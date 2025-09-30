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
async function closePopups(page) {
  // 以常见关闭按钮为例，可根据实际页面调整选择器
  const selectors = [
    'svg[data-testid*="close"]',
    'svg[class*="close"]',
    'i[class*="close"]',
    'text="关闭"', // 新增文本选择器
    'button:has-text("关闭")' // 备用选择器
  ];
  let clicked = false;
  for (const selector of selectors) {
    const popup = await page.$(selector);
    if (popup) {
      const result = await popup.click({ timeout: 200 }).catch(() => false);
      if (result !== false) {
        clicked = true;
      }
    }
  }
  if (clicked) {
    // 如果有弹窗被关闭，递归再次尝试
    await closePopups(page);
  }
}

/**
 * 物流规则配置
 * 这是一个规则数组，每个元素代表一个或一组必须满足的条件 (AND 关系)。
 * 
 * 规则对象结构:
 * {
 *   group: 'group_name',      // (可选) 规则分组名
 *   groupLogic: 'OR' | 'AND', // (可选, 仅分组第一条规则需要) 组内规则的关系
 *   index: number,            // 要检查的物流信息在数组中的索引
 *   keywords: string[],       // 要匹配的关键词列表
 *   logic: 'OR' | 'AND'       // 关键词列表的匹配逻辑 (任一匹配或全部匹配)
 * }
 * 
 * 示例解释:
 * - 下面的配置表示：(第0条物流信息[满足条件A]) AND (第1、2、3条中任意一条[满足各自条件])
 * - 条件A: 包含 '已派送至本' 或 '已投递' 或 ...
 * - 条件B: 第1条包含 '上溪'
 * - 条件C: 第2条包含 '上溪' 或 '金华义乌龙海店'
 * - 条件D: 第3条同时包含 '义乌转运中心' 和 '官塘电退项目营业点'
 */
const WULIU_RULES_CONFIG = [
  // 第一组规则 (独立规则，必须满足)
  {
    group: 'group1',
    groupLogic: 'AND',
    index: 0,
    keywords: ['已派送至本', '已投递', '二楼仓库', '代收', '签收', '派送成功'],
    logic: 'OR',
  },
  // 第二组规则 (B, C, D 规则满足其一即可)
  {
    group: 'group2',
    groupLogic: 'OR',
    index: 1,
    keywords: ['上溪'],
    logic: 'OR',
  },
  {
    group: 'group2',
    index: 2,
    keywords: ['上溪', '金华义乌龙海店'],
    logic: 'OR',
  },
  {
    group: 'group2',
    index: 3,
    keywords: ['义乌转运中心', '官塘电退项目营业点'],
    logic: 'OR',
  },
];

function wuliu_rule(wuliulist) {
  if (!Array.isArray(wuliulist)) return false;

  console.log(`[物流检测] 当前物流信息列表:`, wuliulist);

  const checkRule = (text, rule) => {
    if (!text) return false;
    if (rule.logic === 'AND') {
      return rule.keywords.every(kw => text.includes(kw));
    }
    return rule.keywords.some(kw => text.includes(kw));
  };

  const groupedRules = WULIU_RULES_CONFIG.reduce((acc, rule) => {
    const groupName = rule.group || `rule_${rule.index}`;
    if (!acc[groupName]) {
      acc[groupName] = { logic: rule.groupLogic || 'AND', rules: [] };
    }
    acc[groupName].rules.push(rule);
    return acc;
  }, {});

  for (const groupName in groupedRules) {
    const group = groupedRules[groupName];
    const groupResults = group.rules.map(rule => checkRule(wuliulist[rule.index], rule));

    let groupMatch = false;
    if (group.logic === 'AND') {
      groupMatch = groupResults.every(res => res);
    } else {
      groupMatch = groupResults.some(res => res);
    }

    if (!groupMatch) {
      console.log(`[物流检测] 规则组 '${groupName}' 未通过`);
      return false; // 任何一个AND连接的组失败，则整体失败
    }
  }

  console.log('[物流检测] 所有规则组均通过');
  return true; // 所有AND连接的组都成功
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
  filterCookies,
  closePopups,
  wuliu_rule
};
