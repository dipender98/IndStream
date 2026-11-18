'use strict';

const fs = require('fs');
const path = require('path');

const MAX_USERS = 5000;
const FILE_NAME = 'user-settings.json';

// Small file-backed store keyed by the signed-in account id.
function createUserStore(options) {
  const dir = options && options.dir ? options.dir : '';
  const file = dir ? path.join(dir, FILE_NAME) : '';
  const users = new Map();
  let loaded = false;
  let writing = false;
  let pending = false;
  let warned = false;
  let writePromise = Promise.resolve();

  function load() {
    if (loaded) return;
    loaded = true;
    if (!file) return;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      Object.keys(data || {}).forEach(function (key) {
        const entry = data[key];
        if (!entry || typeof entry !== 'object') return;
        if (!entry.cfg || typeof entry.cfg !== 'object' || Array.isArray(entry.cfg)) return;
        users.set(key, { cfg: entry.cfg, updatedAt: Number(entry.updatedAt) || 0 });
      });
    } catch (e) {
      if (e && e.code !== 'ENOENT') console.warn('user settings: could not read store');
    }
  }

  function snapshot() {
    const out = {};
    users.forEach(function (entry, key) {
      out[key] = { cfg: entry.cfg, updatedAt: entry.updatedAt };
    });
    return out;
  }

  function trim() {
    if (users.size <= MAX_USERS) return;
    const oldest = Array.from(users.entries())
      .sort(function (a, b) { return a[1].updatedAt - b[1].updatedAt; });
    while (users.size > MAX_USERS && oldest.length) users.delete(oldest.shift()[0]);
  }

  function persist() {
    if (!file) return writePromise;
    if (writing) { pending = true; return writePromise; }
    writing = true;
    writePromise = fs.promises.mkdir(dir, { recursive: true })
      .then(function () {
        const tmp = file + '.tmp';
        return fs.promises.writeFile(tmp, JSON.stringify(snapshot()), { mode: 0o600 })
          .then(function () { return fs.promises.rename(tmp, file); });
      })
      .catch(function () {
        if (warned) return;
        warned = true;
        console.warn('user settings: storage is not persistent');
      })
      .finally(function () {
        writing = false;
        if (!pending) return;
        pending = false;
        persist();
      });
    return writePromise;
  }

  async function flush() {
    while (writing || pending) await writePromise;
  }

  function get(sub) {
    load();
    const entry = users.get(String(sub || ''));
    return entry ? entry.cfg : null;
  }

  function set(sub, cfg) {
    load();
    const key = String(sub || '');
    if (!key || !cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return;
    users.set(key, { cfg: cfg, updatedAt: Date.now() });
    trim();
    return persist();
  }

  return {
    get: get,
    set: set,
    flush: flush,
  };
}

module.exports = {
  createUserStore: createUserStore,
};
