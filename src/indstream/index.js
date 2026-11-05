'use strict';

const http = require('./http');
const tmdb = require('./tmdb');
const settings = require('./settings');
const providers = require('./providers');
const racer = require('./racer');
const finalize = require('./finalize');
const util = require('./util');

const TMDB_META_CAP_MS = 6000;

function safeInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

async function probeUnknownQuality(stream, ctx) {
  if (!ctx.settings.probeQuality) return stream;
  if (finalize.streamHeight(stream)) return stream;
  const url = stream.url;
  if (url.indexOf('.m3u8') < 0 && url.indexOf('.mpd') < 0) return stream;
  const text = await http.getText(url, {
    timeoutMs: 4000,
    headers: stream.headers || {},
  });
  if (!text) return stream;
  let result = { height: 0, languages: [] };
  if (url.indexOf('.mpd') >= 0) result = util.parseDashHeights(text);
  else if (text.indexOf('#EXTM3U') >= 0) result = util.parseHlsMaster(text);
  if (result.height > 0) {
    stream.height = result.height;
    stream.quality = util.qualityLabel(result.height);
  }
  return stream;
}

async function getStreams(mediaId, mediaType, season, episode) {
  const type = mediaType === 'tv' || mediaType === 'series' ? 'tv' : 'movie';
  const s = settings.getSettings();

  const inputId = String(mediaId == null ? '' : mediaId).trim();
  const inputImdbId = tmdb.normalizeImdbId(inputId);
  const inputTmdbId = inputImdbId ? 0 : safeInt(inputId);

  const context = {
    inputId: inputId,
    tmdbId: inputTmdbId,
    imdbId: inputImdbId,
    type: type,
    season: safeInt(season),
    episode: safeInt(episode),
    settings: s,
    timeoutMs: s.requestTimeout * 1000,
    log: s.debug ? function (message) { console.log('[IndStream] ' + message); } : function () {},
  };

  if (!context.tmdbId && !context.imdbId) return [];

  // Resolve metadata while providers start; IMDb input waits for the mapping.
  const metaController = http.createAbortController();
  const metaPromise = http.withTimeout(
    tmdb.resolveMeta(inputId, type, {
      deadline: Date.now() + TMDB_META_CAP_MS,
      signal: metaController ? metaController.signal : undefined,
    }),
    TMDB_META_CAP_MS,
    null,
    function () {
      http.abort(metaController);
    }
  )
    .catch(function () { return null; })
    .then(function (meta) {
      if (meta) {
        context.meta = meta;
        if (!context.tmdbId && Number(meta.id)) context.tmdbId = Number(meta.id);
        if (!context.imdbId && meta.imdbId) context.imdbId = meta.imdbId;
      }
      context.log(
        'lookup: ' + inputId + ' -> ' +
        (meta && meta.title ? '"' + meta.title + '" (' + (meta.year || '?') + ')' : 'metadata unavailable') +
        (context.tmdbId ? ' [tmdb:' + context.tmdbId + ']' : '') +
        (context.imdbId ? ' [imdb:' + context.imdbId + ']' : '')
      );
      return meta;
    });
  context.metaPromise = metaPromise;
  context.meta = null;

  // IMDb input must map to a TMDB id before providers start.
  if (inputImdbId) await metaPromise;

  const wanted = providers.enabled(s.sources, type);
  if (!wanted.length) return [];

  let streams = await racer.race(wanted, context, finalize.normalizeStream);

  if (s.probeQuality) {
    streams = await http.parallelMap(streams, 4, function (stream) {
      return probeUnknownQuality(stream, context);
    });
  }

  return finalize.finalizeStreams(streams, {
    minQuality: s.minQuality,
    includeDash: s.includeDash,
    resultLimit: s.resultLimit,
    providers: providers.PROVIDERS,
  });
}

async function onSettings() {
  return settings.onSettings();
}

const api = {
  getStreams: getStreams,
  onSettings: onSettings,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.getStreams = getStreams;
  globalThis.onSettings = onSettings;
} else if (typeof global !== 'undefined') {
  global.getStreams = getStreams;
  global.onSettings = onSettings;
}
