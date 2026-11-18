'use strict';

const http = require('../http');
const util = require('../util');
const tmdb = require('../tmdb');

const ORIGIN = 'https://vidbolt.xyz';
const REFERER = ORIGIN + '/';
const SERVERS = ['orion', 'callisto', 'vega', 'quantum', 'quasar'];

module.exports = {
  id: 'vidbolt',
  name: 'VidBolt',
  speed: 'fast',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 12000,
  toggle: {
    key: 'sourceVidbolt',
    label: 'VidBolt',
    description: 'HLS sources with inline manifests and multi-language audio.',
  },

  async resolve(ctx) {
    const net = ctx.http || http;
    if (!ctx.tmdbId) await tmdb.awaitMeta(ctx);
    const id = String(ctx.tmdbId || '');
    if (!id) {
      ctx.log('vidbolt: missing id, skipping');
      return [];
    }
    const type = ctx.type;
    const deadline = ctx.deadline || (Date.now() + (Number(ctx.timeoutMs) || 15000));
    const headers = { Referer: REFERER, Origin: ORIGIN };

    async function fetchSources(only) {
      if (Date.now() >= deadline) return '';
      return net.getText(buildUrl(type, id, ctx.season, ctx.episode, only), {
        timeoutMs: only ? 4500 : 6000,
        deadline: deadline,
        headers: headers,
      });
    }

    let texts = [];
    const first = await fetchSources('');
    if (hasUsableSource(first)) texts.push(first);
    if (!texts.length) {
      const more = await http.parallelMap(SERVERS, 3, function (server) {
        return fetchSources(server);
      });
      texts = (more || []).filter(hasUsableSource);
    }

    const out = [];
    const seen = {};
    texts.forEach(function (text) {
      vidboltSources(text).forEach(function (source) {
        if (seen[source.url]) return;
        seen[source.url] = true;
        const stream = toStream(source);
        if (stream) out.push(stream);
      });
    });
    if (out.length) await tmdb.awaitMeta(ctx, 400);
    return out;
  },
};

function buildUrl(type, id, season, episode, only) {
  let url = ORIGIN + '/api/resolve?type=' + (type === 'tv' || type === 'series' ? 'tv' : 'movie') + '&id=' + encodeURIComponent(id);
  if (type === 'tv' || type === 'series') {
    url += '&season=' + (Number(season) || 1) + '&episode=' + (Number(episode) || 1);
  }
  if (only) url += '&only=' + encodeURIComponent(only);
  return url;
}

function hasUsableSource(text) {
  const arr = vidboltSources(text);
  if (!arr.length) return false;
  return arr.some(function (source) {
    const height = toStream(source).height;
    return !height || height >= 720;
  });
}

function vidboltSources(jsonText) {
  let root = null;
  try {
    root = JSON.parse(jsonText);
  } catch (error) {
    return [];
  }
  const stream = root && root.stream;
  const arr = stream && Array.isArray(stream.sources) ? stream.sources : [];
  const out = [];
  arr.forEach(function (item) {
    if (!item || typeof item !== 'object') return;
    const url = String(item.url || '').trim();
    if (url.indexOf('http') !== 0) return;
    out.push({
      url: url,
      kind: String(item.kind || ''),
      quality: String(item.quality || ''),
      language: String(item.language || ''),
      label: String(item.label || ''),
      master: String(item.master || ''),
    });
  });
  return out;
}

function toStream(source) {
  const url = source.url;
  const isDash = source.kind === 'dash' || /\.mpd(?:[?#]|$)/i.test(url);
  const isHls = source.kind === 'hls' || /\.m3u8(?:[?#]|$)/i.test(url);
  const master = source.master && /#EXTM3U|<MPD/i.test(source.master) ? source.master : '';
  const parsed = master && /#EXTM3U/i.test(master) ? util.parseHlsMaster(master) : null;
  const height = util.parseHeight(source.quality || source.label) || (parsed ? parsed.height : 0);
  const declared = /sub/i.test(source.language) ? '' : source.language;
  let names = util.languageNames(declared);
  if (!names.length && parsed && parsed.languages.length) names = parsed.languages;
  return {
    provider: module.exports.name,
    url: url,
    type: isDash ? 'dash' : isHls ? 'hls' : 'mp4',
    quality: util.qualityLabel(height),
    height: height,
    language: names.join(', ') || util.languageLabel(declared),
    size: '',
    title: source.label || '',
    headers: { Referer: REFERER, 'User-Agent': http.DEFAULT_UA },
  };
}

module.exports._test = {
  buildUrl: buildUrl,
  vidboltSources: vidboltSources,
  toStream: toStream,
};
