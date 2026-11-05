'use strict';

const http = require('../http');
const util = require('../util');

const HOST = 'h5-api.aoneroom.com';
const BASE = 'https://' + HOST;
const REFERER = 'https://movieboxonline.net/';
const TOKEN_TTL_MS = 30 * 60 * 1000;

let tokenCache = '';
let tokenAt = 0;
let lastPlayAt = 0;

const SEASON_END_RE = /\s+S(\d+)(?:\s*-\s*S?(\d+))?$/i;
const SEASON_SUFFIX_RE = /\s+S\d+(?:\s*-\s*S?\d+)?$/i;
const BRACKETS_RE = /[\[(]([^\])]+)[\])]/gi;
const BRACKET_REMOVE_RE = /\s*[\(\[][^)\]]*[\)\]]/g;
const YEAR_RE = /\s*\d{4}/;

module.exports = {
  id: 'moviebox',
  name: 'MovieBox',
  speed: 'normal',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 4000,
  toggle: {
    key: 'sourceMoviebox',
    label: 'MovieBox',
    description: 'Title-keyed catalogue with download and playback renditions.',
  },

  async resolve(ctx) {
    const meta = await http.withTimeout(ctx.metaPromise || Promise.resolve(ctx.meta || null), 3000, null);
    const title = meta && meta.title ? meta.title : '';
    const type = ctx.type;
    if (!title) {
      ctx.log('moviebox: missing title, skipping');
      return [];
    }

    const deadline = ctx.deadline || (Date.now() + ctx.timeoutMs);

    const seasonKey = Number(ctx.season) > 0 ? Number(ctx.season) : 1;
    const episodeKey = Number(ctx.episode) > 0 ? Number(ctx.episode) : 1;
    const subjectType = type === 'movie' ? 1 : 2;

    const token = await fetchBearer(false, ctx);
    if (!token) return [];
    let baseHeaders = headersFor(token);

    let items = await searchItems(baseHeaders, title, subjectType, ctx);
    if ((!items || !items.length) && Date.now() < deadline - 2000) {
      const fresh = await fetchBearer(true, ctx);
      if (fresh) {
        baseHeaders = headersFor(fresh);
        items = await searchItems(baseHeaders, title, subjectType, ctx);
      }
    }
    if (!items || !items.length) return [];

    const subjects = matchSubjects(items, title, type, seasonKey);
    if (!subjects.length) {
      const titles = items.slice(0, 5).map(function (it) { return it && it.title ? String(it.title) : '?'; }).join(' | ');
      ctx.log('moviebox: no title match for "' + title + '"; search returned: ' + titles);
      return [];
    }

    const out = [];
    const seen = {};
    for (let i = 0; i < subjects.length; i += 1) {
      if (Date.now() > deadline) break;
      const ref = subjects[i];
      if (type === 'tv' && ref.seasonEnd > 0 && ref.seasonEnd < seasonKey) continue;
      const streams = await subjectStreams(ref, baseHeaders, type, seasonKey, episodeKey, ctx);
      streams.forEach(function (s) {
        if (seen[s.url]) return;
        seen[s.url] = true;
        out.push(s);
      });
      if (out.length >= 12) break;
    }
    return out;
  },
};

async function searchItems(baseHeaders, title, subjectType, ctx) {
  const net = ctx.http || http;
  const json = await net.postJson(BASE + '/wefeed-h5api-bff/subject/search', {
    keyword: title,
    page: 1,
    perPage: 24,
    subjectType: subjectType,
  }, {
    timeoutMs: Math.min(ctx.timeoutMs, 15000),
    headers: baseHeaders,
  });
  if (!json) return null;
  const data = unwrapData(json);
  return Array.isArray(data.items) ? data.items : null;
}

function headersFor(token) {
  return {
    'X-Client-Info': '{"timezone":"Africa/Nairobi"}',
    'Accept-Language': 'en-US,en;q=0.5',
    Accept: 'application/json',
    Referer: BASE,
    Host: HOST,
    Connection: 'keep-alive',
    Authorization: 'Bearer ' + token,
    'User-Agent': http.DEFAULT_UA,
  };
}

