const cron = require('node-cron');
const { spawn } = require('child_process');
const { getDatabase } = require('./database');
const { readScriptFile, resolveScriptFullPath } = require('./fileManager');
const fs = require('fs-extra');
const path = require('path');

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

// 新增：多格式环境变量展开（支持 ${VAR}、$VAR、%VAR%、~）
function expandEnvLike(input, envMap = {}, extraMap = {}) {
  if (input == null) return input;
  if (typeof input !== 'string') return input;

  // 构造查找表：优先 extraMap（globals），再 envMap（系统）
  const base = Object.create(null);
  const setKV = (k, v) => { if (k) base[String(k)] = v == null ? '' : String(v); };
  for (const [k, v] of Object.entries(envMap)) setKV(k, v);
  for (const [k, v] of Object.entries(extraMap)) setKV(k, v);

  // 递归展开，限制最大深度避免循环引用
  let str = input;
  const maxDepth = 5;
  for (let depth = 0; depth < maxDepth; depth++) {
    const before = str;

    // ~ -> HOME/USERPROFILE（仅在开头，且后面是 / 或 \ 或 结束）
    const homeDir = base.HOME || base.USERPROFILE || process.env.HOME || process.env.USERPROFILE || '';
  str = str.replace(/^(~)(?=$|[/])/, homeDir);

    // ${VAR}（允许中文及符号，直到遇到 }）
    str = str.replace(/\$\{([^}]+)\}/g, (_, key) => {
      const k = String(key).trim();
      return Object.prototype.hasOwnProperty.call(base, k) ? String(base[k]) : '';
    });

    // %VAR%（Windows 风格，仅字母数字下划线）
    str = str.replace(/%([A-Za-z0-9_]+)%/g, (_, key) => {
      const k = String(key);
      return Object.prototype.hasOwnProperty.call(base, k) ? String(base[k]) : '';
    });

    // $VAR（类 Unix，变量名：字母/下划线开头）
    str = str.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (m, key, offset, s) => {
      const prev = offset > 0 ? s[offset - 1] : '';
      if (/^[A-Za-z0-9_]$/.test(prev)) return m; // 前一个是标识符字符则不替换
      const k = String(key);
      return Object.prototype.hasOwnProperty.call(base, k) ? String(base[k]) : '';
    });

    if (str === before) break;
  }
  return str;
}

// 新增：对任意值进行递归展开（对象/数组内的字符串也会展开）
function deepExpand(value, envMap = {}, extraMap = {}) {
  if (typeof value === 'string') return expandEnvLike(value, envMap, extraMap);
  if (Array.isArray(value)) return value.map((v) => deepExpand(v, envMap, extraMap));
  if (value && typeof value === 'object') {
    const out = Array.isArray(value) ? [] : {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepExpand(v, envMap, extraMap);
    }
    return out;
  }
  return value;
}

// 新增：构建执行环境变量（来自配置中的 globals）
function buildExecutionEnv() {
  try {
    const db = getDatabase();
    const cfg = db.get('config_groups').value() || {};
    const globals = cfg.globals || {};
    const inherit = globals.inheritSystemEnv !== false;
    const env = inherit ? { ...process.env } : {};
    const items = Array.isArray(globals.items) ? globals.items : [];

    // 组装可用映射：系统 env + 原始 globals 键值（原样 key 与归一化 KEY）
    const extraMap = Object.create(null);
    for (const it of items) {
      if (!it || !it.key) continue;
      const rawKey = String(it.key);
      const normKey = rawKey.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      let strVal = '';
      if (Object.prototype.hasOwnProperty.call(it, 'value')) {
        const v = it.value;
        strVal = typeof v === 'string' ? v : JSON.stringify(v);
      }
      extraMap[rawKey] = strVal;
      extraMap[normKey] = strVal;
    }
    
    // 注入各键到子进程环境（大写下划线），值支持多格式变量展开；对象则 JSON 字符串化后注入
    for (const it of items) {
      if (!it || !it.key) continue;
      const normKey = String(it.key).toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      const rawVal = Object.prototype.hasOwnProperty.call(it, 'value') ? it.value : '';
      const expanded = deepExpand(rawVal, env, extraMap);
      env[normKey] = typeof expanded === 'string' ? expanded : JSON.stringify(expanded);
    }

    // 以 JSON 形式注入供 shim 使用，保留原始 Key 与原始类型（对象递归展开字符串）
    const kv = {};
    for (const it of items) {
      if (!it || !it.key) continue;
      const rawKey = String(it.key);
      const rawVal = Object.prototype.hasOwnProperty.call(it, 'value') ? it.value : '';
      kv[rawKey] = deepExpand(rawVal, env, extraMap);
    }
    env.TASKDOG_GLOBALS_JSON = JSON.stringify(kv);

    // TD.set 所需后端地址（优先系统 env 配置）
    const cfgUrl = cfg.system && cfg.system.backendUrl ? String(cfg.system.backendUrl) : '';
    env.TASKDOG_API_URL = process.env.TASKDOG_API_URL || cfgUrl || `http://127.0.0.1:${process.env.PORT || 3001}`;

    return env;
  } catch {
    return process.env;
  }
}

