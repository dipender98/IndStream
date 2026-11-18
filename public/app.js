const PROVIDERS = [
  { id: 'hdhub', name: 'HdHub', mark: 'HH', tags: ['4K', '1080p', 'Multi-Audio', 'Stream', 'Download', 'Very Fast'] },
  { id: 'vidrift', name: 'Vidrift', mark: 'VR', tags: ['1080p', 'Stream', 'Very Fast'] },
  { id: 'bingr', name: 'Bingr', mark: 'BG', tags: ['1080p', 'Stream', 'Download', 'Fast'] },
  { id: 'moviebox', name: 'MovieBox', mark: 'MB', tags: ['4K', '1080p', 'Multi-Audio', 'Stream', 'Download'] },
  { id: 'hub4k', name: '4KHDHub', mark: '4K', tags: ['4K', '1080p', 'Multi-Audio', 'Stream', 'Download'] },
  { id: 'netmirror', name: 'NetMirror', mark: 'NM', tags: ['Multi-Audio', 'Stream', 'Download', 'Fast'] },
  { id: 'atlantic', name: 'Atlantic', mark: 'AT', tags: ['1080p', 'Multi-Audio', 'Stream', 'Very Fast'] },
  { id: 'vidly', name: 'Vidly', mark: 'VL', tags: ['1080p', 'Stream', 'Fast'] },
  { id: 'vidbolt', name: 'VidBolt', mark: 'VB', tags: ['4K', '1080p', 'Multi-Audio', 'Stream', 'Fast'] },
  { id: 'movy', name: 'Movy', mark: 'MV', tags: ['4K', '1080p', 'Multi-Audio', 'Stream', 'Fast'] },
  { id: 'vidy', name: 'Vidy', mark: 'VD', tags: ['4K', '1080p', 'Multi-Audio', 'Stream', 'Fast'] },
  { id: 'vidlink', name: 'VidLink', mark: 'VK', tags: ['1080p', 'Stream', 'Very Fast'] },
];

const QUALITY_TAGS = ['4K', '1080p', '720p'];
function displayTags(tags) {
  const list = Array.isArray(tags) ? tags : [];
  const highest = QUALITY_TAGS.find(function (tag) { return list.indexOf(tag) >= 0; });
  const canStream = list.indexOf('Stream') >= 0;
  const canDownload = list.indexOf('Download') >= 0;
  const out = [];
  let addedMode = false;
  list.forEach(function (tag) {
    if (tag === 'Stream' || tag === 'Download') {
      if (!addedMode && canStream) {
        out.push(canDownload ? 'Stream and Download' : 'Stream only');
        addedMode = true;
      }
      return;
    }
    if (QUALITY_TAGS.indexOf(tag) >= 0 && tag !== highest) return;
    out.push(tag);
  });
  return out;
}

const LANGS = ['Multi', 'Original'].concat(
  ['Hindi', 'English', 'Tamil', 'Telugu', 'Malayalam', 'Kannada',
    'Bengali', 'Urdu', 'Marathi', 'Punjabi', 'Arabic', 'Russian', 'Chinese',
    'Japanese', 'Korean', 'French', 'Spanish', 'Portuguese', 'Indonesian',
    'Vietnamese', 'Thai', 'Turkish', 'German', 'Italian', 'Dutch', 'Polish', 'Nepali']
    .sort(function (a, b) { return a.localeCompare(b); })
);

const QUALITY_KEYS = ['2160', '1440', '1080', '720', 'auto', 'unknown'];
const QUALITIES = [
  { id: '2160', name: '4K/2160p', mark: '4K', meta: '2160p and above' },
  { id: '1440', name: '2K/1440p', mark: '2K', meta: '1440p' },
  { id: '1080', name: '1080p', mark: '1080p', meta: '1080p' },
  { id: '720', name: '720p', mark: '720p', meta: '720p' },
  { id: 'auto', name: 'Auto', mark: 'Auto', meta: 'Other detected heights' },
  { id: 'unknown', name: 'Unknown', mark: '?', meta: 'No height detected' },
];
const QUALITY_MAP = {};
QUALITIES.forEach(function (q) { QUALITY_MAP[q.id] = q; });

function normalizeQualityOrder(value) {
  const order = [];
  if (Array.isArray(value)) {
    value.forEach(function (key) {
      if (QUALITY_KEYS.indexOf(key) >= 0 && order.indexOf(key) < 0) order.push(key);
    });
  }
  QUALITY_KEYS.forEach(function (key) { if (order.indexOf(key) < 0) order.push(key); });
  return order;
}

function normalizeQualityOff(value) {
  const off = [];
  if (!Array.isArray(value)) return off;
  value.forEach(function (key) {
    if (QUALITY_KEYS.indexOf(key) >= 0 && off.indexOf(key) < 0) off.push(key);
  });
  return off;
}

function resolveQuality(raw) {
  const hasOrder = !!raw && Array.isArray(raw.qualityOrder);
  const order = normalizeQualityOrder(raw && raw.qualityOrder);
  let off = hasOrder
    ? normalizeQualityOff(raw && raw.qualityOff)
    : (String((raw && raw.minQuality) || '') === '1080' ? ['720', 'auto'] : []);
  const enabled = order.filter(function (key) { return off.indexOf(key) < 0; });
  if (!enabled.length) off = off.filter(function (key) { return key !== order[0]; });
  return { qualityOrder: order, qualityOff: off };
}

const DEFAULT_CFG = {
  p: PROVIDERS.map(function (p) { return p.id; }),
  sourceOrder: PROVIDERS.map(function (p) { return p.id; }),
  langs: ['Original', 'Hindi', 'English', 'Multi'],
  langStrict: false,
  streamStyle: 'indstream',
  qualityOrder: QUALITY_KEYS.slice(),
  qualityOff: [],
  resultLimit: '40',
  requestTimeout: '10',
  includeDash: true,
  probeQuality: false,
  debug: false,
};

var cfgSyncEnabled = false;
var cfgPushTimer = 0;
var profileTokens = {};

function addonUrlFromToken(token) {
  return window.location.origin + '/u/' + token + '/manifest.json';
}

function manifestUrl(cfg, profile) {
  var target = profile || activeProfile();
  if (target && profileTokens[target.id]) return addonUrlFromToken(profileTokens[target.id]);
  return window.location.origin + '/' + b64url(cfg) + '/manifest.json';
}

function syncTokens(data) {
  if (!data || !Array.isArray(data.profiles)) return;
  var next = {};
  data.profiles.forEach(function (p) {
    if (p && typeof p.id === 'string' && typeof p.token === 'string') next[p.id] = p.token;
  });
  profileTokens = next;
}

function pushCfg() {
  if (!cfgSyncEnabled) return;
  clearTimeout(cfgPushTimer);
  cfgPushTimer = setTimeout(function () {
    var cfg = currentCfg();
    var profiles = loadProfiles();
    var activeId = activeProfileId(profiles);
    try {
      fetch('/api/cfg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cfg: cfg,
          profiles: profiles.map(function (p) {
            return { id: p.id, name: p.name, cfg: sanitizeCfg(p.cfg) };
          }),
          activeId: activeId,
        }),
      }).then(function (res) { return res.json(); }).then(function (data) {
        syncTokens(data);
        setText('manifestUrl', manifestUrl(currentCfg()));
        renderProfiles();
      }).catch(function () {});
    } catch (e) {}
  }, 600);
}

const LS_KEY = 'indstream.cfg.v3';

