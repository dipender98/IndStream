const PROVIDERS = [
  { id: 'hdhub', name: 'HdHub', tag: 'API' },
  { id: 'vidrift', name: 'Vidrift', tag: 'API' },
  { id: 'bingr', name: 'Bingr', tag: 'API' },
  { id: 'moviebox', name: 'MovieBox', tag: 'API' },
  { id: 'hub4k', name: '4KHDHub', tag: 'Web' },
  { id: 'fsl', name: 'FSL', tag: 'Web' },
];

const LANGS = ['Hindi', 'English', 'Tamil', 'Telugu', 'Malayalam', 'Kannada',
  'Bengali', 'Arabic', 'Russian', 'Chinese', 'Japanese', 'Korean', 'French',
  'Spanish', 'Portuguese', 'Indonesian', 'Vietnamese', 'Thai', 'Turkish',
  'German', 'Italian', 'Dutch', 'Polish', 'Marathi', 'Punjabi', 'Urdu', 'Nepali'];

const DEFAULT_CFG = {
  p: ['hdhub', 'vidrift', 'bingr', 'moviebox', 'hub4k'],
  langs: [],
  langStrict: false,
  minQuality: '720',
  resultLimit: '40',
  requestTimeout: '15',
  includeDash: true,
  probeQuality: false,
  debug: false,
  streamStyle: 'lightgdrive',
};

const LS_KEY = 'indstream.cfg.v1';

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

function readForm() {
  const cfg = {
    p: PROVIDERS.filter(function (pr) { return document.querySelector('[data-provider="' + pr.id + '"]').classList.contains('active'); }).map(function (pr) { return pr.id; }),
    langs: selectedLangs(),
    langStrict: document.getElementById('langStrict').checked,
    minQuality: document.getElementById('minQuality').value,
    resultLimit: document.getElementById('resultLimit').value,
    requestTimeout: document.getElementById('requestTimeout').value,
    includeDash: document.getElementById('includeDash').checked,
    probeQuality: document.getElementById('probeQuality').checked,
    debug: document.getElementById('debug').checked,
    streamStyle: document.getElementById('streamStyle').value,
  };
  if (!cfg.p.length) cfg.p = DEFAULT_CFG.p.slice();
  return cfg;
}

function selectedLangs() {
  return Array.from(document.querySelectorAll('#langs .chip-btn.active')).map(function (el) { return el.dataset.lang; });
}

function writeForm(cfg) {
  cfg = Object.assign({}, DEFAULT_CFG, cfg || {});
  PROVIDERS.forEach(function (pr) {
    const el = document.querySelector('[data-provider="' + pr.id + '"]');
    if (el) el.classList.toggle('active', cfg.p.indexOf(pr.id) >= 0);
  });
  document.querySelectorAll('#langs .chip-btn').forEach(function (el) {
    el.classList.toggle('active', cfg.langs.indexOf(el.dataset.lang) >= 0);
  });
  document.getElementById('minQuality').value = cfg.minQuality;
  document.getElementById('resultLimit').value = cfg.resultLimit;
  document.getElementById('requestTimeout').value = cfg.requestTimeout;
  document.getElementById('includeDash').checked = !!cfg.includeDash;
  document.getElementById('probeQuality').checked = !!cfg.probeQuality;
  document.getElementById('debug').checked = !!cfg.debug;
  document.getElementById('langStrict').checked = !!cfg.langStrict;
  const styleSel = document.getElementById('streamStyle');
  if (styleSel && cfg.streamStyle) styleSel.value = cfg.streamStyle;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
}

function updateUrl() {
  const cfg = readForm();
  saveCfg(cfg);
  const enc = b64url(cfg);
  const origin = window.location.origin;
  const url = origin + '/' + enc + '/manifest.json';
  document.getElementById('manifestUrl').textContent = url;
  const testLink = origin + '/' + enc + '/stream/movie/27205.json';
  document.getElementById('testUrl').href = testLink;
  document.getElementById('openStremio').href = 'https://www.stremio.com/#/addons?addonUrl=' + encodeURIComponent(url);
  document.getElementById('openStremio2').href = 'https://www.stremio.com/#/addons?addonUrl=' + encodeURIComponent(url);
  updatePreview();
  return url;
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(function () { toast('Copied to clipboard'); });
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); toast('Copied to clipboard'); } catch (e) { toast('Copy failed - select manually'); }
  document.body.removeChild(ta);
  return Promise.resolve();
}

