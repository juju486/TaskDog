const cron = require('node-cron')
const { getDatabase } = require('../utils/database')
const { scheduleTask, unscheduleTask, logTaskExecution, executeTask } = require('../utils/scheduler')

// 查询任务列表
async function list(ctx) {
  const db = getDatabase()
  try {
    const tasks = db.get('scheduled_tasks').value() || []
    const scripts = db.get('scripts').value() || []
    const scriptMap = new Map(scripts.map(s => [s.id, s]))
    const tasksWithScripts = tasks
      .map((task) => {
        const scriptIds = Array.isArray(task.script_ids) && task.script_ids.length
          ? task.script_ids
          : (task.script_id ? [task.script_id] : [])
        const names = scriptIds.map(id => scriptMap.get(id)?.name).filter(Boolean)
        return { ...task, script_name: names.length ? names.join(', ') : 'Unknown Script' }
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    ctx.body = { success: true, data: tasksWithScripts }
  } catch (error) {
    ctx.status = 500
    ctx.body = { success: false, message: error.message }
  }
}

// 获取单个任务
async function getById(ctx) {
  const db = getDatabase()
  const { id } = ctx.params
  try {
    const task = db.get('scheduled_tasks').find({ id: parseInt(id) }).value()
    if (!task) { ctx.status = 404; ctx.body = { success: false, message: 'Task not found' }; return }
    const scripts = db.get('scripts').value() || []
    const scriptMap = new Map(scripts.map(s => [s.id, s]))
    const scriptIds = Array.isArray(task.script_ids) && task.script_ids.length ? task.script_ids : (task.script_id ? [task.script_id] : [])
    const names = scriptIds.map(sid => scriptMap.get(sid)?.name).filter(Boolean)
    ctx.body = { success: true, data: { ...task, script_name: names.length ? names.join(', ') : 'Unknown Script' } }
  } catch (error) {
    ctx.status = 500
    ctx.body = { success: false, message: error.message }
  }
}

// 创建任务（支持多脚本）
async function create(ctx) {
  const db = getDatabase()
  const { name, script_id, script_ids, cron_expression, status = 'inactive' } = ctx.request.body
  if (!name || !cron_expression || (!script_id && (!Array.isArray(script_ids) || script_ids.length === 0))) {
    ctx.status = 400; ctx.body = { success: false, message: 'Name, cron_expression and script(s) are required' }; return
  }
  try {
    // 归一化脚本ID数组
    const ids = Array.isArray(script_ids) && script_ids.length ? script_ids.map(n => parseInt(n)).filter(Boolean) : [parseInt(script_id)]
    // 校验脚本存在
    const existing = db.get('scripts').filter(s => ids.includes(s.id)).value()
    if (!existing || existing.length !== ids.length) { ctx.status = 400; ctx.body = { success: false, message: 'Some scripts not found' }; return }

    const nextId = db.get('_meta.nextTaskId').value()
    const newTask = { id: nextId, name, script_ids: ids, cron_expression, status, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    // 兼容旧字段：保留第一个脚本为 script_id（便于旧逻辑/日志）
    newTask.script_id = ids[0]

    db.get('scheduled_tasks').push(newTask).write()
    db.set('_meta.nextTaskId', nextId + 1).write()
    if (status === 'active') scheduleTask(newTask)

    const names = existing.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)).map(s => s.name)
    ctx.body = { success: true, data: { ...newTask, script_name: names.join(', ') } }
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message }
  }
}

// 更新任务（支持多脚本）
async function update(ctx) {
  const db = getDatabase()
  const { id } = ctx.params
  const { name, script_id, script_ids, cron_expression, status } = ctx.request.body
  try {
    const taskId = parseInt(id)
    const existingTask = db.get('scheduled_tasks').find({ id: taskId }).value()
    if (!existingTask) { ctx.status = 404; ctx.body = { success: false, message: 'Task not found' }; return }

    let ids = null
    if (Array.isArray(script_ids)) {
      if (!script_ids.length) { ctx.status = 400; ctx.body = { success: false, message: 'At least one script is required' }; return }
      ids = script_ids.map(n => parseInt(n)).filter(Boolean)
    } else if (script_id) {
      ids = [parseInt(script_id)]
    }

    if (ids) {
      const existing = db.get('scripts').filter(s => ids.includes(s.id)).value()
      if (!existing || existing.length !== ids.length) { ctx.status = 400; ctx.body = { success: false, message: 'Some scripts not found' }; return }
    }

    const updatedTask = {
      ...existingTask,
      ...(name && { name }),
      ...(cron_expression && { cron_expression }),
      ...(typeof status === 'string' && { status }),
      ...(ids ? { script_ids: ids, script_id: ids[0] } : {}),
      updated_at: new Date().toISOString()
    }

    db.get('scheduled_tasks').find({ id: taskId }).assign(updatedTask).write()

    unscheduleTask(taskId)
    if (updatedTask.status === 'active') scheduleTask(updatedTask)

    const scripts = db.get('scripts').value() || []
    const scriptMap = new Map(scripts.map(s => [s.id, s]))
    const finalIds = Array.isArray(updatedTask.script_ids) ? updatedTask.script_ids : (updatedTask.script_id ? [updatedTask.script_id] : [])
    const names = finalIds.map(sid => scriptMap.get(sid)?.name).filter(Boolean)

    ctx.body = { success: true, message: 'Task updated successfully', data: { ...updatedTask, script_name: names.length ? names.join(', ') : 'Unknown Script' } }
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message }
  }
}