const LS_LANG_MIGRATE = 'indstream.langDefaults.v4';
const LS_PROVIDER_MIGRATE = 'indstream.providerDefaults.v6';
const LEGACY_DEFAULT_PROVIDERS = ['hdhub', 'vidrift', 'bingr', 'moviebox', 'hub4k'];
const LS_WELCOME = 'indstream.welcome.dismissed';
const LS_PROFILES = 'indstream.profiles.v1';
const LS_ACTIVE = 'indstream.activeProfile.v1';
let interactive = false;

function safeGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch (e) {
    console.warn('IndStream: storage is unavailable');
    return false;
  }
}

function sanitizeCfg(raw) {
  const merged = Object.assign({}, DEFAULT_CFG, raw || {});
  const providerIds = PROVIDERS.map(function (p) { return p.id; });
  merged.p = Array.isArray(merged.p) ? merged.p.filter(function (id) { return providerIds.indexOf(id) >= 0; }) : [];
  if (safeGet(LS_PROVIDER_MIGRATE) !== '1') {
    const oldDefault = merged.p.length === LEGACY_DEFAULT_PROVIDERS.length &&
      LEGACY_DEFAULT_PROVIDERS.every(function (id) { return merged.p.indexOf(id) >= 0; });
    if (oldDefault) merged.p = providerIds.slice();
    safeSet(LS_PROVIDER_MIGRATE, '1');
  }
  const sourceOrder = [];
  if (Array.isArray(merged.sourceOrder)) {
    merged.sourceOrder.forEach(function (id) {
      if (providerIds.indexOf(id) >= 0 && sourceOrder.indexOf(id) < 0) sourceOrder.push(id);
    });
  }
  providerIds.forEach(function (id) { if (sourceOrder.indexOf(id) < 0) sourceOrder.push(id); });
  merged.sourceOrder = sourceOrder;
  const storedLangs = merged.langs;
  if (!Array.isArray(storedLangs)) {
    merged.langs = DEFAULT_CFG.langs.slice();
    safeSet(LS_LANG_MIGRATE, '1');
  } else {
    merged.langs = storedLangs.filter(function (lang) { return LANGS.indexOf(lang) >= 0; });
    if (!merged.langs.length && safeGet(LS_LANG_MIGRATE) !== '1' && safeSet(LS_LANG_MIGRATE, '1')) {
      merged.langs = DEFAULT_CFG.langs.slice();
    }
  }
  merged.langStrict = !!merged.langStrict;
  merged.streamStyle = typeof merged.streamStyle === 'string' ? merged.streamStyle : DEFAULT_CFG.streamStyle;
  const quality = resolveQuality(merged);
  merged.qualityOrder = quality.qualityOrder;
  merged.qualityOff = quality.qualityOff;
  delete merged.minQuality;
  merged.resultLimit = ['0', '20', '40', '80'].indexOf(String(merged.resultLimit)) >= 0 ? String(merged.resultLimit) : DEFAULT_CFG.resultLimit;
  merged.requestTimeout = ['5', '10', '15', '25'].indexOf(String(merged.requestTimeout)) >= 0 ? String(merged.requestTimeout) : DEFAULT_CFG.requestTimeout;
  merged.includeDash = !!merged.includeDash;
  merged.probeQuality = !!merged.probeQuality;
  merged.debug = !!merged.debug;
  return merged;
}

