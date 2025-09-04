const Router = require('koa-router');
const { getDatabase } = require('../utils/database');
const router = new Router();

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

module.exports = router;
