'use strict';

const http = require('../http');
const util = require('../util');
const tmdb = require('../tmdb');

const BASE = 'https://vidly.pro';

module.exports = {
  id: 'vidly',
  name: 'Vidly',
  speed: 'fast',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 5000,
  toggle: {
    key: 'sourceVidly',
    label: 'Vidly',
    description: 'Embed player exposing direct multi-audio HLS renditions.',
  },

  async resolve(ctx) {
    const net = ctx.http || http;
    const type = ctx.type;
    const season = Number(ctx.season) || 0;
    const episode = Number(ctx.episode) || 0;
    if (ctx.deadline && Date.now() >= ctx.deadline) return [];
    if (!ctx.tmdbId) await tmdb.awaitMeta(ctx);
    if (!ctx.tmdbId) {
      ctx.log('vidly: missing tmdb id, skipping');
      return [];
    }
    if (type === 'tv' && (season <= 0 || episode <= 0)) return [];

    const page = type === 'movie'
      ? BASE + '/embed/movie/' + ctx.tmdbId
      : BASE + '/embed/tv/' + ctx.tmdbId + '/' + season + '/' + episode;
    const html = await net.getText(page, {
      timeoutMs: Math.min(ctx.timeoutMs || 5000, 9000),
      headers: { Referer: BASE + '/', 'User-Agent': http.DEFAULT_UA },
    });
    if (!html) {
      ctx.log('vidly: embed page unreachable');
      return [];
    }
    const urls = vidlyStreamUrls(html);
    if (!urls.length) {
      ctx.log('vidly: no m3u8 in embed page');
      return [];
    }

    const deadline = ctx.deadline || Date.now() + (ctx.timeoutMs || 10000);
    const picked = urls.slice(0, 4);
    const results = await Promise.all(picked.map(function (url) {
      return net.getText(url, { timeoutMs: 4000, headers: { Referer: BASE + '/', 'User-Agent': http.DEFAULT_UA } })
        .then(function (text) { return { url: url, master: text || '' }; })
        .catch(function () { return { url: url, master: '' }; });
    }));

    const out = [];
    results.forEach(function (item) {
      if (Date.now() > deadline) return;
      const parsed = item.master ? util.parseHlsMaster(item.master) : null;
      const height = parsed ? parsed.height : 0;
      const lang = parsed && parsed.languages && parsed.languages.length ? parsed.languages.join(', ') : '';
      out.push({
        provider: module.exports.name,
        url: item.url,
        type: 'hls',
        quality: util.qualityLabel(height),
        height: height,
        language: lang,
        size: '',
        title: '',
        headers: { Referer: BASE + '/', 'User-Agent': http.DEFAULT_UA },
      });
    });
    if (out.length) await tmdb.awaitMeta(ctx, 400);
    return out;
  },
};

function vidlyStreamUrls(htmlText) {
  const text = String(htmlText || '')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003d/gi, '=')
    .replace(/\\u003f/gi, '?')
    .replace(/\\\//g, '/')
    .replace(/\\u003C/gi, '<')
    .replace(/\\u003E/gi, '>');
  const re = /https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/gi;
  const seen = {};
  const out = [];
  let match;
  while ((match = re.exec(text))) {
    const url = match[0].trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (seen[url]) continue;
    seen[url] = true;
    out.push(url);
  }
  return out;
}

module.exports._test = {
  vidlyStreamUrls: vidlyStreamUrls,
};
