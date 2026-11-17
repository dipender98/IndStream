'use strict';

// Small in-memory TTL cache with single-flight for identical concurrent requests.
function createTtlCache(options) {
  const opts = options || {};
  const ttlMs = Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : 15 * 60 * 1000;
  const maxEntries = Math.max(1, Number(opts.maxEntries) || 500);
  const now = typeof opts.now === 'function' ? opts.now : Date.now;
  const map = new Map();
  const inflight = new Map();

  function isCacheable(value) {
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  function sweep() {
    const t = now();
    for (const [key, entry] of map) {
      if (entry.expiresAt <= t) map.delete(key);
    }
    while (map.size > maxEntries) {
      const oldest = map.keys().next();
      if (oldest.done) break;
      map.delete(oldest.value);
    }
  }

  async function get(key, producer) {
    const t = now();
    const hit = map.get(key);
    if (hit) {
      if (hit.expiresAt > t) {
        map.delete(key);
        map.set(key, hit);
        return { value: hit.value, cached: true };
      }
      map.delete(key);
    }
    if (inflight.has(key)) {
      return { value: await inflight.get(key), cached: 'inflight' };
    }
    const pending = (async function () {
      const value = await producer();
      if (isCacheable(value)) {
        map.set(key, { value: value, expiresAt: now() + ttlMs });
        sweep();
      }
      return value;
    })();
    inflight.set(key, pending);
    try {
      return { value: await pending, cached: false };
    } finally {
      inflight.delete(key);
    }
  }

  return {
    get: get,
    size: function () {
      return map.size;
    },
    clear: function () {
      map.clear();
      inflight.clear();
    },
  };
}

module.exports = {
  createTtlCache: createTtlCache,
};
