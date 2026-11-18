'use strict';

const http = require('../http');
const util = require('../util');
const tmdb = require('../tmdb');

const API = 'https://api.bingr.one/api/stream';
const ORIGIN = 'https://bingr.one';
const REFERER = ORIGIN + '/';
const SRVS = ['s40', 's70', 's80', 's81', 's62', 's63', 's30', 's60', 's61', 's31', 's3'];
const CONCURRENCY = 3;
const REQUEST_MS = 4000;
const MAX_STREAMS = 6;

module.exports = {
  id: 'bingr',
  name: 'Bingr',
  speed: 'very-fast',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 5000,
  toggle: {
    key: 'sourceBingr',
    label: 'Bingr',
    description: 'Multi-server JSON API. Usually the fastest source.',
  },

  async resolve(ctx) {
    const net = ctx.http || http;
    if (!ctx.tmdbId) await tmdb.awaitMeta(ctx);
    const meta = ctx.meta || null;
    const title = meta && meta.title ? meta.title : '';
    const year = meta && meta.year ? meta.year : '';
    const type = ctx.type;
    const id = String(ctx.tmdbId || '');
    if (!id) {
      ctx.log('bingr: missing id, skipping');
      return [];
    }

    const postHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      Origin: ORIGIN,
      Referer: REFERER,
      'User-Agent': http.DEFAULT_UA,
    };
    const getHeaders = {
      Accept: 'application/json, text/plain, */*',
      Origin: ORIGIN,
      Referer: REFERER,
      'User-Agent': http.DEFAULT_UA,
    };

    const deadline = ctx.deadline || (Date.now() + (Number(ctx.timeoutMs) || 15000));
    const results = await http.parallelMap(SRVS, CONCURRENCY, async function (srv) {
      if (Date.now() >= deadline) return { srv: srv, res: null };
      const aphelion = srv === 's40' && type === 'tv';
      const url = aphelion
        ? API + '/aphelion-tv/' + id + '/' + (Number(ctx.season) || 1) + '/' + (Number(ctx.episode) || 1)
        : API;
      const options = {
        timeoutMs: REQUEST_MS,
        deadline: deadline,
        headers: aphelion ? getHeaders : postHeaders,
      };
      if (!aphelion) {
        options.method = 'POST';
        options.body = JSON.stringify(bingrBody(srv, type, id, title, year, ctx.season, ctx.episode));
      }
      const res = await net.request(url, options);
      return { srv: srv, res: res };
    });

    const out = [];
    const seen = {};
    let blocked = 0;
    for (let i = 0; i < results.length && out.length < MAX_STREAMS; i += 1) {
      const entry = results[i];
      const res = entry && entry.res;
      if (!res) continue;
      if (isBlockedResponse(res) || isChallengeHtml(res.text)) {
        blocked += 1;
        ctx.log('bingr: ' + entry.srv + ' blocked (' + (res.status || 'challenge') + ')');
        continue;
      }
      bingrSources(res.text).forEach(function (s) {
        if (out.length >= MAX_STREAMS || seen[s.url]) return;
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
    if (blocked === SRVS.length) ctx.log('bingr: upstream blocked every server; try again later');
    if (out.length) await tmdb.awaitMeta(ctx, 400);
    return out;
  },
};

function bingrBody(srv, type, id, title, year, season, episode) {
  const query = {};
  if (title) query.title = title;
  if (year) query.year = year;
  if (type === 'tv') {
    query.season = Number(season) || 1;
    query.episode = Number(episode) || 1;
  }
  return { srv: srv, t: type === 'tv' ? 'tv' : 'movie', id: id, query: query };
}

function isBlockedResponse(res) {
  if (!res) return false;
  return res.status === 403 || res.status === 429 || res.status === 503;
}

function isChallengeHtml(text) {
  const t = String(text || '');
  if (!t) return false;
  return t.indexOf('<!DOCTYPE') >= 0 || t.indexOf('<html') >= 0 || t.indexOf('Attention Required') >= 0 || t.indexOf('Just a moment') >= 0;
}

function bingrSources(jsonText) {
  if (isChallengeHtml(jsonText)) return [];
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
  isChallengeHtml: isChallengeHtml,
  isBlockedResponse: isBlockedResponse,
};
