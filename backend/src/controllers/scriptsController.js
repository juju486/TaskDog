const path = require('path');
const fs = require('fs-extra');
const { getDatabase } = require('../utils/database');
const {
  generateScriptFileName,
  ensureScriptsDir,
  readScriptFile,
  writeScriptFile,
  deleteScriptFile,
  fileExists,
  isSupportedLanguage
} = require('../utils/fileManager');
const { spawn } = require('child_process');
const { getInterpreter, buildEnvVars } = require('../utils/scheduler');

// 生成不重复的脚本路径（优先在 scripts 目录内）
async function generateUniqueScriptPath(baseName, language, preferFilePath = null) {
  let fileName = generateScriptFileName(baseName, language);
  let filePath = `scripts/${fileName}`;
  if (preferFilePath) {
    const onlyName = path.basename(preferFilePath);
    filePath = preferFilePath.startsWith('scripts') ? preferFilePath : `scripts/${onlyName}`;
  }
  let suffix = 0;
  while (await fileExists(filePath)) {
    suffix += 1;
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const dir = path.dirname(filePath);
    filePath = path.join(dir, `${base}-${suffix}${ext}`).replace(/\\/g, '/');
  }
  return filePath;
}

// 新增：确保“参数化示例：问候与重试”存在（只创建一次）
async function ensureParamSampleExists() {
  const db = getDatabase();
  try {
    // 一次性标记：若已标记创建过，则不再自动生成（即使被删除）
    const createdFlag = db.get('_meta.sampleParamCreated').value();
    if (createdFlag) return;

    const name = '参数化示例：问候与重试';
    const exists = db.get('scripts').find({ name }).value();
    if (exists) { db.set('_meta.sampleParamCreated', true).write(); return; }

    await ensureScriptsDir();
    const id = db.get('_meta.nextScriptId').value();
    const language = 'node';
    const content = `// 参数化示例：读取 TD.params 并支持重试\n// 运行时参数注入：\n// - 全局/任务/测试传入的 JSON 将注入到环境变量 TASKDOG_PARAMS_JSON\n// - TD shim 提供 TD.params/TD.getParam/TD.requireParam 访问参数\n// - 任务层参数与脚本 default_params 深合并\n\n;(async () => {\n  try {\n    const name = TD.getParam('name', 'World')\n    const times = Number(TD.getParam('times', 1))\n    const failUntil = Number(TD.getParam('failUntil', 0)) // 前几次失败演示重试\n\n    let attempt = 0\n    await TD.retry(async () => {\n      attempt++\n      if (attempt <= failUntil) {\n        console.log('模拟失败，第 ' + attempt + ' 次')\n        throw new Error('Mock failure ' + attempt)\n      }\n      for (let i = 0; i < times; i++) {\n        console.log('Hello, ' + name + '! #' + (i + 1))\n        await TD.sleep(200)\n      }\n    }, { retries: Number(TD.getParam('retries', 2)), delay: Number(TD.getParam('delay', 300)) })\n\n    console.log('完成，参数为:', JSON.stringify(TD.params))\n  } catch (e) {\n    console.error('运行失败:', e && e.message ? e.message : e)\n    process.exitCode = 1\n  }\n})()\n`;
    const filePath = await generateUniqueScriptPath(name, language);
    await writeScriptFile(filePath, content);

    const now = new Date().toISOString();
    const script = {
      id,
      name,
      description: '演示通过 default_params 与运行参数（TD.params）进行注入与重试',
      language,
      file_path: filePath,
      default_params: { name: 'TaskDog', times: 2, retries: 2, delay: 300, failUntil: 0 },
      created_at: now,
      updated_at: now
    };
    db.get('scripts').push(script).write();
    db.set('_meta.nextScriptId', id + 1).write();
    db.set('_meta.sampleParamCreated', true).write();
  } catch (e) {
    console.warn('ensureParamSampleExists failed:', e && e.message ? e.message : e);
  }
}

