const cron = require('node-cron');
const { spawn } = require('child_process');
const { getDatabase } = require('./database');
const { readScriptFile, resolveScriptFullPath } = require('./fileManager');
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
          output: result.stdout,
          exitCode: result.exitCode
        }
      );
    } else {
      logTaskExecution(
        task.id, 
        task.script_id, 
        'error', 
        `Task failed: ${result.stderr || result.error}`,
        {
          duration,
          error: result.stderr || result.error,
          output: result.stdout,
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
    const isWin = process.platform === 'win32';
    let command, args, options = {};
    const scriptPath = resolveScriptFullPath(script.file_path);
    
    if (script.language === 'python') {
      command = isWin ? 'python' : 'python3';
      args = [scriptPath];
    } else if (script.language === 'node' || script.language === 'javascript') {
      command = 'node';
      args = [scriptPath];
    } else if (script.language === 'batch' || script.language === 'cmd') {
      if (isWin) {
        command = 'cmd.exe';
        args = ['/c', scriptPath];
      } else {
        // 非 Windows 环境尝试用 sh 运行
        command = 'sh';
        args = [scriptPath];
      }
    } else if (script.language === 'powershell') {
      if (isWin) {
        command = 'powershell.exe';
        args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
      } else {
        // Linux/macOS 可用 pwsh（若已安装）
        command = 'pwsh';
        args = ['-NoProfile', '-File', scriptPath];
      }
    } else if (script.language === 'bash' || script.language === 'shell') {
      command = 'bash';
      args = [scriptPath];
    } else {
      // 默认尝试直接执行
      command = scriptPath;
      args = [];
      options.shell = true;
    }
    
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      
      const child = spawn(command, args, {
        ...options,
        cwd: path.dirname(scriptPath),
        env: process.env,
        windowsHide: true
      });
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        const result = {
          success: code === 0,
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          // 兼容旧字段
          output: stdout.trim(),
          error: stderr.trim()
        };
        resolve(result);
      });
      
      child.on('error', (error) => {
        resolve({
          success: false,
          exitCode: -1,
          stdout: stdout.trim(),
          stderr: (stderr + '\n' + (error.message || '')).trim(),
          output: stdout.trim(),
          error: (stderr + '\n' + (error.message || '')).trim()
        });
      });
      
      // 设置超时 (5 分钟)
      const timeout = setTimeout(() => {
        try { child.kill('SIGTERM'); } catch {}
        resolve({
          success: false,
          exitCode: -1,
          stdout: stdout.trim(),
          stderr: 'Script execution timeout (5 minutes)',
          output: stdout.trim(),
          error: 'Script execution timeout (5 minutes)'
        });
      }, 5 * 60 * 1000);
      
      child.on('exit', () => clearTimeout(timeout));
    });
    
  } catch (error) {
    return {
      success: false,
      exitCode: -1,
      stdout: '',
      stderr: error.message,
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
    : `Script test failed: ${result.stderr || result.error}`;
  
  logTaskExecution(null, script.id, logType, logMessage, {
    duration,
    output: result.stdout,
    error: result.stderr || result.error,
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