function loadProfiles() {
  let profiles = null;
  try { profiles = JSON.parse(safeGet(LS_PROFILES) || 'null'); } catch (e) {}
  if (!Array.isArray(profiles) || !profiles.length) {
    let legacy = null;
    try { const raw = safeGet(LS_KEY); if (raw) legacy = JSON.parse(raw); } catch (e) {}
    profiles = [{ id: 'p1', name: 'Default', cfg: sanitizeCfg(legacy) }];
    saveProfiles(profiles);
  }
  return profiles.map(function (p) {
    return { id: String(p.id || ('p' + Date.now())), name: String(p.name || 'Profile').slice(0, 40) || 'Profile', cfg: sanitizeCfg(p.cfg) };
  });
}
function saveProfiles(profiles) {
  const ok = safeSet(LS_PROFILES, JSON.stringify(profiles));
  if (!ok) toast('Could not save to this browser');
  return ok;
}
function activeProfileId(profiles) {
  const list = profiles || loadProfiles();
  const id = safeGet(LS_ACTIVE);
  return list.some(function (p) { return p.id === id; }) ? id : list[0].id;
}
function activeProfile() {
  const profiles = loadProfiles();
  const id = activeProfileId(profiles);
  return profiles.find(function (p) { return p.id === id; }) || profiles[0];
}
function loadCfg() {
  const p = activeProfile();
  return sanitizeCfg(p.cfg);
}
function saveCfg(cfg) {
  const profiles = loadProfiles();
  const id = activeProfileId(profiles);
  const idx = profiles.findIndex(function (p) { return p.id === id; });
  if (idx >= 0) {
    profiles[idx].cfg = sanitizeCfg(cfg);
    return saveProfiles(profiles);
  }
  return false;
}
function trapFocus(container, event) {
  const nodes = Array.from(container.querySelectorAll('button:not([tabindex="-1"]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(function (el) { return !el.hidden && (el.offsetWidth || el.offsetHeight || el.getClientRects().length); });
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function decodeCfgSegment(seg) {
  try {
    const padded = seg.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((seg.length + 3) % 4);
    const obj = JSON.parse(atob(padded));
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch (e) {
    return null;
  }
}

function b64url(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let binary = '';
  bytes.forEach(function (byte) { binary += String.fromCharCode(byte); });
  return btoa(binary)
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function currentCfg() {
  const prev = loadCfg();
  const prevL = prev.langs;
  const langs = Array.from(document.querySelectorAll('#langs .chip-btn.active')).map(function (el) { return el.dataset.lang; });
  const sourceRows = Array.from(document.querySelectorAll('#sourceList .source-item'));
  const sourceOrder = sourceRows.length ? sourceRows.map(function (el) { return el.dataset.key; }) : prev.sourceOrder.slice();
  const p = sourceRows.length
    ? sourceRows.filter(function (el) { return !el.classList.contains('off'); }).map(function (el) { return el.dataset.key; })
    : prev.p.slice();
  const langsOrdered = prevL.filter(function (l) { return langs.indexOf(l) >= 0; })
    .concat(langs.filter(function (l) { return prevL.indexOf(l) < 0; }));
  const qualityRows = Array.from(document.querySelectorAll('#qualityRank .quality-item'));
  const qualityOrder = qualityRows.map(function (el) { return el.dataset.key; });
  const qualityOff = qualityRows.filter(function (el) { return el.classList.contains('off'); })
    .map(function (el) { return el.dataset.key; });
  return {
    p: p,
    sourceOrder: sourceOrder,
    langs: langsOrdered,
    langStrict: document.getElementById('langStrict').checked,
    streamStyle: document.getElementById('streamStyle').value,
    qualityOrder: qualityOrder.length ? qualityOrder : QUALITY_KEYS.slice(),
    qualityOff: qualityOff,
    resultLimit: document.getElementById('resultLimitSeg').querySelector('.active').dataset.value,
    requestTimeout: document.getElementById('timeoutSeg').querySelector('.active').dataset.value,
    includeDash: document.getElementById('includeDash').checked,
    probeQuality: document.getElementById('probeQuality').checked,
    debug: document.getElementById('debug').checked,
  };
}

function setSeg(sel, value) {
  document.querySelectorAll(sel + ' button').forEach(function (btn) {
    const active = btn.dataset.value === String(value);
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

function applyCfg(cfg) {
  cfg = sanitizeCfg(cfg);
  document.querySelectorAll('#langs .chip-btn').forEach(function (el) {
    const active = cfg.langs.indexOf(el.dataset.lang) >= 0;
    el.classList.toggle('active', active);
    el.setAttribute('aria-pressed', String(active));
  });
  setSeg('#resultLimitSeg', cfg.resultLimit);
  setSeg('#timeoutSeg', cfg.requestTimeout);
  document.getElementById('langStrict').checked = !!cfg.langStrict;
  document.getElementById('includeDash').checked = !!cfg.includeDash;
  document.getElementById('probeQuality').checked = !!cfg.probeQuality;
  document.getElementById('debug').checked = !!cfg.debug;
  const styleSel = document.getElementById('streamStyle');
  if (styleSel && cfg.streamStyle) styleSel.value = cfg.streamStyle;
  renderPreferenceLists(cfg);
  updateAll();
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { t.classList.remove('show'); }, 2400);
}

function configureUrlCfg() {
  const m = window.location.pathname.match(/^\/([A-Za-z0-9_-]+)\/configure\/?$/);
  if (!m || m[1] === 'u') return null;
  const cfg = decodeCfgSegment(m[1]);
  return cfg ? sanitizeCfg(cfg) : null;
}

function configureAddonToken() {
  const m = window.location.pathname.match(/^\/u\/([A-Za-z0-9_-]{16,64})\/configure\/?$/);
  return m ? m[1] : null;
}

function qualitySummary(cfg) {
  const order = cfg.qualityOrder.filter(function (key) { return cfg.qualityOff.indexOf(key) < 0; });
  if (!order.length) return '—';
  if (order.length === QUALITY_KEYS.length) return 'All qualities';
  return order.slice(0, 3).map(function (key) { return QUALITY_MAP[key].mark; }).join(' → ');
}

function flashSaved() {
  if (!interactive) return;
  const bar = document.querySelector('.saved-line');
  if (!bar) return;
  clearTimeout(flashSaved._t);
  const original = flashSaved._original || bar.innerHTML;
  flashSaved._original = original;
  bar.innerHTML = '<span class="dot-success"></span> All changes saved';
  flashSaved._t = setTimeout(function () {
    bar.innerHTML = original;
  }, 1400);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateAll() {
  const cfg = currentCfg();
  const saved = saveCfg(cfg);
  if (saved) flashSaved();
  else toast('Changes could not be saved to this browser');
  const url = manifestUrl(cfg, activeProfile());
  setText('manifestUrl', url);
  setText('sourcesBadge', cfg.p.length);
  setText('sourcesCount', cfg.p.length + ' selected');
  updatePreview(document.getElementById('streamStyle').value);
  renderProfiles();
  pushCfg();
}

function renderProfiles() {
  const grid = document.getElementById('profilesGrid');
  if (!grid) return;
  const profiles = loadProfiles();
  const activeId = activeProfileId(profiles);
  const badge = document.getElementById('profilesBadge');
  if (badge) badge.textContent = profiles.length;
  grid.innerHTML = '';
  profiles.forEach(function (p) {
    const cfg = sanitizeCfg(p.cfg);
    const url = manifestUrl(cfg, p);
    const isActive = p.id === activeId;
    const card = document.createElement('div');
    card.className = 'profile-card' + (isActive ? ' active' : '');
    card.innerHTML =
      '<div class="profile-card-head">' +
        '<div class="profile-avatar">' + escapeHtml((p.name || 'P')[0].toUpperCase()) + '</div>' +
        '<div><div class="profile-name">' + escapeHtml(p.name) + '</div>' +
        '<div class="profile-meta"><strong>' + cfg.p.length + '</strong> sources · ' +
          qualitySummary(cfg) +
          (cfg.langs.length ? ' · ' + cfg.langs.length + ' language' + (cfg.langs.length > 1 ? 's' : '') : '') +
        '</div></div>' +
        (isActive ? '<span class="profile-active-tag">Active</span>' : '') +
      '</div>' +
      '<div class="profile-url">' + escapeHtml(url) + '</div>' +
      '<div class="profile-actions">' +
        '<button class="profile-btn primary" data-act="use">' + (isActive ? 'Using' : 'Use') + '</button>' +
        '<button class="profile-btn" data-act="copy">Copy URL</button>' +
        '<button class="profile-btn" data-act="rename">Rename</button>' +
        (profiles.length > 1 ? '<button class="profile-btn danger" data-act="delete">Delete</button>' : '') +
      '</div>';
    card.querySelectorAll('.profile-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const act = btn.dataset.act;
        if (act === 'use') {
          safeSet(LS_ACTIVE, p.id);
          applyCfg(loadCfg());
          toast('Switched to "' + p.name + '"');
        } else if (act === 'copy') {
          copyText(url);
        } else if (act === 'rename') {
          const next = prompt('Profile name', p.name);
          if (next && next.trim()) { p.name = next.trim().slice(0, 40); saveProfiles(profiles); renderProfiles(); }
        } else if (act === 'delete') {
          if (confirm('Delete profile "' + p.name + '"?')) {
            const idx = profiles.findIndex(function (x) { return x.id === p.id; });
            profiles.splice(idx, 1);
            saveProfiles(profiles);
            applyCfg(loadCfg());
            toast('Profile deleted');
          }
        }
      });
    });
    grid.appendChild(card);
  });
}

function createProfile(seedCfg, suggestedName) {
  const profiles = loadProfiles();
  const fallback = 'Profile ' + (profiles.length + 1);
  let prompted = suggestedName;
  if (!prompted) prompted = prompt('Name your profile', fallback);
  if (prompted == null) return;
  const name = String(prompted).trim().slice(0, 40);
  if (!name) return;
  const cfg = sanitizeCfg(seedCfg || loadCfg());
  const id = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : 'p' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  profiles.push({ id: id, name: name, cfg: cfg });
  saveProfiles(profiles);
  safeSet(LS_ACTIVE, id);
  applyCfg(loadCfg());
  toast('Profile "' + name + '" created');
}

function importFromUrl(url) {
  const text = String(url || '');
  const tokenMatch = text.match(/\/u\/([A-Za-z0-9_-]{16,64})\/manifest\.json/);
  if (tokenMatch) {
    fetch('/api/addon/' + encodeURIComponent(tokenMatch[1]))
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || !data.ok) { toast('That addon link is invalid'); return; }
        createProfile(data.cfg, data.profile && data.profile.name ? data.profile.name : 'Imported');
      })
      .catch(function () { toast('Could not read that addon link'); });
    return;
  }
  const m = text.match(/\/([A-Za-z0-9_-]+)\/manifest\.json/);
  if (!m) { toast('No config found in that URL'); return; }
  const cfg = decodeCfgSegment(m[1]);
  if (!cfg) { toast('That config URL is invalid'); return; }
  createProfile(cfg, 'Imported');
}

let previewToken = 0;
let previewTimer = 0;
function updatePreview(style) {
  const box = document.getElementById('stylePreview');
  if (!box) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(function () {
    const token = ++previewToken;
    fetch('/api/style-preview?style=' + encodeURIComponent(style))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (token !== previewToken) return;
        box.innerHTML = '';
        (data.samples || []).forEach(function (s) {
          const div = document.createElement('div');
          div.className = 'sample';
          const name = document.createElement('div');
          name.className = 'sample-name';
          name.textContent = s.name;
          const title = document.createElement('div');
          title.textContent = s.title;
          div.appendChild(name);
          div.appendChild(title);
          box.appendChild(div);
        });
      })
      .catch(function () {
        if (token !== previewToken) return;
        box.innerHTML = '<div class="sample">Preview unavailable. Try another style.</div>';
      });
  }, 200);
}

