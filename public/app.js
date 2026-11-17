const PROVIDERS = [
  { id: 'hdhub', name: 'HdHub', mark: 'HH', tags: ['4K', '1080p', 'Very Fast'], fast: true },
  { id: 'vidrift', name: 'Vidrift', mark: 'VR', tags: ['1080p', 'Very Fast', 'HLS'], fast: true },
  { id: 'bingr', name: 'Bingr', mark: 'BG', tags: ['1080p', 'Fast', 'HLS'], fast: true },
  { id: 'moviebox', name: 'MovieBox', mark: 'MB', tags: ['4K', '1080p', 'Multi-Audio'], fast: false },
  { id: 'hub4k', name: '4KHDHub', mark: '4K', tags: ['4K', '1080p', 'Web'], fast: false },
  { id: 'fsl', name: 'FSL', mark: 'FS', tags: ['Web', 'Hindi'], fast: false },
];

const LANGS = ['Hindi', 'English', 'Tamil', 'Telugu', 'Malayalam', 'Kannada',
  'Bengali', 'Urdu', 'Marathi', 'Punjabi', 'Arabic', 'Russian', 'Chinese',
  'Japanese', 'Korean', 'French', 'Spanish', 'Portuguese', 'Indonesian',
  'Vietnamese', 'Thai', 'Turkish', 'German', 'Italian', 'Dutch', 'Polish', 'Nepali'];

const DEFAULT_CFG = {
  p: ['hdhub', 'vidrift', 'bingr', 'moviebox', 'hub4k'],
  langs: [],
  langStrict: false,
  streamStyle: 'lightgdrive',
  minQuality: '720',
  resultLimit: '40',
  requestTimeout: '15',
  includeDash: true,
  probeQuality: false,
  debug: false,
};