// 新增：确保“Playwright 工具示例”存在（只创建一次）
async function ensurePlaywrightSampleExists() {
  const db = getDatabase();
  try {
    // 一次性标记：若已标记创建过，则不再自动生成（即使被删除）
    const createdFlag = db.get('_meta.samplePlaywrightCreated').value();
    if (createdFlag) return;

    const name = 'Playwright 示例：访问网页截图';
    const exists = db.get('scripts').find({ name }).value();
    if (exists) { db.set('_meta.samplePlaywrightCreated', true).write(); return; }

    await ensureScriptsDir();
    const id = db.get('_meta.nextScriptId').value();
    const language = 'node';
    const content = `// 自动化示例：访问网页并截图\n// 依赖：在“配置 -> 依赖” 安装 playwright；如需浏览器：在 backend/scripts 执行 npx playwright install\n// 可在“工具配置”页面调整全局 Playwright 参数\nconst { createPWToolkit } = require('./utils/playwrightHelper')\n\n;(async () => {\n  const pw = await createPWToolkit({ headless: true }) // 可覆盖部分参数\n  try {\n    const page = await pw.newPage()\n    await page.goto(pw.withBaseURL('https://example.com'))\n    await page.screenshot({ path: 'example.png', fullPage: true })\n    console.log('已保存截图到 example.png')\n  } catch (e) {\n    console.error('示例运行出错:', e)\n    process.exitCode = 1\n  } finally {\n    await pw.close()\n  }\n})()\n`;
    // 使用固定英文文件名，避免中文名生成空文件名
    const filePath = await generateUniqueScriptPath(name, language, 'scripts/playwright_example_screenshot.js');
    await writeScriptFile(filePath, content);

    const now = new Date().toISOString();
    const script = {
      id,
      name,
      description: '使用通用 Playwright 工具访问 example.com 并保存截图',
      language,
      file_path: filePath,
      default_params: {},
      created_at: now,
      updated_at: now
    };
    db.get('scripts').push(script).write();
    db.set('_meta.nextScriptId', id + 1).write();
    db.set('_meta.samplePlaywrightCreated', true).write();
  } catch (e) {
    console.warn('ensurePlaywrightSampleExists failed:', e && e.message ? e.message : e);
  }
}

// ===== 分组V2辅助（脚本） =====
function getGroupV2Config() {
  const db = getDatabase();
  const cfg = db.get('config_groups').value() || {};
  const v2 = cfg.groupsV2 || { script: [], task: [], nextScriptGroupId: 1, nextTaskGroupId: 1 };
  const groups = cfg.groups || { scriptGroups: [], taskGroups: [] };
  return { cfg, v2, groups };
}
function findGroupIdByNameScript(name) {
  const { v2 } = getGroupV2Config();
  const list = Array.isArray(v2.script) ? v2.script : [];
  const item = list.find((x) => x && x.name === name);
  return item ? item.id : undefined;
}
function findGroupNameByIdScript(id) {
  const { v2 } = getGroupV2Config();
  const list = Array.isArray(v2.script) ? v2.script : [];
  const item = list.find((x) => Number(x.id) === Number(id));
  return item ? item.name : undefined;
}
function ensureScriptGroup(name) {
  if (!name) return { id: undefined, name: '' };
  const db = getDatabase();
  const { cfg, v2, groups } = getGroupV2Config();
  const list = Array.isArray(v2.script) ? v2.script : [];
  const exist = list.find((x) => x.name === name);
  if (exist) return { id: exist.id, name: exist.name };
  // 不存在则创建
  const id = (v2.nextScriptGroupId && Number.isFinite(Number(v2.nextScriptGroupId))) ? v2.nextScriptGroupId : 1;
  const nextId = id + 1;
  const newList = list.concat([{ id, name }]);
  const scriptGroups = Array.from(new Set([...(groups.scriptGroups || []), name]));
  const nextV2 = { ...v2, script: newList, nextScriptGroupId: nextId };
  const nextCfg = { ...cfg, groups: { ...groups, scriptGroups }, groupsV2: nextV2 };
  db.set('config_groups', nextCfg).write();
  return { id, name };
}
function resolveIncomingScriptGroup(payload) {
  // 支持 { group, group_id }
  const gName = typeof payload.group === 'string' && payload.group.trim() ? payload.group.trim() : '';
  const gidRaw = payload.group_id;
  const gid = Number.isFinite(Number(gidRaw)) ? Number(gidRaw) : undefined;

  // 优先ID -> 名称
  if (gid) {
    const name = findGroupNameByIdScript(gid);
    if (name) return { group: name, group_id: gid };
    // ID 无效则回退到名称处理
  }
  // 名称 -> ID（必要时创建）
  if (gName) {
    const id = findGroupIdByNameScript(gName) || ensureScriptGroup(gName).id;
    return { group: gName, group_id: id };
  }
  return { group: undefined, group_id: undefined };
}