function copyText(text) {
  const done = function () { toast('Addon URL copied — paste it in Nuvio or Stremio'); };
  const fail = function () { toast('Copy failed — select the URL text and copy it manually'); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(done, fail);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(ta);
  ta.select();
  var copied = false;
  try { copied = document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
  if (copied) done(); else fail();
  return Promise.resolve(copied);
}

function buildLangChips() {
  const wrap = document.getElementById('langs');
  wrap.innerHTML = '';
  LANGS.forEach(function (lang) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip-btn';
    btn.dataset.lang = lang;
    btn.setAttribute('aria-pressed', 'false');
    btn.textContent = lang;
    btn.addEventListener('click', function () {
      const active = !btn.classList.contains('active');
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
      updateAll();
    });
    wrap.appendChild(btn);
  });
}

const FALLBACK_STYLES = [
  { id: 'indstream', label: 'IndStream (default)' },
  { id: 'lightgdrive', label: 'LightGDrive' },
  { id: 'gdrive', label: 'GDrive' },
  { id: 'minimalisticgdrive', label: 'MinimalisticGDrive' },
  { id: 'prism', label: 'Prism' },
  { id: 'torrentio-minimalist', label: 'Torrentio Minimalist' },
  { id: 'mediafusion-pro', label: 'MediaFusion Pro' },
  { id: 'torrentio', label: 'Torrentio' },
  { id: 'torbox', label: 'TorBox' },
];
const DEFAULT_STYLE = 'indstream';

function loadStyles() {
  fetch('/api/styles').then(function (r) { return r.json(); }).then(function (data) {
    const sel = document.getElementById('streamStyle');
    if (!sel) return;
    sel.innerHTML = '';
    (data.options || FALLBACK_STYLES).forEach(function (opt) {
      const o = document.createElement('option');
      o.value = opt.id;
      o.textContent = opt.label;
      sel.appendChild(o);
    });
    const cfg = loadCfg();
    sel.value = cfg.streamStyle || data.default || DEFAULT_STYLE;
    updateAll();
  }).catch(function () {
    const sel = document.getElementById('streamStyle');
    if (!sel) return;
    sel.innerHTML = '';
    FALLBACK_STYLES.forEach(function (opt) {
      const o = document.createElement('option');
      o.value = opt.id;
      o.textContent = opt.label;
      sel.appendChild(o);
    });
    const cfg = loadCfg();
    sel.value = cfg.streamStyle || DEFAULT_STYLE;
    updateAll();
  });
}

var loginConfigured = false;

async function loadAccount() {
  const note = document.getElementById('installState');
  const googleBtn = document.getElementById('installGoogleBtn');
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    const signedIn = !!(data.signedIn && data.user);
    loginConfigured = !!data.loginEnabled;
    cfgSyncEnabled = signedIn;
    if (signedIn) {
      syncTokens(data);
      if (data.cfg && typeof data.cfg === 'object') {
        const merged = sanitizeCfg(data.cfg);
        saveCfg(merged);
        applyCfg(merged);
      } else {
        pushCfg();
      }
    }
    const name = signedIn ? (data.user.name || 'Account') : 'Guest mode';
    if (note) {
      note.textContent = signedIn
        ? 'Signed in as ' + name + '. The install links follow your saved setup — changes apply automatically.'
        : 'Guest — copy this URL and paste it into Nuvio/Stremio. Settings stay on this device.';
    }
    if (googleBtn) googleBtn.hidden = signedIn || !loginConfigured;
    const modalGoogleBtn = document.getElementById('modalGoogleBtn');
    if (modalGoogleBtn) modalGoogleBtn.hidden = signedIn || !loginConfigured;
    document.getElementById('accountName').textContent = name;
    document.getElementById('accountSub').textContent = signedIn
      ? (data.user.email || 'Connected on this browser')
      : (loginConfigured ? 'Local preferences' : 'Local preferences — sign-in disabled');
    const accountBlock = document.querySelector('.account-block');
    if (accountBlock) accountBlock.title = signedIn
      ? name + (data.user.email ? ' · ' + data.user.email : '')
      : 'Guest mode · local preferences';
    document.getElementById('bigName').textContent = name;
    document.getElementById('bigSub').textContent = signedIn
      ? (data.user.email || 'Connected on this browser')
      : (loginConfigured
        ? 'Sign in with Google — or stay local. Settings always save on this device.'
        : 'Google sign-in is not configured on this instance — settings always save on this device.');
    document.getElementById('googleBtn').hidden = signedIn || !loginConfigured;
    document.getElementById('guestBtn').hidden = signedIn;
    document.getElementById('logoutBtn').hidden = !signedIn;
    document.getElementById('signOutBtn').hidden = !signedIn;
    document.getElementById('accountDot').hidden = signedIn;
    const initial = (name[0] || 'G').toUpperCase();
    ['accountAvatar', 'bigAvatar'].forEach(function (id) {
      const el = document.getElementById(id);
      el.textContent = initial;
      if (!(signedIn && data.user.picture)) return;
      const img = document.createElement('img');
      img.src = data.user.picture;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onerror = function () { el.textContent = initial; };
      el.textContent = '';
      el.appendChild(img);
    });
  } catch (e) {
    if (note) note.textContent = 'Could not check sign-in. Settings stay on this device; copy the addon URL.';
    if (googleBtn) googleBtn.hidden = true;
    ['accountName', 'bigName', 'accountSub', 'bigSub'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.textContent = id === 'bigName' || id === 'accountName' ? 'Guest mode' : id === 'accountSub' ? 'Local preferences' : 'Local preferences — sign in to keep your account connected.';
    });
    const googleBtn2 = document.getElementById('googleBtn');
    if (googleBtn2) googleBtn2.hidden = true;
    const guestBtn = document.getElementById('guestBtn');
    if (guestBtn) guestBtn.hidden = false;
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) signOutBtn.hidden = true;
  }
}

function signInWithGoogle() {
  if (!loginConfigured) {
    toast('Google sign-in is not configured on this instance — settings still save on this device.');
    return;
  }
  window.location.href = '/auth/google';
}

const WIZARD_STEPS = [
  { id: 'sources', label: 'Sources' },
  { id: 'filters', label: 'Filters' },
  { id: 'output', label: 'Output' },
];

const SECTION_TITLES = {
  install: ['Install', 'Copy into Nuvio or Stremio'],
  profiles: ['Presets', 'One addon URL per setup'],
  sources: ['Sources', 'Pick your servers'],
  filters: ['Filters', 'Quality & languages'],
  output: ['Output', 'Results & style'],
  account: ['Account', 'Sign in, or carry on as guest'],
  status: ['Status', 'Service health'],
};

function currentWizardIndex() {
  const active = document.querySelector('#nav .nav-item.active');
  const name = active ? active.dataset.section : 'install';
  return WIZARD_STEPS.findIndex(function (s) { return s.id === name; });
}

function updateWizard(name) {
  const bar = document.getElementById('wizardBar');
  const steps = document.getElementById('wizardSteps');
  if (!bar || !steps) return;
  const idx = WIZARD_STEPS.findIndex(function (s) { return s.id === name; });
  if (idx === -1) {
    bar.classList.remove('show');
    return;
  }
  bar.classList.add('show');
  steps.innerHTML = '';
  WIZARD_STEPS.forEach(function (step, i) {
    const el = document.createElement('button');
    el.className = 'tuner-step' + (i < idx ? ' done' : '') + (i === idx ? ' active' : '');
    el.innerHTML = '<span class="tick">' + (i + 1) + '</span><span class="step-name">' + step.label + '</span>';
    el.addEventListener('click', function () { setSection(step.id); });
    steps.appendChild(el);
    if (i < WIZARD_STEPS.length - 1) {
      const line = document.createElement('div');
      line.className = 'wizard-line';
      steps.appendChild(line);
    }
  });
  const nextBtn = document.getElementById('wizardNext');
  nextBtn.innerHTML = (idx === WIZARD_STEPS.length - 1 ? 'Done' : 'Next') +
    ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polyline points="9 18 15 12 9 6"/></svg>';
}

