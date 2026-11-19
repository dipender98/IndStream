'use strict';

const http = require('../http');
const util = require('../util');
const tmdb = require('../tmdb');

const BASE = 'https://hdhub.thevolecitor.qzz.io';

// These hosts serve HTML file pages, not media; the player cannot use them.
const FILE_PAGE_RE = /(?:^|\/\/)(?:[^/]+\.)?(?:hubdrive|hubcloud|hubcdn|gdrive)[^/]*\.[a-z]{2,}(?:\/|\?|$)/i;

// The addon tags each release with the catalog it came from as the trailing
// "Host | Source" token; release group tags can point somewhere else.
function sourceOf(text) {
  const value = String(text || '').trim();
  const tail = value.match(/\|\s*(4KHDHub|HdHub(?:4u)?)\s*$/i);
  if (tail) return /4khd/i.test(tail[1]) ? '4KHDHub' : 'HdHub4u';
  return /4khd\s*hub/i.test(value) ? '4KHDHub' : 'HdHub4u';
}

// Release titles declare audio names; codecs, subtitles and file extensions can
// look like language codes, so accept full names and unambiguous 3-letter codes only.
function audioLabel(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return '';
  if (/^(?:original|orig|org|default)$/i.test(text)) return 'Original';
  const lower = text.toLowerCase();
  const names = [];
  const push = function (name) {
    if (name && names.indexOf(name) < 0) names.push(name);
  };
  util.languageNames(text).forEach(function (name) {
    if (new RegExp('(?:^|[^a-z])' + name.toLowerCase() + '(?:[^a-z]|$)').test(lower)) push(name);
  });
  text.split(/[\s+,&/|.:;_()\[\]{}-]+/).forEach(function (token) {
    if (token.length !== 3) return;
    const resolved = util.languageNames(token);
    if (resolved.length === 1) push(resolved[0]);
  });
  if (names.length) return names.join(', ');
  if (/\b(?:multi|dual|both)(?:\s*-?\s*audio)?\b/i.test(text)) return 'Multi';
  return '';
}

module.exports = {
  id: 'hdhub',
  name: 'HdHub4u',
  speed: 'very-fast',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 5000,
  toggle: {
    key: 'sourceHdhub',
    label: 'HdHub4u',
    description: 'Addon aggregating HdHub4u and 4KHDHub release pages. Streams are tagged with their actual source.',
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
    const seenUrl = {};
    const seenMeta = {};
    const seenFile = {};
    json.streams.forEach(function (s) {
      if (!s || !s.url) return;
      const name = String(s.name || '');
      if (/donation|discord/i.test(name)) return;
      if (FILE_PAGE_RE.test(s.url)) return;

      const desc = String(s.description || s.title || '');
      const height = util.parseHeight(name + ' ' + desc);
      const language = audioLabel(desc) || audioLabel(name);
      const size = util.normalizeSizeToken(desc);
      const isHls = /m3u8/i.test(s.url) || /resolve\/cj/i.test(s.url);

      const path = String(s.url).split('#')[0].split('?')[0];
      const file = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
      const metaKey = height > 0 && size ? height + '|' + size + '|' + language : '';
      if (seenUrl[s.url] || (file && seenFile[file]) || (metaKey && seenMeta[metaKey])) {
        if (file) seenFile[file] = true;
        return;
      }
      seenUrl[s.url] = true;
      if (file) seenFile[file] = true;
      if (metaKey) seenMeta[metaKey] = true;

      out.push({
        provider: sourceOf(name + ' ' + desc),
        url: s.url,
        type: isHls ? 'hls' : 'mp4',
        quality: util.qualityLabel(height),
        height: height,
        language: language,
        size: size,
        title: '',
        releaseText: desc.slice(0, 300),
        headers: { 'User-Agent': http.DEFAULT_UA },
      });
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
  audioLabel: audioLabel,
  sourceOf: sourceOf,
  isFilePage: function (url) { return FILE_PAGE_RE.test(String(url || '')); },
};
