const cron = require('node-cron');
const { spawn } = require('child_process');
const { getDatabase } = require('./database');
const { readScriptFile } = require('./fileManager');
const fs = require('fs-extra');
const path = require('path');

const scheduledJobs = new Map();

async function initScheduler() {
  const db = getDatabase();
  
  // 加载所有活动的定时任务
  try {
    const tasks = db.get('scheduled_tasks')
      .filter({ status: 'active' })
      .value() || [];
    
    tasks.forEach(task => {
      scheduleTask(task);
    });
    
    console.log(`Loaded ${tasks.length} scheduled tasks`);
  } catch (error) {
    console.error('Error loading scheduled tasks:', error);
  }
}

function scheduleTask(task) {
  if (scheduledJobs.has(task.id)) {
    // 停止现有任务
    scheduledJobs.get(task.id).stop();
  }
  
  try {
    const job = cron.schedule(task.cron_expression, async () => {
      await executeTask(task);
    }, {
      scheduled: false
    });
    
    job.start();
    scheduledJobs.set(task.id, job);
    
    console.log(`Scheduled task: ${task.name} with cron: ${task.cron_expression}`);
  } catch (error) {
    console.error(`Error scheduling task ${task.name}:`, error);
    logTaskExecution(task.id, task.script_id, 'error', `Scheduling failed: ${error.message}`);
  }
}

function unscheduleTask(taskId) {
  if (scheduledJobs.has(taskId)) {
    scheduledJobs.get(taskId).stop();
    scheduledJobs.delete(taskId);
    console.log(`Unscheduled task: ${taskId}`);
  }
}

async function executeTask(task) {
  const db = getDatabase();
  
  try {
    // 获取脚本信息
    const script = db.get('scripts').find({ id: task.script_id }).value();
    
    if (!script) {
      throw new Error(`Script with ID ${task.script_id} not found`);
    }
    
    // 更新最后运行时间
    db.get('scheduled_tasks')
      .find({ id: task.id })
      .assign({ last_run: new Date().toISOString() })
      .write();
    
    logTaskExecution(task.id, task.script_id, 'info', `Task "${task.name}" started`);
    
    const startTime = Date.now();
    
    // 执行脚本
    const result = await executeScript(script);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    if (result.success) {
      logTaskExecution(
        task.id, 
        task.script_id, 
        'success', 
        `Task completed successfully in ${duration}ms`,
        {
          duration,
          output: result.output,
          exitCode: result.exitCode
        }
      );
    } else {
      logTaskExecution(
        task.id, 
        task.script_id, 
        'error', 
        `Task failed: ${result.error}`,
        {
          duration,
          error: result.error,
          output: result.output,
          exitCode: result.exitCode
        }
      );
    }
    
  } catch (error) {
    logTaskExecution(task.id, task.script_id, 'error', `Task execution error: ${error.message}`);
  }
}

async function executeScript(script) {
  try {
    let command, args, options = {};
    const scriptPath = path.join(__dirname, '../..', script.file_path);
    
    if (script.language === 'python') {
      command = 'python';
      args = [scriptPath];
    } else if (script.language === 'node' || script.language === 'javascript') {
      command = 'node';
      args = [scriptPath];
    } else if (script.language === 'batch' || script.language === 'cmd') {
      // Windows 批处理
      command = scriptPath;
      args = [];
      options.shell = true;
    } else if (script.language === 'powershell') {
      command = 'powershell';
      args = ['-File', scriptPath];
      options.shell = true;
    } else if (script.language === 'bash' || script.language === 'shell') {
      command = 'bash';
      args = [scriptPath];
    } else {
      // 默认作为可执行文件处理
      command = scriptPath;
      args = [];
      options.shell = true;
    }
    
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      
      const child = spawn(command, args, {
        ...options,
        cwd: process.cwd(),
        env: process.env
      });
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      child.on('close', (code) => {
        const result = {
          success: code === 0,
          exitCode: code,
          output: output.trim(),
          error: errorOutput.trim()
        };
        
        resolve(result);
      });
      
      child.on('error', (error) => {
        resolve({
          success: false,
          exitCode: -1,
          output: output.trim(),
          error: error.message
        });
      });
      
      // 设置超时 (5 分钟)
      setTimeout(() => {
        child.kill('SIGTERM');
        resolve({
          success: false,
          exitCode: -1,
          output: output.trim(),
          error: 'Script execution timeout (5 minutes)'
        });
      }, 5 * 60 * 1000);
    });
    
  } catch (error) {
    return {
      success: false,
      exitCode: -1,
      output: '',
      error: error.message
    };
  }
}

function logTaskExecution(taskId, scriptId, type, message, details = null) {
  const db = getDatabase();
  
  try {
    // 获取下一个 ID
    const nextId = db.get('_meta.nextLogId').value();
    
    const logEntry = {
      id: nextId,
      type,
      message,
      script_id: scriptId,
      task_id: taskId,
      details: details ? JSON.stringify(details) : null,
      created_at: new Date().toISOString()
    };
    
    // 添加日志
    db.get('logs').push(logEntry).write();
    
    // 更新下一个 ID
    db.set('_meta.nextLogId', nextId + 1).write();
    
    console.log(`[${type.toUpperCase()}] Task ${taskId}: ${message}`);
  } catch (error) {
    console.error('Error logging task execution:', error);
  }
}

// 测试执行脚本（不通过定时任务）
async function testScript(script) {
  logTaskExecution(null, script.id, 'info', `Testing script: ${script.name}`);
  
  const startTime = Date.now();
  const result = await executeScript(script);
  const duration = Date.now() - startTime;
  
  const logType = result.success ? 'success' : 'error';
  const logMessage = result.success 
    ? `Script test completed successfully in ${duration}ms`
    : `Script test failed: ${result.error}`;
  
  logTaskExecution(null, script.id, logType, logMessage, {
    duration,
    output: result.output,
    error: result.error,
    exitCode: result.exitCode
  });
  
  return result;
}

module.exports = {
  initScheduler,
  scheduleTask,
  unscheduleTask,
  executeTask,
  executeScript,
  testScript,
  logTaskExecution
};
