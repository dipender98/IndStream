'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const settings = require('./src/indstream/settings');
const tmdb = require('./src/indstream/tmdb');
const racer = require('./src/indstream/racer');
const finalize = require('./src/indstream/finalize');
const httpLib = require('./src/indstream/http');
const styles = require('./src/indstream/styles');

const hdhub = require('./src/indstream/providers/hdhub');
const vidrift = require('./src/indstream/providers/vidrift');
const bingr = require('./src/indstream/providers/bingr');
const moviebox = require('./src/indstream/providers/moviebox');
const hub4k = require('./src/indstream/providers/hub4k');
const fsl = require('./src/indstream/providers/fsl');

const ALL_PROVIDERS = [hdhub, vidrift, bingr, moviebox, hub4k, fsl];

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const LOGIN_ENABLED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && SESSION_SECRET);

const DEFAULT_CFG = {
  p: ['hdhub', 'vidrift', 'bingr', 'moviebox', 'hub4k'],
  langs: [],
  langStrict: false,
  streamStyle: styles.DEFAULT_STYLE,
  minQuality: '720',
  resultLimit: '40',
  requestTimeout: '15',
  includeDash: true,
  probeQuality: false,
  debug: false,
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

function normalizeCfg(raw) {
  const merged = Object.assign({}, DEFAULT_CFG, raw || {});
  if (!Array.isArray(merged.p)) merged.p = DEFAULT_CFG.p.slice();
  if (!Array.isArray(merged.langs)) merged.langs = [];
  try {
    globalThis.SCRAPER_SETTINGS = JSON.stringify(merged);
    return settings.getSettings();
  } finally {
    globalThis.SCRAPER_SETTINGS = undefined;
  }
}

function encodeCfg(cfg) {
  return Buffer.from(JSON.stringify(cfg)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeCfg(seg) {
  try {
    if (typeof seg !== 'string' || seg.length > 8192) return null;
    const padded = seg.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((seg.length + 3) % 4);
    const obj = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    const cleaned = {};
    for (const key of Object.keys(obj)) {
      if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') cleaned[key] = obj[key];
    }
    return cleaned;
  } catch (e) {
    return null;
  }
}

function shortHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function makeManifest(cfg, base) {
  return {
    id: 'com.indstream.addon.' + shortHash(encodeCfg(cfg)),
    version: '1.1.0',
    name: 'IndStream',
    description: 'IndStream streams for movies and series.',
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'tmdb:'],
    catalogs: [],
    logo: base + '/logo.png',
    behaviorHints: { configurable: true, p2p: false },
  };
}

function selectedProviders(cfg) {
  const ids = Array.isArray(cfg.p) && cfg.p.length ? cfg.p : DEFAULT_CFG.p;
  return ids.map(function (id) {
    return ALL_PROVIDERS.find(function (p) { return p.id === id; });
  }).filter(Boolean);
}

function languageRank(label, langs) {
  const text = String(label || '').toLowerCase();
  if (!text) return -1;
  for (let i = 0; i < langs.length; i++) {
    if (text.indexOf(String(langs[i]).toLowerCase()) >= 0) return i;
  }
  return -1;
}

function toBool(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'yes';
}

function languagePrefs(raw) {
  const langs = Array.isArray(raw && raw.langs)
    ? raw.langs.filter(function (lang) { return typeof lang === 'string' && lang.trim(); }).map(function (lang) { return lang.trim(); })
    : [];
  return { langs: langs, langStrict: toBool(raw && raw.langStrict) };
}

function applyLanguagePreference(streams, prefs) {
  const langs = Array.isArray(prefs.langs) ? prefs.langs.filter(Boolean) : [];
  if (!langs.length) return streams;
  let out = streams;
  if (prefs.langStrict) {
    out = out.filter(function (s) {
      const label = String(s.language || '').trim();
      if (!label) return true;
      return languageRank(label, langs) >= 0;
    });
  }
  return out.slice().sort(function (a, b) {
    const ra = languageRank(a.language, langs);
    const rb = languageRank(b.language, langs);
    if (ra === rb) return 0;
    if (ra < 0) return 1;
    if (rb < 0) return -1;
    return ra - rb;
  });
}

async function getStreams(mediaId, mediaType, season, episode, cfg) {
  const s = normalizeCfg(cfg);
  const type = mediaType === 'series' ? 'tv' : 'movie';
  const inputId = String(mediaId == null ? '' : mediaId).trim();
  const inputImdbId = tmdb.normalizeImdbId(inputId);
  const tmdbMatch = inputId.match(/^(?:tmdb:)?(\d+)$/);
  const inputTmdbId = inputImdbId ? 0 : (tmdbMatch ? Number(tmdbMatch[1]) : 0);

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

  const wanted = selectedProviders(cfg).filter(function (p) {
    return !p.supports || p.supports[type] !== false;
  });
  if (!wanted.length) return [];

  const raw = await racer.race(wanted, context, finalize.normalizeStream);
  const resultLimit = Number(s.resultLimit) || 0;
  const finalized = finalize.finalizeStreams(raw, {
    minQuality: s.minQuality,
    includeDash: s.includeDash,
    resultLimit: 0,
    providers: wanted,
  });
  const languageSorted = applyLanguagePreference(finalized, languagePrefs(cfg));
  return resultLimit > 0 ? languageSorted.slice(0, resultLimit) : languageSorted;
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch (e) { return ''; }
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach(function (part) {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    out[part.slice(0, idx).trim()] = safeDecode(part.slice(idx + 1).trim());
  });
  return out;
}

function signValue(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

function readSession(req) {
  if (!LOGIN_ENABLED) return null;
  const cookies = parseCookies(req);
  const raw = cookies.indstream_sess;
  if (!raw) return null;
  const idx = raw.lastIndexOf('.');
  if (idx < 0) return null;
  const payload = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  const expected = signValue(payload);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || !data.exp || data.exp < Date.now()) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function sessionCookie(data, secure) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return 'indstream_sess=' + payload + '.' + signValue(payload) + '; Path=/; HttpOnly; SameSite=Lax' + (secure ? '; Secure' : '') + '; Max-Age=2592000';
}

function clearCookie(secure) {
  return 'indstream_sess=; Path=/; HttpOnly; SameSite=Lax' + (secure ? '; Secure' : '') + '; Max-Age=0';
}

function isHttpsRequest(req) {
  const h = req && req.headers['x-forwarded-proto'];
  if (typeof h === 'string' && h.trim()) return h.split(',')[0].trim().toLowerCase() === 'https';
  return String(PUBLIC_URL || '').startsWith('https://');
}
function baseUrl(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto = isHttpsRequest(req) ? 'https' : 'http';
  return proto + '://' + req.headers.host;
}

function redirect(res, location, extraCookie) {
  const headers = { Location: location };
  if (extraCookie) headers['Set-Cookie'] = extraCookie;
  res.writeHead(302, headers);
  res.end();
}

function clearOauthCookie(secure) {
  return 'indstream_oauth=; Path=/; HttpOnly; SameSite=Lax' + (secure ? '; Secure' : '') + '; Max-Age=0';
}

async function handleGoogleCallback(req, res, query) {
  if (!LOGIN_ENABLED) {
    redirect(res, '/?error=disabled', clearOauthCookie(isHttpsRequest(req)));
    return;
  }
  const cookies = parseCookies(req);
  const stateCookie = cookies.indstream_oauth;
  const state = query.state || '';
  const code = query.code || '';

  if (!code || !stateCookie || stateCookie !== state) {
    redirect(res, '/?error=auth', clearOauthCookie(isHttpsRequest(req)));
    return;
  }
  try {
    const redirectUri = baseUrl(req) + '/auth/google/callback';
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(8000),
      body: new URLSearchParams({
        code: code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenJson || !tokenJson.access_token) {
      redirect(res, '/?error=token', clearOauthCookie(isHttpsRequest(req)));
      return;
    }
    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: 'Bearer ' + tokenJson.access_token },
      signal: AbortSignal.timeout(8000),
    });
    const info = await infoRes.json();
    if (!info || !info.sub) {
      redirect(res, '/?error=profile', clearOauthCookie(isHttpsRequest(req)));
      return;
    }
    const session = {
      sub: info.sub,
      name: info.name || info.email || 'User',
      email: info.email || '',
      picture: info.picture || '',
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };
    redirect(res, '/', [clearOauthCookie(isHttpsRequest(req)), sessionCookie(session, isHttpsRequest(req))]);
  } catch (e) {
    console.error('oauth error:', e && e.message ? e.message : e);
    redirect(res, '/?error=oauth', clearOauthCookie(isHttpsRequest(req)));
  }
}