async function fetchBearer(forceRefresh, ctx) {
  if (!forceRefresh && tokenCache && Date.now() - tokenAt < TOKEN_TTL_MS) return tokenCache;
  const net = (ctx && ctx.http) || http;
  const res = await net.request(BASE + '/wefeed-h5api-bff/app/get-latest-app-pkgs?app_name=moviebox', {
    timeoutMs: 8000,
  });
  const xUser = res.headers && res.headers.get ? res.headers.get('x-user') : '';
  if (!xUser) return null;
  let token = '';
  try {
    token = JSON.parse(xUser).token || '';
  } catch (error) {
    token = '';
  }
  if (!token) return null;
  tokenCache = token;
  tokenAt = Date.now();
  return token;
}

function unwrapData(json) {
  if (!json || typeof json !== 'object') return {};
  const d = json.data && typeof json.data === 'object' ? json.data : json;
  return d.data && typeof d.data === 'object' ? d.data : d;
}

function seasonEndOf(rawTitle) {
  const match = String(rawTitle).match(SEASON_END_RE);
  if (!match) return 0;
  return Number(match[2] || match[1]) || 0;
}

function matchSubjects(items, title, type, seasonKey) {
  const norm = function (t) {
    return String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  };
  const titleNorm = norm(title);
  const out = [];
  items.forEach(function (item) {
    if (!item || typeof item !== 'object') return;
    const id = String(item.subjectId || '');
    if (!id) return;
    const rawTitle = String(item.title || '');
    const seasonEnd = seasonEndOf(rawTitle);
    const audioTag = '';
    const clean = rawTitle
      .replace(SEASON_SUFFIX_RE, '')
      .replace(BRACKET_REMOVE_RE, '')
      .replace(YEAR_RE, '')
      .trim();
    const cleanNorm = norm(clean);
    if (cleanNorm !== titleNorm) {
      const prefixForward = titleNorm.length >= 4 && cleanNorm.indexOf(titleNorm) === 0;
      const prefixReverse = cleanNorm.length >= 4 && titleNorm.indexOf(cleanNorm) === 0;
      if (!prefixForward && !prefixReverse) return;
    }
    out.push({ id: id, seasonEnd: seasonEnd, audioTag: audioTag, detailPath: String(item.detailPath || '') });
  });
  return out;
}

