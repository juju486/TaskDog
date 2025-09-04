const Router = require('koa-router');
const { getDatabase } = require('../utils/database');

const router = new Router();

// 工具：统一将字符串转为时间戳（毫秒），兼容 'YYYY-MM-DD HH:mm:ss' 与 ISO 字符串
function toTimestamp(input) {
  if (!input) return NaN;
  if (input instanceof Date) return input.getTime();
  // 若为 "YYYY-MM-DD HH:mm:ss"，转为 ISO 近似格式
  if (typeof input === 'string' && input.includes(' ') && !input.includes('T')) {
    const isoLike = input.replace(' ', 'T');
    const d = new Date(isoLike);
    return d.getTime();
  }
  return new Date(input).getTime();
}

// 获取日志统计（需在 /:id 之前声明以免被拦截）
router.get('/stats/summary', async (ctx) => {
  const db = getDatabase();
  const { start_date, end_date, days } = ctx.query;
  
  try {
    let logs = db.get('logs').value() || [];

    if (days) {
      const n = parseInt(days, 10) || 7;
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - n + 1);
      const startTs = start.getTime();
      const endTs = end.getTime();
      logs = logs.filter(l => {
        const ts = toTimestamp(l.created_at);
        return !isNaN(ts) && ts >= startTs && ts <= endTs;
      });
    } else {
      // 时间过滤（可选）
      const startTs = toTimestamp(start_date);
      const endTs = toTimestamp(end_date);
      if (!isNaN(startTs)) {
        logs = logs.filter(log => toTimestamp(log.created_at) >= startTs);
      }
      if (!isNaN(endTs)) {
        logs = logs.filter(log => toTimestamp(log.created_at) <= endTs);
      }
    }

    const stats = {
      total: logs.length,
      by_type: {},
      by_date: {},
      successes: 0,
      errors: 0,
      info: 0
    };

    logs.forEach(log => {
      // 类型计数
      stats.by_type[log.type] = (stats.by_type[log.type] || 0) + 1;
      if (log.type === 'success') stats.successes++;
      if (log.type === 'error') stats.errors++;
      if (log.type === 'info') stats.info++;
      
      // 日期计数（YYYY-MM-DD）
      const date = (log.created_at || '').split('T')[0];
      stats.by_date[date] = (stats.by_date[date] || 0) + 1;
    });

    ctx.body = { success: true, data: stats };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

// 获取日志类型列表（在 /:id 之前）
router.get('/meta/types', async (ctx) => {
  const db = getDatabase();
  try {
    const logs = db.get('logs').value() || [];
    const types = [...new Set(logs.map(log => log.type))].sort();
    ctx.body = { success: true, data: types };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

// 获取日志列表
router.get('/', async (ctx) => {
  const db = getDatabase();
  const { 
    page = 1, 
    limit = 50, 
    type, 
    task_id, 
    script_id,
    start_date,
    end_date,
    keyword
  } = ctx.query;
  
  try {
    let logs = db.get('logs').value() || [];
    
    // 过滤条件
    if (type) {
      logs = logs.filter(log => log.type === type);
    }
    
    if (task_id) {
      logs = logs.filter(log => log.task_id === parseInt(task_id));
    }
    
    if (script_id) {
      logs = logs.filter(log => log.script_id === parseInt(script_id));
    }

    // 时间过滤改为按时间戳比较，避免字符串比较问题
    const startTs = toTimestamp(start_date);
    const endTs = toTimestamp(end_date);
    if (!isNaN(startTs)) {
      logs = logs.filter(log => toTimestamp(log.created_at) >= startTs);
    }
    if (!isNaN(endTs)) {
      logs = logs.filter(log => toTimestamp(log.created_at) <= endTs);
    }

    // 关键字过滤（消息与详情）
    if (keyword && String(keyword).trim()) {
      const kw = String(keyword).toLowerCase();
      logs = logs.filter(l =>
        (l.message && l.message.toLowerCase().includes(kw)) ||
        (l.details && String(l.details).toLowerCase().includes(kw))
      );
    }
    
    // 按时间倒序排列
    logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    // 分页
    const total = logs.length;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const paginatedLogs = logs.slice(offset, offset + parseInt(limit));
    
    // 关联脚本和任务信息
    const scripts = db.get('scripts').value() || [];
    const tasks = db.get('scheduled_tasks').value() || [];
    
    const logsWithInfo = paginatedLogs.map(log => {
      const script = scripts.find(s => s.id === log.script_id);
      const task = tasks.find(t => t.id === log.task_id);
      
      return {
        ...log,
        script_name: script ? script.name : null,
        task_name: task ? task.name : null
      };
    });
    
    ctx.body = {
      success: true,
      data: {
        logs: logsWithInfo,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 获取单个日志（必须放在固定路径之后）
router.get('/:id', async (ctx) => {
  const db = getDatabase();
  const { id } = ctx.params;
  
  try {
    const log = db.get('logs').find({ id: parseInt(id) }).value();
    
    if (!log) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: 'Log not found'
      };
      return;
    }
    
    // 关联脚本和任务信息
    const script = db.get('scripts').find({ id: log.script_id }).value();
    const task = db.get('scheduled_tasks').find({ id: log.task_id }).value();
    
    const logWithInfo = {
      ...log,
      script_name: script ? script.name : null,
      task_name: task ? task.name : null
    };
    
    ctx.body = {
      success: true,
      data: logWithInfo
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 创建日志
router.post('/', async (ctx) => {
  const db = getDatabase();
  const { type, message, script_id, task_id, details } = ctx.request.body;
  
  if (!type || !message) {
    ctx.status = 400;
    ctx.body = {
      success: false,
      message: 'Type and message are required'
    };
    return;
  }
  
  try {
    // 获取下一个 ID
    const nextId = db.get('_meta.nextLogId').value();
    
    const newLog = {
      id: nextId,
      type,
      message,
      script_id: script_id ? parseInt(script_id) : null,
      task_id: task_id ? parseInt(task_id) : null,
      details: details || null,
      created_at: new Date().toISOString()
    };
    
    // 添加日志
    db.get('logs').push(newLog).write();
    
    // 更新下一个 ID
    db.set('_meta.nextLogId', nextId + 1).write();
    
    ctx.body = {
      success: true,
      data: newLog
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 删除日志
router.delete('/:id', async (ctx) => {
  const db = getDatabase();
  const { id } = ctx.params;
  
  try {
    const existingLog = db.get('logs').find({ id: parseInt(id) }).value();
    
    if (!existingLog) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: 'Log not found'
      };
      return;
    }
    
    // 删除日志
    db.get('logs').remove({ id: parseInt(id) }).write();
    
    ctx.body = {
      success: true,
      message: 'Log deleted successfully'
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 批量删除日志（保留原有 / 删除接口）
router.delete('/', async (ctx) => {
  const db = getDatabase();
  const { ids, type, before_date } = ctx.request.body;
  
  try {
    let deletedCount = 0;
    
    if (ids && Array.isArray(ids)) {
      // 按 ID 删除
      for (const id of ids) {
        const result = db.get('logs').remove({ id: parseInt(id) }).write();
        if (result.length > 0) deletedCount++;
      }
    } else if (type || before_date) {
      // 按条件删除
      let logsToDelete = db.get('logs').value() || [];
      
      if (type) {
        logsToDelete = logsToDelete.filter(log => log.type === type);
      }
      
      if (before_date) {
        const beforeTs = toTimestamp(before_date);
        if (!isNaN(beforeTs)) {
          logsToDelete = logsToDelete.filter(log => toTimestamp(log.created_at) < beforeTs);
        }
      }
      
      for (const log of logsToDelete) {
        db.get('logs').remove({ id: log.id }).write();
        deletedCount++;
      }
    }
    
    ctx.body = {
      success: true,
      message: `Deleted ${deletedCount} logs successfully`,
      data: { deletedCount }
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 兼容前端：DELETE /logs/cleanup?days=30&type=error
router.delete('/cleanup', async (ctx) => {
  const db = getDatabase();
  const { days = 30, type = '' } = ctx.query; // 使用 ctx.query
  
  try {
    const n = parseInt(days, 10) || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - n); // 修复变量名拼写
    const cutoffTs = cutoff.getTime();
    
    const logs = db.get('logs').value() || [];
    const toDelete = logs.filter(l => {
      const ts = toTimestamp(l.created_at);
      return (!isNaN(ts) && ts < cutoffTs) && (!type || l.type === type);
    });
    
    toDelete.forEach(l => db.get('logs').remove({ id: l.id }).write());
    
    ctx.body = { success: true, message: `Deleted ${toDelete.length} logs successfully`, data: { deletedCount: toDelete.length } };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

module.exports = router;
