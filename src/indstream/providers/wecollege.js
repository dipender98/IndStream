'use strict';

const http = require('../http');
const util = require('../util');
const tmdb = require('../tmdb');

const BASE = 'https://api.wecollege.net';
const GOLDEN = 0x9e3779b9 | 0;
const MAGIC = [109, 118, 109, 49];
const LANGS = [
  'hindi', 'tamil', 'telugu', 'english', 'spanish', 'french', 'german',
  'italian', 'portuguese', 'korean', 'japanese', 'malayalam', 'kannada',
];

function u32(value) {
  return value >>> 0;
}

function fmix(input) {
  let h = input | 0;
  h = h ^ (h >>> 16);
  h = Math.imul(h, 0x85ebca6b);
  h = h ^ (h >>> 13);
  h = Math.imul(h, 0xc2b2ae35);
  h = h ^ (h >>> 16);
  return h | 0;
}

function rotl(value, amount) {
  const n = amount & 31;
  return n === 0 ? value | 0 : ((value << n) | (value >>> (32 - n))) | 0;
}

function keyedFnV(value) {
  let hash = 0x811c9dc5 | 0;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x1000193);
  }
  return fmix(hash);
}

function initKeystream(seed, mediaId) {
  const table = new Map();
  let n = fmix(keyedFnV(seed) ^ fmix((mediaId ^ GOLDEN) | 0));
  for (let i = 0; i < 8; i += 1) {
    const slot = u32(n) % 61;
    n = rotl((n + GOLDEN) | 0, 7 + (7 & i));
    table.set(slot, n ^ fmix(n));
    n = fmix((n + slot) | 0);
  }
  return { table: table, acc: fmix((0xa5a5a5a5 ^ n) | 0) };
}

function nextWord(ks, counter) {
  const slot = u32(ks.acc) % 61;
  const present = ks.table.has(slot);
  const r = present ? ks.table.get(slot) : 0;
  const mixed = (r ^ Math.imul(GOLDEN, counter + 1)) | 0;
  const b = ((ks.acc ^ mixed) | (ks.acc & mixed & (present ? -1 : 0))) | 0;
  const next = fmix(((rotl((b + ks.acc) | 0, 31 & slot) ^ rotl(ks.acc, 31 & (slot * 7))) + GOLDEN) | 0);
  ks.table.set(slot, next);
  ks.acc = next;
  return next;
}

function decodeBytes(payload) {
  let text = String(payload || '').trim().replace(/-/g, '+').replace(/_/g, '/');
  text = util.b64decode(text);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 255;
  return bytes;
}

function utf8(bytes) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  let text = '';
  for (let i = 0; i < bytes.length; i += 1) text += String.fromCharCode(bytes[i]);
  return text;
}

function decrypt(payload, seed, mediaId) {
  try {
    const cipher = decodeBytes(payload);
    const ks = initKeystream(seed, mediaId | 0);
    const key = new Uint8Array(cipher.length);
    let counter = 0;
    let i = 0;
    while (i < cipher.length) {
      const word = nextWord(ks, counter++);
      if (i < cipher.length) key[i++] = word & 255;
      if (i < cipher.length) key[i++] = (word >>> 8) & 255;
      if (i < cipher.length) key[i++] = (word >>> 16) & 255;
      if (i < cipher.length) key[i++] = (word >>> 24) & 255;
    }
    for (let j = 0; j < MAGIC.length; j += 1) {
      if (j >= cipher.length || (cipher[j] ^ key[j]) !== MAGIC[j]) return '';
    }
    const plain = new Uint8Array(cipher.length - MAGIC.length);
    for (let j = MAGIC.length; j < cipher.length; j += 1) plain[j - MAGIC.length] = cipher[j] ^ key[j];
    return utf8(plain);
  } catch (error) {
    return '';
  }
}

function sources(plainText) {
  let root = null;
  try {
    root = JSON.parse(plainText);
  } catch (error) {
    return [];
  }
  const arr = root && Array.isArray(root.sources) ? root.sources : [];
  const out = [];
  arr.forEach(function (item) {
    if (!item || typeof item.url !== 'string' || item.url.indexOf('http') !== 0) return;
    out.push({
      url: item.url,
      quality: String(item.quality || ''),
      language: String(item.language || item.audio || item.lang || item.audioLanguage || ''),
    });
  });
  return out;
}

function doubleEncode(value) {
  const once = encodeURIComponent(String(value == null ? '' : value)).replace(/\+/g, '%20');
  return encodeURIComponent(once).replace(/\+/g, '%20');
}