// 列表
async function list(ctx) {
  const db = getDatabase();
  try {
    // 首次访问时自动注入示例脚本
    await ensureParamSampleExists();
    await ensurePlaywrightSampleExists();

    const q = ctx.request.query || {};
    const groupFilter = typeof q.group === 'string' && q.group.trim() ? q.group.trim() : null;
    const groupIdFilter = (q.groupId ?? q.group_id);
    const gid = Number.isFinite(Number(groupIdFilter)) ? Number(groupIdFilter) : null;

    let scripts = db.get('scripts').orderBy(['created_at'], ['desc']).value();
    if (gid != null) {
      scripts = (scripts || []).filter((s) => Number(s.group_id) === gid);
    } else if (groupFilter) {
      scripts = (scripts || []).filter(s => (s.group || '') === groupFilter);
    }
    const scriptsWithContent = await Promise.all(
      (scripts || []).map(async (script) => {
        try {
          const content = await readScriptFile(script.file_path);
          return { ...script, content };
        } catch (error) {
          console.warn(`Failed to read script file ${script.file_path}:`, error.message);
          return { ...script, content: '// 无法读取脚本文件' };
        }
      })
    );
    ctx.body = { success: true, data: scriptsWithContent };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 获取单个
async function getById(ctx) {
  const db = getDatabase();
  const { id } = ctx.params;
  try {
    const script = db.get('scripts').find({ id: parseInt(id) }).value();
    if (!script) { ctx.status = 404; ctx.body = { success: false, message: 'Script not found' }; return; }
    try {
      const content = await readScriptFile(script.file_path);
      ctx.body = { success: true, data: { ...script, content } };
    } catch (error) {
      ctx.body = { success: true, data: { ...script, content: '// 无法读取脚本文件' } };
    }
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 创建
async function create(ctx) {
  const db = getDatabase();
  const { name, description, content, language = 'shell', file_path, default_params } = ctx.request.body;
  // 同时支持 { group, group_id }
  const incoming = ctx.request.body || {};
  const resolved = resolveIncomingScriptGroup(incoming);
  if (!name || !content) { ctx.status = 400; ctx.body = { success: false, message: 'Name and content are required' }; return; }
  if (!isSupportedLanguage(language)) { ctx.status = 400; ctx.body = { success: false, message: 'Unsupported language' }; return; }
  try {
    await ensureScriptsDir();
    const id = db.get('_meta.nextScriptId').value();
    const targetPath = await generateUniqueScriptPath(name, language, file_path);
    await writeScriptFile(targetPath, content);
    const script = { id, name, description, language, file_path: targetPath, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    // 支持默认参数
    if (default_params !== undefined) {
      script.default_params = default_params;
    } else {
      script.default_params = {};
    }
    // 分组（名称与ID）
    if (resolved.group) script.group = resolved.group;
    if (resolved.group_id) script.group_id = resolved.group_id;

    db.get('scripts').push(script).write();
    db.set('_meta.nextScriptId', id + 1).write();
    ctx.body = { success: true, data: { ...script, content } };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 更新
async function update(ctx) {
  const db = getDatabase();
  const { id } = ctx.params;
  const { name, description, content, language, default_params } = ctx.request.body;
  // 同时支持 { group, group_id }
  const incoming = ctx.request.body || {};
  const resolved = resolveIncomingScriptGroup(incoming);
  try {
    const script = db.get('scripts').find({ id: parseInt(id) }).value();
    if (!script) { ctx.status = 404; ctx.body = { success: false, message: 'Script not found' }; return; }
    if (language && !isSupportedLanguage(language)) { ctx.status = 400; ctx.body = { success: false, message: 'Unsupported language' }; return; }
    if (content !== undefined) {
      await writeScriptFile(script.file_path, content);
    }
    let newFilePath = script.file_path;
    if ((name && name !== script.name) || (language && language !== script.language)) {
      const candidate = generateScriptFileName(name || script.name, language || script.language);
      newFilePath = await generateUniqueScriptPath(name || script.name, language || script.language, `scripts/${candidate}`);
      if (newFilePath !== script.file_path) {
        const oldContent = content !== undefined ? content : await readScriptFile(script.file_path);
        await writeScriptFile(newFilePath, oldContent);
        await deleteScriptFile(script.file_path);
      }
    }
    const patch = {
      name: name || script.name,
      description: description !== undefined ? description : script.description,
      language: language || script.language,
      file_path: newFilePath,
      // 支持默认参数更新
      default_params: default_params !== undefined ? default_params : (script.default_params || {}),
      updated_at: new Date().toISOString()
    };
    // 分组（允许清空；若解析到值则同时写入 name 与 id）
    if (incoming.hasOwnProperty('group') || incoming.hasOwnProperty('group_id')) {
      if (resolved.group || resolved.group_id) {
        patch.group = resolved.group;
        patch.group_id = resolved.group_id;
      } else {
        // 清空
        patch.group = undefined;
        delete patch.group;
        patch.group_id = undefined;
        delete patch.group_id;
      }
    }

    const updated = db.get('scripts').find({ id: parseInt(id) }).assign(patch).write();

    const respContent = content !== undefined ? content : await readScriptFile(newFilePath).catch(() => '// 无法读取脚本文件');
    ctx.body = { success: true, message: 'Script updated successfully', data: { ...updated, content: respContent } };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 删除
async function remove(ctx) {
  const db = getDatabase();
  const { id } = ctx.params;
  try {
    const script = db.get('scripts').find({ id: parseInt(id) }).value();
    if (!script) { ctx.status = 404; ctx.body = { success: false, message: 'Script not found' }; return; }
    await deleteScriptFile(script.file_path);
    db.get('scripts').remove({ id: parseInt(id) }).write();
    ctx.body = { success: true, message: 'Script deleted successfully' };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 测试运行
async function test(ctx) {
  const db = getDatabase();
  const { id } = ctx.params;
  const { testScript } = require('../utils/scheduler');
  try {
    const script = db.get('scripts').find({ id: parseInt(id) }).value();
    if (!script) { ctx.status = 404; ctx.body = { success: false, message: 'Script not found' }; return; }
    // 允许前端传入临时参数 { params: {...} }
    const body = ctx.request.body || {};
    const overrideParams = body && typeof body === 'object' ? body.params : undefined;
    const result = await testScript(script, overrideParams);
    ctx.body = { success: true, data: { success: result.success, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr } };
  } catch (error) {
    ctx.status = 200;
    ctx.body = { success: true, data: { success: false, exitCode: -1, stdout: '', stderr: error.message } };
  }
}

// 新增：流式测试运行
async function testStream(ctx) {
  const db = getDatabase();
  const { id } = ctx.params;
  const script = db.get('scripts').find({ id: parseInt(id) }).value();

  if (!script) {
    ctx.status = 404;
    ctx.body = 'Script not found';
    return;
  }

  // 从查询参数获取 overrideParams
  const queryParams = ctx.query.params ? JSON.parse(ctx.query.params) : undefined;

  ctx.request.socket.setTimeout(0);
  ctx.req.socket.setNoDelay(true);
  ctx.req.socket.setKeepAlive(true);

  ctx.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const stream = new require('stream').PassThrough();
  ctx.status = 200;
  ctx.body = stream;

  const sendEvent = (event, data) => {
    stream.write(`event: ${event}\n`);
    stream.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const sendLog = (type, chunk) => {
    const lines = chunk.toString().split(/\r?\n/);
    for (const line of lines) {
      if (line) {
        sendEvent('log', { type, line });
      }
    }
  };

  try {
    const interpreter = getInterpreter(script.language);
    const scriptPath = path.resolve(process.cwd(), script.file_path);
    const env = buildEnvVars(script, queryParams);

    const child = spawn(interpreter.command, [...interpreter.args, scriptPath], {
      cwd: path.dirname(scriptPath),
      env,
      shell: true,
    });

    sendEvent('start', { message: '脚本开始执行...' });

    child.stdout.on('data', (chunk) => sendLog('stdout', chunk));
    child.stderr.on('data', (chunk) => sendLog('stderr', chunk));

    child.on('close', (code) => {
      sendEvent('exit', { exitCode: code });
      stream.end();
    });

    child.on('error', (err) => {
      sendLog('stderr', `执行失败: ${err.message}`);
      sendEvent('exit', { exitCode: 1 });
      stream.end();
    });
  } catch (error) {
    sendLog('stderr', `启动脚本时出错: ${error.message}`);
    sendEvent('exit', { exitCode: -1 });
    stream.end();
  }
}

// 下载
async function download(ctx) {
  const db = getDatabase();
  const { id } = ctx.params;
  try {
    const script = db.get('scripts').find({ id: parseInt(id) }).value();
    if (!script) { ctx.status = 404; ctx.body = { success: false, message: 'Script not found' }; return; }
    const fullPath = path.join(__dirname, '../..', script.file_path);
    const fileName = path.basename(fullPath);
    const exists = await fs.pathExists(fullPath);
    if (!exists) { ctx.status = 404; ctx.body = { success: false, message: 'Script file not found' }; return; }
    ctx.set('Content-Type', 'application/octet-stream');
    ctx.set('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    ctx.body = fs.createReadStream(fullPath);
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// ===== 新增：从外部目录导入脚本 =====
function extToLanguage(ext) {
  const e = String(ext || '').toLowerCase();
  if (e === '.ps1') return 'powershell';
  if (e === '.bat' || e === '.cmd') return 'batch';
  if (e === '.py') return 'python';
  if (e === '.js' || e === '.mjs' || e === '.cjs') return 'node';
  if (e === '.sh') return 'shell';
  return null;
}
async function walkDir(dir, recursive = true) {
  const out = [];
  const entries = await fs.readdir(dir).catch(() => []);
  for (const name of entries) {
    const full = path.join(dir, name);
    const st = await fs.stat(full).catch(() => null);
    if (!st) continue;
    if (st.isDirectory()) {
      if (recursive) {
        const nested = await walkDir(full, recursive);
        for (const n of nested) out.push(n);
      }
    } else if (st.isFile()) {
      out.push(full);
    }
  }
  return out;
}
function decodeFallback(buf) {
  // 简易编码检测：UTF-8 BOM、UTF-16LE BOM
  if (!Buffer.isBuffer(buf)) return null;
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.slice(3).toString('utf8');
  }
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.slice(2).toString('utf16le');
  }
  // 尝试 utf8 -> utf16le -> latin1
  try { return buf.toString('utf8'); } catch {}
  try { return buf.toString('utf16le'); } catch {}
  try { return buf.toString('latin1'); } catch {}
  return null;
}
async function readTextSmart(filePath) {
  try {
    const raw = await fs.readFile(filePath);
    const s = decodeFallback(raw);
    if (s != null) return s;
    return raw.toString('utf8');
  } catch (e) {
    return null;
  }
}
async function importFromDir(ctx) {
  const db = getDatabase();
  const body = ctx.request.body || {};
  const sourceDir = String(body.sourceDir || body.source || '').trim();
  const recursive = body.recursive !== false;
  const dryRun = !!body.dryRun;
  const includeExt = Array.isArray(body.includeExt) ? body.includeExt.map((s) => String(s).toLowerCase()) : null;
  const incoming = body;
  const resolvedGroup = resolveIncomingScriptGroup(incoming);

  if (!sourceDir) { ctx.status = 400; ctx.body = { success: false, message: 'sourceDir is required' }; return; }
  const absSource = path.resolve(sourceDir);
  const exists = await fs.pathExists(absSource);
  if (!exists) { ctx.status = 400; ctx.body = { success: false, message: 'sourceDir not found' }; return; }
  const stat = await fs.stat(absSource);
  if (!stat.isDirectory()) { ctx.status = 400; ctx.body = { success: false, message: 'sourceDir is not a directory' }; return; }

  try {
    const files = await walkDir(absSource, recursive);
    const allowed = files.filter((f) => {
      const ext = path.extname(f).toLowerCase();
      if (includeExt && includeExt.length) return includeExt.includes(ext);
      return !!extToLanguage(ext);
    });

    await ensureScriptsDir();
    const imported = [];
    const skipped = [];

    for (const full of allowed) {
      const rel = path.relative(absSource, full).replace(/\\/g, '/');
      const ext = path.extname(full).toLowerCase();
      const lang = extToLanguage(ext);
      if (!lang || !isSupportedLanguage(lang)) { skipped.push({ file: full, reason: 'unsupported_ext' }); continue; }
      const baseName = path.basename(full, ext);
      const prefer = `scripts/imported/${rel}`.replace(/\\/g, '/');
      const preferInScripts = prefer.startsWith('scripts') ? prefer : `scripts/${prefer}`;
      const targetPath = await generateUniqueScriptPath(baseName, lang, preferInScripts);
      const content = await readTextSmart(full);
      if (content == null) { skipped.push({ file: full, reason: 'read_failed' }); continue; }

      const nextId = db.get('_meta.nextScriptId').value();
      const now = new Date().toISOString();
      const record = {
        id: nextId,
        name: baseName,
        description: `Imported from ${absSource}`,
        language: lang,
        file_path: targetPath,
        default_params: {},
        created_at: now,
        updated_at: now,
      };
      if (resolvedGroup.group) record.group = resolvedGroup.group;
      if (resolvedGroup.group_id) record.group_id = resolvedGroup.group_id;

      if (!dryRun) {
        await writeScriptFile(targetPath, content);
        db.get('scripts').push(record).write();
        db.set('_meta.nextScriptId', nextId + 1).write();
      }

      imported.push({ ...record });
    }

    ctx.body = { success: true, data: { importedCount: imported.length, skippedCount: skipped.length, imported, skipped } };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

module.exports = { list, getById, create, update, remove, test, testStream, download, importFromDir };
