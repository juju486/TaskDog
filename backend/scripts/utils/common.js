/*
  通用 Node.js 工具函数（脚本可复用）
  放置位置：backend/scripts/utils/common.js
  用法（脚本在 backend/scripts 下）：
    const { sleep, retry, logger, fetchJSON, resolveFromScripts } = require('./utils/common')
*/

const path = require('path');
const CryptoJS = require('crypto-js');
// 优先使用 Node 18+ 原生 fetch，回退到 node-fetch
let _fetch;
try {
  _fetch = (typeof globalThis.fetch === 'function') ? globalThis.fetch.bind(globalThis) : null;
} catch (_) { _fetch = null; }
if (!_fetch) {
  try {
    const nf = require('node-fetch');
    _fetch = (nf && nf.default) ? nf.default : nf;
  } catch (e) {
    throw new Error('fetch is not available (need Node >=18 or install node-fetch)');
  }
}

function scriptsRoot() {
  // 本文件位于 backend/scripts/utils
  return path.resolve(__dirname, '..');
}

function resolveFromScripts(...segments) {
  return path.join(scriptsRoot(), ...segments);
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function retry(fn, opts = {}) {
  let { tries = 3, delay = 500, factor = 2, onRetry } = opts;
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn(i + 1);
    } catch (e) {
      lastErr = e;
      if (typeof onRetry === 'function') {
        try { await onRetry(e, i + 1); } catch { }
      }
      if (i < tries - 1) {
        await sleep(typeof delay === 'function' ? delay(i + 1) : delay);
        if (typeof factor === 'number') delay = Math.round(delay * factor);
      }
    }
  }
  throw lastErr;
}

async function fetchJSON(url, options = {}) {
  const res = await _fetch(url, options);
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

function logger(scope = 'script') {
  const prefix = () => `[${new Date().toISOString()}][${scope}]`;
  return {
    log: (...a) => console.log(prefix(), ...a),
    info: (...a) => console.info(prefix(), ...a),
    warn: (...a) => console.warn(prefix(), ...a),
    error: (...a) => console.error(prefix(), ...a),
  };
}

function normalizeBaseUrl(input) {
  if (!input) return '';
  let base = String(input).trim();
  if (!/^https?:\/\//i.test(base)) base = 'http://' + base;
  // 确保以 / 结尾，便于 URL 解析
  if (!base.endsWith('/')) base += '/';
  return base;
}

async function cloud_cookie(optsOrHost, uuidArg, passwordArg) {
  // 支持两种调用方式：cloud_cookie({host, uuid, password}) 或 cloud_cookie(host, uuid, password)
  const opts = (optsOrHost && typeof optsOrHost === 'object')
    ? optsOrHost
    : { host: optsOrHost, uuid: uuidArg, password: passwordArg };

  const host = opts && opts.host;
  const uuid = opts && opts.uuid;
  const password = opts && opts.password;

  if (!host || !uuid) {
    throw new Error('cloud_cookie requires host and uuid');
  }

  const base = normalizeBaseUrl(host);
  const url = new URL(`get/${uuid}`, base).toString();

  const ret = await _fetch(url);
  const json = await ret.json().catch(() => null);
  let cookies = [];
  if (json && json.encrypted) {
    const { cookie_data } = cookie_decrypt(uuid, json.encrypted, password);
    for (const key in cookie_data) {
      const arr = cookie_data[key] || [];
      cookies = cookies.concat(arr.map((item) => {
        const c = { ...item };
        // Playwright 只接受 Strict|Lax|None
        if (!['Strict', 'Lax', 'None'].includes(c.sameSite)) c.sameSite = 'Lax';
        return c;
      }));
    }
  } else if (Array.isArray(json)) {
    // 服务端若直接返回 cookies 数组也兼容
    cookies = json;
  }
  return cookies;
}

function cookie_decrypt(uuid, encrypted, password) {
  const the_key = CryptoJS.MD5(uuid + '-' + password).toString().substring(0, 16);
  const decrypted = CryptoJS.AES.decrypt(encrypted, the_key).toString(CryptoJS.enc.Utf8);
  const parsed = JSON.parse(decrypted);
  return parsed;
}

function filterCookies(inputCookies, targetDomains) {

  const filteredCookies = inputCookies.filter(cookie => {
    return targetDomains.some(domain => {
      // 精确匹配，或者通配符域名匹配（例如 .example.com 匹配 sub.example.com）
      return cookie.domain === domain ||
        (domain.startsWith('.') && cookie.domain.endsWith(domain));
    });
  });
  return filteredCookies;
}

module.exports = {
  // 路径
  scriptsRoot,
  resolveFromScripts,
  // 通用
  sleep,
  retry,
  fetchJSON,
  logger,
  cloud_cookie,
  filterCookies
};
