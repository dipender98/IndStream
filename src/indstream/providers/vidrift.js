'use strict';

const http = require('../http');
const util = require('../util');
const tmdb = require('../tmdb');

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
    description: 'Boot-token HLS player with per-audio-language renditions.',
  },

  async resolve(ctx) {
    const net = ctx.http || http;
    const type = ctx.type;
    const season = Number(ctx.season) || 0;
    const episode = Number(ctx.episode) || 0;
    if (ctx.deadline && Date.now() >= ctx.deadline) return [];
    if (!ctx.tmdbId) await tmdb.awaitMeta(ctx);
    if (!ctx.tmdbId) {
      ctx.log('vidrift: missing tmdb id, skipping');
      return [];
    }
    if (type === 'tv' && (season <= 0 || episode <= 0)) return [];

    const path = type === 'movie'
      ? '/api/boot/movie/' + ctx.tmdbId
      : '/api/boot/tv/' + ctx.tmdbId + '/' + season + '/' + episode;
    const boot = await net.getJson(BASE + path, {
      timeoutMs: Math.min(ctx.timeoutMs || 4000, 8000),
      headers: { 'User-Agent': http.DEFAULT_UA, Accept: 'application/json', Referer: BASE + '/' },
    });
    if (!boot) {
      ctx.log('vidrift: boot endpoint unreachable');
      return [];
    }
    const meta = boot.meta || null;
    if (!meta) {
      ctx.log('vidrift: boot payload missing meta');
      return [];
    }

    const out = [];
    const seen = {};
    const streams = vidriftStreams(meta);
    streams.forEach(function (s) {
      if (seen[s.url]) return;
      seen[s.url] = true;
      s.provider = module.exports.name;
      s.headers = { 'User-Agent': http.DEFAULT_UA, Referer: BASE + '/' };
      out.push(s);
    });

    if (out.length && ctx.deadline && Date.now() < ctx.deadline) {
      await Promise.all(out.map(function (stream) {
        const subUrl = stream._subtitleListUrl;
        delete stream._subtitleListUrl;
        if (!subUrl) return Promise.resolve();
        return net.getJson(BASE + subUrl, { timeoutMs: 3000 }).then(function (json) {
          const tracks = json && Array.isArray(json.tracks) ? json.tracks : [];
          const subtitles = [];
          tracks.slice(0, 30).forEach(function (track) {
            if (!track || typeof track !== 'object') return;
            const rel = track.url ? String(track.url) : '';
            if (!rel) return;
            subtitles.push({
              id: 'vidrift-' + (track.code || subtitles.length),
              url: rel.indexOf('http') === 0 ? rel : BASE + (rel.charAt(0) === '/' ? rel : '/' + rel),
              lang: track.lang || '',
              label: track.label || track.lang || '',
            });
          });
          if (subtitles.length) stream.subtitles = subtitles;
        }, function () {
          /* subtitle tracks are best effort */
        });
      }));
    } else {
      out.forEach(function (stream) {
        delete stream._subtitleListUrl;
      });
    }
    if (out.length) await tmdb.awaitMeta(ctx, 400);
    return out;
  },
};

function vidriftStreams(meta) {
  const out = [];
  const arr = Array.isArray(meta && meta.orionStreams) ? meta.orionStreams : [];
  arr.forEach(function (s) {
    if (!s || typeof s !== 'object') return;
    const rel = String(s.url || '').trim();
    if (!rel) return;
    const abs = rel.indexOf('http') === 0 ? rel : BASE + (rel.charAt(0) === '/' ? rel : '/' + rel);
    let height = 0;
    const rungs = Array.isArray(s.rungs) ? s.rungs : [];
    rungs.forEach(function (rung) {
      const h = Number(rung && rung.height) || 0;
      if (h > height) height = h;
    });
    const stream = {
      provider: 'Vidrift',
      url: abs,
      type: 'hls',
      quality: util.qualityLabel(height),
      height: height,
      language: vidriftLabel(s.name),
      size: '',
      title: '',
      _subtitleListUrl:
        typeof s.subtitleListUrl === 'string' && s.subtitleListUrl.trim() ? s.subtitleListUrl.trim() : '',
    };
    out.push(stream);
  });
  const evion = meta && meta.evionUrl ? String(meta.evionUrl) : '';
  if (!out.length && evion.indexOf('.m3u8') >= 0) {
    out.push({
      provider: 'Vidrift',
      url: evion,
      type: 'hls',
      quality: '',
      height: 0,
      language: '',
      size: '',
      title: '',
    });
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