function serveStatic(req, res, filePath) {
  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const etag = '"' + crypto.createHash('sha1').update(data).digest('hex').slice(0, 16) + '"';
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' });
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      ETag: etag,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

async function handleRequest(req, res) {
  const u = new URL(req.url || '/', 'http://localhost');
  const pathname = u.pathname || '/';
  const query = Object.fromEntries(u.searchParams.entries());

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    });
    res.end();
    return;
  }

  if (pathname === '/api/styles') {
    sendJson(res, 200, { default: styles.DEFAULT_STYLE, options: styles.STYLE_OPTIONS });
    return;
  }

  if (pathname === '/api/style-preview') {
    const style = (query.style || styles.DEFAULT_STYLE);
    sendJson(res, 200, { samples: styles.previewSamples(style) });
    return;
  }

  if (pathname === '/api/me') {
    const session = readSession(req);
    sendJson(res, 200, {
      signedIn: !!session,
      loginEnabled: LOGIN_ENABLED,
      user: session ? { name: session.name, email: session.email, picture: session.picture } : null,
    });
    return;
  }

  if (pathname === '/auth/google') {
    if (!LOGIN_ENABLED) {
      redirect(res, '/?error=disabled');
      return;
    }
    const state = crypto.randomBytes(16).toString('hex');
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: baseUrl(req) + '/auth/google/callback',
      response_type: 'code',
      scope: 'openid email profile',
      state: state,
      access_type: 'online',
      prompt: 'select_account',
    }).toString();
    res.writeHead(302, {
      Location: authUrl,
      'Set-Cookie': 'indstream_oauth=' + state + '; Path=/; HttpOnly; SameSite=Lax' + (isHttpsRequest(req) ? '; Secure' : '') + '; Max-Age=600',
    });
    res.end();
    return;
  }

  if (pathname === '/auth/google/callback') {
    await handleGoogleCallback(req, res, query);
    return;
  }

  if (pathname === '/auth/logout') {
    redirect(res, '/', clearCookie(isHttpsRequest(req)));
    return;
  }

  if (pathname === '/logo.png') {
    serveStatic(req, res, path.join(ROOT, 'assets', 'indstream.png'));
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    serveStatic(req, res, path.join(PUBLIC_DIR, 'index.html'));
    return;
  }

  if (pathname === '/app.js' || pathname === '/style.css') {
    serveStatic(req, res, path.join(PUBLIC_DIR, pathname.slice(1)));
    return;
  }

  const { cfg, rest } = splitConfig(pathname);

  if (rest === '/manifest.json' || rest === '/') {
    sendJson(res, 200, makeManifest(cfg, baseUrl(req)));
    return;
  }

  if (rest === '/configure' || rest === '/configure/') {
    serveStatic(req, res, path.join(PUBLIC_DIR, 'index.html'));
    return;
  }

  const m = rest.match(/^\/stream\/(movie|series)\/(.+)\.json$/);
  if (m) {
    const parts = decodeURIComponent(m[2]).split(':');
    try {
      const streams = await getStreams(parts[0], m[1], parts[1], parts[2], cfg);
      sendJson(res, 200, { streams: streams });
    } catch (err) {
      console.error('stream error:', err && err.message ? err.message : err);
      sendJson(res, 200, { streams: [] });
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

const server = http.createServer(function (req, res) {
  handleRequest(req, res).catch(function (err) {
    console.error('request error:', err && err.message ? err.message : err);
    if (!res.headersSent) {
      sendJson(res, 500, { streams: [] });
      return;
    }
    try { res.end(); } catch (e) {}
  });
});

function splitConfig(pathname) {
  if (typeof pathname !== 'string' || pathname.length > 8192) return { cfg: DEFAULT_CFG, rest: '/' };
  const parts = pathname.split('/').filter(Boolean);
  if (!parts.length) return { cfg: DEFAULT_CFG, rest: '/' };
  const first = decodeCfg(parts[0]);
  if (first) {
    const rest = '/' + parts.slice(1).join('/');
    return { cfg: Object.assign({}, DEFAULT_CFG, first), rest: rest === '/' ? '/' : rest };
  }
  return { cfg: DEFAULT_CFG, rest: pathname };
}

server.listen(PORT, HOST, function () {
  console.log('IndStream addon listening on http://' + HOST + ':' + PORT);
  console.log('Google login: ' + (LOGIN_ENABLED ? 'enabled' : 'disabled (guest only)'));
});