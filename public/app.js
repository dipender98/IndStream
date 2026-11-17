const PROVIDERS = [
  { id: 'hdhub', name: 'HdHub', tags: ['4K', '1080p', 'Very Fast'], fast: true },
  { id: 'vidrift', name: 'Vidrift', tags: ['1080p', 'Very Fast', 'HLS'], fast: true },
  { id: 'bingr', name: 'Bingr', tags: ['1080p', 'Fast', 'HLS'], fast: true },
  { id: 'moviebox', name: 'MovieBox', tags: ['4K', '1080p', 'Multi-Audio'], fast: false },
  { id: 'hub4k', name: '4KHDHub', tags: ['4K', '1080p', 'Web'], fast: false },
  { id: 'fsl', name: 'FSL', tags: ['Web', 'Hindi'], fast: false },
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

function loadCfg() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return Object.assign({}, DEFAULT_CFG, JSON.parse(raw));
  } catch (e) {}
  return Object.assign({}, DEFAULT_CFG);
}
function saveCfg(cfg) { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} }

function b64url(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function currentCfg() {
  const langs = Array.from(document.querySelectorAll('#langs .chip-btn.active')).map(function (el) { return el.dataset.lang; });
  const p = PROVIDERS.filter(function (pr) { return document.querySelector('[data-provider="' + pr.id + '"]').classList.contains('active'); }).map(function (pr) { return pr.id; });
  return {
    p: p.length ? p : DEFAULT_CFG.p.slice(),
    langs: langs,
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
    btn.classList.toggle('active', btn.dataset.value === String(value));
  });
}

function applyCfg(cfg) {
  cfg = Object.assign({}, DEFAULT_CFG, cfg || {});
  document.querySelectorAll('#providers .provider-card').forEach(function (el) {
    el.classList.toggle('active', cfg.p.indexOf(el.dataset.provider) >= 0);
  });
  document.querySelectorAll('#langs .chip-btn').forEach(function (el) {
    el.classList.toggle('active', cfg.langs.indexOf(el.dataset.lang) >= 0);
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

function manifestUrl(cfg) {
  return window.location.origin + '/' + b64url(cfg) + '/manifest.json';
}

function updateAll() {
  const cfg = currentCfg();
  saveCfg(cfg);
  const url = manifestUrl(cfg);
  document.getElementById('manifestUrl').textContent = url;
  document.getElementById('heroSources').textContent = cfg.p.length;
  document.getElementById('statSources').textContent = cfg.p.length;
  document.getElementById('sourcesCount').textContent = cfg.p.length + ' selected';
  document.getElementById('statResultLimit').textContent = cfg.resultLimit === '0' ? '∞' : cfg.resultLimit;
  const styleSel = document.getElementById('streamStyle');
  const styleLabel = styleSel.options[styleSel.selectedIndex] ? styleSel.options[styleSel.selectedIndex].textContent.replace(' (default)', '') : 'LightGDrive';
  document.getElementById('statStyle').textContent = styleLabel;
  document.getElementById('posterStyle').textContent = styleLabel;
  document.getElementById('openStremio').href = 'https://www.stremio.com/#/addons?addonUrl=' + encodeURIComponent(url);
  updatePreview(styleSel.value);
}

let previewToken = 0;
function updatePreview(style) {
  const box = document.getElementById('posterSamples');
  if (!box) return;
  const token = ++previewToken;
  fetch('/api/style-preview?style=' + encodeURIComponent(style))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (token !== previewToken) return;
      box.innerHTML = '';
      (data.samples || []).slice(0, 4).forEach(function (s) {
        const div = document.createElement('div');
        div.className = 'poster-sample';
        div.textContent = s.title;
        box.appendChild(div);
      });
    })
    .catch(function () {});
}

function copyText(text) {
  const done = function () { toast('Addon URL copied — paste it in Nuvio or Stremio'); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(done, done);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
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
    btn.innerHTML =
      '<span class="check-circle"></span>' +
      '<span><span class="provider-name">' + pr.name + '</span>' +
      '<span class="chip-tags">' + pr.tags.map(function (t) { return '<span class="tag' + (t === 'Very Fast' || t === 'Fast' ? ' fast' : '') + '">' + t + '</span>'; }).join('') + '</span>' +
      '</span>';
    btn.addEventListener('click', function () { btn.classList.toggle('active'); updateAll(); });
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
    btn.textContent = lang;
    btn.addEventListener('click', function () { btn.classList.toggle('active'); updateAll(); });
    wrap.appendChild(btn);
  });
}

function loadStyles() {
  fetch('/api/styles').then(function (r) { return r.json(); }).then(function (data) {
    const sel = document.getElementById('streamStyle');
    sel.innerHTML = '';
    (data.options || []).forEach(function (opt) {
      const o = document.createElement('option');
      o.value = opt.id;
      o.textContent = opt.label;
      sel.appendChild(o);
    });
    const cfg = loadCfg();
    sel.value = cfg.streamStyle || data.default;
    updateAll();
  }).catch(function () {});
}

