'use strict';

const crypto = require('crypto');
const http = require('../http');
const util = require('../util');
const tmdb = require('../tmdb');

const BASE = 'https://stream.hls.lol';
const REFERER = 'https://atlantic.st/';
const FALLBACK_KEY_HEX = '55060a042823f51a94c296894a58a0db15f3baef807155140983083fa799ef47';
const HLS_PROVIDERS = ['vidbox', 'q62', 'moscow'];

module.exports = {
  id: 'atlantic',
  name: 'Atlantic',
  speed: 'very-fast',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 5000,
  toggle: {
    key: 'sourceAtlantic',
    label: 'Atlantic',
    description: 'CDN orchestrated HLS/DASH with multi-audio renditions.',
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
      ctx.log('atlantic: missing tmdb id, skipping');
      return [];
    }

    const query = type === 'tv'
      ? '?tmdbId=' + id + '&type=tv&seasonId=' + season + '&episodeId=' + episode
      : '?tmdbId=' + id + '&type=movie';
    const headers = { Referer: REFERER, 'User-Agent': http.DEFAULT_UA };
    const deadline = ctx.deadline || Date.now() + (ctx.timeoutMs || 10000);

    const out = [];
    const seen = {};
    let subtitles = [];

    const jsonTargets = HLS_PROVIDERS.concat(['mbox']);
    const allJsons = await Promise.all(jsonTargets.map(function (provider) {
      if (Date.now() >= deadline - 200) return Promise.resolve(null);
      return net.getJson(BASE + '/' + provider + query, { timeoutMs: 6000, headers: headers }).catch(function () { return null; });
    }));
    const hlsJsons = allJsons.slice(0, HLS_PROVIDERS.length);
    const mboxJson = allJsons[allJsons.length - 1];

    for (let i = 0; i < HLS_PROVIDERS.length; i += 1) {
      const provider = HLS_PROVIDERS[i];
      const json = hlsJsons[i];
      if (!json) continue;
      const pick = bestHlsSource(json);
      if (!pick) continue;
      let masterLang = '';
      let height = pick.height || 0;
      if (Date.now() < deadline - 400) {
        const masterText = await net.getText(pick.url, { timeoutMs: 5000, headers: headers });
        const parsed = masterText ? util.parseHlsMaster(masterText) : null;
        if (parsed) {
          if (parsed.height > height) height = parsed.height;
          if (parsed.languages && parsed.languages.length) masterLang = parsed.languages.join(', ');
        }
      }
      const stream = {
        provider: module.exports.name,
        url: pick.url,
        type: 'hls',
        quality: util.qualityLabel(height),
        height: height,
        language: pick.language || masterLang || '',
        size: '',
        title: '',
        headers: { Referer: REFERER, 'User-Agent': http.DEFAULT_UA },
      };
      seen[stream.url.split('?')[0]] = stream;
      out.push(stream);
      subtitles = subtitles.concat(subtitlesOf(json, provider));
      break;
    }

    if (mboxJson) {
      mboxTracks(mboxJson).forEach(function (track) {
        if (out.length >= 6) return;
        const key = String(track.url).split('?')[0];
        if (seen[key]) return;
        seen[key] = track;
        out.push(track);
      });
      if (subtitles.length === 0) subtitles = subtitlesOf(mboxJson, 'mbox');
    }

    if (!out.length) return [];
    if (subtitles.length) {
      const merged = subtitles.slice(0, 30);
      out.forEach(function (stream) {
        stream.subtitles = merged;
      });
    }
    if (out.length) await tmdb.awaitMeta(ctx, 400);
    return out;
  },
};

function bestHlsSource(json) {
  if (!json || typeof json !== 'object') return null;
  const sources = json.sources;
  let best = null;
  if (sources && typeof sources === 'object') {
    const names = Object.keys(sources);
    for (let i = 0; i < names.length; i += 1) {
      const s = sources[names[i]];
      if (!s || typeof s !== 'object') continue;
      const url = String(s.url || '').trim();
      if (!url) continue;
      const type = String(s.type || '').toLowerCase();
      const height = Number(s.height) || util.parseHeight(s.label || names[i] || '');
      const language = localesOf(s.label || names[i] || '');
      const entry = { url: null, height: height, language: language };
      if (url.indexOf('ms_') === 0) {
        entry.url = decryptMsUrl(url);
      } else if (url.indexOf('http') === 0) {
        entry.url = url;
      }
      if (!entry.url) continue;
      if (type === 'hls') return entry;
      if (!best) best = entry;
    }
    return best;
  }
  const rootUrl = String(json.url || '').trim();
  if (rootUrl.indexOf('ms_') === 0) {
    const url = decryptMsUrl(rootUrl);
    if (url) return { url: url, height: 0, language: '' };
  }
  if (rootUrl.indexOf('http') === 0) return { url: rootUrl, height: 0, language: '' };
  return null;
}

