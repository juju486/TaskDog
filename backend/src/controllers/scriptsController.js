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

// 列表
async function list(ctx) {
  const db = getDatabase();
  try {
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
  const { name, description, content, language = 'shell', file_path } = ctx.request.body;
  if (!name || !content) { ctx.status = 400; ctx.body = { success: false, message: 'Name and content are required' }; return; }
  if (!isSupportedLanguage(language)) { ctx.status = 400; ctx.body = { success: false, message: 'Unsupported language' }; return; }
  try {
    await ensureScriptsDir();
    const id = db.get('_meta.nextScriptId').value();
    const targetPath = await generateUniqueScriptPath(name, language, file_path);
    await writeScriptFile(targetPath, content);
    const script = { id, name, description, language, file_path: targetPath, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
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
  const { name, description, content, language } = ctx.request.body;
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
    const result = await testScript(script);
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
