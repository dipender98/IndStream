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
const LS_PROFILES = 'indstream.profiles.v1';
const LS_ACTIVE = 'indstream.activeProfile.v1';

function loadProfiles() {
  let profiles = null;
  try { profiles = JSON.parse(localStorage.getItem(LS_PROFILES) || 'null'); } catch (e) {}
  if (!Array.isArray(profiles) || !profiles.length) {
    let legacy = null;
    try { const raw = localStorage.getItem(LS_KEY); if (raw) legacy = JSON.parse(raw); } catch (e) {}
    profiles = [{ id: 'p1', name: 'Default', cfg: Object.assign({}, DEFAULT_CFG, legacy || {}) }];
    saveProfiles(profiles);
  }
  return profiles;
}
function saveProfiles(profiles) { try { localStorage.setItem(LS_PROFILES, JSON.stringify(profiles)); } catch (e) {} }
function activeProfileId(profiles) {
  const list = profiles || loadProfiles();
  const id = localStorage.getItem(LS_ACTIVE);
  return list.some(function (p) { return p.id === id; }) ? id : list[0].id;
}
function activeProfile() {
  const profiles = loadProfiles();
  const id = activeProfileId(profiles);
  return profiles.find(function (p) { return p.id === id; }) || profiles[0];
}
function loadCfg() {
  const p = activeProfile();
  return Object.assign({}, DEFAULT_CFG, p.cfg || {});
}
function saveCfg(cfg) {
  const profiles = loadProfiles();
  const id = activeProfileId(profiles);
  const idx = profiles.findIndex(function (p) { return p.id === id; });
  if (idx >= 0) {
    profiles[idx].cfg = Object.assign({}, DEFAULT_CFG, cfg);
    saveProfiles(profiles);
  }
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

function flashSaved() {
  const bar = document.querySelector('.saved-line');
  if (!bar) return;
  bar.innerHTML = '<span class="dot-success" style="background:#c9a36b"></span> Saving...';
  setTimeout(function () {
    bar.innerHTML = '<span class="dot-success"></span> All changes saved';
  }, 650);
}

function updateAll() {
  const cfg = currentCfg();
  saveCfg(cfg);
  flashSaved();
  const url = manifestUrl(cfg);
  document.getElementById('manifestUrl').textContent = url;
  document.getElementById('statSources').textContent = cfg.p.length;
  document.getElementById('sourcesBadge').textContent = cfg.p.length;
  document.getElementById('sourcesCount').textContent = cfg.p.length + ' selected';
  document.getElementById('statQualities').textContent = cfg.minQuality === '0' ? 'Any' : cfg.minQuality + 'p+';
  document.getElementById('installState').textContent = 'Configuration ready.';
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
    const cfg = Object.assign({}, DEFAULT_CFG, p.cfg || {});
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
      '<div class="profile-url">' + url + '</div>' +
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
          localStorage.setItem(LS_ACTIVE, p.id);
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
  const name = (suggestedName || prompt('Name your profile', fallback) || fallback).trim().slice(0, 40);
  if (!name) return;
  const cfg = Object.assign({}, DEFAULT_CFG, seedCfg || loadCfg());
  const id = 'p' + Date.now();
  profiles.push({ id: id, name: name, cfg: cfg });
  saveProfiles(profiles);
  localStorage.setItem(LS_ACTIVE, id);
  applyCfg(loadCfg());
  toast('Profile "' + name + '" created');
}

function importFromUrl(url) {
  const m = String(url || '').match(/\/([A-Za-z0-9_-]+)\/manifest\.json/);
  if (!m) { toast('No config found in that URL'); return; }
  const cfg = decodeCfgSegment(m[1]);
  if (!cfg) { toast('That config URL is invalid'); return; }
  createProfile(Object.assign({}, DEFAULT_CFG, cfg), 'Imported');
}

let previewToken = 0;
function updatePreview(style) {
  const box = document.getElementById('stylePreview');
  if (!box) return;
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
    document.getElementById('accountSub').textContent = signedIn ? 'Connected · synced' : 'Local preferences';
    document.getElementById('bigName').textContent = name;
    document.getElementById('bigSub').textContent = signedIn ? (data.user.email || 'Connected · synced to this Google account') : 'Local preferences - sign in to keep them on every device.';
    document.getElementById('googleBtn').hidden = signedIn || !data.loginEnabled;
    document.getElementById('modalGoogleBtn').hidden = !data.loginEnabled;
    document.getElementById('guestBtn').hidden = signedIn;
    document.getElementById('logoutBtn').hidden = !signedIn;
    document.getElementById('signOutBtn').hidden = !signedIn;
    document.getElementById('accountDot').hidden = signedIn;
    const initial = name[0].toUpperCase();
    ['accountAvatar', 'bigAvatar'].forEach(function (id) {
      const el = document.getElementById(id);
      if (signedIn && data.user.picture) {
        el.innerHTML = '<img src="' + data.user.picture + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'' + initial + '\'">';
      } else {
        el.textContent = initial;
      }
    });
  } catch (e) {}
}

