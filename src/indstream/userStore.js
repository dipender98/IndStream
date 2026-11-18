'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_USERS = 5000;
const MAX_PROFILES = 20;
const FILE_NAME = 'user-settings.json';

function newToken() {
  return crypto.randomBytes(18).toString('base64url');
}

function cleanId(value, fallback) {
  const text = String(value == null ? '' : value).trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(text) ? text : fallback;
}

function cleanName(value, fallback) {
  const text = String(value == null ? '' : value).trim().slice(0, 40);
  return text || fallback;
}

// Small file-backed store keyed by the signed-in account id.
function createUserStore(options) {
  const dir = options && options.dir ? options.dir : '';
  const file = dir ? path.join(dir, FILE_NAME) : '';
  const users = new Map();
  const tokenIndex = new Map();
  let loaded = false;
  let writing = false;
  let pending = false;
  let warned = false;
  let writePromise = Promise.resolve();

  function indexProfile(sub, profile) {
    if (profile && profile.token) tokenIndex.set(profile.token, { sub: sub, profileId: profile.id });
  }

  function cleanProfile(raw, index, existing) {
    if (!raw || typeof raw !== 'object') return null;
    const cfg = raw.cfg;
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return null;
    const id = cleanId(raw.id, 'p' + (index + 1));
    const token = typeof raw.token === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(raw.token)
      ? raw.token
      : (existing && existing.token) || newToken();
    return {
      id: id,
      name: cleanName(raw.name, 'Profile ' + (index + 1)),
      cfg: cfg,
      token: token,
    };
  }

  function cleanAccount(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const profiles = [];
    const seenIds = new Set();
    const seenTokens = new Set();
    if (Array.isArray(raw.profiles)) {
      raw.profiles.slice(0, MAX_PROFILES).forEach(function (item, index) {
        const profile = cleanProfile(item, index, null);
        if (!profile || seenIds.has(profile.id) || seenTokens.has(profile.token)) return;
        seenIds.add(profile.id);
        seenTokens.add(profile.token);
        profiles.push(profile);
      });
    }
    if (!profiles.length && raw.cfg && typeof raw.cfg === 'object' && !Array.isArray(raw.cfg)) {
      profiles.push({ id: 'p1', name: 'Default', cfg: raw.cfg, token: newToken() });
    }
    if (!profiles.length) return null;
    const activeId = profiles.some(function (profile) { return profile.id === raw.activeId; })
      ? raw.activeId
      : profiles[0].id;
    return { profiles: profiles, activeId: activeId, updatedAt: Number(raw.updatedAt) || 0 };
  }

  function load() {
    if (loaded) return;
    loaded = true;
    if (!file) return;
    let migrated = false;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      Object.keys(data || {}).forEach(function (key) {
        const account = cleanAccount(data[key]);
        if (!account) return;
        if (!Array.isArray(data[key].profiles) || !data[key].profiles.length) migrated = true;
        users.set(key, account);
        account.profiles.forEach(function (profile) { indexProfile(key, profile); });
      });
    } catch (e) {
      if (e && e.code !== 'ENOENT') console.warn('user settings: could not read store');
    }
    if (migrated) persistSync();
  }

  function snapshot() {
    const out = {};
    users.forEach(function (account, key) {
      const active = account.profiles.find(function (profile) { return profile.id === account.activeId; }) || account.profiles[0];
      out[key] = {
        cfg: active.cfg,
        profiles: account.profiles,
        activeId: account.activeId,
        updatedAt: account.updatedAt,
      };
    });
    return out;
  }

  function persistSync() {
    if (!file) return;
    try {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(snapshot()), { mode: 0o600 });
      fs.renameSync(tmp, file);
    } catch (e) {
      if (!warned) {
        warned = true;
        console.warn('user settings: storage is not persistent');
      }
    }
  }

  function trim() {
    if (users.size <= MAX_USERS) return;
    const oldest = Array.from(users.entries())
      .sort(function (a, b) { return a[1].updatedAt - b[1].updatedAt; });
    while (users.size > MAX_USERS && oldest.length) {
      const key = oldest.shift()[0];
      const account = users.get(key);
      if (account) account.profiles.forEach(function (profile) { tokenIndex.delete(profile.token); });
      users.delete(key);
    }
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

  function activeProfile(account) {
    if (!account) return null;
    return account.profiles.find(function (profile) { return profile.id === account.activeId; }) || account.profiles[0];
  }

  function get(sub) {
    load();
    const account = users.get(String(sub || ''));
    const profile = activeProfile(account);
    return profile ? profile.cfg : null;
  }

  function getAccount(sub) {
    load();
    return users.get(String(sub || '')) || null;
  }

  function set(sub, cfg) {
    load();
    const key = String(sub || '');
    if (!key || !cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return;
    const account = users.get(key);
    if (account) {
      account.profiles.forEach(function (profile) {
        if (profile.id === account.activeId) profile.cfg = cfg;
      });
      account.updatedAt = Date.now();
    } else {
      users.set(key, {
        profiles: [{ id: 'p1', name: 'Default', cfg: cfg, token: newToken() }],
        activeId: 'p1',
        updatedAt: Date.now(),
      });
      indexProfile(key, users.get(key).profiles[0]);
    }
    trim();
    return persist();
  }

  function setAccount(sub, value) {
    load();
    const key = String(sub || '');
    if (!key || !value || !Array.isArray(value.profiles)) return null;
    const existing = users.get(key);
    const existingById = new Map();
    if (existing) existing.profiles.forEach(function (profile) { existingById.set(profile.id, profile); });

    const profiles = [];
    const seenIds = new Set();
    const seenTokens = new Set();
    value.profiles.slice(0, MAX_PROFILES).forEach(function (item, index) {
      if (!item || typeof item !== 'object') return;
      const profile = cleanProfile(item, index, existingById.get(String(item.id || '')));
      if (!profile || seenIds.has(profile.id) || seenTokens.has(profile.token)) return;
      seenIds.add(profile.id);
      seenTokens.add(profile.token);
      profiles.push(profile);
    });
    if (!profiles.length) return null;

    if (existing) {
      existing.profiles.forEach(function (profile) { tokenIndex.delete(profile.token); });
    }
    const activeId = profiles.some(function (profile) { return profile.id === value.activeId; })
      ? value.activeId
      : profiles[0].id;
    const account = { profiles: profiles, activeId: activeId, updatedAt: Date.now() };
    users.set(key, account);
    profiles.forEach(function (profile) { indexProfile(key, profile); });
    trim();
    persist();
    return account;
  }

  function findByToken(token) {
    load();
    const hit = tokenIndex.get(String(token || ''));
    if (!hit) return null;
    const account = users.get(hit.sub);
    if (!account) return null;
    const profile = account.profiles.find(function (item) { return item.id === hit.profileId; });
    if (!profile) return null;
    return { sub: hit.sub, profile: profile, activeId: account.activeId };
  }

  return {
    get: get,
    getAccount: getAccount,
    set: set,
    setAccount: setAccount,
    findByToken: findByToken,
    flush: flush,
  };
}

module.exports = {
  createUserStore: createUserStore,
};
