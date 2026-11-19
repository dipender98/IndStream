'use strict';

const http = require('../http');
const util = require('../util');
const tmdb = require('../tmdb');

const RAW = 'https://raw.githubusercontent.com/Watchout2025/api/refs/heads/main';
const REFERER = 'https://vidout.pages.dev/';
const ID_RE = /^\d{2,10}$/;

module.exports = {
  id: 'vidout',
  name: 'VidOut',
  speed: 'fast',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 8000,
  toggle: {
    key: 'sourceVidout',
    label: 'VidOut',
    description: 'Multi-audio HLS streams resolved from a title-keyed catalogue.',
  },

  async resolve(ctx) {
    const net = ctx.http || http;
    if (!ctx.tmdbId) await tmdb.awaitMeta(ctx);
    const id = String(ctx.tmdbId || '').trim();
    if (!ID_RE.test(id)) {
      ctx.log('vidout: missing id, skipping');
      return [];
    }
    const deadline = ctx.deadline || (Date.now() + (Number(ctx.timeoutMs) || 15000));
    const type = ctx.type === 'tv' || ctx.type === 'series' ? 'tv' : 'movie';
    const headers = { Referer: REFERER, 'User-Agent': http.DEFAULT_UA };

    let line = '';
    if (type === 'tv') {
      const season = Math.max(1, Number(ctx.season) || 1);
      const episode = Math.max(1, Number(ctx.episode) || 1);
      const json = await net.getJson(RAW + '/hls/tv/' + id + '/S' + season + '.json', {
        timeoutMs: 5000,
        deadline: deadline,
        headers: headers,
        maxBytes: 262144,
      });
      line = pickTvUrl(json, episode);
    } else {
      const text = await net.getText(RAW + '/hls/movie/' + id, {
        timeoutMs: 5000,
        deadline: deadline,
        headers: headers,
        maxBytes: 8192,
      });
      line = firstHttpLine(text);
    }
    if (!line || !/^https?:\/\//i.test(line) || line.indexOf('#') >= 0) {
      ctx.log('vidout: no direct stream for this title');
      return [];
    }

    const master = await net.getText(line, {
      timeoutMs: 6000,
      deadline: deadline,
      headers: headers,
      maxBytes: 262144,
    });
    const parsed = master && util.parseHlsMaster(master);
    if (!parsed || parsed.height < 720) {
      ctx.log('vidout: playlist unreachable or below 720p, skipping');
      return [];
    }
    if (parsed.languages.length) await tmdb.awaitMeta(ctx, 400);
    return [{
      provider: module.exports.name,
      url: line,
      type: 'hls',
      quality: util.qualityLabel(parsed.height),
      height: parsed.height,
      language: parsed.languages.join(', '),
      size: '',
      title: '',
      headers: headers,
    }];
  },
};

function firstHttpLine(text) {
  const lines = String(text == null ? '' : text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (/^https?:\/\//i.test(line)) return line;
  }
  return '';
}

function pickTvUrl(json, episode) {
  const value = json && typeof json === 'object' ? json[String(episode)] : '';
  return typeof value === 'string' ? value.trim() : '';
}

module.exports._test = {
  firstHttpLine: firstHttpLine,
  pickTvUrl: pickTvUrl,
};
