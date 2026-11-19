'use strict';

const http = require('../http');
const util = require('../util');
const tmdb = require('../tmdb');

const HOST = 'h5-api.aoneroom.com';
const BASE = 'https://' + HOST;
const REFERER = 'https://movieboxonline.net/';
const TOKEN_TTL_MS = 30 * 60 * 1000;

let tokenCache = '';
let tokenAt = 0;
let lastPlayAt = 0;

const SEASON_RE = /\s+S(\d+)(?:\s*[-–—]\s*S?(\d+))?\s*$/i;
const SEASON_SUFFIX_RE = /\s+S\d+(?:\s*[-–—]\s*S?\d+)?\s*$/i;
const BRACKETS_RE = /[\[(]([^\])]+)[\])]/gi;
const BRACKET_REMOVE_RE = /\s*[\(\[][^)\]]*[\)\]]/g;
const DASH_LANGUAGE_RE = /\s*[-–—]\s*([A-Za-z][A-Za-z\s]{1,24})$/;
const FLOOR = 720;
const CAPTION_LIMIT = 24;

module.exports = {
  id: 'moviebox',
  name: 'MovieBox',
  speed: 'normal',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 5000,
  toggle: {
    key: 'sourceMoviebox',
    label: 'MovieBox',
    description: 'Title-keyed catalogue with download and playback renditions.',
  },

  async resolve(ctx) {
    const meta = await tmdb.awaitMeta(ctx);
    const title = meta && meta.title ? meta.title : '';
    const type = ctx.type === 'tv' || ctx.type === 'series' ? 'tv' : 'movie';
    if (!title) {
      ctx.log('moviebox: missing title, skipping');
      return [];
    }

    const deadline = ctx.deadline || (Date.now() + ctx.timeoutMs);

    const seasonKey = Number(ctx.season) > 0 ? Number(ctx.season) : 1;
    const episodeKey = Number(ctx.episode) > 0 ? Number(ctx.episode) : 1;
    const subjectType = type === 'movie' ? 1 : 2;
    const originalTitle = meta && meta.originalTitle ? String(meta.originalTitle).trim() : '';
    const titles = title.toLowerCase() === originalTitle.toLowerCase() ? [title] : [title, originalTitle].filter(Boolean);

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

    let subjects = matchSubjects(items, titles, type, seasonKey);
    if (!subjects.length && originalTitle && titles.length > 1 && Date.now() < deadline - 2500) {
      const altItems = await searchItems(baseHeaders, originalTitle, subjectType, ctx);
      if (altItems && altItems.length) {
        items = items.concat(altItems);
        subjects = matchSubjects(items, titles, type, seasonKey);
      }
    }
    if (!subjects.length) {
      const found = items.slice(0, 5).map(function (it) { return it && it.title ? String(it.title) : '?'; }).join(' | ');
      ctx.log('moviebox: no title match for "' + title + '"; search returned: ' + found);
      return [];
    }

    const out = [];
    const seen = {};
    const eligible = subjects
      .map(function (ref) { return { ref: ref, rank: subjectRank(ref, type, seasonKey) }; })
      .filter(function (entry) { return entry.rank < 10000; })
      .sort(function (a, b) { return a.rank - b.rank; })
      .slice(0, 4)
      .map(function (entry) { return entry.ref; });
    const jobs = await Promise.allSettled(eligible.map(function (ref) {
      if (Date.now() > deadline) return Promise.resolve([]);
      return subjectStreams(ref, baseHeaders, type, seasonKey, episodeKey, ctx);
    }));
    for (let i = 0; i < jobs.length; i += 1) {
      if (Date.now() > deadline) break;
      const job = jobs[i];
      if (job.status !== 'fulfilled' || !job.value) continue;
      job.value.forEach(function (s) {
        const key = streamKey(s);
        const prev = seen[key];
        if (prev) {
          if (!prev.language && s.language) {
            prev.language = s.language;
            prev.subtitles = s.subtitles;
          }
          return;
        }
        seen[key] = s;
        out.push(s);
      });
      if (out.length >= 16) break;
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

function seasonRangeOf(rawTitle) {
  const match = String(rawTitle).match(SEASON_RE);
  if (!match) return { start: 0, end: 0 };
  const start = Number(match[1]) || 0;
  const end = Number(match[2] || match[1]) || start;
  return { start: start, end: Math.max(start, end) };
}

function seasonEndOf(rawTitle) {
  return seasonRangeOf(rawTitle).end;
}

function normTitle(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function declaredAudio(item, rawTitle) {
  const names = [];
  const push = function (value) {
    util.languageNames(value).forEach(function (name) {
      if (names.indexOf(name) < 0) names.push(name);
    });
  };
  push(item && item.corner);

  const text = String(rawTitle || '');
  BRACKETS_RE.lastIndex = 0;
  let match;
  while ((match = BRACKETS_RE.exec(text))) push(match[1]);

  const dash = text.replace(BRACKET_REMOVE_RE, ' ').match(DASH_LANGUAGE_RE);
  if (dash) {
    const tail = dash[1].replace(/\b(?:dubbed|dub|audio)\b/gi, ' ').trim();
    if (tail && util.languageNames(tail).length === 1) push(tail);
  }

  const dubs = item && item.dubs;
  if (Array.isArray(dubs)) {
    dubs.forEach(function (dub) {
      if (!dub) return;
      if (typeof dub === 'string') push(dub);
      else push([dub.lanName, dub.language, dub.name, dub.lan].filter(Boolean).join(' '));
    });
  }
  return names.join(', ');
}

function subjectRank(ref, type, seasonKey) {
  if (type !== 'tv') return 0;
  if (!ref.seasonStart) return 500;
  if (ref.seasonStart === seasonKey && ref.seasonEnd === seasonKey) return 0;
  if (seasonKey >= ref.seasonStart && seasonKey <= ref.seasonEnd) {
    return 100 + (ref.seasonEnd - ref.seasonStart);
  }
  return 10000;
}

function cleanTitle(rawTitle) {
  const text = String(rawTitle || '').replace(/[\[(]([^\])]+)[\])]/g, function (full, inner) {
    const value = String(inner).trim();
    if (/^(?:19|20)\d{2}$/.test(value)) return ' ';
    if (/^(?:4k|uhd|1080p?|720p?|2160p?)$/i.test(value)) return ' ';
    if (util.languageNames(value).length) return ' ';
    return full;
  });
  return text.replace(SEASON_SUFFIX_RE, '').replace(/\s+/g, ' ').trim();
}

function matchSubjects(items, titles) {
  const wanted = (Array.isArray(titles) ? titles : [titles])
    .map(normTitle)
    .filter(Boolean);
  if (!wanted.length) return [];
  const out = [];
  items.forEach(function (item) {
    if (!item || typeof item !== 'object') return;
    const id = String(item.subjectId || '');
    if (!id) return;
    const rawTitle = String(item.title || '');
    if (wanted.indexOf(normTitle(cleanTitle(rawTitle))) < 0) return;
    const season = seasonRangeOf(rawTitle);
    out.push({
      id: id,
      seasonStart: season.start,
      seasonEnd: season.end,
      language: declaredAudio(item, rawTitle),
      detailPath: String(item.detailPath || ''),
    });
  });
  return out;
}

function streamHeight(entry) {
  const raw = entry && (entry.resolutions != null ? entry.resolutions : entry.resolution);
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return 0;
  const dims = text.match(/(\d{3,4})\s*[x*]\s*(\d{3,4})/i);
  if (dims) return Number(dims[2]) || 0;
  return parseInt(text, 10) || util.parseHeight(text);
}

function sizeLabel(value) {
  if (value == null || value === '') return '';
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return util.normalizeSizeToken(text);
  const bytes = Number(text);
  if (!bytes || bytes < 1024) return '';
  if (bytes >= 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(2).replace(/\.?0+$/, '') + ' GB';
  }
  return Math.round(bytes / (1024 * 1024)) + ' MB';
}

function subtitlesOf(list) {
  const out = [];
  const seen = {};
  (Array.isArray(list) ? list : []).forEach(function (item) {
    if (!item || typeof item.url !== 'string' || item.url.indexOf('http') !== 0) return;
    const label = String((item.lanName || item.language || item.lan || '')).trim();
    const lang = util.languageNames(label)[0] || label;
    if (!lang || seen[lang]) return;
    seen[lang] = true;
    out.push({ url: item.url, lang: lang, label: label || lang });
  });
  return out.slice(0, CAPTION_LIMIT);
}

function streamKey(stream) {
  const path = String((stream && stream.url) || '').split('#')[0].split('?')[0];
  const file = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  return (Number(stream && stream.height) || 0) + '|' + (file || path);
}

async function subjectStreams(ref, baseHeaders, type, seasonKey, episodeKey, ctx) {
  const net = ctx.http || http;
  let detailPath = ref.detailPath;
  if (!detailPath) {
    const json = await net.getJson(BASE + '/wefeed-h5-bff/web/post/list/subject?id=' + encodeURIComponent(ref.id), {
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
  const params = 'subjectId=' + encodeURIComponent(ref.id) +
    (type === 'tv' ? '&se=' + seasonKey + '&ep=' + episodeKey : '') +
    '&detailPath=' + encodeURIComponent(detailPath);

  const out = [];
  const seen = {};
  let subtitles = [];
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
      if (dash) {
        const manifest = dashManifestFromPolicy(sign);
        if (manifest) finalUrl = manifest;
        else if (rawUrl.indexOf('.mpd') < 0 || isNoticeUrl(rawUrl)) return;
      } else if (isNoticeUrl(rawUrl)) {
        return;
      }

      const height = streamHeight(s);
      if (util.isKnownBelowFloor(height, FLOOR)) return;

      const isMpd = dash || finalUrl.indexOf('.mpd') >= 0 || rawUrl.indexOf('.mpd') >= 0;
      const headers = { Referer: REFERER, 'User-Agent': http.DEFAULT_UA };
      if (cookie) headers.Cookie = cookie;
      const stream = {
        provider: module.exports.name,
        url: finalUrl,
        type: isMpd ? 'dash' : finalUrl.indexOf('.m3u8') >= 0 ? 'hls' : 'mp4',
        quality: util.qualityLabel(height),
        height: height,
        language: ref.language || '',
        size: sizeLabel(s.size),
        title: '',
        headers: headers,
      };
      if (subtitles.length) stream.subtitles = subtitles;

      const key = streamKey(stream);
      const prev = seen[key];
      if (prev) {
        if (!prev.language && stream.language) prev.language = stream.language;
        if (!prev.size && stream.size) prev.size = stream.size;
        if (!prev.subtitles && stream.subtitles) prev.subtitles = stream.subtitles;
        return;
      }
      seen[key] = stream;
      out.push(stream);
    });
  };

  const downloadJson = await net.getJson(BASE + '/wefeed-h5api-bff/subject/download?' + params, {
    timeoutMs: 8000,
    headers: reqHeaders,
  });
  const download = unwrapData(downloadJson);
  subtitles = subtitlesOf(download.captions);
  add(download.downloads, false);

  if (ctx.deadline && Date.now() >= ctx.deadline) return out;
  await util.sleep(Math.max(0, 200 - (Date.now() - lastPlayAt)));
  if (ctx.deadline && Date.now() >= ctx.deadline) return out;
  lastPlayAt = Date.now();
  const playJson = await net.getJson(BASE + '/wefeed-h5api-bff/subject/play?' + params, {
    timeoutMs: 8000,
    headers: reqHeaders,
  });
  const play = unwrapData(playJson);
  if (!subtitles.length) subtitles = subtitlesOf(play.captions);
  add(play.streams, false);
  const hls = (Array.isArray(play.hls) ? play.hls : []).map(function (entry) {
    return typeof entry === 'string' ? { url: entry } : entry;
  });
  add(hls, false);
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
  seasonRangeOf: seasonRangeOf,
  declaredAudio: declaredAudio,
  streamHeight: streamHeight,
  sizeLabel: sizeLabel,
  subtitlesOf: subtitlesOf,
  streamKey: streamKey,
  unwrapData: unwrapData,
};
