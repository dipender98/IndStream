'use strict';

const util = require('./util');

function streamHeight(stream) {
  if (!stream) return 0;
  return Number(stream.height) || util.parseHeight(stream.quality);
}

function normalizeStream(raw, provider) {
  if (!raw || !raw.url) return null;
  const url = String(raw.url);
  const type = raw.type || (url.indexOf('.m3u8') >= 0 ? 'hls' : url.indexOf('.mpd') >= 0 ? 'dash' : 'mp4');
  const declaredHeight = Number(raw.height) || 0;
  const quality = raw.quality || util.qualityLabel(declaredHeight);
  const height = declaredHeight || util.parseHeight(quality);
  const stream = {
    title: util.displayName(provider.name, raw.language || '', null, raw.size || '', ''),
    name: provider.name || '',
    url: url,
    type: type,
    quality: quality,
    height: height,
    size: raw.size || '',
    language: raw.language || '',
    provider: provider.name || '',
    providerId: provider.id || '',
    headers: raw.headers || {},
  };
  if (Array.isArray(raw.subtitles) && raw.subtitles.length) {
    stream.subtitles = raw.subtitles;
  }
  return stream;
}

function rankMaps(providers) {
  const byId = {};
  const byName = {};
  (providers || []).forEach(function (provider, index) {
    if (provider.id) byId[provider.id] = index;
    if (provider.name) byName[provider.name] = index;
  });
  return { byId: byId, byName: byName };
}

function rankOf(stream, ranks) {
  if (stream.providerId != null && ranks.byId[stream.providerId] != null) {
    return ranks.byId[stream.providerId];
  }
  if (stream.provider && ranks.byName[stream.provider] != null) {
    return ranks.byName[stream.provider];
  }
  return 1000;
}

// Best-first comparison with stable tie-breakers.
function compareStreams(a, b, ranks) {
  const ha = streamHeight(a);
  const hb = streamHeight(b);
  if (hb !== ha) return hb - ha;

  const la = util.languagePriority(a.language);
  const lb = util.languagePriority(b.language);
  if (lb !== la) return lb - la;

  const ra = rankOf(a, ranks);
  const rb = rankOf(b, ranks);
  if (ra !== rb) return ra - rb;

  const ua = String(a.url || '');
  const ub = String(b.url || '');
  if (ua < ub) return -1;
  if (ua > ub) return 1;
  return 0;
}

function finalizeStreams(streams, options) {
  const opts = options || {};
  const ranks = rankMaps(opts.providers || []);
  const includeDash = opts.includeDash !== false;

  const filtered = (streams || []).filter(function (stream) {
    if (!stream || !stream.url) return false;
    if (!includeDash && stream.type === 'dash') return false;
    return !util.isKnownBelowFloor(streamHeight(stream), opts.minQuality);
  });

  const deduped = util.dedupeStreams(filtered, function (a, b) {
    return compareStreams(a, b, ranks);
  });
  deduped.sort(function (a, b) {
    return compareStreams(a, b, ranks);
  });

  const limit = Number(opts.resultLimit) || 0;
  return limit > 0 && deduped.length > limit ? deduped.slice(0, limit) : deduped;
}

module.exports = {
  normalizeStream: normalizeStream,
  finalizeStreams: finalizeStreams,
  streamHeight: streamHeight,
  _test: {
    compareStreams: compareStreams,
    rankMaps: rankMaps,
  },
};
