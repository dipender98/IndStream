'use strict';

const http = require('../http');
const util = require('../util');
const tmdb = require('../tmdb');

const SITE = 'https://allmanga.to';
const GQL = 'https://api.allanime.day/api';
// Video host published by the site's own client config (VIDEO_SERVER_HEAD).
const CDN = 'https://aln.youtube-anime.com';
const HEADERS = {
  'User-Agent': http.DEFAULT_UA,
  Referer: SITE + '/',
  Origin: SITE,
  Accept: 'application/json, text/plain, */*',
};

// The upstream schema still spells the enum type this way.
const SEARCH_GQL =
  'query ($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) ' +
  '{ shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) ' +
  '{ edges { _id name englishName nativeName availableEpisodes } } }';
const EPISODE_GQL =
  'query ($showId: String!, $epNum: Float!) { episodeInfos(showId: $showId, episodeNumStart: $epNum, episodeNumEnd: $epNum) ' +
  '{ episodeIdNum vidInforssub vidInforsdub vidInforsraw } }';
const SOURCES_GQL =
  'query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) ' +
  '{ episode(showId: $showId, translationType: $translationType, episodeString: $episodeString) { episodeString sourceUrls } }';

const CDN_TRACKS = [
  ['vidInforssub', 'Sub'],
  ['vidInforsdub', 'Dub'],
  ['vidInforsraw', 'Raw'],
];

module.exports = {
  id: 'allanime',
  name: 'AllAnime',
  mark: 'AA',
  tags: ['1080p', 'Anime', 'Stream', 'Fast'],
  speed: 'normal',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 9000,
  toggle: {
    key: 'sourceAllanime',
    label: 'AllAnime',
    description: 'Anime catalogue with direct sub/dub episodes and embed fallbacks.',
  },

  async resolve(ctx) {
    const net = ctx.http || http;
    const meta = await tmdb.awaitMeta(ctx, 800);
    const titles = [meta && meta.title, meta && meta.originalTitle].filter(Boolean);
    if (!titles.length) {
      ctx.log('allanime: missing title, skipping');
      return [];
    }

    const deadline = Number(ctx.deadline) || 0;
    const opts = function (ms) {
      return { timeoutMs: Math.min(ms, Number(ctx.timeoutMs) || ms), deadline: deadline, headers: HEADERS };
    };
    const episode = Math.max(1, Number(ctx.episode) || 1);

    const search = await gql(net, SEARCH_GQL, {
      search: { allowAdult: false, allowUnknown: false, query: String(titles[0]) },
      limit: 20,
      page: 1,
      translationType: 'sub',
      countryOrigin: 'ALL',
    }, opts(5000));
    const showId = pickShow(search, titles, meta && meta.year);
    if (!showId || (deadline && Date.now() > deadline - 500)) return [];

    let out = [];
    if (ctx.type === 'movie') {
      // Movies are listed as a single episode by this catalogue.
      const info = await gql(net, EPISODE_GQL, { showId: showId, epNum: 1 }, opts(4000));
      out = cdnStreams(info);
      if (!out.length && (!deadline || Date.now() < deadline - 500)) {
        out = await embedStreams(net, showId, '1', opts(3500));
      }
    } else {
      const info = await gql(net, EPISODE_GQL, { showId: showId, epNum: episode }, opts(4000));
      out = cdnStreams(info);
      if (!out.length && (!deadline || Date.now() < deadline - 500)) {
        out = await embedStreams(net, showId, String(episode), opts(3500));
      }
    }

    const seen = {};
    const unique = out.filter(function (stream) {
      if (!stream || seen[stream.url]) return false;
      seen[stream.url] = true;
      return true;
    });
    unique.sort(function (a, b) { return (b.height || 0) - (a.height || 0); });
    if (unique.length) await tmdb.awaitMeta(ctx, 300);
    ctx.log('allanime: ' + unique.length + ' streams');
    return unique.slice(0, 12);
  },
};

async function gql(net, query, variables, options) {
  const json = await net.postJson(GQL, { query: query, variables: variables }, options);
  return json && !json.errors ? json : null;
}

function pickShow(json, titles, year) {
  const edges = json && json.data && json.data.shows && json.data.shows.edges;
  if (!Array.isArray(edges)) return '';
  const wanted = (titles || []).filter(Boolean).map(function (title) { return String(title); });
  if (!wanted.length) return '';
  let best = '';
  let bestScore = 0;
  edges.forEach(function (edge) {
    if (!edge || !edge._id) return;
    const names = [edge.englishName, edge.name, edge.nativeName].filter(Boolean);
    let score = 0;
    names.forEach(function (name) {
      wanted.forEach(function (title) {
        score = Math.max(score, util.titleScore(title, name, year, util.yearFromText(name)));
      });
    });
    if (score > bestScore) {
      bestScore = score;
      best = String(edge._id);
    }
  });
  return bestScore >= 0.6 ? best : '';
}