// 新增：浅工具
function isPlainObject(v) {
  return Object.prototype.toString.call(v) === '[object Object]';
}

function deepMerge(a, b) {
  if (!isPlainObject(a)) a = {};
  if (!isPlainObject(b)) return { ...a };
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (isPlainObject(v) && isPlainObject(a[k])) out[k] = deepMerge(a[k], v);
    else out[k] = v;
  }
  return out;
}

function flattenParams(obj, prefix = []) {
  const entries = {};
  if (!isPlainObject(obj)) return entries;
  for (const [k, v] of Object.entries(obj)) {
    const keyPath = [...prefix, k];
    if (isPlainObject(v)) {
      Object.assign(entries, flattenParams(v, keyPath));
    } else {
      const flatKey = keyPath.join('_').replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();
      entries[flatKey] = typeof v === 'string' ? v : JSON.stringify(v);
    }
  }
  return entries;
}

function normalizeScriptParams(scriptParams) {
  // 支持对象形式 { [id]: params } 或 数组 [{ script_id, params }]
  const out = {};
  if (isPlainObject(scriptParams)) {
    for (const [sid, p] of Object.entries(scriptParams)) {
      const key = String(parseInt(sid, 10));
      out[key] = isPlainObject(p) ? p : {};
    }
  } else if (Array.isArray(scriptParams)) {
    for (const item of scriptParams) {
      if (!item) continue;
      const key = String(parseInt(item.script_id, 10));
      if (!key || key === 'NaN') continue;
      out[key] = isPlainObject(item.params) ? item.params : {};
    }
  }
  return out;
}

// 新增：解析参数中的全局变量引用（支持 "$TD:KEY" 与 {"$global":"KEY"}）
function deepResolveTDRefs(value, globalsKV) {
  if (value == null) return value;
  const g = (globalsKV && typeof globalsKV === 'object') ? globalsKV : {};
  if (Array.isArray(value)) return value.map((v) => deepResolveTDRefs(v, g));
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === '$global' && typeof value.$global === 'string') {
      const k = value.$global;
      return Object.prototype.hasOwnProperty.call(g, k) ? g[k] : null;
    }
    const out = Array.isArray(value) ? [] : {};
    for (const [k, v] of Object.entries(value)) out[k] = deepResolveTDRefs(v, g);
    return out;
  }
  if (typeof value === 'string') {
    const m = value.match(/^\$TD:([A-Za-z0-9_]+)$/);
    if (m) {
      const key = m[1];
      return Object.prototype.hasOwnProperty.call(g, key) ? g[key] : null;
    }
    return value;
  }
  return value;
}

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
    // 归一化脚本ID数组（保持顺序）
    const scriptIds = Array.isArray(task.script_ids) && task.script_ids.length
      ? task.script_ids
      : (task.script_id ? [task.script_id] : []);

    if (!scriptIds.length) {
      throw new Error('No scripts configured for this task');
    }

    // 归一化任务级脚本参数
    const taskScriptParamsMap = normalizeScriptParams(task.script_params || {});

    // 更新最后运行时间（任务级）
    db.get('scheduled_tasks')
      .find({ id: task.id })
      .assign({ last_run: new Date().toISOString() })
      .write();

    logTaskExecution(task.id, null, 'info', `Task "${task.name}" started (${scriptIds.length} script(s))`);

    const startTime = Date.now();
    const results = [];
    let allSuccess = true;

    for (let i = 0; i < scriptIds.length; i++) {
      const sid = scriptIds[i];
      const script = db.get('scripts').find({ id: sid }).value();
      if (!script) {
        allSuccess = false;
        logTaskExecution(task.id, sid, 'error', `Script with ID ${sid} not found`);
        results.push({ script_id: sid, success: false, exitCode: -1, stdout: '', stderr: `Script ${sid} not found` });
        continue; // 继续执行后续脚本
      }

      // 计算有效参数：脚本默认参数 + 任务级覆盖
      const baseParams = isPlainObject(script.default_params) ? script.default_params : {};
      const overrideParams = taskScriptParamsMap[String(sid)] || {};
      const effectiveParams = deepMerge(baseParams, overrideParams);

      logTaskExecution(task.id, sid, 'info', `Script #${i+1}/${scriptIds.length} "${script.name}" started`);

      const sStart = Date.now();
      const result = await executeScript(script, effectiveParams);
      const sDuration = Date.now() - sStart;

      results.push({ script_id: sid, name: script.name, duration: sDuration, params: effectiveParams, ...result });

      if (result.success) {
        logTaskExecution(
          task.id,
          sid,
          'success',
          `Script "${script.name}" completed in ${sDuration}ms`,
          { duration: sDuration, output: result.stdout, exitCode: result.exitCode }
        );
      } else {
        allSuccess = false;
        logTaskExecution(
          task.id,
          sid,
          'error',
          `Script "${script.name}" failed: ${result.stderr || result.error}`,
          { duration: sDuration, error: result.stderr || result.error, output: result.stdout, exitCode: result.exitCode }
        );
      }
    }

    const totalDuration = Date.now() - startTime;
    logTaskExecution(
      task.id,
      scriptIds[0] || null,
      allSuccess ? 'success' : 'error',
      `Task ${allSuccess ? 'completed' : 'finished with errors'} in ${totalDuration}ms (${results.length} script(s))`,
      { duration: totalDuration, results }
    );

    return { success: allSuccess, results, totalDuration };
    
  } catch (error) {
    logTaskExecution(task.id, task.script_id || null, 'error', `Task execution error: ${error.message}`);
    return { success: false, results: [], error: error.message };
  }
}

