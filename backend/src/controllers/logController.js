const { getDatabase } = require('../utils/database');

// 中国时区时间字符串：YYYY-MM-DD HH:mm:ss
function nowCN() {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date());
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}

function toTimestamp(input) {
  if (!input) return NaN;
  if (input instanceof Date) return input.getTime();
  if (typeof input === 'string' && input.includes(' ') && !input.includes('T')) {
    const isoLike = input.replace(' ', 'T');
    const d = new Date(isoLike);
    return d.getTime();
  }
  return new Date(input).getTime();
}

// 统计摘要
async function statsSummary(ctx) {
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
      logs = logs.filter(l => { const ts = toTimestamp(l.created_at); return !isNaN(ts) && ts >= startTs && ts <= endTs; });
    } else {
      const startTs = toTimestamp(start_date);
      const endTs = toTimestamp(end_date);
      if (!isNaN(startTs)) logs = logs.filter(log => toTimestamp(log.created_at) >= startTs);
      if (!isNaN(endTs)) logs = logs.filter(log => toTimestamp(log.created_at) <= endTs);
    }
    const stats = { total: logs.length, by_type: {}, by_date: {}, successes: 0, errors: 0, info: 0 };
    logs.forEach(log => {
      stats.by_type[log.type] = (stats.by_type[log.type] || 0) + 1;
      if (log.type === 'success') stats.successes++;
      if (log.type === 'error') stats.errors++;
      if (log.type === 'info') stats.info++;
      const date = (log.created_at || '').split('T')[0];
      stats.by_date[date] = (stats.by_date[date] || 0) + 1;
    });
    ctx.body = { success: true, data: stats };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 获取日志类型列表
async function metaTypes(ctx) {
  const db = getDatabase();
  try {
    const logs = db.get('logs').value() || [];
    const types = [...new Set(logs.map(log => log.type))].sort();
    ctx.body = { success: true, data: types };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 列表
async function list(ctx) {
  const db = getDatabase();
  const { page = 1, limit = 50, type, task_id, script_id, start_date, end_date, keyword } = ctx.query;
  try {
    let logs = db.get('logs').value() || [];
    if (type) logs = logs.filter(log => log.type === type);
    if (task_id) logs = logs.filter(log => log.task_id === parseInt(task_id));
    if (script_id) logs = logs.filter(log => log.script_id === parseInt(script_id));
    const startTs = toTimestamp(start_date);
    const endTs = toTimestamp(end_date);
    if (!isNaN(startTs)) logs = logs.filter(log => toTimestamp(log.created_at) >= startTs);
    if (!isNaN(endTs)) logs = logs.filter(log => toTimestamp(log.created_at) <= endTs);
    if (keyword && String(keyword).trim()) {
      const kw = String(keyword).toLowerCase();
      logs = logs.filter(l => (l.message && l.message.toLowerCase().includes(kw)) || (l.details && String(l.details).toLowerCase().includes(kw)));
    }
    logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = logs.length;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const paginatedLogs = logs.slice(offset, offset + parseInt(limit));
    const scripts = db.get('scripts').value() || [];
    const tasks = db.get('scheduled_tasks').value() || [];
    const logsWithInfo = paginatedLogs.map(log => {
      const script = scripts.find(s => s.id === log.script_id);
      const task = tasks.find(t => t.id === log.task_id);
      return { ...log, script_name: script ? script.name : null, task_name: task ? task.name : null };
    });
    ctx.body = { success: true, data: { logs: logsWithInfo, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } } };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 获取单个
async function getById(ctx) {
  const db = getDatabase();
  const { id } = ctx.params;
  try {
    const log = db.get('logs').find({ id: parseInt(id) }).value();
    if (!log) { ctx.status = 404; ctx.body = { success: false, message: 'Log not found' }; return; }
    const script = db.get('scripts').find({ id: log.script_id }).value();
    const task = db.get('scheduled_tasks').find({ id: log.task_id }).value();
    ctx.body = { success: true, data: { ...log, script_name: script ? script.name : null, task_name: task ? task.name : null } };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 创建
async function create(ctx) {
  const db = getDatabase();
  const { type, message, script_id, task_id, details } = ctx.request.body;
  if (!type || !message) { ctx.status = 400; ctx.body = { success: false, message: 'Type and message are required' }; return; }
  try {
    const nextId = db.get('_meta.nextLogId').value();
  const newLog = { id: nextId, type, message, script_id: script_id ? parseInt(script_id) : null, task_id: task_id ? parseInt(task_id) : null, details: details || null, created_at: nowCN() };
    db.get('logs').push(newLog).write();
    db.set('_meta.nextLogId', nextId + 1).write();
    ctx.body = { success: true, data: newLog };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 删除单个
async function remove(ctx) {
  const db = getDatabase();
  const { id } = ctx.params;
  try {
    const existingLog = db.get('logs').find({ id: parseInt(id) }).value();
    if (!existingLog) { ctx.status = 404; ctx.body = { success: false, message: 'Log not found' }; return; }
    db.get('logs').remove({ id: parseInt(id) }).write();
    ctx.body = { success: true, message: 'Log deleted successfully' };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 批量删除
async function removeBatch(ctx) {
  const db = getDatabase();
  const { ids, type, before_date } = ctx.request.body || {};
  try {
    let deletedCount = 0;
    if (ids && Array.isArray(ids)) {
      for (const id of ids) {
        const result = db.get('logs').remove({ id: parseInt(id) }).write();
        if (result.length > 0) deletedCount++;
      }
    } else if (type || before_date) {
      let logsToDelete = db.get('logs').value() || [];
      if (type) logsToDelete = logsToDelete.filter(log => log.type === type);
      if (before_date) {
        const beforeTs = toTimestamp(before_date);
        if (!isNaN(beforeTs)) logsToDelete = logsToDelete.filter(log => toTimestamp(log.created_at) < beforeTs);
      }
      for (const log of logsToDelete) { db.get('logs').remove({ id: log.id }).write(); deletedCount++; }
    }
    ctx.body = { success: true, message: `Deleted ${deletedCount} logs successfully`, data: { deletedCount } };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 清理过期
async function cleanup(ctx) {
  const db = getDatabase();
  const { days = 30, type = '' } = ctx.query;
  try {
    const n = parseInt(days, 10) || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - n);
    const cutoffTs = cutoff.getTime();
    const logs = db.get('logs').value() || [];
    const toDelete = logs.filter(l => {
      const ts = toTimestamp(l.created_at);
      return (!isNaN(ts) && ts < cutoffTs) && (!type || l.type === type);
    });
    toDelete.forEach(l => db.get('logs').remove({ id: l.id }).write());
    ctx.body = { success: true, message: `Deleted ${toDelete.length} logs successfully`, data: { deletedCount: toDelete.length } };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

module.exports = { statsSummary, metaTypes, list, getById, create, remove, removeBatch, cleanup };
