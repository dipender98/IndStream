'use strict';

const http = require('../http');
const util = require('../util');
const tmdb = require('../tmdb');

const BASE = 'https://hdhub.thevolecitor.qzz.io';

module.exports = {
  id: 'hdhub',
  name: 'HdHub',
  speed: 'very-fast',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 5000,
  toggle: {
    key: 'sourceHdhub',
    label: 'HdHub',
    description: 'Fast aggregator: instant HLS streams plus 4K file links.',
  },

  async resolve(ctx) {
    const net = ctx.http || http;
    const type = ctx.type;
    const pathId = await streamPath(ctx);
    if (!pathId) return [];

    const kind = type === 'tv' || type === 'series' ? 'series' : 'movie';
    const url = BASE + '/stream/' + kind + '/' + pathId + '.json';
    const json = await net.getJson(url, { timeoutMs: ctx.timeoutMs });
    if (!json || !Array.isArray(json.streams)) return [];

    const out = [];
    const seen = {};
    json.streams.forEach(function (s) {
      if (!s || !s.url) return;
      const name = String(s.name || '');
      if (/donation|discord/i.test(name)) return;
      if (/hubdrive\.bar/i.test(s.url)) return;

      const desc = String(s.description || s.title || '');
      const height = util.parseHeight(name + ' ' + desc);
      const language = util.languageLabel(desc) || util.languageLabel(name) || '';
      const size = util.normalizeSizeToken(desc);
      const isHls = /m3u8/i.test(s.url) || /resolve\/cj/i.test(s.url) || /googleusercontent/i.test(s.url);
      const entry = {
        provider: module.exports.name,
        url: s.url,
        type: isHls ? 'hls' : 'mp4',
        quality: util.qualityLabel(height),
        height: height,
        language: language,
        size: size,
        title: '',
        releaseText: desc.slice(0, 300),
        headers: { 'User-Agent': http.DEFAULT_UA },
      };
      if (seen[entry.url]) return;
      seen[entry.url] = true;
      out.push(entry);
    });
    if (out.length) await tmdb.awaitMeta(ctx, 400);
    ctx.log('hdhub: ' + out.length + ' streams');
    return out;
  },
};

async function streamPath(ctx) {
  let id = '';
  if (ctx.imdbId) {
    id = 'tt' + String(ctx.imdbId).replace(/^tt/i, '');
  } else if (ctx.tmdbId) {
    id = 'tmdb:' + ctx.tmdbId;
  } else {
    const meta = await tmdb.awaitMeta(ctx, 1000);
    const imdbId = (meta && meta.imdbId) || ctx.imdbId || '';
    if (imdbId) id = 'tt' + String(imdbId).replace(/^tt/i, '');
    else if (meta && meta.id) id = 'tmdb:' + meta.id;
  }
  if (!id) return '';
  if (ctx.type === 'tv' || ctx.type === 'series') {
    id += ':' + (Number(ctx.season) || 1) + ':' + (Number(ctx.episode) || 1);
  }
  return id;
}

module.exports._test = {
  streamPath: streamPath,
};
