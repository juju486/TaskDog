const Router = require('koa-router');
const { getDatabase } = require('../utils/database');
const { scheduleTask, unscheduleTask, logTaskExecution } = require('../utils/scheduler');
const cron = require('node-cron');

const router = new Router();

// 获取所有定时任务
router.get('/', async (ctx) => {
  const db = getDatabase();
  
  try {
    const tasks = db.get('scheduled_tasks').value() || [];
    const scripts = db.get('scripts').value() || [];
    
    // 关联脚本信息
    const tasksWithScripts = tasks.map(task => {
      const script = scripts.find(s => s.id === task.script_id);
      return {
        ...task,
      };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    ctx.body = {
      success: true,
      data: tasksWithScripts
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 获取单个定时任务
router.get('/:id', async (ctx) => {
  const db = getDatabase();
  const { id } = ctx.params;
  
  try {
    const task = db.get('scheduled_tasks').find({ id: parseInt(id) }).value();
    
    if (!task) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: 'Task not found'
      };
      return;
    }
    
    // 获取关联的脚本信息
    const script = db.get('scripts').find({ id: task.script_id }).value();
    const taskWithScript = {
      ...task,
      script_name: script ? script.name : 'Unknown Script'
    };
    
    ctx.body = {
      success: true,
      data: taskWithScript
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 创建定时任务
router.post('/', async (ctx) => {
  const db = getDatabase();
  const { name, script_id, cron_expression, status = 'inactive' } = ctx.request.body;
  
  if (!name || !script_id || !cron_expression) {
    ctx.status = 400;
    ctx.body = {
      success: false,
      message: 'Name, script_id and cron_expression are required'
    };
    return;
  }
  
  try {
    // 验证脚本是否存在
    const script = db.get('scripts').find({ id: parseInt(script_id) }).value();
    if (!script) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: 'Script not found'
      };
      return;
    }
    
    // 获取下一个 ID
    const nextId = db.get('_meta.nextTaskId').value();
    
    const newTask = {
      id: nextId,
      name,
      script_id: parseInt(script_id),
      cron_expression,
      status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // 添加任务
    db.get('scheduled_tasks').push(newTask).write();
    
    // 更新下一个 ID
    db.set('_meta.nextTaskId', nextId + 1).write();
    
    // 如果状态是激活的，立即调度任务
    if (status === 'active') {
      scheduleTask(newTask);
    }
    
    ctx.body = {
      success: true,
      data: newTask
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 更新定时任务
router.put('/:id', async (ctx) => {
  const db = getDatabase();
  const { id } = ctx.params;
  const { name, script_id, cron_expression, status } = ctx.request.body;
  
  try {
    const taskId = parseInt(id);
    const existingTask = db.get('scheduled_tasks').find({ id: taskId }).value();
    
    if (!existingTask) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: 'Task not found'
      };
      return;
    }
    
    // 验证脚本是否存在
    if (script_id) {
      const script = db.get('scripts').find({ id: parseInt(script_id) }).value();
      if (!script) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          message: 'Script not found'
        };
        return;
      }
    }
    
    // 更新任务
    const updatedTask = {
      ...existingTask,
      ...(name && { name }),
      ...(script_id && { script_id: parseInt(script_id) }),
      ...(cron_expression && { cron_expression }),
      ...(status && { status }),
      updated_at: new Date().toISOString()
    };
    
    db.get('scheduled_tasks')
      .find({ id: taskId })
      .assign(updatedTask)
      .write();
    
    // 重新调度任务
    unscheduleTask(taskId);
    if (updatedTask.status === 'active') {
      scheduleTask(updatedTask);
    }
    
    ctx.body = {
      success: true,
      message: 'Task updated successfully',
      data: updatedTask
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 删除定时任务
router.delete('/:id', async (ctx) => {
  const db = getDatabase();
  const { id } = ctx.params;
  
  try {
    const taskId = parseInt(id);
    const existingTask = db.get('scheduled_tasks').find({ id: taskId }).value();
    
    if (!existingTask) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: 'Task not found'
      };
      return;
    }
    
    // 取消调度
    unscheduleTask(taskId);
    
    // 删除任务
    db.get('scheduled_tasks').remove({ id: taskId }).write();
    
    ctx.body = {
      success: true,
      message: 'Task deleted successfully'
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 切换任务状态
router.patch('/:id/toggle', async (ctx) => {
  const db = getDatabase();
  const { id } = ctx.params;
  
  try {
    const taskId = parseInt(id);
    const task = db.get('scheduled_tasks').find({ id: taskId }).value();
    
    if (!task) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: 'Task not found'
      };
      return;
    }
    
    const newStatus = task.status === 'active' ? 'inactive' : 'active';
    
    // 更新状态
    db.get('scheduled_tasks')
      .find({ id: taskId })
      .assign({ 
        status: newStatus, 
        updated_at: new Date().toISOString() 
      })
      .write();
    
    // 重新调度任务
    unscheduleTask(taskId);
    if (newStatus === 'active') {
      const updatedTask = { ...task, status: newStatus };
      scheduleTask(updatedTask);
    }
    
    ctx.body = {
      success: true,
      message: `Task ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`,
      data: { status: newStatus }
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

// 启动任务
router.post('/:id/start', async (ctx) => {
  const db = getDatabase();
  const { id } = ctx.params;

  try {
    const taskId = parseInt(id, 10);
    const task = db.get('scheduled_tasks').find({ id: taskId }).value();

    if (!task) {
      ctx.status = 404;
      ctx.body = { success: false, message: 'Task not found' };
      return;
    }

    if (!cron.validate(task.cron_expression)) {
      ctx.status = 400;
      ctx.body = { success: false, message: 'Invalid cron expression' };
      return;
    }

    // 更新状态为 active
    const updatedTask = { ...task, status: 'active', updated_at: new Date().toISOString() };
    db.get('scheduled_tasks').find({ id: taskId }).assign({ status: 'active', updated_at: updatedTask.updated_at }).write();

    // 重新调度
    unscheduleTask(taskId);
    scheduleTask(updatedTask);

    // 记录日志
    try { logTaskExecution(taskId, task.script_id, 'info', 'Task started manually'); } catch {}

    ctx.body = { success: true, message: 'Task started successfully', data: { status: 'active' } };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

// 停止任务
router.post('/:id/stop', async (ctx) => {
  const db = getDatabase();
  const { id } = ctx.params;

  try {
    const taskId = parseInt(id, 10);
    const task = db.get('scheduled_tasks').find({ id: taskId }).value();

    if (!task) {
      ctx.status = 404;
      ctx.body = { success: false, message: 'Task not found' };
      return;
    }

    // 更新状态为 inactive
    db.get('scheduled_tasks').find({ id: taskId }).assign({ status: 'inactive', updated_at: new Date().toISOString() }).write();

    // 取消调度
    unscheduleTask(taskId);

    // 记录日志
    try { logTaskExecution(taskId, task.script_id, 'info', 'Task stopped manually'); } catch {}

    ctx.body = { success: true, message: 'Task stopped successfully', data: { status: 'inactive' } };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

module.exports = router;
