const Router = require('koa-router');
const { getDatabase } = require('../utils/database');
const router = new Router();
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');

// 获取全部分组配置（推荐前端一次性拉取）
router.get('/all', async (ctx) => {
  const db = getDatabase();
  try {
    // configs 以分组对象存储
    let configObj = db.get('config_groups').value();
    if (!configObj) {
      // 首次初始化，兼容旧结构
      configObj = {};
      const flatConfigs = db.get('configs').value() || [];
      for (const c of flatConfigs) {
        if (!configObj[c.category]) configObj[c.category] = {};
        configObj[c.category][c.key] = c.value;
      }
      db.set('config_groups', configObj).write();
    }
    ctx.body = { success: true, data: configObj };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

// 批量保存分组配置（前端表单整体提交）
router.put('/all', async (ctx) => {
  const db = getDatabase();
  const configObj = ctx.request.body;
  if (!configObj || typeof configObj !== 'object') {
    ctx.status = 400;
    ctx.body = { success: false, message: 'Invalid config object' };
    return;
  }
  try {
    // 校验部分字段类型（可扩展）
    if (configObj.system && configObj.system.maxConcurrent && isNaN(Number(configObj.system.maxConcurrent))) {
      ctx.status = 400;
      ctx.body = { success: false, message: 'maxConcurrent must be a number' };
      return;
    }
    // ...可加更多校验...
    db.set('config_groups', configObj).write();
    ctx.body = { success: true, message: 'Config saved', data: configObj };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

// 一键测试配置（如解释器、SMTP、Webhook）
router.post('/test', async (ctx) => {
  const db = getDatabase();
  const configObj = ctx.request.body || db.get('config_groups').value();
  const result = {};
  // 示例：测试 powershell/node/python 路径
  try {
    const { execution, notify } = configObj;
    const { interpreters = {} } = execution || {};
    for (const lang in interpreters) {
      const interp = interpreters[lang];
      if (interp.enabled && interp.path) {
        try {
          const { spawnSync } = require('child_process');
          const proc = spawnSync(interp.path, ['--version'], { timeout: 5000 });
          result[lang] = proc.error ? proc.error.message : (proc.stdout.toString() || proc.stderr.toString());
        } catch (e) {
          result[lang] = e.message;
        }
      }
    }
    // 测试 SMTP（伪代码，实际需 nodemailer）
    if (notify && notify.email && notify.email.enabled) {
      result.email = notify.email.host ? 'SMTP配置已填写' : 'SMTP未配置';
    }
    // 测试 webhook
    if (notify && notify.webhook && notify.webhook.enabled && Array.isArray(notify.webhook.items)) {
      result.webhook = [];
      for (const w of notify.webhook.items) {
        try {
          const axios = require('axios');
          await axios.post(w.url, { test: true });
          result.webhook.push({ url: w.url, ok: true });
        } catch (e) {
          result.webhook.push({ url: w.url, ok: false, error: e.message });
        }
      }
    }
    ctx.body = { success: true, data: result };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

// 新增：替换 globals 分组（整体）
router.put('/globals', async (ctx) => {
  const db = getDatabase();
  const body = ctx.request.body || {};
  try {
    const cfg = db.get('config_groups').value() || {};
    const incoming = {
      inheritSystemEnv: body.inheritSystemEnv !== false,
      items: Array.isArray(body.items) ? body.items.map(n => ({
        key: String(n.key || ''),
        value: n.value == null ? '' : String(n.value),
        secret: !!n.secret
      })) : []
    };
    cfg.globals = incoming;
    db.set('config_groups', cfg).write();
    ctx.body = { success: true, data: cfg.globals };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

// 新增：单个全局变量 upsert（TD.set 支持）
router.post('/globals/set', async (ctx) => {
  const db = getDatabase();
  const { key, value, secret } = ctx.request.body || {};
  if (!key || typeof key !== 'string') {
    ctx.status = 400;
    ctx.body = { success: false, message: 'key is required' };
    return;
  }
  if (String(key).length > 128) {
    ctx.status = 400;
    ctx.body = { success: false, message: 'key too long' };
    return;
  }
  try {
    const cfg = db.get('config_groups').value() || {};
    const globals = cfg.globals || { inheritSystemEnv: true, items: [] };
    const items = Array.isArray(globals.items) ? globals.items : [];

    const idx = items.findIndex((it) => it && String(it.key) === String(key));
    if (idx >= 0) {
      items[idx] = { ...items[idx], key: String(key), value: value == null ? '' : String(value), secret: !!(secret ?? items[idx].secret) };
    } else {
      items.push({ key: String(key), value: value == null ? '' : String(value), secret: !!secret });
    }

    db.set('config_groups', { ...cfg, globals: { ...globals, items } }).write();

    ctx.body = { success: true, data: { key: String(key), value: value == null ? '' : String(value), secret: !!secret } };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

function scriptsRootDir() {
  return path.resolve(__dirname, '../../scripts');
}

function runCmd(command, args, options) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command, args, { shell: process.platform === 'win32', windowsHide: true, ...options });
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
    child.on('error', (err) => resolve({ code: -1, stdout: stdout.trim(), stderr: (stderr + '\n' + err.message).trim() }));
  });
}

// 辅助：解析 Python 包版本与元数据
async function getPythonPackageMeta(siteDir, pkgName) {
  // 寻找与包名匹配的 .dist-info 目录，尽量大小写无关并兼容下划线/连字符
  const items = await fs.readdir(siteDir).catch(() => []);
  const normTarget = String(pkgName).toLowerCase().replace(/[-_]/g, '');
  let meta = null;
  for (const it of items) {
    if (!it.endsWith('.dist-info')) continue;
    const base = it.replace(/\.dist-info$/, '');
    const normBase = base.toLowerCase().replace(/[-_]/g, '');
    // base 形如 name-1.2.3
    const lastDash = base.lastIndexOf('-');
    const namePart = lastDash > 0 ? base.slice(0, lastDash) : base;
    const versionPart = lastDash > 0 ? base.slice(lastDash + 1) : '';
    const normName = namePart.toLowerCase().replace(/[-_]/g, '');
    if (normName === normTarget || normBase.startsWith(normTarget)) {
      // 读取 METADATA 提取更多信息
      const metaFile = path.join(siteDir, it, 'METADATA');
      let summary = '';
      let home = '';
      try {
        const content = await fs.readFile(metaFile, 'utf8');
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          if (!summary && line.toLowerCase().startsWith('summary:')) summary = line.split(':').slice(1).join(':').trim();
          if (!home && line.toLowerCase().startsWith('home-page:')) home = line.split(':').slice(1).join(':').trim();
          if (summary && home) break;
        }
      } catch (_) {
        // ignore
      }
      meta = { name: namePart, version: versionPart, summary, homePage: home };
      break;
    }
  }
  return meta;
}

// 依赖列表
router.get('/deps/list', async (ctx) => {
  const lang = String(ctx.request.query.lang || '').toLowerCase();
  const root = scriptsRootDir();
  try {
    if (lang === 'node' || lang === 'javascript') {
      const pkgPath = path.join(root, 'package.json');
      const nodeModules = path.join(root, 'node_modules');
      let deps = {};
      if (await fs.pathExists(pkgPath)) {
        const json = await fs.readJson(pkgPath).catch(() => ({}));
        deps = { ...(json.dependencies || {}), ...(json.devDependencies || {}) };
      }
      // 返回数组形式
      ctx.body = { success: true, data: Object.entries(deps).map(([name, version]) => ({ name, version })) };
      return;
    }
    if (lang === 'python') {
      const site = path.join(root, '.python_packages');
      const exists = await fs.pathExists(site);
      if (!exists) {
        ctx.body = { success: true, data: [] };
        return;
      }
      const items = await fs.readdir(site);
      // 先从 *.dist-info 中解析版本
      const distInfos = items.filter((n) => n.endsWith('.dist-info'));
      const result = [];
      for (const info of distInfos) {
        const base = info.replace(/\.dist-info$/, '');
        const lastDash = base.lastIndexOf('-');
        const namePart = lastDash > 0 ? base.slice(0, lastDash) : base;
        const versionPart = lastDash > 0 ? base.slice(lastDash + 1) : '';
        result.push({ name: namePart, version: versionPart });
      }
      // 去重（有些包目录名与 dist-info 名称不一致）
      const seen = new Set(result.map((r) => r.name.toLowerCase()));
      for (const it of items) {
        if (it.endsWith('.dist-info') || it.endsWith('.data')) continue;
        const lower = it.toLowerCase();
        if (!seen.has(lower)) result.push({ name: it });
      }
      ctx.body = { success: true, data: result };
      return;
    }
    ctx.status = 400;
    ctx.body = { success: false, message: 'Unsupported lang. Use node|python' };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

// 安装依赖
router.post('/deps/install', async (ctx) => {
  const { lang, name, version } = ctx.request.body || {};
  if (!lang || !name) {
    ctx.status = 400;
    ctx.body = { success: false, message: 'lang and name are required' };
    return;
  }
  const root = scriptsRootDir();
  try {
    if (String(lang).toLowerCase() === 'node' || String(lang).toLowerCase() === 'javascript') {
      await fs.ensureDir(root);
      // 初始化 package.json 如缺失
      const pkgPath = path.join(root, 'package.json');
      if (!(await fs.pathExists(pkgPath))) {
        await fs.writeJson(pkgPath, { name: 'taskdog-scripts', private: true, version: '1.0.0' }, { spaces: 2 });
      }
      const pkgSpec = version ? `${name}@${version}` : name;
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const res = await runCmd(npmCmd, ['install', pkgSpec, '--save', '--no-audit', '--prefer-offline'], { cwd: root });
      if (res.code !== 0) {
        ctx.status = 500;
        ctx.body = { success: false, message: res.stderr || 'npm install failed' };
        return;
      }
      ctx.body = { success: true, data: { name, version: version || 'latest' } };
      return;
    }
    if (String(lang).toLowerCase() === 'python') {
      await fs.ensureDir(root);
      const target = path.join(root, '.python_packages');
      await fs.ensureDir(target);
      const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
      const spec = version ? `${name}==${version}` : name;
      const res = await runCmd(pyCmd, ['-m', 'pip', 'install', spec, '-t', target], { cwd: root });
      if (res.code !== 0) {
        ctx.status = 500;
        ctx.body = { success: false, message: res.stderr || 'pip install failed' };
        return;
      }
      ctx.body = { success: true, data: { name, version: version || 'latest' } };
      return;
    }
    ctx.status = 400;
    ctx.body = { success: false, message: 'Unsupported lang. Use node|python' };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

// 卸载依赖
router.post('/deps/uninstall', async (ctx) => {
  const { lang, name } = ctx.request.body || {};
  if (!lang || !name) {
    ctx.status = 400;
    ctx.body = { success: false, message: 'lang and name are required' };
    return;
  }
  const root = scriptsRootDir();
  try {
    if (String(lang).toLowerCase() === 'node' || String(lang).toLowerCase() === 'javascript') {
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const res = await runCmd(npmCmd, ['uninstall', name, '--save'], { cwd: root });
      if (res.code !== 0) {
        ctx.status = 500;
        ctx.body = { success: false, message: res.stderr || 'npm uninstall failed' };
        return;
      }
      ctx.body = { success: true };
      return;
    }
    if (String(lang).toLowerCase() === 'python') {
      const target = path.join(root, '.python_packages');
      const candidates = await fs.readdir(target).catch(() => []);
      for (const item of candidates) {
        const lower = item.toLowerCase();
        if (lower === name.toLowerCase() || lower.startsWith(name.toLowerCase().replace(/[-_]/g, ''))) {
          await fs.remove(path.join(target, item));
        }
        if (lower.startsWith(name.toLowerCase().replace(/[-_]/g, '') + '.dist-info')) {
          await fs.remove(path.join(target, item));
        }
      }
      ctx.body = { success: true };
      return;
    }
    ctx.status = 400;
    ctx.body = { success: false, message: 'Unsupported lang. Use node|python' };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

// 依赖详情
router.get('/deps/info', async (ctx) => {
  const lang = String(ctx.request.query.lang || '').toLowerCase();
  const name = String(ctx.request.query.name || '').trim();
  if (!lang || !name) {
    ctx.status = 400;
    ctx.body = { success: false, message: 'lang and name are required' };
    return;
  }
  const root = scriptsRootDir();
  try {
    if (lang === 'node' || lang === 'javascript') {
      const pkgJsonPath = path.join(root, 'node_modules', ...name.split('/'), 'package.json');
      if (!(await fs.pathExists(pkgJsonPath))) {
        ctx.body = { success: true, data: null, message: 'Package not found' };
        return;
      }
      const json = await fs.readJson(pkgJsonPath).catch(() => ({}));
      const data = {
        name: json.name || name,
        version: json.version || '',
        description: json.description || '',
        homepage: json.homepage || (json.repository && (typeof json.repository === 'string' ? json.repository : json.repository.url)) || '',
        license: json.license || '',
        dependencies: json.dependencies || {},
      };
      ctx.body = { success: true, data };
      return;
    }
    if (lang === 'python') {
      const site = path.join(root, '.python_packages');
      if (!(await fs.pathExists(site))) {
        ctx.body = { success: true, data: null, message: 'Package not found' };
        return;
      }
      const meta = await getPythonPackageMeta(site, name);
      if (!meta) {
        ctx.body = { success: true, data: null, message: 'Package not found' };
        return;
      }
      ctx.body = { success: true, data: meta };
      return;
    }
    ctx.status = 400;
    ctx.body = { success: false, message: 'Unsupported lang. Use node|python' };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

module.exports = router;
