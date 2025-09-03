const Router = require('koa-router');
const { getDatabase } = require('../utils/database');
const { 
  generateScriptFileName, 
  ensureScriptsDir,
  readScriptFile,
  writeScriptFile,
  deleteScriptFile,
  fileExists
} = require('../utils/fileManager');

const router = new Router();

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
  const { name, description, content, language = 'shell' } = ctx.request.body;
  
  if (!name || !content) {
    ctx.status = 400;
    ctx.body = {
      success: false,
      message: 'Name and content are required'
    };
    return;
  }
  
  try {
    await ensureScriptsDir();
    
    const id = db.get('_meta.nextScriptId').value();
    const fileName = generateScriptFileName(name, language);
    const filePath = `scripts/${fileName}`;
    
    // 写入脚本文件
    await writeScriptFile(filePath, content);
    
    const script = {
      id,
      name,
      description,
      language,
      file_path: filePath,
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
    
    // 如果内容有变化，更新文件
    if (content !== undefined) {
      await writeScriptFile(script.file_path, content);
    }
    
    // 如果名称或语言有变化，可能需要重命名文件
    let newFilePath = script.file_path;
    if ((name && name !== script.name) || (language && language !== script.language)) {
      const newFileName = generateScriptFileName(name || script.name, language || script.language);
      newFilePath = `scripts/${newFileName}`;
      
      if (newFilePath !== script.file_path) {
        // 读取旧文件内容
        const oldContent = content || await readScriptFile(script.file_path);
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
      data: { ...updated, content: content || await readScriptFile(newFilePath) }
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
  const { runScript } = require('../utils/scheduler');
  
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
    
    const result = await runScript(script, { id: 0, name: 'Test Run' });
    
    ctx.body = {
      success: true,
      data: result
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

module.exports = router;
