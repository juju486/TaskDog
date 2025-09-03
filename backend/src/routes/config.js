const Router = require('koa-router');
const { getDatabase } = require('../utils/database');

const router = new Router();

// 获取所有配置
router.get('/', async (ctx) => {
  const db = getDatabase();
  const { category } = ctx.query;
  
  try {
    let configs = db.get('configs').value() || [];
    
    if (category) {
      configs = configs.filter(config => config.category === category);
    }
    
    // 按类别和键排序
    configs.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.key.localeCompare(b.key);
    });
    
    ctx.body = {
      success: true,
      data: configs
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 获取单个配置
router.get('/:key', async (ctx) => {
  const db = getDatabase();
  const { key } = ctx.params;
  
  try {
    const config = db.get('configs').find({ key }).value();
    
    if (!config) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: 'Config not found'
      };
      return;
    }
    
    ctx.body = {
      success: true,
      data: config
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 创建配置
router.post('/', async (ctx) => {
  const db = getDatabase();
  const { key, value, category = 'general', description = '' } = ctx.request.body;
  
  if (!key || value === undefined) {
    ctx.status = 400;
    ctx.body = {
      success: false,
      message: 'Key and value are required'
    };
    return;
  }
  
  try {
    // 检查配置是否已存在
    const existingConfig = db.get('configs').find({ key }).value();
    if (existingConfig) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: 'Config key already exists'
      };
      return;
    }
    
    // 获取下一个 ID
    const nextId = db.get('_meta.nextConfigId').value();
    
    const newConfig = {
      id: nextId,
      key,
      value,
      category,
      description,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // 添加配置
    db.get('configs').push(newConfig).write();
    
    // 更新下一个 ID
    db.set('_meta.nextConfigId', nextId + 1).write();
    
    ctx.body = {
      success: true,
      data: newConfig
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 更新配置
router.put('/:key', async (ctx) => {
  const db = getDatabase();
  const { key } = ctx.params;
  const { value, category, description } = ctx.request.body;
  
  try {
    const existingConfig = db.get('configs').find({ key }).value();
    
    if (!existingConfig) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: 'Config not found'
      };
      return;
    }
    
    // 更新配置
    const updatedConfig = {
      ...existingConfig,
      ...(value !== undefined && { value }),
      ...(category && { category }),
      ...(description !== undefined && { description }),
      updated_at: new Date().toISOString()
    };
    
    db.get('configs')
      .find({ key })
      .assign(updatedConfig)
      .write();
    
    ctx.body = {
      success: true,
      message: 'Config updated successfully',
      data: updatedConfig
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 删除配置
router.delete('/:key', async (ctx) => {
  const db = getDatabase();
  const { key } = ctx.params;
  
  try {
    const existingConfig = db.get('configs').find({ key }).value();
    
    if (!existingConfig) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: 'Config not found'
      };
      return;
    }
    
    // 删除配置
    db.get('configs').remove({ key }).write();
    
    ctx.body = {
      success: true,
      message: 'Config deleted successfully'
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 批量更新配置
router.patch('/batch', async (ctx) => {
  const db = getDatabase();
  const { configs } = ctx.request.body;
  
  if (!Array.isArray(configs)) {
    ctx.status = 400;
    ctx.body = {
      success: false,
      message: 'configs must be an array'
    };
    return;
  }
  
  try {
    const updatedConfigs = [];
    
    for (const configData of configs) {
      const { key, value, category, description } = configData;
      
      if (!key || value === undefined) {
        continue;
      }
      
      const existingConfig = db.get('configs').find({ key }).value();
      
      if (existingConfig) {
        // 更新现有配置
        const updatedConfig = {
          ...existingConfig,
          value,
          ...(category && { category }),
          ...(description !== undefined && { description }),
          updated_at: new Date().toISOString()
        };
        
        db.get('configs')
          .find({ key })
          .assign(updatedConfig)
          .write();
        
        updatedConfigs.push(updatedConfig);
      } else {
        // 创建新配置
        const nextId = db.get('_meta.nextConfigId').value();
        
        const newConfig = {
          id: nextId,
          key,
          value,
          category: category || 'general',
          description: description || '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        db.get('configs').push(newConfig).write();
        db.set('_meta.nextConfigId', nextId + 1).write();
        
        updatedConfigs.push(newConfig);
      }
    }
    
    ctx.body = {
      success: true,
      message: 'Configs updated successfully',
      data: updatedConfigs
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 获取配置分类
router.get('/meta/categories', async (ctx) => {
  const db = getDatabase();
  
  try {
    const configs = db.get('configs').value() || [];
    const categories = [...new Set(configs.map(config => config.category))].sort();
    
    ctx.body = {
      success: true,
      data: categories
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