function setupWizard() {
  document.getElementById('wizardBack').addEventListener('click', function () {
    const idx = currentWizardIndex();
    if (idx === -1 || idx === 0) setSection('install');
    else setSection(WIZARD_STEPS[idx - 1].id);
  });
  document.getElementById('wizardNext').addEventListener('click', function () {
    const idx = currentWizardIndex();
    if (idx === -1) return;
    if (idx === WIZARD_STEPS.length - 1) setSection('install');
    else setSection(WIZARD_STEPS[idx + 1].id);
  });
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    const welcome = document.getElementById('welcomeModal');
    const palette = document.getElementById('palette');
    if ((welcome && !welcome.classList.contains('hidden')) || (palette && !palette.classList.contains('hidden'))) return;
    const idx = currentWizardIndex();
    if (idx === -1) return;
    if (e.key === 'ArrowRight' && idx < WIZARD_STEPS.length - 1) setSection(WIZARD_STEPS[idx + 1].id);
    else if (e.key === 'ArrowLeft' && idx > 0) setSection(WIZARD_STEPS[idx - 1].id);
  });
}

function setSection(name) {
  document.querySelectorAll('#nav .nav-item').forEach(function (b) {
    const active = b.dataset.section === name;
    b.classList.toggle('active', active);
    b.setAttribute('aria-current', active ? 'page' : 'false');
  });
  document.querySelectorAll('.panel').forEach(function (p) {
    p.classList.toggle('hidden', p.id !== 'panel-' + name);
  });
  updateWizard(name);
  closeDrawer();
  const t = SECTION_TITLES[name] || ['Install', ''];
  document.getElementById('sectionTitle').textContent = t[0];
  document.getElementById('sectionSub').textContent = t[1];
  const panel = document.getElementById('panel-' + name);
  if (panel) {
    panel.setAttribute('tabindex', '-1');
    panel.focus({ preventScroll: true });
  }
  if (name === 'status' && !healthChecked) checkHealth();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
}

function openDrawer() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.add('open');
  const backdrop = document.getElementById('sidebarBackdrop');
  backdrop.hidden = false;
  document.getElementById('hamburger').setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
  const closeBtn = document.getElementById('drawerClose');
  if (closeBtn) closeBtn.focus();
}

function closeDrawer() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar.classList.contains('open')) return;
  sidebar.classList.remove('open');
  document.getElementById('sidebarBackdrop').hidden = true;
  document.getElementById('hamburger').setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
  const current = document.querySelector('.panel:not(.hidden)');
  if (current) { current.setAttribute('tabindex', '-1'); current.focus(); }
}

function setupDrawer() {
  document.getElementById('hamburger').addEventListener('click', openDrawer);
  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  document.getElementById('sidebarBackdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeDrawer();
  });
}

function setupNav() {
  document.querySelectorAll('#nav .nav-item').forEach(function (btn) {
    btn.addEventListener('click', function () { setSection(btn.dataset.section); });
  });
}

