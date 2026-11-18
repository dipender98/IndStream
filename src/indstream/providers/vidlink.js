'use strict';

const http = require('../http');
const util = require('../util');
const tmdb = require('../tmdb');

const ENCRYPT = 'https://enc-dec.app/api/enc-vidlink';
const ORIGIN = 'https://vidlink.pro';
const REFERER = ORIGIN + '/';
const UA = 'Mozilla/5.0 (Linux; Android 11; Mi 9T Pro) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/95.0.4638.69 Mobile Safari/537.36 EdgA/95.0.1020.48';

module.exports = {
  id: 'vidlink',
  name: 'VidLink',
  speed: 'very-fast',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 9000,
  toggle: {
    key: 'sourceVidlink',
    label: 'VidLink',
    description: 'Fast multi-quality source with subtitle tracks.',
  },

  async resolve(ctx) {
    const net = ctx.http || http;
    if (!ctx.tmdbId) await tmdb.awaitMeta(ctx);
    const id = String(ctx.tmdbId || '');
    if (!id) {
      ctx.log('vidlink: missing id, skipping');
      return [];
    }
    const deadline = ctx.deadline || (Date.now() + (Number(ctx.timeoutMs) || 15000));
    const encText = await net.getText(ENCRYPT + '?text=' + encodeURIComponent(id), {
      timeoutMs: 5000,
      deadline: deadline,
      headers: { 'User-Agent': UA },
    });
    const encoded = parseEncodedId(encText);
    if (!encoded) {
      ctx.log('vidlink: no encoded id from upstream');
      return [];
    }
    const type = ctx.type === 'tv' || ctx.type === 'series' ? 'tv' : 'movie';
    const path = type === 'tv'
      ? '/api/b/tv/' + encoded + '/' + (Number(ctx.season) || 1) + '/' + (Number(ctx.episode) || 1)
      : '/api/b/movie/' + encoded;
    const json = await net.getJson(ORIGIN + path, {
      timeoutMs: 7000,
      deadline: deadline,
      headers: { 'User-Agent': UA, Referer: REFERER, Origin: ORIGIN },
    });
    const out = toStreams(json);
    if (out.length) await tmdb.awaitMeta(ctx, 400);
    return out;
  },
};

function parseEncodedId(text) {
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return '';
  }
  const value = json && json.result;
  return typeof value === 'string' && value.length > 8 && value.length < 256 ? value : '';
}

function subtitlesOf(list) {
  const out = [];
  const seen = {};
  (Array.isArray(list) ? list : []).forEach(function (item) {
    if (!item || typeof item.url !== 'string' || item.url.indexOf('http') !== 0) return;
    const label = String(item.language || item.lang || item.name || '').trim();
    const lang = util.languageNames(label)[0] || label || item.url;
    if (seen[lang]) return;
    seen[lang] = true;
    out.push({ url: item.url, lang: lang, label: label || lang });
  });
  return out;
}

function toStreams(json) {
  const stream = json && json.stream;
  const qualities = stream && stream.qualities && typeof stream.qualities === 'object'
    ? stream.qualities
    : {};
  const subtitles = subtitlesOf(stream && stream.captions);
  const out = [];
  Object.keys(qualities).forEach(function (key) {
    const item = qualities[key];
    if (!item || typeof item.url !== 'string' || item.url.indexOf('http') !== 0) return;
    const height = util.parseHeight(key) || util.parseHeight(item.url);
    const type = item.type === 'm3u8' || /\.m3u8(?:[?#]|$)/i.test(item.url)
      ? 'hls'
      : item.type === 'dash' || /\.mpd(?:[?#]|$)/i.test(item.url) ? 'dash' : 'mp4';
    const headers = Object.assign({}, item.headers || {});
    headers['User-Agent'] = headers['User-Agent'] || UA;
    out.push({
      provider: module.exports.name,
      url: item.url,
      type: type,
      quality: util.qualityLabel(height),
      height: height,
      // Captions are subtitle evidence, not an audio track; never label them as audio.
      language: '',
      size: '',
      title: '',
      headers: headers,
      subtitles: subtitles,
    });
  });
  out.sort(function (a, b) { return b.height - a.height; });
  return out;
}

module.exports._test = {
  parseEncodedId: parseEncodedId,
  subtitlesOf: subtitlesOf,
  toStreams: toStreams,
};
