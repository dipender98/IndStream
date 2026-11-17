'use strict';

const http = require('../http');
const util = require('../util');
const tmdb = require('../tmdb');

const BASE = 'https://net79.cc';
const PLAY_REFERER = 'https://videodownloader.site/';
const INDIAN_DUBS = ['Hindi', 'Tamil', 'Telugu', 'Malayalam', 'Kannada', 'Bengali', 'Punjabi', 'Gujarati', 'Marathi', 'Urdu'];

module.exports = {
  id: 'netmirror',
  name: 'NetMirror',
  speed: 'fast',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 5000,
  toggle: {
    key: 'sourceNetmirror',
    label: 'NetMirror',
    description: 'Mirror catalogue with native dub variants per title.',
  },

  async resolve(ctx) {
    const net = ctx.http || http;
    const type = ctx.type;
    const season = Number(ctx.season) || 0;
    const episode = Number(ctx.episode) || 0;
    if (type === 'tv' && (season <= 0 || episode <= 0)) return [];
    if (!ctx.tmdbId) await tmdb.awaitMeta(ctx);
    const id = String(ctx.tmdbId || '');
    if (!id) {
      ctx.log('netmirror: missing tmdb id, skipping');
      return [];
    }

    const embedPath = type === 'tv'
      ? '/api/embed-tmdb/' + id + '?type=tv&se=' + season + '&ep=' + episode
      : '/api/embed-tmdb/' + id + '?type=movie';
    const variantsPath = type === 'tv'
      ? '/api/variants-tmdb/tv/' + id + '?se=' + season + '&ep=' + episode
      : '/api/variants-tmdb/movie/' + id;
    const reqHeaders = { Referer: BASE + '/', 'User-Agent': http.DEFAULT_UA };

    const deadline = ctx.deadline || Date.now() + (ctx.timeoutMs || 10000);
    const pair = await Promise.all([
      net.getText(BASE + embedPath, { timeoutMs: 7000, headers: reqHeaders, deadline: deadline }),
      net.getText(BASE + variantsPath, { timeoutMs: 5000, headers: reqHeaders, deadline: deadline }),
    ]);
    const rootText = pair[0];
    const variantsText = pair[1];

    const out = [];
    const seen = {};
    const defaultRoot = parseJson(rootText);
    const captions = captionsOf(defaultRoot);

    const dubs = dubSpecs(variantsText);
    const dubResults = dubs.length
      ? await Promise.all(dubs.map(function (d) {
          const dubUrl = BASE + embedPath + '&dub=' + encodeURIComponent(d.sid) + '&dubdp=' + encodeURIComponent(d.dp);
          return net.getText(dubUrl, { timeoutMs: 4000, headers: reqHeaders, deadline: deadline })
            .then(function (text) { return streamsOf(parseJson(text), d.label); })
            .catch(function () { return []; });
        }))
      : [];

    const groups = [streamsOf(defaultRoot, '')].concat(dubResults);
    groups.forEach(function (items) {
      items.forEach(function (s) {
        const key = s.url.split('?')[0];
        const prev = seen[key];
        if (!prev) {
          seen[key] = s;
          return;
        }
        if (!prev.language && s.language) seen[key] = s;
      });
    });
    Object.keys(seen).forEach(function (key) {
      const s = seen[key];
      if (captions.length) s.subtitles = captions;
      s.provider = module.exports.name;
      s.headers = { Referer: PLAY_REFERER, 'User-Agent': http.DEFAULT_UA };
      out.push(s);
    });
    if (out.length) await tmdb.awaitMeta(ctx, 400);
    return out;
  },
};

function parseJson(text) {
  if (!text) return null;
  const t = String(text);
  if (t.indexOf('<') === 0 || t.indexOf('<meta') === 0) return null;
  try {
    return JSON.parse(t);
  } catch (error) {
    return null;
  }
}

function sizeLabel(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1024 * 1024 * 1024) return (n / (1024 * 1024 * 1024)).toFixed(2).replace(/\.?0+$/, '') + ' GB';
  return Math.round(n / (1024 * 1024)) + ' MB';
}

function streamsOf(root, label) {
  if (!root || root.ok !== true) return [];
  const out = [];
  const arr = Array.isArray(root.streams) ? root.streams : [];
  arr.forEach(function (o) {
    if (!o || typeof o !== 'object') return;
    const url = String(o.url || '');
    if (url.indexOf('http') !== 0) return;
    const height = Number(o.resolution) || 0;
    out.push({
      provider: 'NetMirror',
      url: url,
      type: url.indexOf('.m3u8') >= 0 ? 'hls' : 'mp4',
      quality: util.qualityLabel(height),
      height: height,
      language: label || '',
      size: sizeLabel(o.size),
      title: '',
    });
  });
  if (!out.length) {
    const mp4 = String(root.mp4 || '');
    if (mp4.indexOf('http') === 0) {
      const height = Number(root.resolution) || 0;
      out.push({
        provider: 'NetMirror',
        url: mp4,
        type: mp4.indexOf('.m3u8') >= 0 ? 'hls' : 'mp4',
        quality: util.qualityLabel(height),
        height: height,
        language: label || '',
        size: '',
        title: '',
      });
    }
  }
  return out;
}

function captionsOf(root) {
  if (!root || !Array.isArray(root.captions)) return [];
  const out = [];
  root.captions.forEach(function (c, index) {
    if (!c || typeof c !== 'object') return;
    const rel = String(c.url || '');
    if (!rel) return;
    const url = rel.indexOf('http') === 0 ? rel : BASE + (rel.charAt(0) === '/' ? rel : '/' + rel);
    out.push({
      id: 'netmirror-' + (c.lang || index),
      url: url,
      lang: String(c.lang || ''),
      label: String(c.name || c.lang || ''),
    });
  });
  return out.slice(0, 40);
}

function dubLabel(language, isOriginal) {
  if (isOriginal) return 'Original';
  const match = String(language || '').trim().match(/^(.*)\s+dub$/i);
  if (!match) return null;
  const langs = util.languageNames(match[1]);
  if (!langs.length) return null;
  return langs[0];
}

function dubSpecs(variantsText) {
  const root = parseJson(variantsText);
  const arr = root && Array.isArray(root.variants) ? root.variants : [];
  const picked = [];
  arr.forEach(function (v) {
    if (!v || typeof v !== 'object') return;
    const sid = String(v.dubSubjectId || '');
    const dp = String(v.detailPath || '');
    if (!sid || !dp) return;
    const label = dubLabel(v.language, v.isOriginal === true);
    if (!label || label === 'Default' || label === 'Original') return;
    picked.push({ sid: sid, dp: dp, label: label });
  });
  picked.sort(function (a, b) {
    const ai = INDIAN_DUBS.indexOf(a.label);
    const bi = INDIAN_DUBS.indexOf(b.label);
    const ar = ai < 0 ? INDIAN_DUBS.length : ai;
    const br = bi < 0 ? INDIAN_DUBS.length : bi;
    return ar - br;
  });
  const seen = {};
  const out = [];
  picked.forEach(function (p) {
    if (seen[p.sid] || out.length >= 4) return;
    seen[p.sid] = true;
    out.push(p);
  });
  return out;
}

module.exports._test = {
  parseJson: parseJson,
  streamsOf: streamsOf,
  captionsOf: captionsOf,
  dubLabel: dubLabel,
  dubSpecs: dubSpecs,
  sizeLabel: sizeLabel,
};
