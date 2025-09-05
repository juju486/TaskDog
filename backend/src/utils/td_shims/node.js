// TD shim for Node.js scripts
// Provides global TD object:
// - Access globals via TD.KEY or TD['原始Key'] or TD.变量名
// - Update via TD.set(key, value) -> writes to backend config_groups.globals (single upsert)

const axios = require('axios');

function buildTDFromEnv() {
  const json = process.env.TASKDOG_GLOBALS_JSON || '{}';
  let map = {};
  try { map = JSON.parse(json); } catch { map = {}; }

  // Proxy to support TD.someKey and TD['变量'] access
  const store = new Map(Object.entries(map));

  const handler = {
    get(target, prop) {
      if (prop === 'set') return async (key, value, opts = {}) => {
        const api = process.env.TASKDOG_API_URL || 'http://127.0.0.1:3001';
        try {
          await axios.post(`${api}/api/config/globals/set`, { key, value, secret: !!opts.secret }, { timeout: 8000 });
          store.set(String(key), value == null ? '' : String(value));
          return true;
        } catch (e) {
          console.error('TD.set failed:', e.message);
          return false;
        }
      };
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
