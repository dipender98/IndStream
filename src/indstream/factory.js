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

function createPlugin(providerId) {
  const singleProvider = providerId ? providers.BY_ID[providerId] : null;

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

    if (inputImdbId) await metaPromise;

    let wanted;
    if (singleProvider) {
      wanted = providers.enabled(s.sources, type, [singleProvider]);
    } else {
      wanted = providers.enabled(s.sources, type);
    }
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
      providers: singleProvider ? [singleProvider] : providers.PROVIDERS,
    });
  }

  async function onSettings() {
    if (singleProvider) {
      return settings.onSettingsFor([providerId]);
    }
    return settings.onSettings();
  }

  const api = {
    getStreams: getStreams,
    onSettings: onSettings,
  };

  return api;
}

module.exports = {
  createPlugin: createPlugin,
};