function setupWelcomeModal() {
  const modal = document.getElementById('welcomeModal');
  const dismissed = safeGet(LS_WELCOME) === '1';
  let returnFocus = null;
  const open = function () {
    returnFocus = document.activeElement;
    modal.classList.remove('hidden');
    const target = document.getElementById('modalGoogleBtn') || document.getElementById('modalGuestBtn') || document.getElementById('welcomeClose');
    if (target) target.focus();
  };
  const close = function () {
    if (modal.classList.contains('hidden')) return;
    modal.classList.add('hidden');
    safeSet(LS_WELCOME, '1');
    if (returnFocus && returnFocus.focus) returnFocus.focus();
  };
  fetch('/api/me').then(function (r) { return r.json(); }).then(function (data) {
    loginConfigured = !!data.loginEnabled;
    const google = document.getElementById('modalGoogleBtn');
    if (google) google.hidden = !loginConfigured;
    const intro = document.getElementById('modalIntro');
    if (intro && !loginConfigured) {
      intro.textContent = 'Settings save on this device. Google sign-in is not configured on this instance.';
    }
    if (!dismissed && !data.signedIn) setTimeout(open, 800);
  }).catch(function () {});
  document.getElementById('welcomeClose').addEventListener('click', close);
  document.getElementById('modalGuestBtn').addEventListener('click', close);
  document.getElementById('modalGoogleBtn').addEventListener('click', function () { signInWithGoogle(); });
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  document.addEventListener('keydown', function (e) {
    if (modal.classList.contains('hidden')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') trapFocus(modal, e);
  });
}

function setupActions() {
  const copy = function () {
    const cfg = currentCfg();
    if (!cfg.p.length) { toast('Select at least one source to copy the addon URL'); return; }
    copyText(manifestUrl(cfg));
  };
  const installBtn = document.getElementById('installBtn');
  if (installBtn) installBtn.addEventListener('click', function () {
    const cfg = currentCfg();
    if (!cfg.p.length) { toast('Select at least one source to install the addon'); return; }
    toast('Opening your player to install — copy the URL if it does not open');
    window.location.href = manifestUrl(cfg).replace(/^https?:\/\//, 'stremio://');
  });
  const copyUrlBtn = document.getElementById('copyUrlBtn');
  if (copyUrlBtn) copyUrlBtn.addEventListener('click', copy);
  document.getElementById('sourcesAll').addEventListener('click', function () {
    const cfg = loadCfg();
    cfg.p = cfg.sourceOrder.slice();
    saveCfg(cfg);
    applyCfg(loadCfg());
    toast('All ' + PROVIDERS.length + ' sources selected');
  });
  document.getElementById('sourcesNone').addEventListener('click', function () { applyCfg(DEFAULT_CFG); toast('Reset to the recommended setup'); });
  document.getElementById('newProfileBtn').addEventListener('click', function () { createProfile(loadCfg()); });
  document.getElementById('importProfileBtn').addEventListener('click', function () {
    const url = prompt('Paste the addon URL to import', '');
    if (url) importFromUrl(url);
  });
  const installGoogleBtn = document.getElementById('installGoogleBtn');
  if (installGoogleBtn) installGoogleBtn.addEventListener('click', signInWithGoogle);
  const googleBtn = document.getElementById('googleBtn');
  if (googleBtn) googleBtn.addEventListener('click', signInWithGoogle);
  const guestBtn = document.getElementById('guestBtn');
  if (guestBtn) guestBtn.addEventListener('click', function () { toast('Guest mode — preferences stay on this device'); });
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', function () { window.location.href = '/auth/logout'; });
  const signOutBtn = document.getElementById('signOutBtn');
  if (signOutBtn) signOutBtn.addEventListener('click', function () { window.location.href = '/auth/logout'; });
}

function setupSegmented() {
  ['#resultLimitSeg', '#timeoutSeg'].forEach(function (sel) {
    const wrap = document.querySelector(sel);
    if (!wrap) return;
    wrap.addEventListener('click', function (e) {
      const btn = e.target.closest('button');
      if (!btn) return;
      wrap.querySelectorAll('button').forEach(function (b) {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      updateAll();
    });
  });
  ['includeDash', 'probeQuality', 'debug', 'langStrict'].forEach(function (id) {
    document.getElementById(id).addEventListener('change', function () { updateAll(); });
  });
  document.getElementById('streamStyle').addEventListener('change', function () { updateAll(); });
}

let healthChecked = false;
async function checkHealth() {
  healthChecked = true;
  const man = document.getElementById('healthManifest');
  const sub = document.getElementById('healthStreams');
  const ver = document.getElementById('healthVersion');
  const rt = document.getElementById('healthRuntime');
  try {
    const v = await fetch('/api/version');
    const vd = await v.json();
    if (ver) ver.textContent = (vd.version || '—');
    if (rt) rt.textContent = (vd.runtime || '—');
  } catch (e) {
    if (ver) ver.textContent = 'unavailable';
    if (rt) rt.textContent = 'unavailable';
  }
  try {
    const mf = await fetch('/manifest.json');
    man.textContent = mf.ok ? 'OK' : 'HTTP ' + mf.status;
    man.className = 'health-val ' + (mf.ok ? 'ok' : 'bad');
  } catch (e) {
    man.textContent = 'unreachable';
    man.className = 'health-val bad';
  }
  try {
    const res = await fetch('/stream/movie/27205.json');
    const data = await res.json();
    const n = (data.streams || []).length;
    sub.textContent = n > 0 ? n + ' streams live' : '0 streams right now';
    sub.className = 'health-val ' + (n > 0 ? 'ok' : 'bad');
  } catch (e) {
    sub.textContent = 'unreachable';
    sub.className = 'health-val bad';
  }
}

function setupHealth() {
  document.getElementById('recheckBtn').addEventListener('click', checkHealth);
}

buildLangChips();
setupLangFilters();
setupPalette();
setupNav();
setupWizard();
setupDrawer();
window.matchMedia('(min-width: 901px)').addEventListener('change', function (e) { if (e.matches) closeDrawer(); });
setupSegmented();
setupActions();
setupWelcomeModal();
loadStyles();
(function () {
  var token = configureAddonToken();
  if (!token) return;
  Promise.all([
    fetch('/api/addon/' + encodeURIComponent(token)).then(function (res) { return res.ok ? res.json() : null; }).catch(function () { return null; }),
    fetch('/api/me').then(function (res) { return res.json(); }).catch(function () { return null; }),
  ]).then(function (results) {
    var data = results[0];
    var me = results[1];
    if (!data || !data.ok) return;
    var sameAccount = me && me.signedIn && Array.isArray(me.profiles) &&
      me.profiles.some(function (p) { return p && p.id === data.profile.id; });
    var profiles = loadProfiles();
    var id;
    var idx = -1;
    if (sameAccount) {
      id = String(data.profile.id);
      idx = profiles.findIndex(function (p) { return p.id === id; });
    } else {
      id = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : 'p' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    }
    var entry = { id: id, name: String(data.profile.name || 'Profile').slice(0, 40), cfg: sanitizeCfg(data.cfg) };
    if (idx >= 0) profiles[idx] = entry; else profiles.push(entry);
    saveProfiles(profiles);
    safeSet(LS_ACTIVE, id);
    if (sameAccount) syncTokens(me);
    applyCfg(loadCfg());
    toast(sameAccount
      ? 'Loaded settings from the addon — changes sync to it'
      : 'Saved a local copy — sign in with the same account to sync those changes');
  }).catch(function () {});
})();
(function () {
  const urlCfg = configureUrlCfg();
  if (!urlCfg) return;
  const profiles = loadProfiles();
  const id = activeProfileId(profiles);
  const idx = profiles.findIndex(function (p) { return p.id === id; });
  if (idx >= 0) {
    profiles[idx].cfg = urlCfg;
    saveProfiles(profiles);
    toast('Loaded settings from the addon URL');
  }
})();
applyCfg(loadCfg());
interactive = true;
loadAccount();
setupHealth();

function setupLangFilters() {
  var search = document.getElementById('langSearch');
  var clear = document.getElementById('clearLangs');
  if (search) {
    search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      document.querySelectorAll('#langs .chip-btn').forEach(function (chip) {
        var match = !q || chip.dataset.lang.toLowerCase().indexOf(q) >= 0;
        chip.style.display = match ? '' : 'none';
      });
    });
  }
  if (clear) {
    clear.addEventListener('click', function () {
      document.querySelectorAll('#langs .chip-btn.active').forEach(function (chip) { chip.classList.remove('active'); chip.setAttribute('aria-pressed', 'false'); });
      updateAll();
      toast('Languages cleared');
    });
  }
}

function setupPalette() {
  var palette = document.getElementById('palette');
  if (!palette) return;
  var input = document.getElementById('paletteInput');
  var list = document.getElementById('paletteList');
  var backdrop = document.getElementById('paletteBackdrop');
  var SECTIONS = ['profiles', 'sources', 'filters', 'output', 'install', 'account', 'status'];
  var actions = [
    { id: 'nav:profiles', label: 'Go to Presets', hint: '1' },
    { id: 'nav:sources', label: 'Go to Sources', hint: '2' },
    { id: 'nav:filters', label: 'Go to Filters', hint: '3' },
    { id: 'nav:output', label: 'Go to Output', hint: '4' },
    { id: 'nav:install', label: 'Go to Install', hint: '5' },
    { id: 'nav:account', label: 'Go to Account', hint: '6' },
    { id: 'nav:status', label: 'Go to Status', hint: '7' },
    { id: 'copy', label: 'Copy addon URL' },
    { id: 'reset', label: 'Reset to defaults' }
  ];
  var filtered = actions.slice();
  var index = 0;
  var lastFocus = null;

  function updateActiveClasses() {
    Array.from(list.querySelectorAll('.palette-item')).forEach(function (item, i) {
      item.classList.toggle('active', i === index);
      item.setAttribute('aria-selected', String(i === index));
    });
    input.setAttribute('aria-activedescendant', filtered.length ? 'palette-opt-' + index : '');
    var active = list.querySelectorAll('.palette-item')[index];
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function render() {
    list.innerHTML = '';
    if (!filtered.length) {
      var empty = document.createElement('li');
      empty.className = 'palette-empty';
      empty.setAttribute('role', 'option');
      empty.setAttribute('aria-selected', 'false');
      empty.textContent = 'No matching commands';
      list.appendChild(empty);
      return;
    }
    filtered.forEach(function (a, i) {
      var li = document.createElement('li');
      li.id = 'palette-opt-' + i;
      li.className = 'palette-item' + (i === index ? ' active' : '');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === index));
      li.innerHTML = '<span class="palette-label">' + escapeHtml(a.label) + '</span>' +
        (a.hint ? '<kbd class="palette-key">' + escapeHtml(a.hint) + '</kbd>' : '');
      li.addEventListener('click', function () { run(a); });
      li.addEventListener('mousemove', function () { if (index !== i) { index = i; updateActiveClasses(); } });
      list.appendChild(li);
    });
  }

  function run(a) {
    closePalette();
    if (a.id.indexOf('nav:') === 0) { setSection(a.id.slice(4)); return; }
    if (a.id === 'copy') { copyText(manifestUrl(currentCfg())); return; }
    if (a.id === 'reset') { applyCfg(DEFAULT_CFG); toast('Reset to defaults'); }
  }

  function openPalette() {
    if (!palette.classList.contains('hidden')) return;
    lastFocus = document.activeElement;
    palette.classList.remove('hidden');
    input.value = '';
    filtered = actions.slice();
    index = 0;
    render();
    input.focus();
  }

  function closePalette() {
    if (palette.classList.contains('hidden')) return;
    palette.classList.add('hidden');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    var typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    var modal = document.getElementById('welcomeModal');
    var modalOpen = modal && !modal.classList.contains('hidden');
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (modalOpen) return;
      if (palette.classList.contains('hidden')) { openPalette(); } else { closePalette(); }
      return;
    }
    var paletteOpen = !palette.classList.contains('hidden');
    if (e.key === 'Escape' && paletteOpen) { e.preventDefault(); closePalette(); return; }
    if (!paletteOpen) {
      if (typing || e.ctrlKey || e.metaKey || e.altKey || modalOpen) { return; }
      if (e.key >= '1' && e.key <= '7') { e.preventDefault(); setSection(SECTIONS[Number(e.key) - 1]); }
      return;
    }
    if (e.key === 'Tab') { trapFocus(palette, e); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); index = Math.min(Math.max(filtered.length - 1, 0), index + 1); updateActiveClasses(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); index = Math.max(0, index - 1); updateActiveClasses(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[index]) { run(filtered[index]); } }
  });

  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();
    filtered = actions.filter(function (a) { return !q || a.label.toLowerCase().indexOf(q) >= 0; });
    index = 0;
    render();
  });

  backdrop.addEventListener('click', closePalette);
}

