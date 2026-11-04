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

  const meta = await tmdb.fetchMeta(context.tmdbId, type);
  context.meta = meta;

  const wanted = servers.SERVERS.filter(function (server) {
    return s.sources[server.id] !== false;
  });
  if (!wanted.length) return [];

  const results = await http.parallelMap(wanted, wanted.length, function (server) {
    return http.withTimeout(
      server.resolve(context).then(function (list) {
        return (list || []).map(function (raw) {
          return normalizeStream(raw, server, context);
        }).filter(Boolean);
      }),
      server.timeoutMs + 5000,
      []
    );
  });

  let streams = [];
  results.forEach(function (list) {
    if (Array.isArray(list)) streams = streams.concat(list);
  });

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
