const Router = require('koa-router');
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
const path = require('path');

const router = new Router();

// 根据名称与语言生成不重名的脚本文件路径
async function generateUniqueScriptPath(baseName, language, preferFilePath = null) {
  let fileName = generateScriptFileName(baseName, language);
  let filePath = `scripts/${fileName}`;
  if (preferFilePath) {
    // 允许指定完整相对路径（限 scripts 目录内）
    const onlyName = path.basename(preferFilePath);
    filePath = preferFilePath.startsWith('scripts') ? preferFilePath : `scripts/${onlyName}`;
  }
  let suffix = 0;
  // 避免覆盖已存在文件
  // 注意：fileExists 内部做了路径约束，防止目录穿越
  while (await fileExists(filePath)) {
    suffix += 1;
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const dir = path.dirname(filePath);
    filePath = path.join(dir, `${base}-${suffix}${ext}`).replace(/\\/g, '/');
  }
  return filePath;
}

// 获取所有脚本
router.get('/', async (ctx) => {
  const db = getDatabase();
  
  try {
    const scripts = db.get('scripts')
      .orderBy(['created_at'], ['desc'])
      .value();
    
    // 为每个脚本添加内容
    const scriptsWithContent = await Promise.all(
      scripts.map(async (script) => {
        try {
          const content = await readScriptFile(script.file_path);
          return { ...script, content };
        } catch (error) {
          console.warn(`Failed to read script file ${script.file_path}:`, error.message);
          return { ...script, content: '// 无法读取脚本文件' };
        }
      })
    );
    
    ctx.body = {
      success: true,
      data: scriptsWithContent
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 获取单个脚本
router.get('/:id', async (ctx) => {
  const db = getDatabase();
  const { id } = ctx.params;
  
  try {
    const script = db.get('scripts')
      .find({ id: parseInt(id) })
      .value();
    
    if (!script) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: 'Script not found'
      };
      return;
    }
    
    // 读取脚本文件内容
    try {
      const content = await readScriptFile(script.file_path);
      ctx.body = {
        success: true,
        data: { ...script, content }
      };
    } catch (error) {
      ctx.body = {
        success: true,
        data: { ...script, content: '// 无法读取脚本文件' }
      };
    }
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 创建脚本
router.post('/', async (ctx) => {
  const db = getDatabase();
  const { name, description, content, language = 'shell', file_path } = ctx.request.body;
  
  if (!name || !content) {
    ctx.status = 400;
    ctx.body = {
      success: false,
      message: 'Name and content are required'
    };
    return;
  }

  if (!isSupportedLanguage(language)) {
    ctx.status = 400;
    ctx.body = { success: false, message: 'Unsupported language' };
    return;
  }
  
  try {
    await ensureScriptsDir();
    
    const id = db.get('_meta.nextScriptId').value();
    // 生成不冲突的文件路径（若传入 file_path 则尽量使用它）
    const targetPath = await generateUniqueScriptPath(name, language, file_path);
    
    // 写入脚本文件
    await writeScriptFile(targetPath, content);
    
    const script = {
      id,
      name,
      description,
      language,
      file_path: targetPath,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    db.get('scripts')
      .push(script)
      .write();
    
    db.set('_meta.nextScriptId', id + 1).write();
    
    ctx.body = {
      success: true,
      data: { ...script, content }
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 更新脚本
router.put('/:id', async (ctx) => {
  const db = getDatabase();
  const { id } = ctx.params;
  const { name, description, content, language } = ctx.request.body;
  
  try {
    const script = db.get('scripts')
      .find({ id: parseInt(id) })
      .value();
    
    if (!script) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: 'Script not found'
      };
      return;
    }

    if (language && !isSupportedLanguage(language)) {
      ctx.status = 400;
      ctx.body = { success: false, message: 'Unsupported language' };
      return;
    }
    
    // 如果内容有变化，更新文件
    if (content !== undefined) {
      await writeScriptFile(script.file_path, content);
    }
    
    // 如果名称或语言有变化，可能需要重命名文件
    let newFilePath = script.file_path;
    if ((name && name !== script.name) || (language && language !== script.language)) {
      const candidate = generateScriptFileName(name || script.name, language || script.language);
      // 生成不冲突的新路径
      newFilePath = await generateUniqueScriptPath(name || script.name, language || script.language, `scripts/${candidate}`);
      
      if (newFilePath !== script.file_path) {
        // 读取旧文件内容
        const oldContent = content !== undefined ? content : await readScriptFile(script.file_path);
        // 写入新文件
        await writeScriptFile(newFilePath, oldContent);
        // 删除旧文件
        await deleteScriptFile(script.file_path);
      }
    }
    
    const updated = db.get('scripts')
      .find({ id: parseInt(id) })
      .assign({
        name: name || script.name,
        description: description !== undefined ? description : script.description,
        language: language || script.language,
        file_path: newFilePath,
        updated_at: new Date().toISOString()
      })
      .write();
    
    ctx.body = {
      success: true,
      message: 'Script updated successfully',
      data: { ...updated, content: content !== undefined ? content : await readScriptFile(newFilePath) }
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 删除脚本
router.delete('/:id', async (ctx) => {
  const db = getDatabase();
  const { id } = ctx.params;
  
  try {
    const script = db.get('scripts')
      .find({ id: parseInt(id) })
      .value();
    
    if (!script) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: 'Script not found'
      };
      return;
    }
    
    // 删除脚本文件
    await deleteScriptFile(script.file_path);
    
    // 从数据库中删除脚本记录
    db.get('scripts')
      .remove({ id: parseInt(id) })
      .write();
    
    ctx.body = {
      success: true,
      message: 'Script deleted successfully'
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 测试运行脚本
router.post('/:id/test', async (ctx) => {
  const db = getDatabase();
  const { id } = ctx.params;
  // 改为调用带日志的 testScript
  const { testScript } = require('../utils/scheduler');
  
  try {
    const script = db.get('scripts')
      .find({ id: parseInt(id) })
      .value();
    
    if (!script) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: 'Script not found'
      };
      return;
    }
    
    const result = await testScript(script);
    
    ctx.body = {
      success: true,
      data: {
        success: result.success,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr
      }
    };
  } catch (error) {
    ctx.status = 200;
    ctx.body = {
      success: true,
      data: {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: error.message
      }
    };
  }
});

// 新增：下载脚本文件
router.get('/:id/download', async (ctx) => {
  const db = getDatabase();
  const { id } = ctx.params;
  const fs = require('fs-extra');

  try {
    const script = db.get('scripts')
      .find({ id: parseInt(id) })
      .value();

    if (!script) {
      ctx.status = 404;
      ctx.body = { success: false, message: 'Script not found' };
      return;
    }

    const fullPath = path.join(__dirname, '../..', script.file_path);
    const fileName = path.basename(fullPath);

    const exists = await fs.pathExists(fullPath);
    if (!exists) {
      ctx.status = 404;
      ctx.body = { success: false, message: 'Script file not found' };
      return;
    }

    ctx.set('Content-Type', 'application/octet-stream');
    ctx.set('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    ctx.body = fs.createReadStream(fullPath);
  } catch (error) {
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

module.exports = router;