function setupSpatialNav() {
  var FOCUSABLE = 'button:not([disabled]):not([hidden]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function visible(el) {
    return !!(el.offsetParent || el.getClientRects().length);
  }

  function center(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  document.addEventListener('keydown', function (e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.key) < 0) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target && e.target.tagName) || '';
    var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (typing) return;
    var wizard = document.getElementById('wizardBar');
    if (wizard && wizard.classList.contains('show') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
    var welcome = document.getElementById('welcomeModal');
    var palette = document.getElementById('palette');
    if ((welcome && !welcome.classList.contains('hidden')) || (palette && !palette.classList.contains('hidden'))) return;

    var candidates = Array.prototype.slice.call(document.querySelectorAll(FOCUSABLE)).filter(visible);
    if (!candidates.length) return;

    var current = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    if (!current) { e.preventDefault(); candidates[0].focus(); return; }

    var c = center(current);
    var best = null;
    var bestScore = Infinity;

    candidates.forEach(function (el) {
      if (el === current) return;
      var p = center(el);
      var dx = p.x - c.x, dy = p.y - c.y;
      var primary, secondary, forward;
      if (e.key === 'ArrowRight') { if (dx <= 1) return; primary = dx; secondary = Math.abs(dy); forward = dx; }
      else if (e.key === 'ArrowLeft') { if (dx >= -1) return; primary = -dx; secondary = Math.abs(dy); forward = -dx; }
      else if (e.key === 'ArrowDown') { if (dy <= 1) return; primary = dy; secondary = Math.abs(dx); forward = dy; }
      else { if (dy >= -1) return; primary = -dy; secondary = Math.abs(dx); forward = -dy; }
      if (forward <= 0) return;
      var score = primary * 4 + secondary;
      if (score < bestScore) { bestScore = score; best = el; }
    });

    if (best) { e.preventDefault(); best.focus(); }
  });
}
setupSpatialNav();

/* Live setup stats on the install panel. */
function updateStats(cfg) {
  var total = PROVIDERS.length;
  setText('statSources', cfg.p.length);
  setText('statFloor', qualitySummary(cfg));
  setText('statResults', cfg.resultLimit === '0' ? 'No limit' : cfg.resultLimit);
  var styleSel = document.getElementById('streamStyle');
  var opt = styleSel && styleSel.selectedOptions && styleSel.selectedOptions[0];
  setText('statStyle', opt ? opt.textContent.trim() : (cfg.streamStyle || '—'));
  setText('statTotal', '/ ' + total + ' active');
}

/* Derived UI (stats, ranking) refreshes whenever the state changes. */
function refreshDerived() {
  try { updateStats(currentCfg()); } catch (e) { /* stats are decorative */ }
  try { renderPreferenceLists(); } catch (e) { /* preference lists are decorative */ }
}
var originalUpdateAll = updateAll;
updateAll = function () {
  originalUpdateAll();
  refreshDerived();
};

/* ---------- Preference lists: one primitive, three uses ---------- */
var UP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>';
var DOWN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

function rowActions(name) {
  return '<span class="rank-actions">' +
    '<button class="rank-btn" type="button" data-move="-1" aria-label="Move ' + escapeHtml(name) + ' up">' + UP_ICON + '</button>' +
    '<button class="rank-btn" type="button" data-move="1" aria-label="Move ' + escapeHtml(name) + ' down">' + DOWN_ICON + '</button>' +
  '</span>';
}

var CHECK_GLYPH = '<span class="check-glyph" aria-hidden="true">✓</span>';

function rowToggle(key, name, off, showTick) {
  return '<button class="list-toggle" type="button" data-toggle="' + escapeHtml(key) + '" aria-pressed="' + (off ? 'false' : 'true') + '" aria-label="' + (off ? 'Allow ' : 'Hide ') + escapeHtml(name) + '">' + (showTick ? CHECK_GLYPH : '') + '</button>';
}

function rankTick() {
  return '<span class="rank-tick" aria-hidden="true">' + CHECK_GLYPH + '</span>';
}

function syncEdgeButtons(list) {
  var rows = list.querySelectorAll('.rank-item');
  rows.forEach(function (row, i) {
    var up = row.querySelector('[data-move="-1"]');
    var down = row.querySelector('[data-move="1"]');
    if (up) up.disabled = i === 0;
    if (down) down.disabled = i === rows.length - 1;
  });
}

function moveInArray(arr, key, delta) {
  var next = arr.slice();
  var i = next.indexOf(key);
  var j = i + delta;
  if (i < 0 || j < 0 || j >= next.length) return null;
  var tmp = next[i]; next[i] = next[j]; next[j] = tmp;
  return next;
}

function dropInArray(arr, draggedKey, targetKey) {
  var next = arr.slice();
  var from = next.indexOf(draggedKey);
  var to = next.indexOf(targetKey);
  if (from < 0 || to < 0 || from === to) return null;
  next.splice(from, 1);
  next.splice(to, 0, draggedKey);
  return next;
}

function setupPreferenceList(listId, handlers) {
  var list = document.getElementById(listId);
  if (!list) return;
  var dragKey = null;
  list.addEventListener('click', function (e) {
    var toggle = e.target.closest('[data-toggle]');
    if (toggle && handlers.toggle) { handlers.toggle(toggle.dataset.toggle); return; }
    var btn = e.target.closest('.rank-btn');
    if (!btn || btn.disabled || !handlers.move) return;
    var row = btn.closest('.rank-item');
    if (row) handlers.move(row.dataset.key, Number(btn.dataset.move));
  });
  list.addEventListener('dragstart', function (e) {
    if (e.target.closest && e.target.closest('button')) { e.preventDefault(); return; }
    var row = e.target.closest('.rank-item');
    if (!row) return;
    dragKey = row.dataset.key;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragKey); } catch (err) {}
  });
  list.addEventListener('dragover', function (e) {
    var row = e.target.closest('.rank-item');
    if (!row || !dragKey || row.dataset.key === dragKey) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    row.classList.add('drag-over');
  });
  list.addEventListener('dragleave', function (e) {
    var row = e.target.closest('.rank-item');
    if (row && (!e.relatedTarget || !row.contains(e.relatedTarget))) row.classList.remove('drag-over');
  });
  list.addEventListener('drop', function (e) {
    e.preventDefault();
    var row = e.target.closest('.rank-item');
    list.querySelectorAll('.drag-over').forEach(function (el) { el.classList.remove('drag-over'); });
    if (row && dragKey && handlers.drop) handlers.drop(dragKey, row.dataset.key);
  });
  list.addEventListener('dragend', function () {
    dragKey = null;
    list.querySelectorAll('.dragging, .drag-over').forEach(function (el) { el.classList.remove('dragging', 'drag-over'); });
  });
}

