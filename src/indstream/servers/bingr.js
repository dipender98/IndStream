'use strict';

const http = require('../http');
const util = require('../util');

const API = 'https://api.bingr.one/api/stream';
const REFERER = 'https://bingr.one/';
const SRVS = ['s40', 's70', 's80', 's81', 's62', 's63', 's30', 's60', 's61', 's31', 's3'];

module.exports = {
  id: 'bingr',
  name: 'Bingr',
  speed: 'very-fast',
  supports: { movie: true, tv: true },
  timeoutMs: 15000,

  async resolve(ctx) {
    const meta = await http.withTimeout(ctx.metaPromise || Promise.resolve(ctx.meta || null), 8000, null);
    const title = meta && meta.title ? meta.title : '';
    const year = meta && meta.year ? meta.year : '';
    const type = ctx.type;
    const id = String(ctx.tmdbId || '');
    if (!title || !id) return [];

    const postHeaders = {
      'Content-Type': 'application/json',
      Origin: 'https://bingr.one',
      Referer: REFERER,
      'User-Agent': http.DEFAULT_UA,
    };

    const out = [];
    const seen = {};
    const deadline = ctx.deadline || (Date.now() + ctx.timeoutMs);
    for (let i = 0; i < SRVS.length; i += 1) {
      const srv = SRVS[i];
      if (out.length >= 6 || Date.now() > deadline) break;
      const text =
        srv === 's40' && type === 'tv'
          ? await http.getText(API + '/aphelion-tv/' + id + '/' + (ctx.season || 1) + '/' + (ctx.episode || 1), {
              timeoutMs: 6000,
              headers: { Referer: REFERER },
            })
          : await http.postText(API, bingrBody(srv, type, id, title, year, ctx.season, ctx.episode), {
              timeoutMs: 6000,
              headers: postHeaders,
            });
      if (!text) continue;
      bingrSources(text).forEach(function (s) {
        if (seen[s.url]) return;
        seen[s.url] = true;
        const isDash = s.url.indexOf('.mpd') >= 0;
        const isHls = s.url.indexOf('.m3u8') >= 0;
        out.push({
          provider: module.exports.name,
          url: s.url,
          type: isDash ? 'dash' : isHls ? 'hls' : 'mp4',
          quality: util.qualityLabel(util.parseHeight(s.quality || s.label)),
          height: util.parseHeight(s.quality || s.label),
          language: s.language || '',
          size: '',
          title: '',
          headers: { Referer: REFERER, 'User-Agent': http.DEFAULT_UA },
        });
      });
    }
    return out;
  },
};

function bingrBody(srv, type, id, title, year, season, episode) {
  const query = { title: title, year: year };
  if (type === 'tv') {
    query.season = Number(season) || 1;
    query.episode = Number(episode) || 1;
  }
  return { srv: srv, t: type === 'tv' ? 'tv' : 'movie', id: id, query: query };
}

function bingrSources(jsonText) {
  let root = null;
  try {
    root = JSON.parse(jsonText);
  } catch (error) {
    return [];
  }
  const arr = root && Array.isArray(root.sources) ? root.sources : [];
  const out = [];
  arr.forEach(function (o) {
    if (!o || typeof o !== 'object') return;
    const url = o.url;
    if (!url || url.indexOf('http') !== 0) return;
    out.push({ url: url, quality: o.quality || '', label: o.label || '', language: o.language || '' });
  });
  return out;
}

module.exports._test = {
  bingrBody: bingrBody,
  bingrSources: bingrSources,
};
