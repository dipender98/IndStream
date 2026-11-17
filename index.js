'use strict';

const http = require('http');
const url = require('url');

const factory = require('./src/indstream/factory');
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

const MANIFEST = {
  id: 'com.indstream.addon',
  version: '1.0.0',
  name: 'IndStream',
  description: 'IndStream streams for movies and series.',
  resources: ['stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt', 'tmdb:'],
  catalogs: [],
  behaviorHints: { configurable: false, p2p: false },
};

function buildSettings() {
  const raw = {
    minQuality: process.env.MIN_QUALITY || '720',
    resultLimit: process.env.RESULT_LIMIT || '40',
    requestTimeout: process.env.REQUEST_TIMEOUT || '15',
    probeQuality: process.env.PROBE_QUALITY === 'true',
    includeDash: process.env.INCLUDE_DASH !== 'false',
    debug: process.env.DEBUG === 'true',
  };
  globalThis.SCRAPER_SETTINGS = JSON.stringify(raw);
  return settings.getSettings();
}

async function getStreams(mediaId, mediaType, season, episode) {
  const s = buildSettings();
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

  if (s.probeQuality) {
    streams = await httpLib.parallelMap(streams, 4, function (stream) {
      // probe unknown quality (reuse factory logic inline is overkill; skip probing on server by default)
      return stream;
    });
  }

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

function parseId(raw) {
  const parts = String(raw || '').split(':');
  return { base: parts[0], season: parts[1], episode: parts[2] };
}

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

  if (pathname === '/' || pathname === '/manifest.json') {
    sendJson(res, 200, MANIFEST);
    return;
  }

  const m = pathname.match(/^\/stream\/(movie|series)\/(.+)\.json$/);
  if (m) {
    const type = m[1];
    const { base, season, episode } = parseId(decodeURIComponent(m[2]));
    try {
      const streams = await getStreams(base, type, season, episode);
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
