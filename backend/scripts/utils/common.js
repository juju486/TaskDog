/*
  通用 Node.js 工具函数（脚本可复用）
  放置位置：backend/scripts/utils/common.js
  用法（脚本在 backend/scripts 下）：
    const { sleep, retry, logger, fetchJSON, resolveFromScripts } = require('./utils/common')
*/

const path = require('path')

function scriptsRoot() {
  // 本文件位于 backend/scripts/utils
  return path.resolve(__dirname, '..')
}

function resolveFromScripts(...segments) {
  return path.join(scriptsRoot(), ...segments)
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms))
}

async function retry(fn, opts = {}) {
  let { tries = 3, delay = 500, factor = 2, onRetry } = opts
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      return await fn(i + 1)
    } catch (e) {
      lastErr = e
      if (typeof onRetry === 'function') {
        try { await onRetry(e, i + 1) } catch {}
      }
      if (i < tries - 1) {
        await sleep(typeof delay === 'function' ? delay(i + 1) : delay)
        if (typeof factor === 'number') delay = Math.round(delay * factor)
      }
    }
  }
  throw lastErr
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options)
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`)
    err.status = res.status
    err.body = data
    throw err
  }
  return data
}

function logger(scope = 'script') {
  const prefix = () => `[${new Date().toISOString()}][${scope}]`
  return {
    log: (...a) => console.log(prefix(), ...a),
    info: (...a) => console.info(prefix(), ...a),
    warn: (...a) => console.warn(prefix(), ...a),
    error: (...a) => console.error(prefix(), ...a),
  }
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
}
