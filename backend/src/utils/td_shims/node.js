// TD shim for Node.js scripts
// Provides global TD object:
// - Access globals via TD.KEY or TD['原始Key'] or TD.变量名
// - Update via TD.set(key, value) -> writes to backend config_groups.globals (single upsert)

// 使用 Node >=18 的全局 fetch，避免对 axios 的依赖

function buildTDFromEnv() {
  const json = process.env.TASKDOG_GLOBALS_JSON || '{}';
  let map = {};
  try { map = JSON.parse(json); } catch { map = {}; }

  // Proxy to support TD.someKey and TD['变量'] access
  const store = new Map(Object.entries(map));

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
      store.set(String(key), value == null ? '' : String(value));
      return true;
    } catch (e) {
      clearTimeout(timeout);
      try { console.error('TD.set failed:', e.message || String(e)); } catch {}
      return false;
    }
  }

  const handler = {
    get(target, prop) {
      if (prop === 'set') return tdSet;
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
