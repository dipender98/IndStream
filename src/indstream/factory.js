'use strict';

const http = require('./http');
const tmdb = require('./tmdb');
const settings = require('./settings');
const racer = require('./racer');
const finalize = require('./finalize');
const probe = require('./probe');

const TMDB_META_CAP_MS = 2000;

function safeInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

function createPlugin(provider) {
  const activeProvider = provider || {};
  const providerList = provider ? [provider] : [];

  async function getStreams(mediaId, mediaType, season, episode) {
    const type = mediaType === 'tv' || mediaType === 'series' ? 'tv' : 'movie';
    const s = settings.getSettings();

    const inputId = String(mediaId == null ? '' : mediaId).trim();
    const inputImdbId = tmdb.normalizeImdbId(inputId);
    const tmdbMatch = inputId.match(/^(?:tmdb:)?(\d+)$/i);
    const inputTmdbId = inputImdbId ? 0 : (tmdbMatch ? Number(tmdbMatch[1]) : 0);

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

    const wanted = !activeProvider.supports || activeProvider.supports[type] !== false
      ? providerList
      : [];
    if (!wanted.length) return [];

    let streams = await racer.race(wanted, context, finalize.normalizeStream);

    if (s.probeQuality || s.hideNonSeekable) {
      streams = await http.parallelMap(streams, 4, function (stream) {
        return probe.probeStream(stream, { settings: s });
      });
    }

    return finalize.finalizeStreams(streams, {
      qualityOrder: s.qualityOrder,
      includeDash: s.includeDash,
      hideNonSeekable: s.hideNonSeekable,
      resultLimit: s.resultLimit,
      providers: providerList,
    });
  }

  async function onSettings() {
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