const WIZARD_STEPS = [
  { id: 'sources', label: 'Sources' },
  { id: 'filtering', label: 'Filtering' },
  { id: 'playback', label: 'Playback' },
];

const SECTION_TITLES = {
  overview: ['Overview', 'Install status & sync'],
  profiles: ['Profiles', 'One addon URL per setup'],
  sources: ['Sources', 'Pick your servers'],
  filtering: ['Filtering', 'Languages & quality'],
  playback: ['Playback', 'Results & style'],
  account: ['Account', 'Sign in, or carry on as guest'],
  status: ['Status', 'Service health'],
};

function currentWizardIndex() {
  const active = document.querySelector('#nav .nav-item.active');
  const name = active ? active.dataset.section : 'overview';
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
    el.style.cssText = 'background:none;border:none;cursor:pointer;font-size:.8rem';
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
  nextBtn.innerHTML = (idx === WIZARD_STEPS.length - 1 ? 'Finish & Install' : 'Next') +
    ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polyline points="9 18 15 12 9 6"/></svg>';
}

function setupWizard() {
  document.getElementById('wizardBack').addEventListener('click', function () {
    const idx = currentWizardIndex();
    if (idx === -1 || idx === 0) setSection('overview');
    else setSection(WIZARD_STEPS[idx - 1].id);
  });
  document.getElementById('wizardNext').addEventListener('click', function () {
    const idx = currentWizardIndex();
    if (idx === -1) return;
    if (idx === WIZARD_STEPS.length - 1) setSection('overview');
    else setSection(WIZARD_STEPS[idx + 1].id);
  });
  document.addEventListener('keydown', function (e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    const idx = currentWizardIndex();
    if (idx === -1) return;
    if (e.key === 'ArrowRight' && idx < WIZARD_STEPS.length - 1) setSection(WIZARD_STEPS[idx + 1].id);
    else if (e.key === 'ArrowLeft' && idx > 0) setSection(WIZARD_STEPS[idx - 1].id);
  });
}

function setSection(name) {
  document.querySelectorAll('#nav .nav-item').forEach(function (b) {
    b.classList.toggle('active', b.dataset.section === name);
  });
  document.querySelectorAll('.panel').forEach(function (p) {
    p.classList.toggle('hidden', p.id !== 'panel-' + name);
  });
  const t = SECTION_TITLES[name] || ['Overview', ''];
  document.getElementById('sectionTitle').textContent = t[0];
  document.getElementById('sectionSub').textContent = t[1];
  updateWizard(name);
  closeDrawer();
  window.scrollTo({ top: 0 });
}

