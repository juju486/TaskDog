const path = require('path');
const fs = require('fs-extra');
const { spawnSync, spawn } = require('child_process');
const { getDatabase } = require('../utils/database');

// 默认配置模板（用于修复与兜底）
const DEFAULT_CONFIG = {
  system: {
    log_level: 'info',
    max_concurrent_tasks: '3',
  },
  execution: {
    interpreters: {
      powershell: { enabled: true, path: 'powershell.exe' },
      cmd: { enabled: true, path: 'cmd.exe' },
      python: { enabled: true, path: 'python' },
      node: { enabled: true, path: 'node' },
      bash: { enabled: false, path: '/bin/bash' },
    },
    defaultTimeoutMs: 300000,
    maxConcurrent: 2,
    queueSize: 20,
    workingDirPolicy: 'scriptDir',
    allowedLanguages: ['powershell', 'cmd', 'batch', 'python', 'node', 'javascript'],
    maxUploadKB: 512,
    pathIsolation: true,
  },
  scheduler: {
    schedulerTz: 'Asia/Shanghai',
    overlapPolicy: 'queue',
    catchup: false,
    jitterMs: 5000,
    retry: { maxAttempts: 1, backoffMs: 30000 },
  },
  logging: {
    level: 'info',
    retainDays: 30,
    captureMaxKB: 256,
    redactKeys: ['token', 'password'],
    rotate: { maxSizeMB: 10, maxFiles: 5 },
  },
  notify: {
    webhook: { enabled: false, items: [] },
    email: { enabled: false, host: '', port: 465, user: '', from: '', useTLS: true },
    on: { taskStart: false, taskSuccess: false, taskError: true },
  },
  ui: { theme: 'light', monacoTheme: 'vs', pageSize: 10, editorWordWrap: true, tabSize: 2 },
  backup: { enabled: false, cron: '0 3 * * *', targetDir: 'backup', backup_retention_days: '30' },
  secrets: [],
  notification: { notification_email: 'admin@example.com' },
  globals: { inheritSystemEnv: true, items: [] },
};

function isObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function asString(v, d = '') { if (v == null) return d; try { return String(v); } catch { return d; } }
function asNumber(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function asBool(v, d = false) { return typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : d; }
function asArray(v, d = []) { return Array.isArray(v) ? v : d; }

// 新增：宽松 JSON 解析（允许未加引号的键、单引号字符串）
function tryParseJSONLoose(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (!t) return null;
  // 快速路径：严格 JSON
  try { return JSON.parse(t); } catch { /* fallthrough */ }
  // 仅在看起来像对象/数组时尝试宽松转换
  if (!/^[\[{]/.test(t)) return null;
  try {
    let s = t;
    // 将单引号字符串替换为双引号（保留内部双引号）
    s = s.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (m, g1) => '"' + g1.replace(/"/g, '\\"') + '"');
    // 为未加引号的键补引号（支持中英文、数字、下划线）
    s = s.replace(/([\{,\[]\s*)([A-Za-z0-9_\u4e00-\u9fa5]+)\s*:/g, '$1"$2":');
    return JSON.parse(s);
  } catch { return null; }
}

// 新增：将字符串智能转为对应类型（JSON/布尔/数字/null），否则原样返回
function coerceValueType(value) {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  if (t === '') return '';
  const loose = tryParseJSONLoose(t);
  if (loose !== null) return loose;
  // 严格 JSON 简写：true/false/null/数字
  try { const v = JSON.parse(t); return v; } catch {}
  if (/^-?\d+(?:\.\d+)?$/.test(t)) { const n = Number(t); if (Number.isFinite(n)) return n; }
  if (/^(true|false)$/i.test(t)) return /^true$/i.test(t);
  if (/^null$/i.test(t)) return null;
  return value;
}

// 规范化/修复配置对象（不会移除未知字段）
function sanitizeConfig(input) {
  const cfg = isObject(input) ? { ...input } : {};

  // system
  const sys = isObject(cfg.system) ? { ...cfg.system } : {};
  sys.log_level = asString(sys.log_level, DEFAULT_CONFIG.system.log_level);
  sys.max_concurrent_tasks = asString(sys.max_concurrent_tasks, DEFAULT_CONFIG.system.max_concurrent_tasks);
  cfg.system = sys;

  // execution
  const execIn = isObject(cfg.execution) ? { ...cfg.execution } : {};
  const interIn = isObject(execIn.interpreters) ? { ...execIn.interpreters } : {};
  const inter = {};
  for (const key of Object.keys(DEFAULT_CONFIG.execution.interpreters)) {
    const ex = isObject(interIn[key]) ? interIn[key] : {};
    inter[key] = {
      enabled: asBool(ex.enabled, DEFAULT_CONFIG.execution.interpreters[key].enabled),
      path: asString(ex.path, DEFAULT_CONFIG.execution.interpreters[key].path),
    };
  }
  const allowedDefault = DEFAULT_CONFIG.execution.allowedLanguages;
  let allowed = asArray(execIn.allowedLanguages, allowedDefault).map((s) => asString(s).toLowerCase()).filter(Boolean);
  if (allowed.length === 0) allowed = allowedDefault;
  cfg.execution = {
    interpreters: inter,
    defaultTimeoutMs: asNumber(execIn.defaultTimeoutMs, DEFAULT_CONFIG.execution.defaultTimeoutMs),
    maxConcurrent: asNumber(execIn.maxConcurrent, DEFAULT_CONFIG.execution.maxConcurrent),
    queueSize: asNumber(execIn.queueSize, DEFAULT_CONFIG.execution.queueSize),
    workingDirPolicy: asString(execIn.workingDirPolicy, DEFAULT_CONFIG.execution.workingDirPolicy),
    allowedLanguages: allowed,
    maxUploadKB: asNumber(execIn.maxUploadKB, DEFAULT_CONFIG.execution.maxUploadKB),
    pathIsolation: asBool(execIn.pathIsolation, DEFAULT_CONFIG.execution.pathIsolation),
  };

  // scheduler
  const schIn = isObject(cfg.scheduler) ? { ...cfg.scheduler } : {};
  cfg.scheduler = {
    schedulerTz: asString(schIn.schedulerTz, DEFAULT_CONFIG.scheduler.schedulerTz),
    overlapPolicy: asString(schIn.overlapPolicy, DEFAULT_CONFIG.scheduler.overlapPolicy),
    catchup: asBool(schIn.catchup, DEFAULT_CONFIG.scheduler.catchup),
    jitterMs: asNumber(schIn.jitterMs, DEFAULT_CONFIG.scheduler.jitterMs),
    retry: {
      maxAttempts: asNumber(schIn.retry && schIn.retry.maxAttempts, DEFAULT_CONFIG.scheduler.retry.maxAttempts),
      backoffMs: asNumber(schIn.retry && schIn.retry.backoffMs, DEFAULT_CONFIG.scheduler.retry.backoffMs),
    },
  };

  // logging
  const logIn = isObject(cfg.logging) ? { ...cfg.logging } : {};
  cfg.logging = {
    level: asString(logIn.level, DEFAULT_CONFIG.logging.level),
    retainDays: asNumber(logIn.retainDays, DEFAULT_CONFIG.logging.retainDays),
    captureMaxKB: asNumber(logIn.captureMaxKB, DEFAULT_CONFIG.logging.captureMaxKB),
    redactKeys: asArray(logIn.redactKeys, DEFAULT_CONFIG.logging.redactKeys).map((s) => asString(s)).filter(Boolean),
    rotate: {
      maxSizeMB: asNumber(logIn.rotate && logIn.rotate.maxSizeMB, DEFAULT_CONFIG.logging.rotate.maxSizeMB),
      maxFiles: asNumber(logIn.rotate && logIn.rotate.maxFiles, DEFAULT_CONFIG.logging.rotate.maxFiles),
    },
  };

  // notify
  const nIn = isObject(cfg.notify) ? { ...cfg.notify } : {};
  const wIn = isObject(nIn.webhook) ? nIn.webhook : {};
  const eIn = isObject(nIn.email) ? nIn.email : {};
  const onIn = isObject(nIn.on) ? nIn.on : {};
  cfg.notify = {
    webhook: { enabled: asBool(wIn.enabled, DEFAULT_CONFIG.notify.webhook.enabled), items: asArray(wIn.items, []) },
    email: {
      enabled: asBool(eIn.enabled, DEFAULT_CONFIG.notify.email.enabled),
      host: asString(eIn.host, DEFAULT_CONFIG.notify.email.host),
      port: asNumber(eIn.port, DEFAULT_CONFIG.notify.email.port),
      user: asString(eIn.user, DEFAULT_CONFIG.notify.email.user),
      from: asString(eIn.from, DEFAULT_CONFIG.notify.email.from),
      useTLS: asBool(eIn.useTLS, DEFAULT_CONFIG.notify.email.useTLS),
    },
    on: {
      taskStart: asBool(onIn.taskStart, DEFAULT_CONFIG.notify.on.taskStart),
      taskSuccess: asBool(onIn.taskSuccess, DEFAULT_CONFIG.notify.on.taskSuccess),
      taskError: asBool(onIn.taskError, DEFAULT_CONFIG.notify.on.taskError),
    },
  };

  // ui
  const uiIn = isObject(cfg.ui) ? { ...cfg.ui } : {};
  cfg.ui = {
    theme: asString(uiIn.theme, DEFAULT_CONFIG.ui.theme),
    monacoTheme: asString(uiIn.monacoTheme, DEFAULT_CONFIG.ui.monacoTheme),
    pageSize: asNumber(uiIn.pageSize, DEFAULT_CONFIG.ui.pageSize),
    editorWordWrap: asBool(uiIn.editorWordWrap, DEFAULT_CONFIG.ui.editorWordWrap),
    tabSize: asNumber(uiIn.tabSize, DEFAULT_CONFIG.ui.tabSize),
  };

  // backup
  const bkIn = isObject(cfg.backup) ? { ...cfg.backup } : {};
  cfg.backup = {
    enabled: asBool(bkIn.enabled, DEFAULT_CONFIG.backup.enabled),
    cron: asString(bkIn.cron, DEFAULT_CONFIG.backup.cron),
    targetDir: asString(bkIn.targetDir, DEFAULT_CONFIG.backup.targetDir),
    backup_retention_days: asString(bkIn.backup_retention_days, DEFAULT_CONFIG.backup.backup_retention_days),
  };

  // secrets（保持数组）
  cfg.secrets = asArray(cfg.secrets, DEFAULT_CONFIG.secrets);

  // notification（兼容旧平铺）
  const ntfIn = isObject(cfg.notification) ? { ...cfg.notification } : {};
  cfg.notification = { notification_email: asString(ntfIn.notification_email, DEFAULT_CONFIG.notification.notification_email) };

  // globals
  const gIn = isObject(cfg.globals) ? { ...cfg.globals } : {};
  const itemsRaw = asArray(gIn.items, []);
  const items = itemsRaw
    .map((it) => ({
      key: asString(it && it.key, ''),
      // 保留原始值类型（可为字符串、数字、布尔、对象、数组等）
      value: it && Object.prototype.hasOwnProperty.call(it, 'value') ? it.value : '',
      secret: asBool(it && it.secret, false),
    }))
    .filter((it) => it.key);
  cfg.globals = { inheritSystemEnv: asBool(gIn.inheritSystemEnv, true), items };

  return cfg;
}

// 获取全部分组
async function getAll(ctx) {
  const db = getDatabase();
  try {
    let configObj = db.get('config_groups').value();
    if (!configObj) {
      configObj = {};
      const flatConfigs = db.get('configs').value() || [];
      for (const c of flatConfigs) {
        if (!configObj[c.category]) configObj[c.category] = {};
        configObj[c.category][c.key] = c.value;
      }
    }
    // 校验并修复
    const sanitized = sanitizeConfig(configObj);
    // 仅当变化时写回
    if (JSON.stringify(sanitized) !== JSON.stringify(configObj)) {
      db.set('config_groups', sanitized).write();
    }
    ctx.body = { success: true, data: sanitized };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 保存全部分组
async function saveAll(ctx) {
  const db = getDatabase();
  const configObj = ctx.request.body;
  if (!configObj || typeof configObj !== 'object') { ctx.status = 400; ctx.body = { success: false, message: 'Invalid config object' }; return; }
  try {
    const sanitized = sanitizeConfig(configObj);
    db.set('config_groups', sanitized).write();
    ctx.body = { success: true, message: 'Config saved', data: sanitized };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 测试配置
async function testAll(ctx) {
  const db = getDatabase();
  const configObj = ctx.request.body || db.get('config_groups').value();
  const result = {};
  try {
    const { execution, notify } = configObj || {};
    const { interpreters = {} } = execution || {};
    for (const lang in interpreters) {
      const interp = interpreters[lang];
      if (interp && interp.enabled && interp.path) {
        try {
          const proc = spawnSync(interp.path, ['--version'], { timeout: 5000 });
          result[lang] = proc.error ? proc.error.message : (proc.stdout.toString() || proc.stderr.toString());
        } catch (e) {
          result[lang] = e.message;
        }
      }
    }
    if (notify && notify.email && notify.email.enabled) {
      result.email = notify.email.host ? 'SMTP配置已填写' : 'SMTP未配置';
    }
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
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 替换 globals 分组
async function replaceGlobals(ctx) {
  const db = getDatabase();
  const body = ctx.request.body || {};
  try {
    const cfg = db.get('config_groups').value() || {};
    const incoming = {
      inheritSystemEnv: body.inheritSystemEnv !== false,
      items: Array.isArray(body.items)
        ? body.items.map((n) => ({
            key: String(n.key || ''),
            // 智能类型兼容
            value: Object.prototype.hasOwnProperty.call(n, 'value') ? coerceValueType(n.value) : '',
            secret: !!n.secret,
          }))
        : [],
    };
    const fixed = sanitizeConfig({ ...cfg, globals: incoming });
    db.set('config_groups', fixed).write();
    ctx.body = { success: true, data: fixed.globals };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// upsert 单个全局变量
async function upsertGlobal(ctx) {
  const db = getDatabase();
  const { key, value, secret } = ctx.request.body || {};
  if (!key || typeof key !== 'string') { ctx.status = 400; ctx.body = { success: false, message: 'key is required' }; return; }
  if (String(key).length > 128) { ctx.status = 400; ctx.body = { success: false, message: 'key too long' }; return; }
  try {
    const cfg = db.get('config_groups').value() || {};
    const globals = cfg.globals || { inheritSystemEnv: true, items: [] };
    const items = Array.isArray(globals.items) ? globals.items : [];
    const idx = items.findIndex((it) => it && String(it.key) === String(key));
    // 保留原始类型；字符串执行智能类型转换
    const rawValue = Object.prototype.hasOwnProperty.call((ctx.request.body || {}), 'value') ? coerceValueType(value) : '';
    if (idx >= 0) {
      items[idx] = { ...items[idx], key: String(key), value: rawValue, secret: !!(secret ?? items[idx].secret) };
    } else {
      items.push({ key: String(key), value: rawValue, secret: !!secret });
    }
    const fixed = sanitizeConfig({ ...cfg, globals: { ...globals, items } });
    db.set('config_groups', fixed).write();
    ctx.body = { success: true, data: { key: String(key), value: rawValue, secret: !!secret } };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 辅助：scripts 根目录
function scriptsRootDir() {
  return path.resolve(__dirname, '../../scripts');
}

// 辅助：执行命令
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

// 辅助：解析 Python 包元数据
async function getPythonPackageMeta(siteDir, pkgName) {
  const items = await fs.readdir(siteDir).catch(() => []);
  const normTarget = String(pkgName).toLowerCase().replace(/[-_]/g, '');
  let meta = null;
  for (const it of items) {
    if (!it.endsWith('.dist-info')) continue;
    const base = it.replace(/\.dist-info$/, '');
    const normBase = base.toLowerCase().replace(/[-_]/g, '');
    const lastDash = base.lastIndexOf('-');
    const namePart = lastDash > 0 ? base.slice(0, lastDash) : base;
    const versionPart = lastDash > 0 ? base.slice(lastDash + 1) : '';
    const normName = namePart.toLowerCase().replace(/[-_]/g, '');
    if (normName === normTarget || normBase.startsWith(normTarget)) {
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
      } catch (_) { /* ignore */ }
      meta = { name: namePart, version: versionPart, summary, homePage: home };
      break;
    }
  }
  return meta;
}

// 依赖列表
async function depsList(ctx) {
  const lang = String(ctx.request.query.lang || '').toLowerCase();
  const root = scriptsRootDir();
  try {
    if (lang === 'node' || lang === 'javascript') {
      const pkgPath = path.join(root, 'package.json');
      let deps = {};
      if (await fs.pathExists(pkgPath)) {
        const json = await fs.readJson(pkgPath).catch(() => ({}));
        deps = { ...(json.dependencies || {}), ...(json.devDependencies || {}) };
      }
      ctx.body = { success: true, data: Object.entries(deps).map(([name, version]) => ({ name, version })) };
      return;
    }
    if (lang === 'python') {
      const site = path.join(root, '.python_packages');
      const exists = await fs.pathExists(site);
      if (!exists) { ctx.body = { success: true, data: [] }; return; }
      const items = await fs.readdir(site);
      const distInfos = items.filter((n) => n.endsWith('.dist-info'));
      const result = [];
      for (const info of distInfos) {
        const base = info.replace(/\.dist-info$/, '');
        const lastDash = base.lastIndexOf('-');
        const namePart = lastDash > 0 ? base.slice(0, lastDash) : base;
        const versionPart = lastDash > 0 ? base.slice(lastDash + 1) : '';
        result.push({ name: namePart, version: versionPart });
      }
      const seen = new Set(result.map((r) => r.name.toLowerCase()));
      for (const it of items) {
        if (it.endsWith('.dist-info') || it.endsWith('.data')) continue;
        const lower = it.toLowerCase();
        if (!seen.has(lower)) result.push({ name: it });
      }
      ctx.body = { success: true, data: result };
      return;
    }
    ctx.status = 400; ctx.body = { success: false, message: 'Unsupported lang. Use node|python' };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 安装依赖
async function depsInstall(ctx) {
  const { lang, name, version } = ctx.request.body || {};
  if (!lang || !name) { ctx.status = 400; ctx.body = { success: false, message: 'lang and name are required' }; return; }
  const root = scriptsRootDir();
  try {
    if (String(lang).toLowerCase() === 'node' || String(lang).toLowerCase() === 'javascript') {
      await fs.ensureDir(root);
      const pkgPath = path.join(root, 'package.json');
      if (!(await fs.pathExists(pkgPath))) {
        await fs.writeJson(pkgPath, { name: 'taskdog-scripts', private: true, version: '1.0.0' }, { spaces: 2 });
      }
      const pkgSpec = version ? `${name}@${version}` : name;
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const res = await runCmd(npmCmd, ['install', pkgSpec, '--save', '--no-audit', '--prefer-offline'], { cwd: root });
      if (res.code !== 0) { ctx.status = 500; ctx.body = { success: false, message: res.stderr || 'npm install failed' }; return; }
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
      if (res.code !== 0) { ctx.status = 500; ctx.body = { success: false, message: res.stderr || 'pip install failed' }; return; }
      ctx.body = { success: true, data: { name, version: version || 'latest' } };
      return;
    }
    ctx.status = 400; ctx.body = { success: false, message: 'Unsupported lang. Use node|python' };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 卸载依赖
async function depsUninstall(ctx) {
  const { lang, name } = ctx.request.body || {};
  if (!lang || !name) { ctx.status = 400; ctx.body = { success: false, message: 'lang and name are required' }; return; }
  const root = scriptsRootDir();
  try {
    if (String(lang).toLowerCase() === 'node' || String(lang).toLowerCase() === 'javascript') {
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const res = await runCmd(npmCmd, ['uninstall', name, '--save'], { cwd: root });
      if (res.code !== 0) { ctx.status = 500; ctx.body = { success: false, message: res.stderr || 'npm uninstall failed' }; return; }
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
    ctx.status = 400; ctx.body = { success: false, message: 'Unsupported lang. Use node|python' };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 依赖详情
async function depsInfo(ctx) {
  const lang = String(ctx.request.query.lang || '').toLowerCase();
  const name = String(ctx.request.query.name || '').trim();
  if (!lang || !name) { ctx.status = 400; ctx.body = { success: false, message: 'lang and name are required' }; return; }
  const root = scriptsRootDir();
  try {
    if (lang === 'node' || lang === 'javascript') {
      const pkgJsonPath = path.join(root, 'node_modules', ...name.split('/'), 'package.json');
      if (!(await fs.pathExists(pkgJsonPath))) { ctx.body = { success: true, data: null, message: 'Package not found' }; return; }
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
      if (!(await fs.pathExists(site))) { ctx.body = { success: true, data: null, message: 'Package not found' }; return; }
      const meta = await getPythonPackageMeta(site, name);
      if (!meta) { ctx.body = { success: true, data: null, message: 'Package not found' }; return; }
      ctx.body = { success: true, data: meta };
      return;
    }
    ctx.status = 400; ctx.body = { success: false, message: 'Unsupported lang. Use node|python' };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

module.exports = { getAll, saveAll, testAll, replaceGlobals, upsertGlobal, depsList, depsInstall, depsUninstall, depsInfo, __sanitizeConfig: sanitizeConfig, __DEFAULT_CONFIG: DEFAULT_CONFIG };