function buildProviderChips() {
  const wrap = document.getElementById('providers');
  wrap.innerHTML = '';
  PROVIDERS.forEach(function (pr) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip-btn';
    btn.dataset.provider = pr.id;
    btn.innerHTML = pr.name + ' <span class="tag">' + pr.tag + '</span>';
    btn.addEventListener('click', function () { btn.classList.toggle('active'); updateUrl(); });
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
    btn.addEventListener('click', function () { btn.classList.toggle('active'); updateUrl(); });
    wrap.appendChild(btn);
  });
}

async function loadAccount() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    const chip = document.getElementById('accountChip');
    const googleBtn = document.getElementById('googleBtn');
    const guestBtn = document.getElementById('guestBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    if (data.signedIn && data.user) {
      chip.textContent = data.user.name || data.user.email || 'Signed in';
      chip.classList.remove('muted');
      googleBtn.hidden = true;
      guestBtn.hidden = true;
      logoutBtn.hidden = false;
    } else {
      chip.textContent = 'Guest';
      chip.classList.add('muted');
      googleBtn.hidden = !data.loginEnabled;
      guestBtn.hidden = false;
      logoutBtn.hidden = true;
    }
  } catch (e) {}
}

function escHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let lastPreviewStyle = null;

function updatePreview() {
  const style = document.getElementById('streamStyle').value;
  if (style === lastPreviewStyle) return;
  lastPreviewStyle = style;
  const wrap = document.getElementById('stylePreview');
  fetch('/format-preview.json?style=' + encodeURIComponent(style))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      wrap.innerHTML = (d.samples || []).map(function (s) {
        return '<div class="pv"><div class="pv-label">' + escHtml(s.label) + '</div>' +
          '<div class="pv-name">' + escHtml(s.name) + '</div>' +
          '<div class="pv-title">' + escHtml(s.title) + '</div></div>';
      }).join('');
    })
    .catch(function () { wrap.innerHTML = ''; lastPreviewStyle = null; });
}

document.getElementById('googleBtn').addEventListener('click', function () {
  window.location.href = '/auth/google';
});
document.getElementById('guestBtn').addEventListener('click', function () {
  document.getElementById('accountChip').textContent = 'Guest';
  toast('Continuing as guest. Preferences stay in this browser.');
});
document.getElementById('logoutBtn').addEventListener('click', function () {
  window.location.href = '/auth/logout';
});

document.getElementById('copyBtn').addEventListener('click', function () { copyText(document.getElementById('manifestUrl').textContent); });
document.getElementById('copyHero').addEventListener('click', function () { copyText(document.getElementById('manifestUrl').textContent); });
document.getElementById('copyInstall').addEventListener('click', function () { copyText(document.getElementById('manifestUrl').textContent); });

['minQuality', 'resultLimit', 'requestTimeout', 'includeDash', 'probeQuality', 'debug', 'langStrict', 'streamStyle'].forEach(function (id) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', updateUrl);
});

function loadStyles() {
  fetch('/api/styles').then(function (r) { return r.json(); }).then(function (data) {
    const sel = document.getElementById('streamStyle');
    if (!sel) return;
    sel.innerHTML = '';
    (data.options || []).forEach(function (opt) {
      const o = document.createElement('option');
      o.value = opt.id;
      o.textContent = opt.label;
      sel.appendChild(o);
    });
    const cfg = loadCfg();
    sel.value = cfg.streamStyle || data.default;
    updateStylePreview();
  }).catch(function () {});
}

function updateStylePreview() {
  const style = document.getElementById('streamStyle').value;
  const box = document.getElementById('stylePreview');
  if (!box) return;
  fetch('/api/style-preview?style=' + encodeURIComponent(style)).then(function (r) { return r.json(); }).then(function (data) {
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
  }).catch(function () {});
}

buildProviderChips();
buildLangChips();
writeForm(loadCfg());
loadStyles();
document.getElementById('streamStyle').addEventListener('change', function () { updateUrl(); updateStylePreview(); });
updateUrl();
loadAccount();