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
    const meta = await http.withTimeout(ctx.metaPromise || Promise.resolve(ctx.meta || null), 6000, null);
    let imdbId = (meta && meta.imdbId) || ctx.imdbId || '';
    if (!imdbId && ctx.tmdbId) {
      imdbId = await tmdb.resolveImdbId(ctx.tmdbId, type, meta, ctx);
    }

    let pathId = '';
    if (imdbId) {
      pathId = 'tt' + String(imdbId).replace(/^tt/, '');
      if (type === 'tv' || type === 'series') {
        pathId += ':' + (Number(ctx.season) || 1) + ':' + (Number(ctx.episode) || 1);
      }
    } else if (ctx.tmdbId) {
      pathId = 'tmdb:' + ctx.tmdbId;
      if (type === 'tv' || type === 'series') {
        pathId += ':' + (Number(ctx.season) || 1) + ':' + (Number(ctx.episode) || 1);
      }
    }
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
        headers: { 'User-Agent': http.DEFAULT_UA },
      };
      if (seen[entry.url]) return;
      seen[entry.url] = true;
      out.push(entry);
    });
    ctx.log('hdhub: ' + out.length + ' streams');
    return out;
  },
};