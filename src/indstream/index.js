'use strict';

const http = require('./http');
const tmdb = require('./tmdb');
const settings = require('./settings');
const providers = require('./providers');
const racer = require('./racer');
const util = require('./util');

const TMDB_META_CAP_MS = 6000;

function safeInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

function normalizeStream(raw, provider) {
  if (!raw || !raw.url) return null;
  const type = raw.type || (raw.url.indexOf('.m3u8') >= 0 ? 'hls' : raw.url.indexOf('.mpd') >= 0 ? 'dash' : 'mp4');
  const height = Number(raw.height) || 0;
  const quality = raw.quality || util.qualityLabel(height);
  const stream = {
    title: util.displayName(provider.name, raw.language || '', null, raw.size || '', ''),
    name: provider.name || '',
    url: raw.url,
    type: type,
    quality: quality,
    size: raw.size || '',
    language: raw.language || '',
    provider: provider.name || '',
    headers: raw.headers || {},
  };
  if (Array.isArray(raw.subtitles) && raw.subtitles.length) {
    stream.subtitles = raw.subtitles;
  }
  return stream;
}

async function probeUnknownQuality(stream, ctx) {
  const url = stream.url;
  if (!ctx.settings.probeQuality) return stream;
  if (stream.quality) return stream;
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

  // Start metadata resolution immediately. Providers that only need the
  // tmdbId run right away; title-keyed providers wait on this promise.
  // Both TMDB ids and IMDb ids/URLs are accepted as input.
  const metaPromise = http.withTimeout(tmdb.resolveMeta(inputId, type), TMDB_META_CAP_MS, null)
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

  // An IMDb input has to be mapped before providers that need a TMDB id can
  // start. TMDB input still races metadata and providers concurrently.
  if (inputImdbId) await metaPromise;

  const wanted = providers.PROVIDERS.filter(function (provider) {
    if (s.sources[provider.id] === false) return false;
    if (provider.supports && provider.supports[type] === false) return false;
    return true;
  });
  if (!wanted.length) return [];

  let streams = await racer.race(wanted, context, normalizeStream);

  const includeDash = s.includeDash;
  streams = streams.filter(function (stream) {
    if (!includeDash && stream.type === 'dash') return false;
    const height = Number(stream.height) || util.parseHeight(stream.quality);
    return !util.isKnownBelowFloor(height, s.minQuality);
  });

  if (s.probeQuality) {
    streams = await http.parallelMap(streams, 4, function (stream) {
      return probeUnknownQuality(stream, context);
    });
    streams = streams.filter(function (stream) {
      const height = Number(stream.height) || util.parseHeight(stream.quality);
      return !util.isKnownBelowFloor(height, s.minQuality);
    });
  }

  streams = util.dedupeStreams(streams);
  streams.sort(function (a, b) {
    const ha = Number(a.height) || util.parseHeight(a.quality);
    const hb = Number(b.height) || util.parseHeight(b.quality);
    if (hb !== ha) return hb - ha;
    return util.languagePriority(b.language) - util.languagePriority(a.language);
  });

  const limit = Number(s.resultLimit) || 0;
  if (limit > 0 && streams.length > limit) streams = streams.slice(0, limit);
  return streams;
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
