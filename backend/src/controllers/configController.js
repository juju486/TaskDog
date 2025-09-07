const path = require('path');
const fs = require('fs-extra');
const { spawnSync, spawn } = require('child_process');
const { getDatabase } = require('../utils/database');

// 默认配置模板（用于修复与兜底）
const DEFAULT_CONFIG = {
  system: {
    log_level: 'info',
    max_concurrent_tasks: '3',
  },
  execution: {
    interpreters: {
      powershell: { enabled: true, path: 'powershell.exe' },
      cmd: { enabled: true, path: 'cmd.exe' },
      python: { enabled: true, path: 'python' },
      node: { enabled: true, path: 'node' },
      bash: { enabled: false, path: '/bin/bash' },
    },
    defaultTimeoutMs: 300000,
    maxConcurrent: 2,
    queueSize: 20,
    workingDirPolicy: 'scriptDir',
    allowedLanguages: ['powershell', 'cmd', 'batch', 'python', 'node', 'javascript'],
    maxUploadKB: 512,
    pathIsolation: true,
  },
  scheduler: {
    schedulerTz: 'Asia/Shanghai',
    overlapPolicy: 'queue',
    catchup: false,
    jitterMs: 5000,
    retry: { maxAttempts: 1, backoffMs: 30000 },
  },
  logging: {
    level: 'info',
    retainDays: 30,
    captureMaxKB: 256,
    redactKeys: ['token', 'password'],
    rotate: { maxSizeMB: 10, maxFiles: 5 },
  },
  notify: {
    webhook: { enabled: false, items: [] },
    email: { enabled: false, host: '', port: 465, user: '', from: '', useTLS: true },
    on: { taskStart: false, taskSuccess: false, taskError: true },
  },
  ui: { theme: 'light', monacoTheme: 'vs', pageSize: 10, editorWordWrap: true, tabSize: 2 },
  backup: { enabled: false, cron: '0 3 * * *', targetDir: 'backup', backup_retention_days: '30' },
  secrets: [],
  notification: { notification_email: 'admin@example.com' },
  globals: { inheritSystemEnv: true, items: [] },
  // 新增：分组配置（仅名称列表，脚本与任务各自维护）
  groups: { scriptGroups: [], taskGroups: [] },
  // 新增：分组V2（带ID）以便稳定引用
  groupsV2: { script: [], task: [], nextScriptGroupId: 1, nextTaskGroupId: 1 },
};

function isObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function asString(v, d = '') { if (v == null) return d; try { return String(v); } catch { return d; } }
function asNumber(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function asBool(v, d = false) { return typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : d; }
function asArray(v, d = []) { return Array.isArray(v) ? v : d; }

// 新增：宽松 JSON 解析（允许未加引号的键、单引号字符串）
function tryParseJSONLoose(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (!t) return null;
  // 快速路径：严格 JSON
  try { return JSON.parse(t); } catch { /* fallthrough */ }
  // 仅在看起来像对象/数组时尝试宽松转换
  if (!/^[\[{]/.test(t)) return null;
  try {
    let s = t;
    // 将单引号字符串替换为双引号（保留内部双引号）
    s = s.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (m, g1) => '"' + g1.replace(/"/g, '\\"') + '"');
    // 为未加引号的键补引号（支持中英文、数字、下划线）
    s = s.replace(/([\{,\[]\s*)([A-Za-z0-9_\u4e00-\u9fa5]+)\s*:/g, '$1"$2":');
    return JSON.parse(s);
  } catch { return null; }
}

// 新增：将字符串智能转为对应类型（JSON/布尔/数字/null），否则原样返回
function coerceValueType(value) {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  if (t === '') return '';
  const loose = tryParseJSONLoose(t);
  if (loose !== null) return loose;
  // 严格 JSON 简写：true/false/null/数字
  try { const v = JSON.parse(t); return v; } catch {}
  if (/^-?\d+(?:\.\d+)?$/.test(t)) { const n = Number(t); if (Number.isFinite(n)) return n; }
  if (/^(true|false)$/i.test(t)) return /^true$/i.test(t);
  if (/^null$/i.test(t)) return null;
  return value;
}

// 带ID分组工具
function normalizeGroupItemsV2(arr) {
  // 规范：数组元素为 { id:number, name:string }
  const out = [];
  const seenIds = new Set();
  const seenNames = new Set();
  for (const it of asArray(arr, [])) {
    if (isObject(it) && Number.isFinite(Number(it.id)) && typeof it.name === 'string' && it.name.trim()) {
      const id = Number(it.id);
      const name = it.name.trim();
      if (!seenIds.has(id) && !seenNames.has(name)) {
        out.push({ id, name });
        seenIds.add(id); seenNames.add(name);
      }
    } else if (typeof it === 'string' && it.trim()) {
      // 兼容字符串项，先占位，后续会分配ID
      out.push({ id: undefined, name: it.trim() });
    }
  }
  return out;
}

function buildNameIdMaps(items) {
  const byId = new Map();
  const byName = new Map();
  for (const it of items) { if (Number.isFinite(it.id)) byId.set(it.id, it.name); if (it.name) byName.set(it.name, it.id); }
  return { byId, byName };
}

// 规范化/修复配置对象（不会移除未知字段）
function sanitizeConfig(input) {
  const cfg = isObject(input) ? { ...input } : {};

  // system
  const sys = isObject(cfg.system) ? { ...cfg.system } : {};
  sys.log_level = asString(sys.log_level, DEFAULT_CONFIG.system.log_level);
  sys.max_concurrent_tasks = asString(sys.max_concurrent_tasks, DEFAULT_CONFIG.system.max_concurrent_tasks);
  cfg.system = sys;

  // execution
  const execIn = isObject(cfg.execution) ? { ...cfg.execution } : {};
  const interIn = isObject(execIn.interpreters) ? { ...execIn.interpreters } : {};
  const inter = {};
  for (const key of Object.keys(DEFAULT_CONFIG.execution.interpreters)) {
    const ex = isObject(interIn[key]) ? interIn[key] : {};
    inter[key] = {
      enabled: asBool(ex.enabled, DEFAULT_CONFIG.execution.interpreters[key].enabled),
      path: asString(ex.path, DEFAULT_CONFIG.execution.interpreters[key].path),
    };
  }
  const allowedDefault = DEFAULT_CONFIG.execution.allowedLanguages;
  let allowed = asArray(execIn.allowedLanguages, allowedDefault).map((s) => asString(s).toLowerCase()).filter(Boolean);
  if (allowed.length === 0) allowed = allowedDefault;
  cfg.execution = {
    interpreters: inter,
    defaultTimeoutMs: asNumber(execIn.defaultTimeoutMs, DEFAULT_CONFIG.execution.defaultTimeoutMs),
    maxConcurrent: asNumber(execIn.maxConcurrent, DEFAULT_CONFIG.execution.maxConcurrent),
    queueSize: asNumber(execIn.queueSize, DEFAULT_CONFIG.execution.queueSize),
    workingDirPolicy: asString(execIn.workingDirPolicy, DEFAULT_CONFIG.execution.workingDirPolicy),
    allowedLanguages: allowed,
    maxUploadKB: asNumber(execIn.maxUploadKB, DEFAULT_CONFIG.execution.maxUploadKB),
    pathIsolation: asBool(execIn.pathIsolation, DEFAULT_CONFIG.execution.pathIsolation),
  };

  // scheduler
  const schIn = isObject(cfg.scheduler) ? { ...cfg.scheduler } : {};
  cfg.scheduler = {
    schedulerTz: asString(schIn.schedulerTz, DEFAULT_CONFIG.scheduler.schedulerTz),
    overlapPolicy: asString(schIn.overlapPolicy, DEFAULT_CONFIG.scheduler.overlapPolicy),
    catchup: asBool(schIn.catchup, DEFAULT_CONFIG.scheduler.catchup),
    jitterMs: asNumber(schIn.jitterMs, DEFAULT_CONFIG.scheduler.jitterMs),
    retry: {
      maxAttempts: asNumber(schIn.retry && schIn.retry.maxAttempts, DEFAULT_CONFIG.scheduler.retry.maxAttempts),
      backoffMs: asNumber(schIn.retry && schIn.retry.backoffMs, DEFAULT_CONFIG.scheduler.retry.backoffMs),
    },
  };

  // logging
  const logIn = isObject(cfg.logging) ? { ...cfg.logging } : {};
  cfg.logging = {
    level: asString(logIn.level, DEFAULT_CONFIG.logging.level),
    retainDays: asNumber(logIn.retainDays, DEFAULT_CONFIG.logging.retainDays),
    captureMaxKB: asNumber(logIn.captureMaxKB, DEFAULT_CONFIG.logging.captureMaxKB),
    redactKeys: asArray(logIn.redactKeys, DEFAULT_CONFIG.logging.redactKeys).map((s) => asString(s)).filter(Boolean),
    rotate: {
      maxSizeMB: asNumber(logIn.rotate && logIn.rotate.maxSizeMB, DEFAULT_CONFIG.logging.rotate.maxSizeMB),
      maxFiles: asNumber(logIn.rotate && logIn.rotate.maxFiles, DEFAULT_CONFIG.logging.rotate.maxFiles),
    },
  };

  // notify
  const nIn = isObject(cfg.notify) ? { ...cfg.notify } : {};
  const wIn = isObject(nIn.webhook) ? nIn.webhook : {};
  const eIn = isObject(nIn.email) ? nIn.email : {};
  const onIn = isObject(nIn.on) ? nIn.on : {};
  cfg.notify = {
    webhook: { enabled: asBool(wIn.enabled, DEFAULT_CONFIG.notify.webhook.enabled), items: asArray(wIn.items, []) },
    email: {
      enabled: asBool(eIn.enabled, DEFAULT_CONFIG.notify.email.enabled),
      host: asString(eIn.host, DEFAULT_CONFIG.notify.email.host),
      port: asNumber(eIn.port, DEFAULT_CONFIG.notify.email.port),
      user: asString(eIn.user, DEFAULT_CONFIG.notify.email.user),
      from: asString(eIn.from, DEFAULT_CONFIG.notify.email.from),
      useTLS: asBool(eIn.useTLS, DEFAULT_CONFIG.notify.email.useTLS),
    },
    on: {
      taskStart: asBool(onIn.taskStart, DEFAULT_CONFIG.notify.on.taskStart),
      taskSuccess: asBool(onIn.taskSuccess, DEFAULT_CONFIG.notify.on.taskSuccess),
      taskError: asBool(onIn.taskError, DEFAULT_CONFIG.notify.on.taskError),
    },
  };

  // ui
  const uiIn = isObject(cfg.ui) ? { ...cfg.ui } : {};
  cfg.ui = {
    theme: asString(uiIn.theme, DEFAULT_CONFIG.ui.theme),
    monacoTheme: asString(uiIn.monacoTheme, DEFAULT_CONFIG.ui.monacoTheme),
    pageSize: asNumber(uiIn.pageSize, DEFAULT_CONFIG.ui.pageSize),
    editorWordWrap: asBool(uiIn.editorWordWrap, DEFAULT_CONFIG.ui.editorWordWrap),
    tabSize: asNumber(uiIn.tabSize, DEFAULT_CONFIG.ui.tabSize),
  };

  // backup
  const bkIn = isObject(cfg.backup) ? { ...cfg.backup } : {};
  cfg.backup = {
    enabled: asBool(bkIn.enabled, DEFAULT_CONFIG.backup.enabled),
    cron: asString(bkIn.cron, DEFAULT_CONFIG.backup.cron),
    targetDir: asString(bkIn.targetDir, DEFAULT_CONFIG.backup.targetDir),
    backup_retention_days: asString(bkIn.backup_retention_days, DEFAULT_CONFIG.backup.backup_retention_days),
  };

  // secrets（保持数组）
  cfg.secrets = asArray(cfg.secrets, DEFAULT_CONFIG.secrets);

  // notification（兼容旧平铺）
  const ntfIn = isObject(cfg.notification) ? { ...cfg.notification } : {};
  cfg.notification = { notification_email: asString(ntfIn.notification_email, DEFAULT_CONFIG.notification.notification_email) };

  // globals
  const gIn = isObject(cfg.globals) ? { ...cfg.globals } : {};
  const itemsRaw = asArray(gIn.items, []);
  const items = itemsRaw
    .map((it) => ({
      key: asString(it && it.key, ''),
      // 保留原始值类型（可为字符串、数字、布尔、对象、数组等）
      value: it && Object.prototype.hasOwnProperty.call(it, 'value') ? it.value : '',
      secret: asBool(it && it.secret, false),
    }))
    .filter((it) => it.key);
  cfg.globals = { inheritSystemEnv: asBool(gIn.inheritSystemEnv, true), items };

  // 新增：分组（名称列表）
  const grpIn = isObject(cfg.groups) ? { ...cfg.groups } : {};
  let scriptGroups = asArray(grpIn.scriptGroups, []).map((s) => asString(s)).filter(Boolean);
  let taskGroups = asArray(grpIn.taskGroups, []).map((s) => asString(s)).filter(Boolean);

  // 分组V2（带ID）
  const grpV2In = isObject(cfg.groupsV2) ? { ...cfg.groupsV2 } : {};
  let v2Script = normalizeGroupItemsV2(grpV2In.script);
  let v2Task = normalizeGroupItemsV2(grpV2In.task);
  let nextScriptGroupId = asNumber(grpV2In.nextScriptGroupId, DEFAULT_CONFIG.groupsV2.nextScriptGroupId);
  let nextTaskGroupId = asNumber(grpV2In.nextTaskGroupId, DEFAULT_CONFIG.groupsV2.nextTaskGroupId);

  // 若存在名称列表而V2为空或缺ID，则按名称补全ID
  const needBootstrapScript = v2Script.length === 0 && scriptGroups.length > 0;
  const needBootstrapTask = v2Task.length === 0 && taskGroups.length > 0;

  if (needBootstrapScript) {
    v2Script = scriptGroups.map((name, idx) => ({ id: idx + 1, name }));
    nextScriptGroupId = v2Script.length + 1;
  }
  if (needBootstrapTask) {
    v2Task = taskGroups.map((name, idx) => ({ id: idx + 1, name }));
    nextTaskGroupId = v2Task.length + 1;
  }

  // 为无ID的V2项分配ID（避免重复名）
  const assignIds = (items, nextIdStart) => {
    const { byName } = buildNameIdMaps(items.filter((x) => Number.isFinite(x.id)));
    let nextId = nextIdStart;
    for (const it of items) {
      if (!Number.isFinite(it.id)) {
        if (byName.has(it.name)) {
          it.id = byName.get(it.name);
        } else {
          it.id = nextId++;
          byName.set(it.name, it.id);
        }
      }
    }
    return nextId;
  };
  nextScriptGroupId = assignIds(v2Script, nextScriptGroupId);
  nextTaskGroupId = assignIds(v2Task, nextTaskGroupId);

  // 确保名称列表与V2一致（去重）
  const uniqByName = (arr) => Array.from(new Set(arr));
  const v2ScriptNames = uniqByName(v2Script.map((x) => x.name));
  const v2TaskNames = uniqByName(v2Task.map((x) => x.name));
  scriptGroups = uniqByName(scriptGroups.concat(v2ScriptNames));
  taskGroups = uniqByName(taskGroups.concat(v2TaskNames));

  cfg.groups = { scriptGroups, taskGroups };
  cfg.groupsV2 = { script: v2Script, task: v2Task, nextScriptGroupId, nextTaskGroupId };

  return cfg;
}

// 获取全部分组
async function getAll(ctx) {
  const db = getDatabase();
  try {
    let configObj = db.get('config_groups').value();
    if (!configObj) {
      configObj = {};
      const flatConfigs = db.get('configs').value() || [];
      for (const c of flatConfigs) {
        if (!configObj[c.category]) configObj[c.category] = {};
        configObj[c.category][c.key] = c.value;
      }
    }
    // 校验并修复
    const sanitized = sanitizeConfig(configObj);
    // 仅当变化时写回
    if (JSON.stringify(sanitized) !== JSON.stringify(configObj)) {
      db.set('config_groups', sanitized).write();
    }
    ctx.body = { success: true, data: sanitized };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 保存全部分组
async function saveAll(ctx) {
  const db = getDatabase();
  const configObj = ctx.request.body;
  if (!configObj || typeof configObj !== 'object') { ctx.status = 400; ctx.body = { success: false, message: 'Invalid config object' }; return; }
  try {
    const sanitized = sanitizeConfig(configObj);
    db.set('config_groups', sanitized).write();
    ctx.body = { success: true, message: 'Config saved', data: sanitized };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 测试配置
async function testAll(ctx) {
  const db = getDatabase();
  const configObj = ctx.request.body || db.get('config_groups').value();
  const result = {};
  try {
    const { execution, notify } = configObj || {};
    const { interpreters = {} } = execution || {};
    for (const lang in interpreters) {
      const interp = interpreters[lang];
      if (interp && interp.enabled && interp.path) {
        try {
          const proc = spawnSync(interp.path, ['--version'], { timeout: 5000 });
          result[lang] = proc.error ? proc.error.message : (proc.stdout.toString() || proc.stderr.toString());
        } catch (e) {
          result[lang] = e.message;
        }
      }
    }
    if (notify && notify.email && notify.email.enabled) {
      result.email = notify.email.host ? 'SMTP配置已填写' : 'SMTP未配置';
    }
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
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 替换 globals 分组
async function replaceGlobals(ctx) {
  const db = getDatabase();
  const body = ctx.request.body || {};
  try {
    const cfg = db.get('config_groups').value() || {};
    const incoming = {
      inheritSystemEnv: body.inheritSystemEnv !== false,
      items: Array.isArray(body.items)
        ? body.items.map((n) => ({
            key: String(n.key || ''),
            // 智能类型兼容
            value: Object.prototype.hasOwnProperty.call(n, 'value') ? coerceValueType(n.value) : '',
            secret: !!n.secret,
          }))
        : [],
    };
    const fixed = sanitizeConfig({ ...cfg, globals: incoming });
    db.set('config_groups', fixed).write();
    ctx.body = { success: true, data: fixed.globals };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// upsert 单个全局变量
async function upsertGlobal(ctx) {
  const db = getDatabase();
  const { key, value, secret } = ctx.request.body || {};
  if (!key || typeof key !== 'string') { ctx.status = 400; ctx.body = { success: false, message: 'key is required' }; return; }
  if (String(key).length > 128) { ctx.status = 400; ctx.body = { success: false, message: 'key too long' }; return; }
  try {
    const cfg = db.get('config_groups').value() || {};
    const globals = cfg.globals || { inheritSystemEnv: true, items: [] };
    const items = Array.isArray(globals.items) ? globals.items : [];
    const idx = items.findIndex((it) => it && String(it.key) === String(key));
    // 保留原始类型；字符串执行智能类型转换
    const rawValue = Object.prototype.hasOwnProperty.call((ctx.request.body || {}), 'value') ? coerceValueType(value) : '';
    if (idx >= 0) {
      items[idx] = { ...items[idx], key: String(key), value: rawValue, secret: !!(secret ?? items[idx].secret) };
    } else {
      items.push({ key: String(key), value: rawValue, secret: !!secret });
    }
    const fixed = sanitizeConfig({ ...cfg, globals: { ...globals, items } });
    db.set('config_groups', fixed).write();
    ctx.body = { success: true, data: { key: String(key), value: rawValue, secret: !!secret } };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// ====== V2 分组辅助 ======
function getSanitizedConfig() {
  const db = getDatabase();
  return sanitizeConfig(db.get('config_groups').value() || {});
}
function saveConfig(cfg) {
  const db = getDatabase();
  db.set('config_groups', cfg).write();
}
function getGroupMaps(type) {
  const cfg = getSanitizedConfig();
  const list = type === 'script' ? cfg.groupsV2.script : cfg.groupsV2.task;
  const { byId, byName } = buildNameIdMaps(list);
  return { cfg, byId, byName, listKey: type === 'script' ? 'script' : 'task' };
}

// =============== 分组管理（新增） ===============
// GET /config/groups?type=script|task 可选参数；不传则返回 { scriptGroups, taskGroups }
async function listGroups(ctx) {
  const db = getDatabase();
  try {
    const cfg = sanitizeConfig(db.get('config_groups').value() || {});
    const type = String(ctx.request.query.type || '').toLowerCase();
    if (type === 'script') { ctx.body = { success: true, data: cfg.groups.scriptGroups }; return; }
    if (type === 'task') { ctx.body = { success: true, data: cfg.groups.taskGroups }; return; }
    ctx.body = { success: true, data: { scriptGroups: cfg.groups.scriptGroups, taskGroups: cfg.groups.taskGroups } };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// POST /config/groups  { type: 'script'|'task', name: string }
async function addGroup(ctx) {
  const db = getDatabase();
  const { type, name } = ctx.request.body || {};
  const t = String(type || '').toLowerCase();
  const n = String(name || '').trim();
  if (!n) { ctx.status = 400; ctx.body = { success: false, message: 'name is required' }; return; }
  if (t !== 'script' && t !== 'task') { ctx.status = 400; ctx.body = { success: false, message: 'type must be script|task' }; return; }
  try {
    const cfg = sanitizeConfig(db.get('config_groups').value() || {});
    const key = t === 'script' ? 'scriptGroups' : 'taskGroups';
    const arr = new Set(cfg.groups[key] || []);
    if (!arr.has(n)) arr.add(n);
    // 同步V2
    const listKey = t === 'script' ? 'script' : 'task';
    const existing = cfg.groupsV2[listKey] || [];
    if (!existing.find((x) => x.name === n)) {
      const id = listKey === 'script' ? cfg.groupsV2.nextScriptGroupId++ : cfg.groupsV2.nextTaskGroupId++;
      cfg.groupsV2[listKey] = existing.concat([{ id, name: n }]);
    }
    const updated = { ...cfg, groups: { ...cfg.groups, [key]: Array.from(arr) }, groupsV2: cfg.groupsV2 };
    db.set('config_groups', updated).write();
    ctx.body = { success: true, data: updated.groups[key] };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// POST /config/groups/rename { type, oldName, newName }
async function renameGroup(ctx) {
  const db = getDatabase();
  const { type, oldName, newName } = ctx.request.body || {};
  const t = String(type || '').toLowerCase();
  const oldN = String(oldName || '').trim();
  const newN = String(newName || '').trim();
  if (!oldN || !newN) { ctx.status = 400; ctx.body = { success: false, message: 'oldName and newName are required' }; return; }
  if (t !== 'script' && t !== 'task') { ctx.status = 400; ctx.body = { success: false, message: 'type must be script|task' }; return; }
  try {
    const cfg = sanitizeConfig(db.get('config_groups').value() || {});
    const key = t === 'script' ? 'scriptGroups' : 'taskGroups';
    const list = cfg.groups[key] || [];
    if (!list.includes(oldN)) { ctx.status = 404; ctx.body = { success: false, message: 'oldName not found' }; return; }
    const next = list.filter(g => g !== oldN);
    if (!next.includes(newN)) next.push(newN);
    // 更新V2名称
    const listKey = t === 'script' ? 'script' : 'task';
    cfg.groupsV2[listKey] = (cfg.groupsV2[listKey] || []).map((x) => x.name === oldN ? { ...x, name: newN } : x);
    const updatedCfg = { ...cfg, groups: { ...cfg.groups, [key]: next } };
    db.set('config_groups', updatedCfg).write();

    // 同步更新实体上的 group 与 group_id（ID保持不变，仅名称变更）
    if (t === 'script') {
      const scripts = db.get('scripts').value() || [];
      const mapByName = new Map(updatedCfg.groupsV2.script.map((x) => [x.name, x.id]));
      let changed = false;
      for (const s of scripts) {
        if ((s.group || '') === oldN) {
          s.group = newN; s.group_id = mapByName.get(newN); changed = true;
        }
      }
      if (changed) db.set('scripts', scripts).write();
    } else {
      const tasks = db.get('scheduled_tasks').value() || [];
      const mapByName = new Map(updatedCfg.groupsV2.task.map((x) => [x.name, x.id]));
      let changed = false;
      for (const it of tasks) {
        if ((it.group || '') === oldN) {
          it.group = newN; it.group_id = mapByName.get(newN); changed = true;
        }
      }
      if (changed) db.set('scheduled_tasks', tasks).write();
    }

    ctx.body = { success: true, data: updatedCfg.groups[key] };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// POST /config/groups/delete { type, name, reassignTo? }
async function deleteGroup(ctx) {
  const db = getDatabase();
  const { type, name, reassignTo } = ctx.request.body || {};
  const t = String(type || '').toLowerCase();
  const n = String(name || '').trim();
  const to = reassignTo != null ? String(reassignTo).trim() : undefined;
  if (!n) { ctx.status = 400; ctx.body = { success: false, message: 'name is required' }; return; }
  if (t !== 'script' && t !== 'task') { ctx.status = 400; ctx.body = { success: false, message: 'type must be script|task' }; return; }
  try {
    const cfg = sanitizeConfig(db.get('config_groups').value() || {});
    const key = t === 'script' ? 'scriptGroups' : 'taskGroups';
    const list = cfg.groups[key] || [];
    if (!list.includes(n)) { ctx.status = 404; ctx.body = { success: false, message: 'group not found' }; return; }
    const next = list.filter(g => g !== n);
    // 仅当目标存在时才允许重定向
    const finalReassign = to && next.includes(to) ? to : undefined;

    // 从V2删除
    const listKey = t === 'script' ? 'script' : 'task';
    const removed = cfg.groupsV2[listKey].find((x) => x.name === n);
    cfg.groupsV2[listKey] = cfg.groupsV2[listKey].filter((x) => x.name !== n);

    const updatedCfg = { ...cfg, groups: { ...cfg.groups, [key]: next }, groupsV2: cfg.groupsV2 };
    db.set('config_groups', updatedCfg).write();

    const targetId = finalReassign ? (updatedCfg.groupsV2[listKey].find((x) => x.name === finalReassign)?.id) : undefined;

    if (t === 'script') {
      const scripts = db.get('scripts').value() || [];
      let changed = false;
      for (const s of scripts) {
        if ((s.group || '') === n || (removed && s.group_id === removed.id)) {
          if (finalReassign && targetId) { s.group = finalReassign; s.group_id = targetId; }
          else { delete s.group; delete s.group_id; }
          changed = true;
        }
      }
      if (changed) db.set('scripts', scripts).write();
    } else {
      const tasks = db.get('scheduled_tasks').value() || [];
      let changed = false;
      for (const it of tasks) {
        if ((it.group || '') === n || (removed && it.group_id === removed.id)) {
          if (finalReassign && targetId) { it.group = finalReassign; it.group_id = targetId; }
          else { delete it.group; delete it.group_id; }
          changed = true;
        }
      }
      if (changed) db.set('scheduled_tasks', tasks).write();
    }

    ctx.body = { success: true, data: updatedCfg.groups[key] };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 新增：从现有脚本/任务中同步未登记的分组名称到配置
// POST /config/groups/syncItems
async function syncGroupsFromItems(ctx) {
  const db = getDatabase();
  try {
    const cfg = sanitizeConfig(db.get('config_groups').value() || {});
    const scripts = db.get('scripts').value() || [];
    const tasks = db.get('scheduled_tasks').value() || [];

    const scriptSet = new Set(cfg.groups.scriptGroups || []);
    const taskSet = new Set(cfg.groups.taskGroups || []);

    for (const s of scripts) {
      const g = (s && typeof s.group === 'string' ? s.group.trim() : '');
      if (g) scriptSet.add(g);
    }
    for (const t of tasks) {
      const g = (t && typeof t.group === 'string' ? t.group.trim() : '');
      if (g) taskSet.add(g);
    }

    // 同步到V2
    const ensureV2 = (list, names, nextKey) => {
      const byName = new Map(list.map((x) => [x.name, x.id]));
      for (const name of names) { if (!byName.has(name)) { list.push({ id: (nextKey.value++), name }); } }
    };
    const nextScript = { value: cfg.groupsV2.nextScriptGroupId };
    const nextTask = { value: cfg.groupsV2.nextTaskGroupId };
    ensureV2(cfg.groupsV2.script, scriptSet, nextScript);
    ensureV2(cfg.groupsV2.task, taskSet, nextTask);
    cfg.groupsV2.nextScriptGroupId = nextScript.value;
    cfg.groupsV2.nextTaskGroupId = nextTask.value;

    const updated = { ...cfg, groups: { scriptGroups: Array.from(scriptSet), taskGroups: Array.from(taskSet) }, groupsV2: cfg.groupsV2 };
    if (JSON.stringify(updated) !== JSON.stringify(cfg)) {
      db.set('config_groups', updated).write();
    }
    ctx.body = { success: true, data: updated.groups };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 新增：统计各分组数量与未分组数量
// GET /config/groups/stats
async function groupStats(ctx) {
  const db = getDatabase();
  try {
    const scripts = db.get('scripts').value() || [];
    const tasks = db.get('scheduled_tasks').value() || [];

    const stat = {
      scripts: { counts: {}, ungrouped: 0, total: scripts.length },
      tasks: { counts: {}, ungrouped: 0, total: tasks.length },
    };

    for (const s of scripts) {
      const g = (s && typeof s.group === 'string' ? s.group.trim() : '');
      if (!g) { stat.scripts.ungrouped++; continue; }
      stat.scripts.counts[g] = (stat.scripts.counts[g] || 0) + 1;
    }
    for (const t of tasks) {
      const g = (t && typeof t.group === 'string' ? t.group.trim() : '');
      if (!g) { stat.tasks.ungrouped++; continue; }
      stat.tasks.counts[g] = (stat.tasks.counts[g] || 0) + 1;
    }

    ctx.body = { success: true, data: stat };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 新增：批量分配/迁移分组
// POST /config/groups/assign
// body: { type: 'script'|'task', toGroup?: string, ids?: number[], fromGroup?: string, allUngrouped?: boolean, clear?: boolean }
// 说明：
// - 优先级 ids > fromGroup > allUngrouped
// - toGroup 提供时赋值为该组；若 clear 为 true（或 toGroup === ''），则清空分组
async function assignGroup(ctx) {
  const db = getDatabase();
  const { type, toGroup, toGroupId, ids, fromGroup, fromGroupId, allUngrouped, clear } = ctx.request.body || {};
  const t = String(type || '').toLowerCase();
  if (t !== 'script' && t !== 'task') { ctx.status = 400; ctx.body = { success: false, message: 'type must be script|task' }; return; }

  const cfg = getSanitizedConfig();
  const list = t === 'script' ? cfg.groupsV2.script : cfg.groupsV2.task;
  const { byId, byName } = buildNameIdMaps(list);

  const wantClear = !!clear || (typeof toGroup === 'string' && toGroup.trim() === '') || (toGroupId === 0);
  let targetGroup = undefined; // name
  let targetId = undefined; // id
  if (!wantClear) {
    if (Number.isFinite(Number(toGroupId))) {
      const id = Number(toGroupId);
      const name = byId.get(id);
      if (!name) { ctx.status = 400; ctx.body = { success: false, message: 'Invalid toGroupId' }; return; }
      targetId = id; targetGroup = name;
    } else if (typeof toGroup === 'string' && toGroup.trim()) {
      const n = toGroup.trim();
      const id = byName.get(n);
      if (id) { targetId = id; targetGroup = n; }
      else { ctx.status = 400; ctx.body = { success: false, message: 'toGroup not exists' }; return; }
    } else {
      ctx.status = 400; ctx.body = { success: false, message: 'toGroup is required (or set clear=true to remove group)' }; return;
    }
  }

  try {
    const key = t === 'script' ? 'scripts' : 'scheduled_tasks';
    const items = db.get(key).value() || [];

    let selectedIds = null;
    if (Array.isArray(ids) && ids.length) {
      selectedIds = new Set(ids.map((n) => parseInt(n)).filter((n) => Number.isFinite(n)));
    } else if (Number.isFinite(Number(fromGroupId))) {
      const fid = Number(fromGroupId);
      selectedIds = new Set(items.filter((it) => (Number(it.group_id) === fid) || (!it.group_id && it.group && byName.get(String(it.group)) === fid)).map((it) => it.id));
    } else if (typeof fromGroup === 'string') {
      const src = fromGroup.trim();
      selectedIds = new Set(items.filter((it) => (it.group || '') === src).map((it) => it.id));
    } else if (allUngrouped) {
      selectedIds = new Set(items.filter((it) => (!it.group && !it.group_id) || String(it.group || '').trim() === '').map((it) => it.id));
    } else {
      ctx.status = 400; ctx.body = { success: false, message: 'one of ids|fromGroup|fromGroupId|allUngrouped is required' }; return;
    }

    let changed = 0;
    const updatedItems = items.map((it) => {
      if (selectedIds.has(it.id)) {
        if (wantClear) {
          if (it.group || it.group_id) { const copy = { ...it }; delete copy.group; delete copy.group_id; changed++; return copy; }
        } else {
          const beforeName = it.group || '';
          const beforeId = Number.isFinite(Number(it.group_id)) ? Number(it.group_id) : (byName.get(String(it.group || '')) || undefined);
          if (beforeName !== targetGroup || beforeId !== targetId) { changed++; return { ...it, group: targetGroup, group_id: targetId }; }
        }
      }
      return it;
    });

    if (changed) db.set(key, updatedItems).write();

    ctx.body = { success: true, data: { changed, total: items.length } };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 辅助：scripts 根目录
function scriptsRootDir() {
  return path.resolve(__dirname, '../../scripts');
}

// 辅助：执行命令
function runCmd(command, args, options) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command, args, { shell: process.platform === 'win32', windowsHide: true, ...options });
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
    child.on('error', (err) => resolve({ code: -1, stdout: stdout.trim(), stderr: (stderr + '\n' + err.message).trim() }));
  });
}

// 辅助：解析 Python 包元数据
async function getPythonPackageMeta(siteDir, pkgName) {
  const items = await fs.readdir(siteDir).catch(() => []);
  const normTarget = String(pkgName).toLowerCase().replace(/[-_]/g, '');
  let meta = null;
  for (const it of items) {
    if (!it.endsWith('.dist-info')) continue;
    const base = it.replace(/\.dist-info$/, '');
    const normBase = base.toLowerCase().replace(/[-_]/g, '');
    const lastDash = base.lastIndexOf('-');
    const namePart = lastDash > 0 ? base.slice(0, lastDash) : base;
    const versionPart = lastDash > 0 ? base.slice(lastDash + 1) : '';
    const normName = namePart.toLowerCase().replace(/[-_]/g, '');
    if (normName === normTarget || normBase.startsWith(normTarget)) {
      const metaFile = path.join(siteDir, it, 'METADATA');
      let summary = '';
      let home = '';
      try {
        const content = await fs.readFile(metaFile, 'utf8');
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          if (!summary && line.toLowerCase().startsWith('summary:')) summary = line.split(':').slice(1).join(':').trim();
          if (!home && line.toLowerCase().startsWith('home-page:')) home = line.split(':').slice(1).join(':').trim();
          if (summary && home) break;
        }
      } catch (_) { /* ignore */ }
      meta = { name: namePart, version: versionPart, summary, homePage: home };
      break;
    }
  }
  return meta;
}

// 依赖列表
async function depsList(ctx) {
  const lang = String(ctx.request.query.lang || '').toLowerCase();
  const root = scriptsRootDir();
  try {
    if (lang === 'node' || lang === 'javascript') {
      const pkgPath = path.join(root, 'package.json');
      let deps = {};
      if (await fs.pathExists(pkgPath)) {
        const json = await fs.readJson(pkgPath).catch(() => ({}));
        deps = { ...(json.dependencies || {}), ...(json.devDependencies || {}) };
      }
      ctx.body = { success: true, data: Object.entries(deps).map(([name, version]) => ({ name, version })) };
      return;
    }
    if (lang === 'python') {
      const site = path.join(root, '.python_packages');
      const exists = await fs.pathExists(site);
      if (!exists) { ctx.body = { success: true, data: [] }; return; }
      const items = await fs.readdir(site);
      const distInfos = items.filter((n) => n.endsWith('.dist-info'));
      const result = [];
      for (const info of distInfos) {
        const base = info.replace(/\.dist-info$/, '');
        const lastDash = base.lastIndexOf('-');
        const namePart = lastDash > 0 ? base.slice(0, lastDash) : base;
        const versionPart = lastDash > 0 ? base.slice(lastDash + 1) : '';
        result.push({ name: namePart, version: versionPart });
      }
      const seen = new Set(result.map((r) => r.name.toLowerCase()));
      for (const it of items) {
        if (it.endsWith('.dist-info') || it.endsWith('.data')) continue;
        const lower = it.toLowerCase();
        if (!seen.has(lower)) result.push({ name: it });
      }
      ctx.body = { success: true, data: result };
      return;
    }
    ctx.status = 400; ctx.body = { success: false, message: 'Unsupported lang. Use node|python' };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 安装依赖
async function depsInstall(ctx) {
  const { lang, name, version } = ctx.request.body || {};
  if (!lang || !name) { ctx.status = 400; ctx.body = { success: false, message: 'lang and name are required' }; return; }
  const root = scriptsRootDir();
  try {
    if (String(lang).toLowerCase() === 'node' || String(lang).toLowerCase() === 'javascript') {
      await fs.ensureDir(root);
      const pkgPath = path.join(root, 'package.json');
      if (!(await fs.pathExists(pkgPath))) {
        await fs.writeJson(pkgPath, { name: 'taskdog-scripts', private: true, version: '1.0.0' }, { spaces: 2 });
      }
      const pkgSpec = version ? `${name}@${version}` : name;
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const res = await runCmd(npmCmd, ['install', pkgSpec, '--save', '--no-audit', '--prefer-offline'], { cwd: root });
      if (res.code !== 0) { ctx.status = 500; ctx.body = { success: false, message: res.stderr || 'npm install failed' }; return; }
      ctx.body = { success: true, data: { name, version: version || 'latest' } };
      return;
    }
    if (String(lang).toLowerCase() === 'python') {
      await fs.ensureDir(root);
      const target = path.join(root, '.python_packages');
      await fs.ensureDir(target);
      const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
      const spec = version ? `${name}==${version}` : name;
      const res = await runCmd(pyCmd, ['-m', 'pip', 'install', spec, '-t', target], { cwd: root });
      if (res.code !== 0) { ctx.status = 500; ctx.body = { success: false, message: res.stderr || 'pip install failed' }; return; }
      ctx.body = { success: true, data: { name, version: version || 'latest' } };
      return;
    }
    ctx.status = 400; ctx.body = { success: false, message: 'Unsupported lang. Use node|python' };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 卸载依赖
async function depsUninstall(ctx) {
  const { lang, name } = ctx.request.body || {};
  if (!lang || !name) { ctx.status = 400; ctx.body = { success: false, message: 'lang and name are required' }; return; }
  const root = scriptsRootDir();
  try {
    if (String(lang).toLowerCase() === 'node' || String(lang).toLowerCase() === 'javascript') {
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const res = await runCmd(npmCmd, ['uninstall', name, '--save'], { cwd: root });
      if (res.code !== 0) { ctx.status = 500; ctx.body = { success: false, message: res.stderr || 'npm uninstall failed' }; return; }
      ctx.body = { success: true };
      return;
    }
    if (String(lang).toLowerCase() === 'python') {
      const target = path.join(root, '.python_packages');
      const candidates = await fs.readdir(target).catch(() => []);
      for (const item of candidates) {
        const lower = item.toLowerCase();
        if (lower === name.toLowerCase() || lower.startsWith(name.toLowerCase().replace(/[-_]/g, ''))) {
          await fs.remove(path.join(target, item));
        }
        if (lower.startsWith(name.toLowerCase().replace(/[-_]/g, '') + '.dist-info')) {
          await fs.remove(path.join(target, item));
        }
      }
      ctx.body = { success: true };
      return;
    }
    ctx.status = 400; ctx.body = { success: false, message: 'Unsupported lang. Use node|python' };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

// 依赖详情
async function depsInfo(ctx) {
  const lang = String(ctx.request.query.lang || '').toLowerCase();
  const name = String(ctx.request.query.name || '').trim();
  if (!lang || !name) { ctx.status = 400; ctx.body = { success: false, message: 'lang and name are required' }; return; }
  const root = scriptsRootDir();
  try {
    if (lang === 'node' || lang === 'javascript') {
      const pkgJsonPath = path.join(root, 'node_modules', ...name.split('/'), 'package.json');
      if (!(await fs.pathExists(pkgJsonPath))) { ctx.body = { success: true, data: null, message: 'Package not found' }; return; }
      const json = await fs.readJson(pkgJsonPath).catch(() => ({}));
      const data = {
        name: json.name || name,
        version: json.version || '',
        description: json.description || '',
        homepage: json.homepage || (json.repository && (typeof json.repository === 'string' ? json.repository : json.repository.url)) || '',
        license: json.license || '',
        dependencies: json.dependencies || {},
      };
      ctx.body = { success: true, data };
      return;
    }
    if (lang === 'python') {
      const site = path.join(root, '.python_packages');
      if (!(await fs.pathExists(site))) { ctx.body = { success: true, data: null, message: 'Package not found' }; return; }
      const meta = await getPythonPackageMeta(site, name);
      if (!meta) { ctx.body = { success: true, data: null, message: 'Package not found' }; return; }
      ctx.body = { success: true, data: meta };
      return;
    }
    ctx.status = 400; ctx.body = { success: false, message: 'Unsupported lang. Use node|python' };
  } catch (error) {
    ctx.status = 500; ctx.body = { success: false, message: error.message };
  }
}

module.exports = { getAll, saveAll, testAll, replaceGlobals, upsertGlobal, depsList, depsInstall, depsUninstall, depsInfo, __sanitizeConfig: sanitizeConfig, __DEFAULT_CONFIG: DEFAULT_CONFIG, listGroups, addGroup, renameGroup, deleteGroup, syncGroupsFromItems, groupStats, assignGroup };
