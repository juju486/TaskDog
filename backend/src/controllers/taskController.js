const cron = require('node-cron')
const { getDatabase } = require('../utils/database')
const { scheduleTask, unscheduleTask, logTaskExecution, executeTask } = require('../utils/scheduler')

function isPlainObject(v) { return v && typeof v === 'object' && !Array.isArray(v) }
function normalizeScriptParams(input) {
  if (Array.isArray(input)) return input
  if (isPlainObject(input)) return input
  return undefined
}

// ===== 分组V2辅助（任务） =====
function getGroupV2ConfigTask() {
  const db = getDatabase()
  const cfg = db.get('config_groups').value() || {}
  const v2 = cfg.groupsV2 || { script: [], task: [], nextScriptGroupId: 1, nextTaskGroupId: 1 }
  const groups = cfg.groups || { scriptGroups: [], taskGroups: [] }
  return { cfg, v2, groups }
}
function findGroupIdByNameTask(name) {
  const { v2 } = getGroupV2ConfigTask()
  const list = Array.isArray(v2.task) ? v2.task : []
  const item = list.find((x) => x && x.name === name)
  return item ? item.id : undefined
}
function findGroupNameByIdTask(id) {
  const { v2 } = getGroupV2ConfigTask()
  const list = Array.isArray(v2.task) ? v2.task : []
  const item = list.find((x) => Number(x.id) === Number(id))
  return item ? item.name : undefined
}
function ensureTaskGroup(name) {
  if (!name) return { id: undefined, name: '' }
  const db = getDatabase()
  const { cfg, v2, groups } = getGroupV2ConfigTask()
  const list = Array.isArray(v2.task) ? v2.task : []
  const exist = list.find((x) => x.name === name)
  if (exist) return { id: exist.id, name: exist.name }
  // 不存在则创建
  const id = (v2.nextTaskGroupId && Number.isFinite(Number(v2.nextTaskGroupId))) ? v2.nextTaskGroupId : 1
  const nextId = id + 1
  const newList = list.concat([{ id, name }])
  const taskGroups = Array.from(new Set([...(groups.taskGroups || []), name]))
  const nextV2 = { ...v2, task: newList, nextTaskGroupId: nextId }
  const nextCfg = { ...cfg, groups: { ...groups, taskGroups }, groupsV2: nextV2 }
  db.set('config_groups', nextCfg).write()
  return { id, name }
}
function resolveIncomingTaskGroup(payload) {
  const gName = typeof payload.group === 'string' && payload.group.trim() ? payload.group.trim() : ''
  const gidRaw = payload.group_id
  const gid = Number.isFinite(Number(gidRaw)) ? Number(gidRaw) : undefined
  // 优先ID -> 名称
  if (gid) {
    const name = findGroupNameByIdTask(gid)
    if (name) return { group: name, group_id: gid }
    // ID 无效则回退到名称处理
  }
  // 名称 -> ID（必要时创建）
  if (gName) {
    const id = findGroupIdByNameTask(gName) || ensureTaskGroup(gName).id
    return { group: gName, group_id: id }
  }
  return { group: undefined, group_id: undefined }
}

// 查询任务列表
async function list(ctx) {
  const db = getDatabase()
  try {
    const q = ctx.request.query || {}
    const groupFilter = typeof q.group === 'string' && q.group.trim() ? q.group.trim() : null
    const groupIdFilter = (q.groupId ?? q.group_id)
    const gid = Number.isFinite(Number(groupIdFilter)) ? Number(groupIdFilter) : null

    let tasks = db.get('scheduled_tasks').value() || []
    if (gid != null) tasks = tasks.filter(t => Number(t.group_id) === gid)
    else if (groupFilter) tasks = tasks.filter(t => (t.group || '') === groupFilter)

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
  const { name, script_id, script_ids, cron_expression, status = 'inactive', script_params } = ctx.request.body
  // 同时支持 { group, group_id }
  const incoming = ctx.request.body || {}
  const resolved = resolveIncomingTaskGroup(incoming)
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
    // 可选：保存脚本参数（对象或数组）
    const sp = normalizeScriptParams(script_params)
    if (sp !== undefined) newTask.script_params = sp
    // 分组（名称与ID）
    if (resolved.group) newTask.group = resolved.group
    if (resolved.group_id) newTask.group_id = resolved.group_id

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
  const { name, script_id, script_ids, cron_expression, status, script_params } = ctx.request.body
  // 同时支持 { group, group_id }
  const incoming = ctx.request.body || {}
  const resolved = resolveIncomingTaskGroup(incoming)
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

    // 分组（允许清空；若解析到值则同时写入 name 与 id）
    if (incoming.hasOwnProperty('group') || incoming.hasOwnProperty('group_id')) {
      if (resolved.group || resolved.group_id) {
        updatedTask.group = resolved.group
        updatedTask.group_id = resolved.group_id
      } else {
        // 清空
        delete updatedTask.group
        delete updatedTask.group_id
      }
    }

    // 更新脚本参数（允许移除）
    if (script_params !== undefined) {
      const sp = normalizeScriptParams(script_params)
      if (sp !== undefined) updatedTask.script_params = sp
      else delete updatedTask.script_params
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