// 删除任务
async function remove(ctx) {
  const db = getDatabase()
  const { id } = ctx.params
  try {
    const taskId = parseInt(id)
    const existingTask = db.get('scheduled_tasks').find({ id: taskId }).value()
    if (!existingTask) { ctx.status = 404; ctx.body = { success: false, message: 'Task not found' }; return }
    unscheduleTask(taskId)
    db.get('scheduled_tasks').remove({ id: taskId }).write()
    ctx.body = { success: true, message: 'Task deleted successfully' }
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message }
  }
}

// 切换状态
async function toggle(ctx) {
  const db = getDatabase()
  const { id } = ctx.params
  try {
    const taskId = parseInt(id)
    const task = db.get('scheduled_tasks').find({ id: taskId }).value()
    if (!task) { ctx.status = 404; ctx.body = { success: false, message: 'Task not found' }; return }
    const newStatus = task.status === 'active' ? 'inactive' : 'active'
    db.get('scheduled_tasks').find({ id: taskId }).assign({ status: newStatus, updated_at: new Date().toISOString() }).write()
    unscheduleTask(taskId)
    if (newStatus === 'active') scheduleTask({ ...task, status: newStatus })
    ctx.body = { success: true, message: `Task ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`, data: { status: newStatus } }
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message }
  }
}

// 立即执行一次（不改变状态）
async function runOnce(ctx) {
  const db = getDatabase()
  const { id } = ctx.params
  try {
    const taskId = parseInt(id, 10)
    const task = db.get('scheduled_tasks').find({ id: taskId }).value()
    if (!task) { ctx.status = 404; ctx.body = { success: false, message: 'Task not found' }; return }
    const result = await executeTask(task)
    // 取回最新任务（含 last_run 更新）并聚合脚本名
    const refreshed = db.get('scheduled_tasks').find({ id: taskId }).value()
    const scripts = db.get('scripts').value() || []
    const scriptMap = new Map(scripts.map(s => [s.id, s]))
    const finalIds = Array.isArray(refreshed?.script_ids) && refreshed.script_ids.length ? refreshed.script_ids : (refreshed?.script_id ? [refreshed.script_id] : [])
    const names = finalIds.map(sid => scriptMap.get(sid)?.name).filter(Boolean)
    ctx.body = { success: true, message: 'Task executed once', data: { result, task: { ...refreshed, script_name: names.length ? names.join(', ') : 'Unknown Script' } } }
  } catch (error) {
    ctx.status = 500
    ctx.body = { success: false, message: error.message }
  }
}

// 启动
async function start(ctx) {
  const db = getDatabase()
  const { id } = ctx.params
  try {
    const taskId = parseInt(id, 10)
    const task = db.get('scheduled_tasks').find({ id: taskId }).value()
    if (!task) { ctx.status = 404; ctx.body = { success: false, message: 'Task not found' }; return }
    if (!cron.validate(task.cron_expression)) { ctx.status = 400; ctx.body = { success: false, message: 'Invalid cron expression' }; return }
    const updatedTask = { ...task, status: 'active', updated_at: new Date().toISOString() }
    db.get('scheduled_tasks').find({ id: taskId }).assign({ status: 'active', updated_at: updatedTask.updated_at }).write()
    unscheduleTask(taskId)
    scheduleTask(updatedTask)
    const firstScriptId = Array.isArray(task.script_ids) && task.script_ids.length ? task.script_ids[0] : task.script_id
    try { logTaskExecution(taskId, firstScriptId || null, 'info', 'Task started manually') } catch {}
    ctx.body = { success: true, message: 'Task started successfully', data: { status: 'active' } }
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message }
  }
}

// 停止
async function stop(ctx) {
  const db = getDatabase()
  const { id } = ctx.params
  try {
    const taskId = parseInt(id, 10)
    const task = db.get('scheduled_tasks').find({ id: taskId }).value()
    if (!task) { ctx.status = 404; ctx.body = { success: false, message: 'Task not found' }; return }
    db.get('scheduled_tasks').find({ id: taskId }).assign({ status: 'inactive', updated_at: new Date().toISOString() }).write()
    unscheduleTask(taskId)
    const firstScriptId = Array.isArray(task.script_ids) && task.script_ids.length ? task.script_ids[0] : task.script_id
    try { logTaskExecution(taskId, firstScriptId || null, 'info', 'Task stopped manually') } catch {}
    ctx.body = { success: true, message: 'Task stopped successfully', data: { status: 'inactive' } }
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message }
  }
}

module.exports = { list, getById, create, update, remove, toggle, runOnce, start, stop }