const LS_KEY = 'indstream.cfg.v3';
const LS_WELCOME = 'indstream.welcome.dismissed';
const LS_PROFILES = 'indstream.profiles.v1';
const LS_ACTIVE = 'indstream.activeProfile.v1';

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
  merged.p = Array.isArray(merged.p) ? merged.p.filter(function (id) { return providerIds.indexOf(id) >= 0; }) : DEFAULT_CFG.p.slice();
  if (!merged.p.length) merged.p = DEFAULT_CFG.p.slice();
  merged.langs = Array.isArray(merged.langs) ? merged.langs.filter(function (lang) { return LANGS.indexOf(lang) >= 0; }) : [];
  merged.langStrict = !!merged.langStrict;
  merged.streamStyle = typeof merged.streamStyle === 'string' ? merged.streamStyle : DEFAULT_CFG.streamStyle;
  merged.minQuality = ['0', '720', '1080'].indexOf(String(merged.minQuality)) >= 0 ? String(merged.minQuality) : DEFAULT_CFG.minQuality;
  merged.resultLimit = ['0', '20', '40', '80'].indexOf(String(merged.resultLimit)) >= 0 ? String(merged.resultLimit) : DEFAULT_CFG.resultLimit;
  merged.requestTimeout = ['10', '15', '25'].indexOf(String(merged.requestTimeout)) >= 0 ? String(merged.requestTimeout) : DEFAULT_CFG.requestTimeout;
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
  const nodes = Array.from(container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
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
  const prevP = prev.p, prevL = prev.langs;
  const langs = Array.from(document.querySelectorAll('#langs .chip-btn.active')).map(function (el) { return el.dataset.lang; });
  const selectedP = PROVIDERS.filter(function (pr) { return document.querySelector('[data-provider="' + pr.id + '"]').classList.contains('active'); }).map(function (pr) { return pr.id; });
  const p = prevP.filter(function (id) { return selectedP.indexOf(id) >= 0; })
    .concat(selectedP.filter(function (id) { return prevP.indexOf(id) < 0; }));
  const langsOrdered = prevL.filter(function (l) { return langs.indexOf(l) >= 0; })
    .concat(langs.filter(function (l) { return prevL.indexOf(l) < 0; }));
  return {
    p: p.length ? p : DEFAULT_CFG.p.slice(),
    langs: langsOrdered,
    langStrict: document.getElementById('langStrict').checked,
    streamStyle: document.getElementById('streamStyle').value,
    minQuality: document.getElementById('minQualitySeg').querySelector('.active').dataset.value,
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
  document.querySelectorAll('#providers .provider-card').forEach(function (el) {
    const active = cfg.p.indexOf(el.dataset.provider) >= 0;
    el.classList.toggle('active', active);
    el.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('#langs .chip-btn').forEach(function (el) {
    const active = cfg.langs.indexOf(el.dataset.lang) >= 0;
    el.classList.toggle('active', active);
    el.setAttribute('aria-pressed', String(active));
  });
  setSeg('#minQualitySeg', cfg.minQuality);
  setSeg('#resultLimitSeg', cfg.resultLimit);
  setSeg('#timeoutSeg', cfg.requestTimeout);
  document.getElementById('langStrict').checked = !!cfg.langStrict;
  document.getElementById('includeDash').checked = !!cfg.includeDash;
  document.getElementById('probeQuality').checked = !!cfg.probeQuality;
  document.getElementById('debug').checked = !!cfg.debug;
  const styleSel = document.getElementById('streamStyle');
  if (styleSel && cfg.streamStyle) styleSel.value = cfg.streamStyle;
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
  if (!m) return null;
  const cfg = decodeCfgSegment(m[1]);
  return cfg ? sanitizeCfg(cfg) : null;
}

function manifestUrl(cfg) {
  return window.location.origin + '/' + b64url(cfg) + '/manifest.json';
}

function flashSaved() {
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
  const url = manifestUrl(cfg);
  setText('manifestUrl', url);
  setText('sourcesBadge', cfg.p.length);
  setText('sourcesCount', cfg.p.length + ' selected');
  updatePreview(document.getElementById('streamStyle').value);
  renderProfiles();
}

function renderProfiles() {
  const grid = document.getElementById('profilesGrid');
  if (!grid) return;
  const profiles = loadProfiles();
  const activeId = activeProfileId(profiles);
  const count = document.getElementById('profilesCount');
  if (count) count.textContent = profiles.length;
  const badge = document.getElementById('profilesBadge');
  if (badge) badge.textContent = profiles.length;
  const nameEl = document.getElementById('activeProfileName');
  if (nameEl) nameEl.textContent = (profiles.find(function (p) { return p.id === activeId; }) || profiles[0]).name;
  grid.innerHTML = '';
  profiles.forEach(function (p) {
    const cfg = sanitizeCfg(p.cfg);
    const url = manifestUrl(cfg);
    const isActive = p.id === activeId;
    const card = document.createElement('div');
    card.className = 'profile-card' + (isActive ? ' active' : '');
    card.innerHTML =
      '<div class="profile-card-head">' +
        '<div class="profile-avatar">' + escapeHtml((p.name || 'P')[0].toUpperCase()) + '</div>' +
        '<div><div class="profile-name">' + escapeHtml(p.name) + '</div>' +
        '<div class="profile-meta"><strong>' + cfg.p.length + '</strong> sources · ' +
          (cfg.minQuality === '0' ? 'any quality' : cfg.minQuality + 'p+') +
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
  const m = String(url || '').match(/\/([A-Za-z0-9_-]+)\/manifest\.json/);
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
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(done, done);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
  done();
  return Promise.resolve();
}

function buildProviderCards() {
  const wrap = document.getElementById('providers');
  wrap.innerHTML = '';
  PROVIDERS.forEach(function (pr) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'provider-card';
    btn.dataset.provider = pr.id;
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML =
      '<span class="provider-mark" aria-hidden="true">' + pr.mark + '</span>' +
      '<span class="provider-copy"><span class="provider-name">' + pr.name + '</span>' +
      '<span class="chip-tags">' + pr.tags.map(function (t) { return '<span class="tag' + (t === 'Very Fast' || t === 'Fast' ? ' fast' : '') + '">' + t + '</span>'; }).join('') + '</span>' +
      '</span>' +
      '<span class="check-circle" aria-hidden="true"></span>';
    btn.addEventListener('click', function () {
      const active = !btn.classList.contains('active');
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
      updateAll();
    });
    wrap.appendChild(btn);
  });
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
  { id: 'lightgdrive', label: 'LightGDrive (default)' },
  { id: 'gdrive', label: 'GDrive' },
  { id: 'minimalisticgdrive', label: 'MinimalisticGDrive' },
  { id: 'prism', label: 'Prism' },
  { id: 'torrentio-minimalist', label: 'Torrentio Minimalist' },
  { id: 'mediafusion-pro', label: 'MediaFusion Pro' },
  { id: 'torrentio', label: 'Torrentio' },
  { id: 'torbox', label: 'TorBox' },
];
const DEFAULT_STYLE = 'lightgdrive';

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
    const name = signedIn ? (data.user.name || 'Account') : 'Guest';
    if (note) {
      note.textContent = signedIn
        ? 'Signed in as ' + name + '. Your settings stay on this device; copy the addon URL to use it in Nuvio/Stremio.'
        : 'Guest — copy this URL and paste it into Nuvio/Stremio. Settings stay on this device.';
    }
    if (googleBtn) googleBtn.hidden = signedIn;
    const modalGoogleBtn = document.getElementById('modalGoogleBtn');
    if (modalGoogleBtn) modalGoogleBtn.hidden = false;
    document.getElementById('accountName').textContent = name;
    document.getElementById('accountSub').textContent = signedIn ? 'Connected on this browser' : 'Local preferences';
    document.getElementById('bigName').textContent = name;
    document.getElementById('bigSub').textContent = signedIn
      ? (data.user.email || 'Connected on this browser')
      : 'Sign in with Google — or stay local. Settings always save on this device.';
    document.getElementById('googleBtn').hidden = signedIn;
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
    if (googleBtn) googleBtn.hidden = false;
    ['accountName', 'bigName', 'accountSub', 'bigSub'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.textContent = id === 'bigName' ? 'Guest' : id === 'accountName' ? 'Guest' : id === 'accountSub' ? 'Local preferences' : 'Local preferences — sign in to keep your account connected.';
    });
    const googleBtn2 = document.getElementById('googleBtn');
    if (googleBtn2) googleBtn2.hidden = false;
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
  { id: 'playback', label: 'Playback' },
];

const SECTION_TITLES = {
  install: ['Install', 'Copy into Nuvio or Stremio'],
  profiles: ['Presets', 'One addon URL per setup'],
  sources: ['Sources', 'Pick your servers'],
  filters: ['Filters', 'Languages & quality'],
  playback: ['Playback', 'Results & style'],
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
    el.type = 'button';
    el.className = 'tuner-step' + (i < idx ? ' done' : '') + (i === idx ? ' active' : '');
    el.type = 'button';
    el.innerHTML = '<span class="tick">' + (i < idx ? '✓' : (i + 1)) + '</span><span class="step-name">' + step.label + '</span>';
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
  const panel = document.getElementById('panel-' + name);
  if (panel) {
    panel.setAttribute('tabindex', '-1');
    panel.focus({ preventScroll: true });
  }
  const t = SECTION_TITLES[name] || ['Install', ''];
  document.getElementById('sectionTitle').textContent = t[0];
  document.getElementById('sectionSub').textContent = t[1];
  updateWizard(name);
  closeDrawer();
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
  const hamburger = document.getElementById('hamburger');
  if (hamburger) hamburger.focus();
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
  const url = function () { return manifestUrl(currentCfg()); };
  const installBtn = document.getElementById('installBtn');
  if (installBtn) installBtn.addEventListener('click', function () { copyText(url()); });
  const copyInstall = document.getElementById('copyInstall');
  if (copyInstall) copyInstall.addEventListener('click', function () { copyText(url()); });
  const copyUrlBtn = document.getElementById('copyUrlBtn');
  if (copyUrlBtn) copyUrlBtn.addEventListener('click', function () { copyText(url()); });
  const clearBtn = document.getElementById('clearBtn');
  if (clearBtn) clearBtn.addEventListener('click', function () { applyCfg(DEFAULT_CFG); toast('Reset to the recommended setup'); });
  document.getElementById('sourcesAll').addEventListener('click', function () {
    document.querySelectorAll('#providers .provider-card').forEach(function (el) {
      el.classList.add('active');
      el.setAttribute('aria-pressed', 'true');
    });
    updateAll();
    toast('All ' + PROVIDERS.length + ' sources selected');
  });
  document.getElementById('sourcesNone').addEventListener('click', function () { applyCfg(DEFAULT_CFG); toast('Reset to the recommended setup'); });
  document.getElementById('newProfileBtn').addEventListener('click', function () { createProfile(loadCfg()); });
  document.getElementById('importProfileBtn').addEventListener('click', function () {
    const url = prompt('Paste the addon URL to import', window.location.origin + '/manifest.json');
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
  const notice = document.getElementById('notice');
  const noticeClose = document.getElementById('noticeClose');
  if (notice && noticeClose) noticeClose.addEventListener('click', function () { notice.remove(); });
}

function setupSegmented() {
  ['#minQualitySeg', '#resultLimitSeg', '#timeoutSeg'].forEach(function (sel) {
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

buildProviderCards();
buildLangChips();
setupLangFilters();
setupPalette();
setupNav();
setupWizard();
setupDrawer();
setupSegmented();
setupActions();
setupWelcomeModal();
loadStyles();
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
  var SECTIONS = ['profiles', 'sources', 'filters', 'playback', 'install', 'account', 'status'];
  var actions = [
    { id: 'nav:profiles', label: 'Go to Presets', hint: '1' },
    { id: 'nav:sources', label: 'Go to Sources', hint: '2' },
    { id: 'nav:filters', label: 'Go to Filters', hint: '3' },
    { id: 'nav:playback', label: 'Go to Playback', hint: '4' },
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
    var active = list.querySelectorAll('.palette-item')[index];
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function render() {
    list.innerHTML = '';
    if (!filtered.length) {
      var empty = document.createElement('li');
      empty.className = 'palette-empty';
      empty.setAttribute('role', 'option');
      empty.textContent = 'No matching commands';
      list.appendChild(empty);
      return;
    }
    filtered.forEach(function (a, i) {
      var li = document.createElement('li');
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
    if (wizard && wizard.classList.contains('show')) return;
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
  setText('statFloor', cfg.minQuality === '0' ? 'Any' : cfg.minQuality + 'p');
  setText('statResults', cfg.resultLimit === '0' ? 'No limit' : cfg.resultLimit);
  var styleSel = document.getElementById('streamStyle');
  var opt = styleSel && styleSel.selectedOptions && styleSel.selectedOptions[0];
  setText('statStyle', opt ? opt.textContent.trim() : (cfg.streamStyle || '—'));
  var totalEl = document.querySelector('#panel-install .stat-value small');
  if (totalEl) totalEl.textContent = '/ ' + total + ' active';
}

/* Derived UI (stats, ranking) refreshes whenever the state changes. */
function refreshDerived() {
  try { updateStats(currentCfg()); } catch (e) { /* stats are decorative */ }
  try { renderRankLists(); } catch (e) { /* ranking is decorative */ }
}
var originalUpdateAll = updateAll;
updateAll = function () {
  originalUpdateAll();
  refreshDerived();
};

/* ---------- Source & language ranking ---------- */
var RANK_KIND = { provider: 'provider', language: 'language' };

function rankListItems(kind) {
  var cfg = loadCfg();
  if (kind === RANK_KIND.provider) {
    return cfg.p.map(function (id) {
      var pr = PROVIDERS.find(function (x) { return x.id === id; });
      return pr ? { key: pr.id, name: pr.name, mark: pr.mark, meta: pr.tags.join(' · ') } : null;
    }).filter(Boolean);
  }
  return cfg.langs.map(function (lang) {
    return { key: lang, name: lang, mark: lang.slice(0, 2).toUpperCase(), meta: 'Language' };
  });
}

function renderRankList(kind, listId, emptyId) {
  var list = document.getElementById(listId);
  var empty = document.getElementById(emptyId);
  if (!list || !empty) return;
  var items = rankListItems(kind);
  list.innerHTML = '';
  empty.hidden = items.length > 0;
  items.forEach(function (item, i) {
    var li = document.createElement('li');
    li.className = 'rank-item';
    li.setAttribute('role', 'listitem');
    li.draggable = true;
    li.dataset.kind = kind;
    li.dataset.key = item.key;
    li.innerHTML =
      '<span class="rank-num" aria-hidden="true">' + (i + 1) + '</span>' +
      '<span class="rank-mark" aria-hidden="true">' + escapeHtml(item.mark) + '</span>' +
      '<span class="rank-copy"><b>' + escapeHtml(item.name) + '</b>' +
        (item.meta ? '<small>' + escapeHtml(item.meta) + '</small>' : '') + '</span>' +
      '<span class="rank-actions">' +
        '<button class="rank-btn" type="button" data-move="-1" aria-label="Move ' + escapeHtml(item.name) + ' up"' + (i === 0 ? ' disabled' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg></button>' +
        '<button class="rank-btn" type="button" data-move="1" aria-label="Move ' + escapeHtml(item.name) + ' down"' + (i === items.length - 1 ? ' disabled' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>' +
      '</span>';
    list.appendChild(li);
  });
}

function renderRankLists() {
  renderRankList(RANK_KIND.provider, 'providerRank', 'providerRankEmpty');
  renderRankList(RANK_KIND.language, 'langRank', 'langRankEmpty');
}

function moveRankItem(kind, key, delta) {
  var cfg = loadCfg();
  if (kind === RANK_KIND.provider) {
    var i = cfg.p.indexOf(key);
    var j = i + delta;
    if (i < 0 || j < 0 || j >= cfg.p.length) return;
    var next = cfg.p.slice();
    var tmp = next[i]; next[i] = next[j]; next[j] = tmp;
    cfg.p = next;
  } else {
    var i2 = cfg.langs.indexOf(key);
    var j2 = i2 + delta;
    if (i2 < 0 || j2 < 0 || j2 >= cfg.langs.length) return;
    var next2 = cfg.langs.slice();
    var tmp2 = next2[i2]; next2[i2] = next2[j2]; next2[j2] = tmp2;
    cfg.langs = next2;
  }
  saveCfg(cfg);
  applyCfg(loadCfg());
}

function dropRankItem(kind, draggedKey, targetKey) {
  var cfg = loadCfg();
  var arr = (kind === RANK_KIND.provider ? cfg.p : cfg.langs).slice();
  var from = arr.indexOf(draggedKey);
  var to = arr.indexOf(targetKey);
  if (from < 0 || to < 0 || from === to) return;
  arr.splice(from, 1);
  arr.splice(to, 0, draggedKey);
  if (kind === RANK_KIND.provider) cfg.p = arr; else cfg.langs = arr;
  saveCfg(cfg);
  applyCfg(loadCfg());
}

var rankDragKey = null;
var rankDragKind = null;
function setupRankList(listId) {
  var list = document.getElementById(listId);
  if (!list) return;
  list.addEventListener('click', function (e) {
    var btn = e.target.closest('.rank-btn');
    if (!btn || btn.disabled) return;
    var row = btn.closest('.rank-item');
    if (!row) return;
    moveRankItem(row.dataset.kind, row.dataset.key, Number(btn.dataset.move));
  });
  list.addEventListener('dragstart', function (e) {
    if (e.target.closest && e.target.closest('.rank-btn')) { e.preventDefault(); return; }
    var row = e.target.closest('.rank-item');
    if (!row) return;
    rankDragKey = row.dataset.key;
    rankDragKind = row.dataset.kind;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', row.dataset.key); } catch (err) {}
  });
  list.addEventListener('dragover', function (e) {
    var row = e.target.closest('.rank-item');
    if (!row || !rankDragKey || row.dataset.kind !== rankDragKind || row.dataset.key === rankDragKey) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    row.classList.add('drag-over');
  });
  list.addEventListener('dragleave', function (e) {
    var row = e.target.closest('.rank-item');
    if (row) row.classList.remove('drag-over');
  });
  list.addEventListener('drop', function (e) {
    e.preventDefault();
    var row = e.target.closest('.rank-item');
    list.querySelectorAll('.drag-over').forEach(function (el) { el.classList.remove('drag-over'); });
    if (!row || !rankDragKey) return;
    dropRankItem(row.dataset.kind, rankDragKey, row.dataset.key);
  });
  list.addEventListener('dragend', function () {
    rankDragKey = null;
    rankDragKind = null;
    list.querySelectorAll('.dragging, .drag-over').forEach(function (el) { el.classList.remove('dragging', 'drag-over'); });
  });
}
setupRankList('providerRank');
setupRankList('langRank');

/* Reset action on the install panel. */
var resetInstall = document.getElementById('resetInstall');
if (resetInstall) {
  resetInstall.addEventListener('click', function () {
    applyCfg(DEFAULT_CFG);
    toast('Reset to the recommended setup');
  });
}

/* First paint of the stats (before the first updateAll cycle settles). */
try { updateStats(loadCfg()); renderRankLists(); } catch (e) {}

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