async function loadAccount() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    const signedIn = !!(data.signedIn && data.user);
    const name = signedIn ? (data.user.name || 'Account') : 'Guest';
    document.getElementById('accountName').textContent = name;
    document.getElementById('accountSub').textContent = signedIn ? 'Connected · synced to this Google account' : 'Preferences saved on this device';
    document.getElementById('topAccount').textContent = name;
    document.getElementById('googleBtn').hidden = signedIn || !data.loginEnabled;
    document.getElementById('modalGoogleBtn').hidden = !data.loginEnabled;
    document.getElementById('guestBtn').hidden = signedIn;
    document.getElementById('logoutBtn').hidden = !signedIn;
    const initial = name[0].toUpperCase();
    const avatar = document.getElementById('accountAvatar');
    if (signedIn && data.user.picture) {
      avatar.innerHTML = '<img src="' + data.user.picture + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'' + initial + '\'">';
    } else {
      avatar.textContent = initial;
    }
  } catch (e) {}
}

function setupWelcomeModal() {
  const modal = document.getElementById('welcomeModal');
  const dismissed = localStorage.getItem(LS_WELCOME) === '1';
  fetch('/api/me').then(function (r) { return r.json(); }).then(function (data) {
    if (!dismissed && !data.signedIn) setTimeout(function () { modal.classList.remove('hidden'); }, 900);
  }).catch(function () {});
  const close = function () { modal.classList.add('hidden'); localStorage.setItem(LS_WELCOME, '1'); };
  document.getElementById('welcomeClose').addEventListener('click', close);
  document.getElementById('modalGuestBtn').addEventListener('click', close);
  document.getElementById('modalGoogleBtn').addEventListener('click', function () { window.location.href = '/auth/google'; });
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
}

function setupActions() {
  const url = function () { return manifestUrl(currentCfg()); };
  document.getElementById('installBtn').addEventListener('click', function () { copyText(url()); });
  document.getElementById('copyInstall').addEventListener('click', function () { copyText(url()); });
  document.getElementById('copyIcon').addEventListener('click', function () { copyText(url()); });
  document.getElementById('clearBtn').addEventListener('click', function () { applyCfg(DEFAULT_CFG); toast('Reset to the recommended setup'); });
  document.getElementById('sourcesAll').addEventListener('click', function () {
    document.querySelectorAll('#providers .provider-card').forEach(function (el) { el.classList.add('active'); });
    updateAll();
    toast('All 6 sources selected');
  });
  document.getElementById('sourcesNone').addEventListener('click', function () { applyCfg(DEFAULT_CFG); toast('Reset to the recommended setup'); });
  document.getElementById('googleBtn').addEventListener('click', function () { window.location.href = '/auth/google'; });
  document.getElementById('guestBtn').addEventListener('click', function () { toast('Guest mode — preferences stay on this device'); });
  document.getElementById('logoutBtn').addEventListener('click', function () { window.location.href = '/auth/logout'; });
  document.getElementById('topAccount').addEventListener('click', function () {
    document.getElementById('account').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function setupSegmented() {
  ['#minQualitySeg', '#resultLimitSeg', '#timeoutSeg'].forEach(function (sel) {
    const wrap = document.querySelector(sel);
    if (!wrap) return;
    wrap.addEventListener('click', function (e) {
      const btn = e.target.closest('button');
      if (!btn) return;
      wrap.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b === btn); });
      updateAll();
    });
  });
  ['includeDash', 'probeQuality', 'debug', 'langStrict'].forEach(function (id) {
    document.getElementById(id).addEventListener('change', updateAll);
  });
  document.getElementById('streamStyle').addEventListener('change', updateAll);
}

async function checkHealth() {
  const dot = document.getElementById('statusDot');
  const sub = document.getElementById('healthStreams');
  const man = document.getElementById('healthManifest');
  try {
    const mf = await fetch('/manifest.json');
    man.textContent = mf.ok ? 'OK' : 'HTTP ' + mf.status;
    man.style.color = mf.ok ? 'var(--success)' : 'var(--danger)';
  } catch (e) {
    man.textContent = 'down';
    man.style.color = 'var(--danger)';
  }
  try {
    const res = await fetch('/stream/movie/27205.json');
    const data = await res.json();
    const n = (data.streams || []).length;
    sub.textContent = n > 0 ? 'Live · ' + n + ' streams for Inception' : 'No streams right now';
    sub.style.color = n > 0 ? 'var(--success)' : 'var(--danger)';
    dot.classList.toggle('bad', n === 0);
  } catch (e) {
    sub.textContent = 'Unreachable';
    sub.style.color = 'var(--danger)';
    dot.classList.add('bad');
  }
}

function setupHealth() {
  document.getElementById('recheckBtn').addEventListener('click', checkHealth);
  checkHealth();
}

buildProviderCards();
buildLangChips();
setupSegmented();
setupActions();
setupWelcomeModal();
loadStyles();
applyCfg(loadCfg());
loadAccount();
setupHealth();