async function executeScript(script, params = {}) {
  try {
    const isWin = process.platform === 'win32';
    let command, args, options = {};
    const scriptPath = resolveScriptFullPath(script.file_path);
    
    if (script.language === 'python') {
      command = isWin ? 'python' : 'python3';
      args = [scriptPath];
    } else if (script.language === 'node' || script.language === 'javascript') {
      command = 'node';
      const tdShim = path.join(__dirname, 'td_shims', 'node.js');
      args = ['-r', tdShim, scriptPath];
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

    // 构建环境并注入参数
    const env = buildExecutionEnv();
    // 解析全局变量 JSON 供参数解引用
    let globalsKV = {};
    try { globalsKV = JSON.parse(env.TASKDOG_GLOBALS_JSON || '{}'); } catch { globalsKV = {}; }
    // 先解析参数里的 $TD:KEY / {"$global":"KEY"}
    const mergedParams = isPlainObject(params) ? params : {};
    const resolvedParams = deepResolveTDRefs(mergedParams, globalsKV);
    try {
      env.TASKDOG_PARAMS_JSON = JSON.stringify(resolvedParams);
      const flat = flattenParams(isPlainObject(resolvedParams) ? resolvedParams : {});
      for (const [k, v] of Object.entries(flat)) {
        env[`TD_PARAM_${k}`] = v;
      }
    } catch {}
    
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      
      const child = spawn(command, args, {
        ...options,
        cwd: path.dirname(scriptPath),
        env,
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
      created_at: nowCN()
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
async function testScript(script, overrideParams = undefined) {
  logTaskExecution(null, script.id, 'info', `Testing script: ${script.name}`);
  
  const startTime = Date.now();
  const base = isPlainObject(script.default_params) ? script.default_params : {};
  const params = overrideParams !== undefined && isPlainObject(overrideParams)
    ? deepMerge(base, overrideParams)
    : base;
  const result = await executeScript(script, params);
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

// 新增：获取解释器信息
function getInterpreter(language) {
  const isWin = process.platform === 'win32';
  let command, args = [], options = {};

  switch (language) {
    case 'python':
      command = isWin ? 'python' : 'python3';
      break;
    case 'node':
    case 'javascript':
      command = 'node';
      const tdShim = path.join(__dirname, 'td_shims', 'node.js');
      args = ['-r', tdShim];
      break;
    case 'batch':
    case 'cmd':
      command = isWin ? 'cmd.exe' : 'sh';
      args = isWin ? ['/c'] : [];
      break;
    case 'powershell':
      command = isWin ? 'powershell.exe' : 'pwsh';
      args = isWin
        ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File']
        : ['-NoProfile', '-File'];
      break;
    case 'bash':
    case 'shell':
      command = 'bash';
      break;
    default:
      // 对于未知类型，我们假定它是可直接执行的
      // command 将在调用方被设置为脚本路径
      command = null; 
      options.shell = true;
      break;
  }
  return { command, args, options };
}

// 新增：构建环境变量
function buildEnvVars(script, params = {}) {
  const env = buildExecutionEnv();
  let globalsKV = {};
  try { globalsKV = JSON.parse(env.TASKDOG_GLOBALS_JSON || '{}'); } catch { globalsKV = {}; }
  
  const baseParams = isPlainObject(script.default_params) ? script.default_params : {};
  const overrideParams = isPlainObject(params) ? params : {};
  const mergedParams = deepMerge(baseParams, overrideParams);

  const resolvedParams = deepResolveTDRefs(mergedParams, globalsKV);
  
  try {
    env.TASKDOG_PARAMS_JSON = JSON.stringify(resolvedParams);
    const flat = flattenParams(isPlainObject(resolvedParams) ? resolvedParams : {});
    for (const [k, v] of Object.entries(flat)) {
      env[`TD_PARAM_${k}`] = v;
    }
  } catch {}

  return env;
}

module.exports = {
  initScheduler,
  scheduleTask,
  unscheduleTask,
  executeTask,
  executeScript,
  testScript,
  getInterpreter,
  buildEnvVars,
};