function openDrawer() {
  document.getElementById('sidebar').classList.add('open');
  const backdrop = document.getElementById('sidebarBackdrop');
  backdrop.hidden = false;
  document.getElementById('hamburger').setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar.classList.contains('open')) return;
  sidebar.classList.remove('open');
  document.getElementById('sidebarBackdrop').hidden = true;
  document.getElementById('hamburger').setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
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
  const dismissed = localStorage.getItem(LS_WELCOME) === '1';
  fetch('/api/me').then(function (r) { return r.json(); }).then(function (data) {
    if (!dismissed && !data.signedIn) setTimeout(function () { modal.classList.remove('hidden'); }, 800);
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
  document.getElementById('copyUrlBtn').addEventListener('click', function () { copyText(url()); });
  document.getElementById('clearBtn').addEventListener('click', function () { applyCfg(DEFAULT_CFG); toast('Reset to the recommended setup'); });
  document.getElementById('sourcesAll').addEventListener('click', function () {
    document.querySelectorAll('#providers .provider-card').forEach(function (el) { el.classList.add('active'); });
    updateAll();
    toast('All 6 sources selected');
  });
  document.getElementById('sourcesNone').addEventListener('click', function () { applyCfg(DEFAULT_CFG); toast('Reset to the recommended setup'); });
  document.getElementById('switchProfileBtn').addEventListener('click', function () { setSection('profiles'); });
  document.getElementById('newProfileBtn').addEventListener('click', function () { createProfile(loadCfg()); });
  document.getElementById('importProfileBtn').addEventListener('click', function () {
    const url = prompt('Paste the addon URL to import', window.location.origin + '/manifest.json');
    if (url) importFromUrl(url);
  });
  document.getElementById('googleBtn').addEventListener('click', function () { window.location.href = '/auth/google'; });
  document.getElementById('guestBtn').addEventListener('click', function () { toast('Guest mode — preferences stay on this device'); });
  document.getElementById('logoutBtn').addEventListener('click', function () { window.location.href = '/auth/logout'; });
  document.getElementById('signOutBtn').addEventListener('click', function () { window.location.href = '/auth/logout'; });
  document.getElementById('noticeClose').addEventListener('click', function () { document.getElementById('notice').remove(); });
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
  checkHealth();
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
      document.querySelectorAll('#langs .chip-btn.active').forEach(function (chip) { chip.classList.remove('active'); });
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
  var SECTIONS = ['overview', 'profiles', 'sources', 'filtering', 'playback', 'account', 'status'];
  var actions = [
    { id: 'nav:overview', label: 'Go to Overview', hint: '1' },
    { id: 'nav:profiles', label: 'Go to Presets', hint: '2' },
    { id: 'nav:sources', label: 'Go to Sources', hint: '3' },
    { id: 'nav:filtering', label: 'Go to Filtering', hint: '4' },
    { id: 'nav:playback', label: 'Go to Playback', hint: '5' },
    { id: 'nav:account', label: 'Go to Account', hint: '6' },
    { id: 'nav:status', label: 'Go to Status', hint: '7' },
    { id: 'copy', label: 'Copy addon URL' },
    { id: 'reset', label: 'Reset to defaults' }
  ];
  var filtered = actions.slice();
  var index = 0;

  function render() {
    list.innerHTML = '';
    filtered.forEach(function (a, i) {
      var li = document.createElement('li');
      li.className = 'palette-item' + (i === index ? ' active' : '');
      li.setAttribute('role', 'option');
      li.innerHTML = '<span class="palette-label">' + a.label + '</span>' +
        (a.hint ? '<kbd class="palette-key">' + a.hint + '</kbd>' : '');
      li.addEventListener('click', function () { run(a); });
      li.addEventListener('mousemove', function () { index = i; render(); });
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
    palette.classList.remove('hidden');
    input.value = '';
    filtered = actions.slice();
    index = 0;
    render();
    input.focus();
  }

  function closePalette() { palette.classList.add('hidden'); }

  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    var typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (palette.classList.contains('hidden')) { openPalette(); } else { closePalette(); }
      return;
    }
    if (e.key === 'Escape') { closePalette(); return; }
    var paletteOpen = !palette.classList.contains('hidden');
    if (!paletteOpen) {
      if (typing) { return; }
      if (e.key >= '1' && e.key <= '7') { e.preventDefault(); setSection(SECTIONS[Number(e.key) - 1]); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); index = Math.min(filtered.length - 1, index + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); index = Math.max(0, index - 1); render(); }
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
