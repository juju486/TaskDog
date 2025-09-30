// TD shim for Node.js scripts
// Provides global TD object:
// - Access globals via TD.KEY or TD['原始Key'] or TD.变量名
// - Update via TD.set(key, value) -> writes to backend config_groups.globals (single upsert)

// 使用 Node >=18 的全局 fetch，避免对 axios 的依赖
const path = require('path');
const crypto = require('crypto');

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

  // 新增：通用 webhook 通知
  async function tdNotify(message, options = {}) {
    const api = process.env.TASKDOG_API_URL || 'http://127.0.0.1:3001';

    // 解析 urls（优先 options.urls/options.url，其次从后台配置拉取）
    async function getWebhookUrls() {
      const explicit = [];
      if (typeof options.url === 'string' && options.url.trim()) explicit.push(options.url.trim());
      if (Array.isArray(options.urls)) {
        for (const u of options.urls) if (typeof u === 'string' && u.trim()) explicit.push(u.trim());
      }
      if (explicit.length) return explicit.map(u => ({ url: u })); // 包装成对象

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(`${api}/api/config/all`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json().catch(() => null);
        const data = json && (json.data || json);
        const w = data && data.notify && data.notify.webhook;
        if (w && w.enabled && Array.isArray(w.items)) {
          // 返回包含 url 和 secret 的完整对象
          return w.items.filter((it) => it && typeof it.url === 'string' && it.url.trim());
        }
      } catch (e) {
        clearTimeout(timeout);
        try { console.error('TD.notify: failed to load webhook config:', e.message || String(e)); } catch {}
      }
      return [];
    }

    function buildDingTalkPayload(msg, opts) {
      const title = (opts && opts.title) || 'TaskDog Notification';
      // 钉钉的 text 字段支持 markdown
      const text = String(msg);
      const at = (opts && opts.at) || {}; // e.g. { atMobiles: ['180xxxx'], isAtAll: false }

      return {
        msgtype: 'markdown',
        markdown: {
          title,
          text,
        },
        at,
      };
    }

    function toPayload(msg, opts) {
      const now = new Date().toISOString();
      const isObj = msg && typeof msg === 'object';
      const level = (opts && typeof opts.level === 'string') ? opts.level : 'info';
      const title = (opts && typeof opts.title === 'string' && opts.title.trim()) ? opts.title.trim() : 'TaskDog Notification';
      const scriptPath = (process && Array.isArray(process.argv) && process.argv.length >= 2) ? process.argv[1] : '';
      const base = {
        source: 'TaskDog',
        title,
        level,
        time: now,
        message: isObj ? undefined : String(msg),
        data: isObj ? msg : (opts && opts.data) || undefined,
        runtime: {
          pid: process.pid,
          cwd: process.cwd(),
          script: scriptPath,
          params,
        },
      };
      // 允许附加自定义字段
      if (opts && typeof opts.extra === 'object' && opts.extra) {
        base.extra = opts.extra;
      }
      return base;
    }

    // 新增：允许 raw/payload/body 直发
    function buildBodyAndHeaders(msg, opts) {
      const baseHeaders = { 'Content-Type': 'application/json', ...(opts && opts.headers ? opts.headers : {}) };

      // 优先处理模板
      if (opts && opts.template) {
        let payload;
        if (opts.template.toLowerCase() === 'dingtalk') {
          payload = buildDingTalkPayload(msg, opts);
        }
        // 未来可在这里扩展 'wechat', 'feishu' 等模板
        if (payload) {
          return { body: JSON.stringify(payload), headers: baseHeaders };
        }
      }

      const hasPayload = opts && (opts.raw === true || Object.prototype.hasOwnProperty.call(opts, 'payload') || Object.prototype.hasOwnProperty.call(opts, 'body'));
      if (hasPayload) {
        const raw = Object.prototype.hasOwnProperty.call(opts, 'payload') ? opts.payload : (Object.prototype.hasOwnProperty.call(opts, 'body') ? opts.body : msg);
        if (typeof raw === 'string') {
          return { body: raw, headers: baseHeaders };
        }
        return { body: JSON.stringify(raw), headers: baseHeaders };
      }
      const payload = toPayload(msg, opts || {});
      return { body: JSON.stringify(payload), headers: baseHeaders };
    }

    const urls = await getWebhookUrls();
    if (!urls.length) {
      try { console.warn('TD.notify: no webhook configured or provided'); } catch {}
      return { ok: false, delivered: 0, results: [] };
    }

    const { body, headers } = buildBodyAndHeaders(message, options || {});

    const results = [];
    for (const webhook of urls) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      let finalUrl = webhook.url;
      const { secret } = webhook;

      // 如果提供了 secret，则执行钉钉加签逻辑
      if (secret && typeof secret === 'string' && secret.startsWith('SEC')) {
        const timestamp = Date.now();
        const stringToSign = `${timestamp}\n${secret}`;
        const signature = crypto.createHmac('sha256', secret).update(stringToSign).digest('base64');
        const encodedSign = encodeURIComponent(signature);
        finalUrl = `${finalUrl}&timestamp=${timestamp}&sign=${encodedSign}`;
      }

      try {
        const res = await fetch(finalUrl, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        let ok = res.ok;
        let respText = '';
        let respJson = null;
        try {
          respText = await res.text();
          try { respJson = JSON.parse(respText); } catch {}
        } catch {}
        // 钉钉/飞书等：errcode/code/StatusCode 为 0 代表成功
        if (respJson && typeof respJson === 'object') {
          if (Object.prototype.hasOwnProperty.call(respJson, 'errcode')) {
            ok = ok && Number(respJson.errcode) === 0;
          } else if (Object.prototype.hasOwnProperty.call(respJson, 'code')) {
            ok = ok && Number(respJson.code) === 0;
          } else if (Object.prototype.hasOwnProperty.call(respJson, 'StatusCode')) {
            ok = ok && Number(respJson.StatusCode) === 0;
          }
        }
        results.push({ url: webhook.url, ok, status: res.status, body: respJson || respText });
      } catch (e) {
        clearTimeout(timeout);
        results.push({ url: webhook.url, ok: false, error: e.message || String(e) });
      }
    }

    const delivered = results.filter(r => r.ok).length;
    return { ok: delivered > 0, delivered, results };
  }

  // playwright 工具集成
  let _pwToolkit = null;
  async function createPWToolkitProxy(cfgOverride = {}) {
    if (!_pwToolkit) {
      try {
        const helperPath = path.resolve(__dirname, '../../../scripts/utils/playwrightHelper.js');
        const { createPWToolkit } = require(helperPath);
        _pwToolkit = await createPWToolkit(cfgOverride);
      } catch (e) {
        throw new Error('Playwright 集成失败: ' + (e && e.message || e));
      }
    }
    return _pwToolkit;
  }

  const handler = {
    get(target, prop) {
      if (prop === 'set') return tdSet;
      if (prop === 'utils') return TD_UTILS;
      if (prop === 'params') return params;
      if (prop === 'getParam') return getParam;
      if (prop === 'requireParam') return requireParam;
      if (prop === 'notify') return tdNotify;
      if (prop === 'createPWToolkit') return createPWToolkitProxy;
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