function renderLanguageList(cfgArg) {
  var list = document.getElementById('langRank');
  var empty = document.getElementById('langRankEmpty');
  if (!list) return;
  var cfg = cfgArg || loadCfg();
  list.innerHTML = '';
  cfg.langs.forEach(function (lang, i) {
    var li = document.createElement('li');
    li.className = 'rank-item';
    li.setAttribute('role', 'listitem');
    li.draggable = true;
    li.dataset.key = lang;
    li.innerHTML =
      rankTick() +
      '<span class="rank-mark" aria-hidden="true">' + escapeHtml(lang.slice(0, 2).toUpperCase()) + '</span>' +
      '<span class="rank-copy"><b>' + escapeHtml(lang) + '</b><small>Language</small></span>' +
      rowActions(lang);
    list.appendChild(li);
  });
  syncEdgeButtons(list);
  if (empty) empty.hidden = cfg.langs.length > 0;
}

function moveLanguageItem(key, delta) {
  var cfg = loadCfg();
  var next = moveInArray(cfg.langs, key, delta);
  if (!next) return;
  cfg.langs = next;
  saveCfg(cfg);
  applyCfg(loadCfg());
}

function dropLanguageItem(draggedKey, targetKey) {
  var cfg = loadCfg();
  var next = dropInArray(cfg.langs, draggedKey, targetKey);
  if (!next) return;
  cfg.langs = next;
  saveCfg(cfg);
  applyCfg(loadCfg());
}

function renderSourceList(cfgArg) {
  var list = document.getElementById('sourceList');
  if (!list) return;
  var cfg = cfgArg || loadCfg();
  list.innerHTML = '';
  cfg.sourceOrder.forEach(function (key) {
    var pr = PROVIDERS.find(function (item) { return item.id === key; });
    if (!pr) return;
    var off = cfg.p.indexOf(key) < 0;
    var li = document.createElement('li');
    li.className = 'rank-item source-item has-toggle' + (off ? ' off' : '');
    li.setAttribute('role', 'listitem');
    li.draggable = true;
    li.dataset.key = key;
    li.innerHTML =
      rowToggle(key, pr.name, off, true) +
      '<span class="rank-mark" aria-hidden="true">' + escapeHtml(pr.mark) + '</span>' +
      '<span class="rank-copy"><b>' + escapeHtml(pr.name) + '</b><small>' + escapeHtml(displayTags(pr.tags).join(' · ')) + '</small></span>' +
      rowActions(pr.name);
    list.appendChild(li);
  });
  syncEdgeButtons(list);
}

function moveSourceItem(key, delta) {
  var cfg = loadCfg();
  var next = moveInArray(cfg.sourceOrder, key, delta);
  if (!next) return;
  cfg.sourceOrder = next;
  saveCfg(cfg);
  applyCfg(loadCfg());
}

function dropSourceItem(draggedKey, targetKey) {
  var cfg = loadCfg();
  var next = dropInArray(cfg.sourceOrder, draggedKey, targetKey);
  if (!next) return;
  cfg.sourceOrder = next;
  saveCfg(cfg);
  applyCfg(loadCfg());
}

function toggleSourceItem(key) {
  var cfg = loadCfg();
  var p = cfg.p.slice();
  var idx = p.indexOf(key);
  if (idx >= 0) {
    if (p.length <= 1) { toast('Keep at least one source enabled'); return; }
    p.splice(idx, 1);
  } else {
    p = cfg.sourceOrder.filter(function (id) { return id === key || p.indexOf(id) >= 0; });
  }
  cfg.p = p;
  saveCfg(cfg);
  applyCfg(loadCfg());
}

function renderPreferenceLists(cfg) {
  renderLanguageList(cfg);
  renderSourceList(cfg);
  renderQualityList(cfg);
}

setupPreferenceList('langRank', { move: moveLanguageItem, drop: dropLanguageItem });
setupPreferenceList('sourceList', { toggle: toggleSourceItem, move: moveSourceItem, drop: dropSourceItem });

/* ---------- Quality preference list ---------- */
function renderQualityList(cfgArg) {
  var list = document.getElementById('qualityRank');
  if (!list) return;
  var cfg = cfgArg || loadCfg();
  list.innerHTML = '';
  cfg.qualityOrder.forEach(function (key) {
    var q = QUALITY_MAP[key];
    if (!q) return;
    var off = cfg.qualityOff.indexOf(key) >= 0;
    var li = document.createElement('li');
    li.className = 'rank-item quality-item' + (off ? ' off' : '');
    li.setAttribute('role', 'listitem');
    li.draggable = true;
    li.className = 'rank-item quality-item has-toggle' + (off ? ' off' : '');
    li.dataset.key = key;
    li.innerHTML =
      rowToggle(key, q.name, off, true) +
      '<span class="rank-mark" aria-hidden="true">' + escapeHtml(q.mark) + '</span>' +
      '<span class="rank-copy"><b>' + escapeHtml(q.name) + '</b><small>' + escapeHtml(q.meta) + '</small></span>' +
      rowActions(q.name);
    list.appendChild(li);
  });
  syncEdgeButtons(list);
}

function moveQualityItem(key, delta) {
  var cfg = loadCfg();
  var i = cfg.qualityOrder.indexOf(key);
  var j = i + delta;
  if (i < 0 || j < 0 || j >= cfg.qualityOrder.length) return;
  var next = cfg.qualityOrder.slice();
  var tmp = next[i]; next[i] = next[j]; next[j] = tmp;
  cfg.qualityOrder = next;
  saveCfg(cfg);
  applyCfg(loadCfg());
}

function dropQualityItem(draggedKey, targetKey) {
  var cfg = loadCfg();
  var arr = cfg.qualityOrder.slice();
  var from = arr.indexOf(draggedKey);
  var to = arr.indexOf(targetKey);
  if (from < 0 || to < 0 || from === to) return;
  arr.splice(from, 1);
  arr.splice(to, 0, draggedKey);
  cfg.qualityOrder = arr;
  saveCfg(cfg);
  applyCfg(loadCfg());
}

function toggleQualityItem(key) {
  var cfg = loadCfg();
  var off = cfg.qualityOff.slice();
  var idx = off.indexOf(key);
  var enabledCount = cfg.qualityOrder.length - off.length;
  if (idx >= 0) {
    off.splice(idx, 1);
  } else {
    if (enabledCount <= 1) {
      toast('Keep at least one quality enabled');
      return;
    }
    off.push(key);
  }
  cfg.qualityOff = off;
  saveCfg(cfg);
  applyCfg(loadCfg());
}

setupPreferenceList('qualityRank', { toggle: toggleQualityItem, move: moveQualityItem, drop: dropQualityItem });

/* Reset action on the install panel. */
var resetInstall = document.getElementById('resetInstall');
if (resetInstall) {
  resetInstall.addEventListener('click', function () {
    applyCfg(DEFAULT_CFG);
    toast('Reset to the recommended setup');
  });
}

/* First paint of the stats (before the first updateAll cycle settles). */
try { updateStats(loadCfg()); renderPreferenceLists(); } catch (e) {}

/* Surface a failed sign-in that landed back on / with ?error=... */
try {
  var err = new URLSearchParams(window.location.search).get('error');
  if (err) {
    toast('Sign-in didn’t complete — you can keep using IndStream as a guest.');
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }
} catch (e) {}
