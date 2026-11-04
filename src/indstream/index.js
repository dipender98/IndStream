'use strict';

const http = require('./http');
const tmdb = require('./tmdb');
const settings = require('./settings');
const servers = require('./servers');
const util = require('./util');

function safeInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

function normalizeStream(raw, server, ctx) {
  if (!raw || !raw.url) return null;
  const type = raw.type || (raw.url.indexOf('.m3u8') >= 0 ? 'hls' : raw.url.indexOf('.mpd') >= 0 ? 'dash' : 'mp4');
  const height = Number(raw.height) || 0;
  const quality = raw.quality || util.qualityLabel(height);
  const stream = {
    title: raw.title || server.name || '',
    name: server.name || '',
    url: raw.url,
    type: type,
    quality: quality,
    size: raw.size || '',
    language: raw.language || '',
    provider: server.name || '',
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

const GRACE_MS = 3500;
const OVERALL_MAX_MS = 30000;
const TMDB_META_CAP_MS = 8000;

const SERVER_CAPS = {
  vidrift: 8000,
  bingr: 8000,
  moviebox: 10000,
  hub4k: 10000,
  fsl: 10000,
};

// Runs all sources concurrently. Resolves as soon as one of these happens:
// - every source has settled, or
// - at least one stream arrived and the grace window has elapsed, or
// - the overall deadline passed.
function runSources(wanted, context) {
  return new Promise(function (resolve) {
    const total = wanted.length;
    const collected = [];
    let settled = 0;
    let finished = false;
    let graceTimer = null;

    const caps = wanted.map(function (server) {
      return Math.min(SERVER_CAPS[server.id] || 15000, context.settings.requestTimeout * 1000 + 5000);
    });
    const overallMs = Math.min(OVERALL_MAX_MS, Math.max.apply(null, caps) + 9000);
    const overallTimer = setTimeout(finish, overallMs);

    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(overallTimer);
      if (graceTimer) clearTimeout(graceTimer);
      resolve(collected.slice());
    }

    function onFirstStream() {
      if (graceTimer) return;
      graceTimer = setTimeout(finish, GRACE_MS);
    }

    function consider() {
      if (settled >= total) finish();
    }

    wanted.forEach(function (server, i) {
      const scope = Object.assign({}, context, { deadline: Date.now() + caps[i] - 1000 });
      http.withTimeout(server.resolve(scope), caps[i], []).then(function (list) {
        const normalized = (list || []).map(function (raw) {
          return normalizeStream(raw, server, context);
        }).filter(Boolean);
        if (normalized.length && !graceTimer) onFirstStream();
        Array.prototype.push.apply(collected, normalized);
        settled += 1;
        consider();
      });
    });
  });
}

async function getStreams(tmdbId, mediaType, season, episode) {
  const type = mediaType === 'tv' || mediaType === 'series' ? 'tv' : 'movie';
  const s = settings.getSettings();

  const context = {
    tmdbId: safeInt(tmdbId),
    type: type,
    season: safeInt(season),
    episode: safeInt(episode),
    settings: s,
    timeoutMs: s.requestTimeout * 1000,
    log: s.debug ? function (message) { console.log('[IndStream] ' + message); } : function () {},
  };

  // Start TMDB metadata resolution immediately. Sources that only need the
  // tmdbId (Vidrift) run right away; title-keyed sources wait on this promise.
  const metaPromise = http.withTimeout(tmdb.fetchMeta(context.tmdbId, type), TMDB_META_CAP_MS, null)
    .catch(function () { return null; });
  context.metaPromise = metaPromise;
  context.meta = null;

  const wanted = servers.SERVERS.filter(function (server) {
    return s.sources[server.id] !== false;
  });
  if (!wanted.length) return [];

  let streams = await runSources(wanted, context);

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

function onSettings() {
  return settings.onSettings();
}

module.exports = {
  getStreams: getStreams,
  onSettings: onSettings,
};
