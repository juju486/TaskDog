// TD shim for Node.js scripts
// Provides global TD object:
// - Access globals via TD.KEY or TD['原始Key'] or TD.变量名
// - Update via TD.set(key, value) -> writes to backend config_groups.globals (single upsert)

// 使用 Node >=18 的全局 fetch，避免对 axios 的依赖
const path = require('path')

function loadCommonUtils() {
  // 优先从脚本工作目录加载 backend/scripts/utils/common.js
  try { return require(path.join(process.cwd(), 'utils', 'common.js')) } catch {}
  // 回退：从源码目录相对定位到 backend/scripts/utils/common.js
  try { return require(path.resolve(__dirname, '../../../scripts/utils/common.js')) } catch {}
  return null
}

const COMMON_UTILS = loadCommonUtils()

const TD_UTILS = COMMON_UTILS

function buildTDFromEnv() {
  const globalsJson = process.env.TASKDOG_GLOBALS_JSON || '{}';
  let globalsMap = {};
  try { globalsMap = JSON.parse(globalsJson); } catch { globalsMap = {}; }

  const paramsJson = process.env.TASKDOG_PARAMS_JSON || '{}';
  let params = {};
  try { params = JSON.parse(paramsJson); } catch { params = {}; }

  // Proxy to support TD.someKey and TD['变量'] access
  const store = new Map(Object.entries(globalsMap));

  async function tdSet(key, value, opts = {}) {
    const api = process.env.TASKDOG_API_URL || 'http://127.0.0.1:3001';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${api}/api/config/globals/set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, secret: !!opts.secret }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // 本地缓存保留原始类型（对象/数组/数字/布尔/字符串）
      store.set(String(key), value);
      return true;
    } catch (e) {
      clearTimeout(timeout);
      try { console.error('TD.set failed:', e.message || String(e)); } catch {}
      return false;
    }
  }

  function getParam(key, dflt = undefined) {
    if (key in params) return params[key];
    const envKey = `TD_PARAM_${String(key).replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()}`;
    if (process.env[envKey] !== undefined) {
      const raw = process.env[envKey];
      try { return JSON.parse(raw); } catch { return raw; }
    }
    return dflt;
  }

  function requireParam(key) {
    const v = getParam(key, undefined);
    if (v === undefined) throw new Error(`Missing required param: ${key}`);
    return v;
  }

  const handler = {
    get(target, prop) {
      if (prop === 'set') return tdSet;
      if (prop === 'utils') return TD_UTILS;
      if (prop === 'params') return params;
      if (prop === 'getParam') return getParam;
      if (prop === 'requireParam') return requireParam;
      if (typeof prop !== 'symbol' && TD_UTILS && Object.prototype.hasOwnProperty.call(TD_UTILS, prop)) {
        return TD_UTILS[prop];
      }
      if (prop === 'toJSON') return () => Object.fromEntries(store);
      if (prop === 'inspect') return () => Object.fromEntries(store);
      if (typeof prop === 'symbol') return undefined;
      return store.get(String(prop));
    },
    set(target, prop, value) {
      // Support TD.key = value (local only), prefer TD.set for persistence
      store.set(String(prop), value);
      return true;
    },
    has(target, prop) {
      return store.has(String(prop));
    }
  };

  return new Proxy({}, handler);
}

// expose global TD
if (!global.TD) {
  global.TD = buildTDFromEnv();
}