async function subjectStreams(ref, baseHeaders, type, seasonKey, episodeKey, ctx) {
  const net = ctx.http || http;
  let detailPath = ref.detailPath;
  if (!detailPath) {
    const json = await net.getJson(BASE + '/wefeed-h5-bff/web/post/list/subject?id=' + ref.id, {
      timeoutMs: 8000,
      headers: baseHeaders,
    });
    const data = unwrapData(json);
    const items = Array.isArray(data.items) ? data.items : [];
    detailPath = items.length && items[0].subject ? String(items[0].subject.detailPath || '') : '';
  }
  if (!detailPath) return [];

  const reqHeaders = Object.assign({}, baseHeaders, {
    Referer: 'https://fmoviesunblocked.net/spa/videoPlayPage/movies/' + detailPath + '?id=' + ref.id + '&type=/movie/detail',
    Origin: 'https://fmoviesunblocked.net',
  });
  const params = 'subjectId=' + ref.id + (type === 'tv' ? '&se=' + seasonKey + '&ep=' + episodeKey : '') + '&detailPath=' + detailPath;

  const out = [];
  const seen = {};
  const add = function (arr, dash) {
    if (!Array.isArray(arr)) return;
    arr.forEach(function (s) {
      if (!s || typeof s !== 'object') return;
      if (s.vipLocked) return;
      const rawUrl = String(s.url || '');
      if (!rawUrl) return;
      const sign = String(s.signCookie || '');
      const cookie = cloudFrontCookie(sign);
      let finalUrl = rawUrl;
      let isDashEntry = dash;
      if (dash) {
        const manifest = dashManifestFromPolicy(sign);
        if (manifest) {
          finalUrl = manifest;
        } else if (rawUrl.indexOf('.mpd') < 0 || isNoticeUrl(rawUrl)) {
          return;
        }
        isDashEntry = true;
      } else {
        if (isNoticeUrl(rawUrl)) return;
        if (rawUrl.indexOf('.mpd') >= 0) isDashEntry = true;
      }
      if (seen[finalUrl]) return;
      seen[finalUrl] = true;
      const resolution = parseInt(s.resolutions, 10) || parseInt(s.resolution, 10) || 0;
      const headers = { Referer: REFERER, 'User-Agent': http.DEFAULT_UA };
      if (cookie) headers.Cookie = cookie;
      const isMpd = isDashEntry || finalUrl.indexOf('.mpd') >= 0;
      out.push({
        provider: module.exports.name,
        url: finalUrl,
        type: isMpd ? 'dash' : finalUrl.indexOf('.m3u8') >= 0 ? 'hls' : 'mp4',
        quality: util.qualityLabel(resolution),
        height: resolution,
        language: '',
        size: '',
        title: '',
        headers: headers,
      });
    });
  };

  const downloadJson = await net.getJson(BASE + '/wefeed-h5api-bff/subject/download?' + params, {
    timeoutMs: 8000,
    headers: reqHeaders,
  });
  add(unwrapData(downloadJson).downloads, false);

  if (ctx.deadline && Date.now() >= ctx.deadline) return out;
  await util.sleep(Math.max(0, 500 - (Date.now() - lastPlayAt)));
  if (ctx.deadline && Date.now() >= ctx.deadline) return out;
  lastPlayAt = Date.now();
  const playJson = await net.getJson(BASE + '/wefeed-h5api-bff/subject/play?' + params, {
    timeoutMs: 8000,
    headers: reqHeaders,
  });
  const play = unwrapData(playJson);
  add(play.streams, false);
  add(play.dash, true);

  return out;
}

function cloudFrontCookie(signCookie) {
  if (!signCookie) return '';
  const parts = String(signCookie)
    .split(';')
    .map(function (item) { return item.trim(); })
    .filter(function (item) {
      const eq = item.indexOf('=');
      return eq > 0 && item.slice(eq + 1).replace(/"/g, '').trim();
    });
  return parts.join('; ');
}

function isNoticeUrl(url) {
  return String(url || '').indexOf('macdn.aoneroom.com/other/') >= 0;
}

function dashManifestFromPolicy(signCookie) {
  if (!signCookie) return '';
  const raw = String(signCookie)
    .split(';')
    .map(function (item) { return item.trim(); })
    .filter(function (item) { return item.indexOf('CloudFront-Policy=') === 0; })[0] || '';
  if (!raw) return '';
  let std = raw.slice('CloudFront-Policy='.length).trim().replace(/^"|"$/g, '');
  if (!std) return '';
  std = std.replace(/-/g, '+').replace(/~/g, '/').replace(/_/g, '=').replace(/\s+/g, '');
  let stripped = std.replace(/=+$/, '');
  if (!stripped || stripped.indexOf('=') >= 0 || stripped.length % 4 === 1) return '';
  const pad = (4 - (stripped.length % 4)) % 4;
  std = stripped + '===='.slice(0, pad);
  const json = util.b64decode(std);
  if (!json) return '';
  let resource = '';
  try {
    const parsed = JSON.parse(json);
    resource = (parsed.Statement && parsed.Statement[0] && parsed.Statement[0].Resource) || '';
  } catch (error) {
    return '';
  }
  if (!resource || resource.indexOf('http') !== 0) return '';
  let base = resource.trim().replace(/\*+$/, '').replace(/\/+$/, '');
  return /\.mpd$/i.test(base) ? base : base + '/index.mpd';
}

module.exports._test = {
  cloudFrontCookie: cloudFrontCookie,
  isNoticeUrl: isNoticeUrl,
  dashManifestFromPolicy: dashManifestFromPolicy,
  matchSubjects: matchSubjects,
  seasonEndOf: seasonEndOf,
  unwrapData: unwrapData,
};
