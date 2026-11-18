'use strict';

const util = require('./util');
const styles = require('./styles');
const settings = require('./settings');

const FLOOR = 720;

function streamHeight(stream) {
  if (!stream) return 0;
  return Number(stream.height) || util.parseHeight(stream.quality);
}

function qualityBucket(stream) {
  const height = streamHeight(stream);
  if (height <= 0) return 'unknown';
  if (height < FLOOR) return 'below';
  if (height >= 2160) return '2160';
  if (height === 1440) return '1440';
  if (height === 1080) return '1080';
  if (height === 720) return '720';
  return 'auto';
}

function resolveQualityOrder(options) {
  const opts = options || {};
  if (Array.isArray(opts.qualityOrder)) {
    const order = opts.qualityOrder.filter(function (key, index) {
      return settings.QUALITY_KEYS.indexOf(key) >= 0 && opts.qualityOrder.indexOf(key) === index;
    });
    if (order.length) return order;
  }
  if (String(opts.minQuality) === '1080') {
    return settings.DEFAULT_QUALITY_ORDER.filter(function (key) { return key !== '720' && key !== 'auto'; });
  }
  return settings.DEFAULT_QUALITY_ORDER.slice();
}

function normalizeStream(raw, provider, ctx) {
  if (!raw || !raw.url) return null;
  const url = String(raw.url);
  const type = raw.type || (url.indexOf('.m3u8') >= 0 ? 'hls' : url.indexOf('.mpd') >= 0 ? 'dash' : 'mp4');
  const declaredHeight = Number(raw.height) || 0;
  const quality = raw.quality || util.qualityLabel(declaredHeight);
  const height = declaredHeight || util.parseHeight(quality);
  const style = (ctx && ctx.settings && ctx.settings.streamStyle) || styles.DEFAULT_STYLE;
  const rendered = styles.renderNameTitle(provider, raw, ctx, style);
  const stream = {
    title: rendered.title,
    name: rendered.name,
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

function qualityRankMap(order) {
  const ranks = {};
  (order || []).forEach(function (key, index) { ranks[key] = index; });
  return ranks;
}

// Quality preference first, then the stable best-first tie-breakers.
function compareStreams(a, b, ranks, qualityRanks) {
  const qa = qualityRanks[qualityBucket(a)];
  const qb = qualityRanks[qualityBucket(b)];
  const ra = qa == null ? 999 : qa;
  const rb = qb == null ? 999 : qb;
  if (ra !== rb) return ra - rb;

  const ha = streamHeight(a);
  const hb = streamHeight(b);
  if (hb !== ha) return hb - ha;

  const la = util.languagePriority(a.language);
  const lb = util.languagePriority(b.language);
  if (lb !== la) return lb - la;

  const pa = rankOf(a, ranks);
  const pb = rankOf(b, ranks);
  if (pa !== pb) return pa - pb;

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
  const qualityOrder = resolveQualityOrder(opts);
  const qualityRanks = qualityRankMap(qualityOrder);

  const filtered = (streams || []).filter(function (stream) {
    if (!stream || !stream.url) return false;
    if (!/^https?:\/\//i.test(stream.url)) return false;
    if (util.isJunkStreamUrl(stream.url)) return false;
    if (!includeDash && stream.type === 'dash') return false;
    if (util.isKnownBelowFloor(streamHeight(stream), FLOOR)) return false;
    return qualityRanks[qualityBucket(stream)] != null;
  });

  const compare = function (a, b) {
    return compareStreams(a, b, ranks, qualityRanks);
  };

  const deduped = util.dedupeStreams(filtered, compare);
  deduped.sort(compare);

  const limit = Number(opts.resultLimit) || 0;
  return limit > 0 && deduped.length > limit ? deduped.slice(0, limit) : deduped;
}

module.exports = {
  normalizeStream: normalizeStream,
  finalizeStreams: finalizeStreams,
  streamHeight: streamHeight,
  qualityBucket: qualityBucket,
  _test: {
    compareStreams: compareStreams,
    rankMaps: rankMaps,
    qualityRankMap: qualityRankMap,
  },
};