function sizeLabel(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
  if (n >= 1048576) return Math.round(n / 1048576) + ' MB';
  return '';
}

function cdnStreams(json) {
  const list = json && json.data && json.data.episodeInfos;
  if (!Array.isArray(list) || !list.length || !list[0]) return [];
  const ep = list[0];
  const out = [];
  CDN_TRACKS.forEach(function (track) {
    const info = ep[track[0]];
    if (!info || !info.vidPath) return;
    const path = String(info.vidPath);
    const url = /^https?:\/\//i.test(path) ? path : CDN + '/' + path.replace(/^\/+/, '');
    const height = parseInt(info.vidResolution, 10) || 0;
    if (height > 0 && height < 720) return;
    const language = util.languageLabel(info.lang || info.language || info.audio || '');
    out.push({
      provider: module.exports.name,
      url: url,
      type: /\.m3u8(?:[?#]|$)/i.test(url) ? 'hls' : 'mp4',
      quality: util.qualityLabel(height),
      height: height,
      language: language,
      size: sizeLabel(info.vidSize),
      title: '',
      releaseText: track[1],
      headers: { Referer: SITE + '/', 'User-Agent': http.DEFAULT_UA },
    });
  });
  return out;
}

// sourceUrls is either an array or a JSON string containing one.
function parseSourceUrls(value) {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch (error) {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(function (item) {
    return item && typeof item.sourceUrl === 'string' && item.sourceUrl;
  }).map(function (item) {
    return {
      sourceName: String(item.sourceName || ''),
      sourceUrl: item.sourceUrl,
      priority: Number(item.priority) || 0,
      type: String(item.type || ''),
    };
  });
}

// Upstream masks paths as hex bytes XOR 56 (sometimes behind a "--" prefix).
function decodeSourceUrl(raw) {
  const value = String(raw == null ? '' : raw).trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.charAt(0) === '/') return value;
  let hex = '';
  if (value.indexOf('--') === 0) hex = value.slice(2);
  else if (/^ap\//i.test(value)) hex = value.slice(3);
  else hex = value;
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return '';
  let decoded = '';
  for (let i = 0; i < hex.length; i += 2) {
    decoded += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ 56);
  }
  return /^https?:\/\//i.test(decoded) || decoded.charAt(0) === '/' ? decoded : '';
}

function providerStreams(json, sourceName) {
  if (!json || typeof json !== 'object') return [];
  const out = [];
  const headers = { Referer: SITE + '/', 'User-Agent': http.DEFAULT_UA };
  const push = function (url, height, label) {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return;
    const h = Number(height) || 0;
    if (h > 0 && h < 720) return;
    out.push({
      provider: module.exports.name,
      url: url,
      type: /\.m3u8(?:[?#]|$)/i.test(url) ? 'hls' : 'mp4',
      quality: util.qualityLabel(h),
      height: h,
      language: '',
      size: '',
      title: '',
      releaseText: label || sourceName || '',
      headers: headers,
    });
  };
  const links = json.links;
  if (Array.isArray(links)) {
    links.forEach(function (link) {
      if (!link) return;
      const url = link.link || link.url;
      push(url, parseInt(link.resolutionStr || link.resolution, 10) || util.parseHeight(String(url || '')), sourceName);
    });
  }
  if (json.hls) push(json.hls.url || json.hls.file, 0, sourceName);
  return out;
}

async function embedStreams(net, showId, episode, options) {
  const json = await gql(net, SOURCES_GQL, {
    showId: showId,
    translationType: 'sub',
    episodeString: episode,
  }, options);
  if (!json) return [];
  const ep = json.data && json.data.episode;
  const sources = parseSourceUrls(ep && ep.sourceUrls);
  sources.sort(function (a, b) { return b.priority - a.priority; });
  const out = [];
  for (let i = 0; i < sources.length && out.length < 6; i += 1) {
    const path = decodeSourceUrl(sources[i].sourceUrl);
    if (!path) continue;
    const url = /^https?:\/\//i.test(path) ? path : util.resolveUrl(SITE + '/', path);
    const providerJson = await net.getJson(url, options);
    providerStreams(providerJson, sources[i].sourceName).forEach(function (stream) {
      out.push(stream);
    });
  }
  return out;
}

module.exports._test = {
  pickShow: pickShow,
  sizeLabel: sizeLabel,
  cdnStreams: cdnStreams,
  parseSourceUrls: parseSourceUrls,
  decodeSourceUrl: decodeSourceUrl,
  providerStreams: providerStreams,
};