function buildQuery(params, seed) {
  const parts = params.map(function (pair) {
    return pair[0] + '=' + pair[1];
  });
  parts.push('enc=2');
  parts.push('seed=' + encodeURIComponent(seed));
  return parts.join('&');
}

function createProvider(options) {
  const config = options || {};
  const id = config.id;
  const lanes = Array.isArray(config.lanes) ? config.lanes : [];
  const referer = config.referer || '';
  const origin = referer.replace(/\/+$/, '');
  const providerHeaders = {
    Referer: referer,
    Origin: origin,
  };

  return {
    id: id,
    name: config.name,
    speed: config.speed || 'fast',
    supports: { movie: true, tv: true },
    raceTimeoutMs: Number(config.raceTimeoutMs) || 15000,
    toggle: config.toggle,

    async resolve(ctx) {
      const net = ctx.http || http;
      if (!ctx.tmdbId) await tmdb.awaitMeta(ctx);
      const numericId = Number(ctx.tmdbId) || 0;
      const mediaId = String(ctx.tmdbId || '');
      const type = ctx.type === 'tv' || ctx.type === 'series' ? 'tv' : 'movie';
      const season = Number(ctx.season) || 1;
      const episode = Number(ctx.episode) || 1;
      if (!mediaId || (type === 'tv' && (!ctx.season || !ctx.episode))) {
        ctx.log(id + ': missing id or episode, skipping');
        return [];
      }
      const deadline = ctx.deadline || (Date.now() + (Number(ctx.timeoutMs) || 15000));
      const headers = Object.assign({ 'User-Agent': http.DEFAULT_UA }, providerHeaders);

      const seedText = await net.getText(BASE + '/seed?mediaId=' + encodeURIComponent(mediaId), {
        timeoutMs: 5000,
        deadline: deadline,
        headers: headers,
      });
      let seed = '';
      try {
        seed = (JSON.parse(seedText || '{}').seed || '').trim();
      } catch (error) {
        seed = '';
      }
      if (!seed) {
        ctx.log(id + ': no seed from upstream');
        return [];
      }

      const meta = ctx.meta || null;
      const query = buildQuery([
        ['title', doubleEncode(meta && meta.title ? meta.title : '')],
        ['mediaType', type],
        ['year', meta && meta.year ? meta.year : ''],
        ['totalSeasons', String((meta && meta.seasons) || 1)],
        ['seasonId', String(type === 'tv' ? season : 1)],
        ['episodeId', String(type === 'tv' ? episode : 1)],
        ['tmdbId', mediaId],
        ['imdbId', meta && meta.imdbId ? meta.imdbId : ''],
      ], seed);

      const texts = await http.parallelMap(lanes, 6, async function (lane) {
        if (Date.now() >= deadline) return '';
        const cipher = await net.getText(BASE + '/' + lane + '/sources?' + query, {
          timeoutMs: 4500,
          deadline: deadline,
          headers: headers,
        });
        return cipher ? decrypt(cipher, seed, numericId) : '';
      });

      const out = [];
      const seen = {};
      (texts || []).forEach(function (plain) {
        if (!plain) return;
        sources(plain).forEach(function (source) {
          if (seen[source.url] || out.length >= 8) return;
          seen[source.url] = true;
          const isDash = /\.mpd(?:[?#]|$)/i.test(source.url);
          const isHls = /\.m3u8(?:[?#]|$)/i.test(source.url);
          const height = util.parseHeight(source.quality);
          out.push({
            provider: config.name,
            url: source.url,
            type: isDash ? 'dash' : isHls ? 'hls' : 'mp4',
            quality: util.qualityLabel(height),
            height: height,
            language: util.languageNames(source.language).join(', ') ||
              (LANGS.indexOf(source.quality.trim().toLowerCase()) >= 0
                ? util.languageLabel(source.quality)
                : ''),
            size: '',
            title: '',
            headers: Object.assign({ 'User-Agent': http.DEFAULT_UA }, providerHeaders),
          });
        });
      });
      if (out.length) await tmdb.awaitMeta(ctx, 400);
      return out;
    },

    _test: {
      decrypt: decrypt,
      sources: sources,
      doubleEncode: doubleEncode,
      buildQuery: buildQuery,
      lanes: lanes,
      referer: referer,
    },
  };
}

module.exports = {
  createProvider: createProvider,
  decrypt: decrypt,
  sources: sources,
  doubleEncode: doubleEncode,
  buildQuery: buildQuery,
};
