const fs = require('fs-extra');
const path = require('path');

const SCRIPTS_DIR = path.join(__dirname, '../../scripts');

// 文件扩展名映射
const LANGUAGE_EXTENSIONS = {
  'powershell': '.ps1',
  'batch': '.bat',
  'cmd': '.bat',
  'python': '.py',
  'javascript': '.js',
  'node': '.js',
  'shell': '.sh',
  'bash': '.sh'
};

const ALLOWED_LANGUAGES = Object.keys(LANGUAGE_EXTENSIONS);

// 统一解析脚本路径，确保在 scripts 目录内，避免目录穿越
function resolveScriptFullPath(filePath) {
  // 允许传入类似 "scripts/foo.ps1" 或 "foo.ps1"
  const relative = filePath.startsWith('scripts') ? filePath : path.join('scripts', filePath);
  const full = path.resolve(path.join(__dirname, '../..', relative));
  const scriptsRoot = path.resolve(SCRIPTS_DIR) + path.sep;
  if (!full.startsWith(scriptsRoot)) {
    throw new Error('非法的脚本路径');
  }
  return full;
}

// 获取语言对应的文件扩展名
function getFileExtension(language) {
  return LANGUAGE_EXTENSIONS[language] || '.txt';
}

function isSupportedLanguage(language) {
  return ALLOWED_LANGUAGES.includes(language);
}

// 生成脚本文件名
function generateScriptFileName(name, language) {
  const safeName = name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').toLowerCase();
  const extension = getFileExtension(language);
  return `${safeName}${extension}`;
}

// 确保脚本目录存在
async function ensureScriptsDir() {
  await fs.ensureDir(SCRIPTS_DIR);
}

// 读取脚本文件内容
async function readScriptFile(filePath) {
  const fullPath = resolveScriptFullPath(filePath);
  try {
    const content = await fs.readFile(fullPath, 'utf8');
    return content;
  } catch (error) {
    console.error('Failed to read script file:', error);
    throw new Error(`无法读取脚本文件: ${filePath}`);
  }
}

// 写入脚本文件内容
async function writeScriptFile(filePath, content) {
  const fullPath = resolveScriptFullPath(filePath);
  try {
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content, 'utf8');
  } catch (error) {
    console.error('Failed to write script file:', error);
    throw new Error(`无法写入脚本文件: ${filePath}`);
  }
}

// 删除脚本文件
async function deleteScriptFile(filePath) {
  const fullPath = resolveScriptFullPath(filePath);
  try {
    await fs.remove(fullPath);
  } catch (error) {
    console.error('Failed to delete script file:', error);
    // 删除文件失败不抛出错误，只记录日志
  }
}

// 检查文件是否存在
async function fileExists(filePath) {
  const fullPath = resolveScriptFullPath(filePath);
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  SCRIPTS_DIR,
  LANGUAGE_EXTENSIONS,
  ALLOWED_LANGUAGES,
  generateScriptFileName,
  ensureScriptsDir,
  readScriptFile,
  writeScriptFile,
  deleteScriptFile,
  fileExists,
  getFileExtension,
  isSupportedLanguage,
  resolveScriptFullPath
};
