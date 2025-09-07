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

// 新增：确保“参数化示例”存在（只创建一次）
async function ensureParamSampleExists() {
  const db = getDatabase();
  try {
    const name = '参数化示例：问候与重试';
    const exists = db.get('scripts').find({ name }).value();
    if (exists) return;

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
  } catch (e) {
    console.warn('ensureParamSampleExists failed:', e && e.message ? e.message : e);
  }
}

// 新增：确保“Playwright 工具示例”存在（只创建一次）
async function ensurePlaywrightSampleExists() {
  const db = getDatabase();
  try {
    const name = 'Playwright 示例：访问网页截图';
    const exists = db.get('scripts').find({ name }).value();
    if (exists) return;

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
  } catch (e) {
    console.warn('ensurePlaywrightSampleExists failed:', e && e.message ? e.message : e);
  }
}

// 列表
async function list(ctx) {
  const db = getDatabase();
  try {
    // 首次访问时自动注入示例脚本
    await ensureParamSampleExists();
    await ensurePlaywrightSampleExists();

    const scripts = db.get('scripts').orderBy(['created_at'], ['desc']).value();
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
    const updated = db.get('scripts').find({ id: parseInt(id) }).assign({
      name: name || script.name,
      description: description !== undefined ? description : script.description,
      language: language || script.language,
      file_path: newFilePath,
      // 支持默认参数更新
      default_params: default_params !== undefined ? default_params : (script.default_params || {}),
      updated_at: new Date().toISOString()
    }).write();

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

module.exports = { list, getById, create, update, remove, test, download };
