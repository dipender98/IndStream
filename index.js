'use strict';

const http = require('http');
const url = require('url');

const settings = require('./src/indstream/settings');
const tmdb = require('./src/indstream/tmdb');
const racer = require('./src/indstream/racer');
const finalize = require('./src/indstream/finalize');
const httpLib = require('./src/indstream/http');

const providers = [
  require('./src/indstream/providers/hdhub'),
  require('./src/indstream/providers/vidrift'),
  require('./src/indstream/providers/bingr'),
  require('./src/indstream/providers/moviebox'),
  require('./src/indstream/providers/hub4k'),
];

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const BASE_URL = process.env.BASE_URL || '';

const DEFAULT_CFG = {
  minQuality: '720',
  resultLimit: '40',
  requestTimeout: '15',
  probeQuality: false,
  includeDash: true,
  debug: false,
};

function normalizeCfg(raw) {
  const merged = Object.assign({}, DEFAULT_CFG, raw || {});
  globalThis.SCRAPER_SETTINGS = JSON.stringify(merged);
  const s = settings.getSettings();
  globalThis.SCRAPER_SETTINGS = undefined;
  return s;
}

function encodeCfg(cfg) {
  return Buffer.from(JSON.stringify(cfg)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeCfg(seg) {
  try {
    const padded = seg.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((seg.length + 3) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== 'object') return null;
    return obj;
  } catch (e) {
    return null;
  }
}

function shortHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function makeManifest(cfg) {
  const enc = encodeCfg(cfg);
  return {
    id: 'com.indstream.addon.' + shortHash(enc),
    version: '1.0.0',
    name: 'IndStream',
    description: 'IndStream streams for movies and series.',
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'tmdb:'],
    catalogs: [],
    behaviorHints: { configurable: true, p2p: false },
  };
}

async function getStreams(mediaId, mediaType, season, episode, cfg) {
  const s = normalizeCfg(cfg);
  const type = mediaType === 'series' ? 'tv' : 'movie';
  const inputId = String(mediaId == null ? '' : mediaId).trim();
  const inputImdbId = tmdb.normalizeImdbId(inputId);
  const inputTmdbId = inputImdbId ? 0 : (parseInt(inputId, 10) || 0);

  const context = {
    inputId: inputId,
    tmdbId: inputTmdbId,
    imdbId: inputImdbId,
    type: type,
    season: Number(season) || 0,
    episode: Number(episode) || 0,
    settings: s,
    timeoutMs: s.requestTimeout * 1000,
    log: s.debug ? function (m) { console.log('[IndStream] ' + m); } : function () {},
  };

  if (!context.tmdbId && !context.imdbId) return [];

  const metaController = httpLib.createAbortController();
  const metaPromise = httpLib.withTimeout(
    tmdb.resolveMeta(inputId, type, {
      deadline: Date.now() + 2000,
      signal: metaController ? metaController.signal : undefined,
    }),
    2000,
    null,
    function () { httpLib.abort(metaController); }
  ).catch(function () { return null; }).then(function (meta) {
    if (meta) {
      context.meta = meta;
      if (!context.tmdbId && Number(meta.id)) context.tmdbId = Number(meta.id);
      if (!context.imdbId && meta.imdbId) context.imdbId = meta.imdbId;
    }
    return meta;
  });
  context.metaPromise = metaPromise;
  context.meta = null;

  const wanted = providers.filter(function (p) {
    return !p.supports || p.supports[type] !== false;
  });
  if (!wanted.length) return [];

  let streams = await racer.race(wanted, context, finalize.normalizeStream);
  return finalize.finalizeStreams(streams, {
    minQuality: s.minQuality,
    includeDash: s.includeDash,
    resultLimit: s.resultLimit,
    providers: wanted,
  });
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function parseId(raw) {
  const parts = String(raw || '').split(':');
  return { base: parts[0], season: parts[1], episode: parts[2] };
}

// Returns { cfg, rest } where rest is the path after the optional config segment.
function splitConfig(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (!parts.length) return { cfg: DEFAULT_CFG, rest: '/' };
  const first = decodeCfg(parts[0]);
  if (first) {
    const rest = '/' + parts.slice(1).join('/');
    return { cfg: Object.assign({}, DEFAULT_CFG, first), rest: rest === '/' ? '/' : rest };
  }
  return { cfg: DEFAULT_CFG, rest: pathname };
}

const CONFIGURE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>IndStream - Configure</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; color: #111; }
  h1 { margin-bottom: .25rem; }
  .sub { color: #555; margin-bottom: 1.5rem; }
  label { display: block; margin: .75rem 0 .25rem; font-weight: 600; }
  select, input[type=checkbox] { font-size: 1rem; }
  .row { display: flex; align-items: center; gap: .5rem; }
  button { margin-top: 1.25rem; padding: .6rem 1.2rem; font-size: 1rem; cursor: pointer; }
  .out { margin-top: 1.5rem; padding: 1rem; background: #f4f4f4; border-radius: 8px; word-break: break-all; }
  .out a { color: #0066cc; }
  .note { color: #666; font-size: .85rem; margin-top: .5rem; }
</style>
</head>
<body>
<h1>IndStream</h1>
<p class="sub">Configure your addon and copy the URL into Nuvio or Stremio.</p>

<label for="minQuality">Minimum quality</label>
<select id="minQuality">
  <option value="0">Best available (no floor)</option>
  <option value="720" selected>720p</option>
  <option value="1080">1080p</option>
</select>

<label for="resultLimit">Maximum results</label>
<select id="resultLimit">
  <option value="20">20</option>
  <option value="40" selected>40</option>
  <option value="80">80</option>
  <option value="0">No limit</option>
</select>

<label for="requestTimeout">Provider timeout</label>
<select id="requestTimeout">
  <option value="10">10 seconds</option>
  <option value="15" selected>15 seconds</option>
  <option value="25">25 seconds</option>
</select>

<div class="row">
  <input type="checkbox" id="includeDash" checked>
  <label for="includeDash" style="margin:0;font-weight:400">Include DASH streams</label>
</div>
<div class="row">
  <input type="checkbox" id="probeQuality">
  <label for="probeQuality" style="margin:0;font-weight:400">Probe unknown quality (slower)</label>
</div>
<div class="row">
  <input type="checkbox" id="debug">
  <label for="debug" style="margin:0;font-weight:400">Verbose logging</label>
</div>

<button id="gen">Generate URL</button>

<div class="out" id="out" style="display:none">
  <strong>Your addon URL:</strong><br>
  <a id="url" href="#" target="_blank"></a>
  <p class="note">Paste this into Nuvio (Settings &rarr; Plugins/Addons &rarr; Add by URL) or Stremio (Addons &rarr; search bar).</p>
</div>

<script>
function b64url(obj){return btoa(JSON.stringify(obj)).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');}
function gen(){
  const cfg={
    minQuality: document.getElementById('minQuality').value,
    resultLimit: document.getElementById('resultLimit').value,
    requestTimeout: document.getElementById('requestTimeout').value,
    includeDash: document.getElementById('includeDash').checked,
    probeQuality: document.getElementById('probeQuality').checked,
    debug: document.getElementById('debug').checked,
  };
  const base = window.location.origin;
  const u = base + '/' + b64url(cfg) + '/manifest.json';
  const a = document.getElementById('url');
  a.href = u; a.textContent = u;
  document.getElementById('out').style.display = 'block';
}
document.getElementById('gen').addEventListener('click', gen);
gen();
</script>
</body>
</html>`;

const server = http.createServer(async function (req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    });
    res.end();
    return;
  }

  if (pathname === '/') {
    sendHtml(res, 200, CONFIGURE_HTML);
    return;
  }

  const { cfg, rest } = splitConfig(pathname);

  if (rest === '/manifest.json' || rest === '/') {
    sendJson(res, 200, makeManifest(cfg));
    return;
  }

  const m = rest.match(/^\/stream\/(movie|series)\/(.+)\.json$/);
  if (m) {
    const type = m[1];
    const { base, season, episode } = parseId(decodeURIComponent(m[2]));
    try {
      const streams = await getStreams(base, type, season, episode, cfg);
      sendJson(res, 200, { streams: streams });
    } catch (err) {
      console.error('stream error:', err && err.message ? err.message : err);
      sendJson(res, 200, { streams: [] });
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, HOST, function () {
  console.log('IndStream addon listening on http://' + HOST + ':' + PORT);
});