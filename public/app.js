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
    el.className = 'wizard-step' + (i < idx ? ' done' : '') + (i === idx ? ' active' : '');
    el.style.cssText = 'background:none;border:none;cursor:pointer;font-size:.8rem';
    el.innerHTML = '<span class="wizard-dot">' + (i < idx ? '✓' : (i + 1)) + '</span><span class="step-name">' + step.label + '</span>';
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