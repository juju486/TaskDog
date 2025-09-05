const cron = require('node-cron')
const { getDatabase } = require('../utils/database')
const { scheduleTask, unscheduleTask, logTaskExecution } = require('../utils/scheduler')

// 查询任务列表
async function list(ctx) {
  const db = getDatabase()
  try {
    const tasks = db.get('scheduled_tasks').value() || []
    // 未来可在此聚合 script_name/next_run 等扩展字段
    const tasksWithScripts = tasks
      .map((task) => ({ ...task }))
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
    const script = db.get('scripts').find({ id: task.script_id }).value()
    ctx.body = { success: true, data: { ...task, script_name: script ? script.name : 'Unknown Script' } }
  } catch (error) {
    ctx.status = 500
    ctx.body = { success: false, message: error.message }
  }
}

// 创建任务
async function create(ctx) {
  const db = getDatabase()
  const { name, script_id, cron_expression, status = 'inactive' } = ctx.request.body
  if (!name || !script_id || !cron_expression) {
    ctx.status = 400; ctx.body = { success: false, message: 'Name, script_id and cron_expression are required' }; return
  }
  try {
    const script = db.get('scripts').find({ id: parseInt(script_id) }).value()
    if (!script) { ctx.status = 400; ctx.body = { success: false, message: 'Script not found' }; return }
    const nextId = db.get('_meta.nextTaskId').value()
    const newTask = { id: nextId, name, script_id: parseInt(script_id), cron_expression, status, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    db.get('scheduled_tasks').push(newTask).write()
    db.set('_meta.nextTaskId', nextId + 1).write()
    if (status === 'active') scheduleTask(newTask)
    ctx.body = { success: true, data: newTask }
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message }
  }
}

// 更新任务
async function update(ctx) {
  const db = getDatabase()
  const { id } = ctx.params
  const { name, script_id, cron_expression, status } = ctx.request.body
  try {
    const taskId = parseInt(id)
    const existingTask = db.get('scheduled_tasks').find({ id: taskId }).value()
    if (!existingTask) { ctx.status = 404; ctx.body = { success: false, message: 'Task not found' }; return }
    if (script_id) {
      const script = db.get('scripts').find({ id: parseInt(script_id) }).value()
      if (!script) { ctx.status = 400; ctx.body = { success: false, message: 'Script not found' }; return }
    }
    const updatedTask = { ...existingTask, ...(name && { name }), ...(script_id && { script_id: parseInt(script_id) }), ...(cron_expression && { cron_expression }), ...(status && { status }), updated_at: new Date().toISOString() }
    db.get('scheduled_tasks').find({ id: taskId }).assign(updatedTask).write()
    unscheduleTask(taskId)
    if (updatedTask.status === 'active') scheduleTask(updatedTask)
    ctx.body = { success: true, message: 'Task updated successfully', data: updatedTask }
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
    try { logTaskExecution(taskId, task.script_id, 'info', 'Task started manually') } catch {}
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
    try { logTaskExecution(taskId, task.script_id, 'info', 'Task stopped manually') } catch {}
    ctx.body = { success: true, message: 'Task stopped successfully', data: { status: 'inactive' } }
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message }
  }
}

module.exports = { list, getById, create, update, remove, toggle, start, stop }
