'use strict';

const http = require('../http');
const util = require('../util');

const BASE = 'https://embed.vidrift.net';

module.exports = {
  id: 'vidrift',
  name: 'Vidrift',
  speed: 'fast',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 5000,
  toggle: {
    key: 'sourceVidrift',
    label: 'Vidrift',
    description: 'Embed player with direct HLS/MP4 links.',
  },

  async resolve(ctx) {
    const net = ctx.http || http;
    const type = ctx.type;
    const season = Number(ctx.season) || 0;
    const episode = Number(ctx.episode) || 0;
    if (ctx.deadline && Date.now() >= ctx.deadline) return [];
    if (!ctx.tmdbId) {
      ctx.log('vidrift: missing tmdb id, skipping');
      return [];
    }
    if (type === 'tv' && (season <= 0 || episode <= 0)) return [];

    const page = type === 'movie' ? BASE + '/embed/movie/' + ctx.tmdbId : BASE + '/embed/tv/' + ctx.tmdbId + '/' + season + '/' + episode;
    const html = await net.getText(page, {
      timeoutMs: ctx.timeoutMs,
      headers: { Referer: BASE + '/' },
    });
    if (!html) {
      ctx.log('vidrift: embed page unreachable (' + page + ')');
      return [];
    }

    const out = [];
    vidriftStreams(html).forEach(function (pair) {
      const rel = pair[0];
      const label = pair[1];
      const abs = /^https?:/i.test(rel) ? rel : BASE + (rel.charAt(0) === '/' ? rel : '/' + rel);
      out.push({
        provider: module.exports.name,
        url: abs,
        type: abs.indexOf('.m3u8') >= 0 ? 'hls' : 'mp4',
        quality: '',
        height: 0,
        language: label || '',
        size: '',
        title: '',
        headers: { 'User-Agent': http.DEFAULT_UA, Referer: BASE + '/' },
      });
    });
    if (!out.length) {
      if (html.indexOf('embedMeta') >= 0) ctx.log('vidrift: embedMeta present but no usable stream urls');
      else if (html.indexOf('iframe') >= 0 || html.indexOf('Embed this page') >= 0) ctx.log('vidrift: embed gated (iframe wall)');
      else ctx.log('vidrift: no embedMeta in page');
    }
    return out;
  },
};

function vidriftStreams(html) {
  const mi = html.indexOf('var embedMeta');
  const brace = mi >= 0 ? html.indexOf('{', mi) : -1;
  const json = brace >= 0 ? util.extractBalancedJson(html, brace) : '';
  let meta = null;
  try {
    meta = json ? JSON.parse(json) : null;
  } catch (error) {
    meta = null;
  }
  if (!meta) return [];

  const out = [];
  const arr = meta.orionStreams;
  if (Array.isArray(arr)) {
    arr.forEach(function (o) {
      if (!o || typeof o !== 'object') return;
      const u = o.url;
      if (!u || (u.indexOf('.m3u8') < 0 && u.indexOf('.mp4') < 0)) return;
      out.push([u, vidriftLabel(o.name)]);
    });
  }
  if (!out.length && meta.evionUrl && meta.evionUrl.indexOf('.m3u8') >= 0) {
    out.push([meta.evionUrl, '']);
  }
  return out;
}

function vidriftLabel(name) {
  const text = String(name || '');
  const tokens = text.split(/[^A-Za-z]+/).filter(Boolean);
  const last = tokens[tokens.length - 1] || '';
  const lower = last.toLowerCase();
  const known = ['hindi', 'tamil', 'telugu', 'english', 'kannada', 'malayalam', 'bengali', 'marathi', 'punjabi', 'original'];
  if (known.indexOf(lower) < 0) return '';
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

module.exports._test = {
  vidriftStreams: vidriftStreams,
  vidriftLabel: vidriftLabel,
};