function localesOf(label) {
  const text = String(label || '');
  const match = text.match(/\(([^)]+)\)/);
  if (!match) return '';
  const names = [];
  match[1].split(/[,|/]/).forEach(function (part) {
    util.languageNames(part).forEach(function (lang) {
      if (names.indexOf(lang) < 0) names.push(lang);
    });
  });
  return names.join(', ');
}

function decryptMsUrl(encoded) {
  try {
    const payload = String(encoded || '').replace(/^ms_/, '').trim();
    if (!payload) return null;
    const bytes = Buffer.from(payload, 'hex');
    if (bytes.length <= 28) return null;
    const iv = bytes.subarray(0, 12);
    const rest = bytes.subarray(12);
    const tag = rest.subarray(rest.length - 16);
    const ciphertext = rest.subarray(0, rest.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(FALLBACK_KEY_HEX, 'hex'), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8').trim();
    return plain.indexOf('http') === 0 ? plain : null;
  } catch (error) {
    return null;
  }
}

function subtitlesOf(json, provider) {
  if (!json || typeof json !== 'object') return [];
  const out = [];
  const arr = Array.isArray(json.subtitles) ? json.subtitles : [];
  arr.forEach(function (s, index) {
    if (!s || typeof s !== 'object') return;
    const url = String(s.url || s.file || '').trim();
    if (url.indexOf('http') !== 0) return;
    const lang = String(s.lang || s.language || '').trim();
    const label = String(s.label || lang || '').trim();
    out.push({ id: 'atlantic-' + provider + '-' + index, url: url, lang: lang, label: label });
  });
  const releases = Array.isArray(json.releases) ? json.releases : [];
  releases.forEach(function (rel, ri) {
    const relSubs = rel && Array.isArray(rel.subtitles) ? rel.subtitles : [];
    relSubs.forEach(function (s, si) {
      if (!s || typeof s !== 'object') return;
      const url = String(s.url || s.file || '').trim();
      if (url.indexOf('http') !== 0) return;
      out.push({
        id: 'atlantic-' + provider + '-' + ri + '-' + si,
        url: url,
        lang: String(s.language || s.lang || '').trim(),
        label: String(s.label || s.language || '').trim(),
      });
    });
  });
  return out;
}

function mboxTracks(json) {
  const tracks = json && Array.isArray(json.tracks) ? json.tracks : [];
  const out = [];
  tracks.slice(0, 8).forEach(function (track) {
    if (!track || typeof track !== 'object') return;
    const url = String(track.url || '').trim();
    if (url.indexOf('http') !== 0) return;
    const mode = String(track.mode || '').toLowerCase();
    const langRaw = String(track.lang || '');
    if (/sub/i.test(mode) || /\bsub(s)?\b/i.test(langRaw)) return;
    const quality = String(track.quality || '');
    const height = util.parseHeight(quality);
    const kind = String(track.kind || '').toLowerCase();
    const isDash = kind === 'dash' || url.indexOf('.mpd') >= 0 || /\/mbox\/mpd/.test(url);
    const lang = util.languageLabel(langRaw);
    out.push({
      provider: 'Atlantic',
      url: url,
      type: isDash ? 'dash' : 'hls',
      quality: util.qualityLabel(height),
      height: height,
      language: lang || '',
      size: '',
      title: '',
      headers: { Referer: REFERER, 'User-Agent': http.DEFAULT_UA },
    });
  });
  return out;
}

module.exports._test = {
  bestHlsSource: bestHlsSource,
  localesOf: localesOf,
  decryptMsUrl: decryptMsUrl,
  subtitlesOf: subtitlesOf,
  mboxTracks: mboxTracks,
};
