'use strict';

const http = require('../http');
const html = require('../html');
const util = require('../util');
const tmdb = require('../tmdb');

const SEEDS = [
  'https://new1.vegamovies.lease',
  'https://new2.vegamovies.futbol',
  'https://vegamovies.latino',
  'https://vegamovis.nl',
  'https://1vegamovies.pics',
];
const INTENT_KEY = 'res_index_probe';
const INTENT = 'bahubali';
const PROROBE = '/ts-search.php?q=' + encodeURIComponent(INTENT) + '&page=1';
const HEAL_TTL_MS = 60 * 60 * 1000;
const FLOOR = 720;
const OG_TITLE_RE = /<meta\s+property="og:title"\s+content="([^"]+)"/i;
const HTML_TITLE_RE = /<title>([^<]+)<\/title>/i;
const HEADING_RE = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
const FASTDL_RE = /https?:\/\/fastdl\.[a-z]{2,10}\/embed(?:\.php)?\?download=[A-Za-z0-9_\-]+/gi;
const NEXDRIVE_RE = /https?:\/\/nexdrive\.[a-z]{2,10}\/genxfm[^\s"'<>\\]*/gi;
const VCLOUD_RE = /https?:\/\/vcloud\.[a-z]{2,10}\/[A-Za-z0-9_\-]{6,}/gi;
const DIRECT_RE = /https?:\/\/video-downloads\.googleusercontent\.com\/[^"'\s<>]+/;
const R2_RE = /https?:\/\/[^"'\s<>]*r2\.cloudflarestorage\.com\/[^"'\s<>]*/gi;
const REURL_RE = /dl\.php\?link=(https?:\/\/[^"'\s<>&]+)/;
const GDRIVE_RE = /https?:\/\/video-downloads\.googleusercontent\.com\/\S+/;
const DOWNLOAD_BTN_RE = /<a\b[\s\S]*?href="([^"]+)"[\s\S]*?<button\b[^>]*class="[^"]*\bdwd-button\b[^"]*"[\s\S]*?<\/button>[\s\S]*?<\/a>/gi;

let healedBase = 0;
let healedAt = 0;
let healedByWalk = null;

module.exports = {
  id: 'vegamovies',
  name: 'Vegamovies',
  speed: 'slow',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 10000,
  toggle: {
    key: 'sourceVegamovies',
    label: 'Vegamovies',
    description: 'Bollywood and Hollywood Hindi-English multi-audio releases, direct links from file gateways.',
  },

  async resolve(ctx) {
    const net = ctx.http || http;
    const meta = await tmdb.awaitMeta(ctx);
    const title = meta && meta.title ? meta.title : '';
    const type = ctx.type === 'tv' || ctx.type === 'series' ? 'tv' : 'movie';
    const season = Number(ctx.season) || 0;
    const episode = Number(ctx.episode) || 0;
    if (!title) {
      ctx.log('vegamovies: missing title, skipping');
      return [];
    }
    if (type === 'tv' && (season <= 0 || episode <= 0)) return [];
    const deadline = ctx.deadline || (Date.now() + ctx.timeoutMs);

    const base = await resolveBase(net, deadline);
    if (!base) {
      ctx.log('vegamovies: no live host in this run');
      return [];
    }

    const encTitle = encodeURIComponent(title);
    const searchUrl = base + '/ts-search.php?q=' + encTitle + '&page=1';
    const json = await net.getJson(searchUrl, {
      timeoutMs: 12000,
      headers: { Referer: base + '/', 'User-Agent': http.DEFAULT_UA, Accept: 'application/json' },
    });
    const hits = parseSearchHits(json, base);
    if (!hits.length) return [];

    const ranked = rankSearch(hits, title, meta && meta.year, type);
    if (!ranked.length) return [];

    const out = [];
    const seen = {};
    const linksPageCache = {};
    for (let i = 0; i < ranked.length; i += 1) {
      if (Date.now() > deadline) break;
      const postUrl = ranked[i].url;
      const post = await net.getText(postUrl, {
        timeoutMs: 15000,
        headers: { Referer: base + '/', 'User-Agent': http.DEFAULT_UA },
      });
      if (!post) continue;
      const postTitle = ((post.match(OG_TITLE_RE) || post.match(HTML_TITLE_RE) || [])[1] || ranked[i].title).trim();
      const groups = extractDownloadGroups(post)
        .filter(function (g) { return heightOf(g.heading) >= FLOOR; })
        .sort(function (a, b) { return heightOf(b.heading) - heightOf(a.heading); });
      if (!groups.length) continue;
      const audio = languageFrom(postTitle).concat(groupAudio(groups.map(function (g) { return g.heading; })));
      const audioOut = util.languageNames(audio).join(', ');
      for (let g = 0; g < groups.length && out.length < 6; g += 1) {
        const group = groups[g];
        const h = heightOf(group.heading);
        const size = util.normalizeSizeToken(group.heading);
        const langLabel = groupAudioLabel(group.heading, audioOut);
        const gateways = group.embeds.filter(function (e) {
          return NEXDRIVE_RE.test(e) || VCLOUD_RE.test(e) || FASTDL_RE.test(e);
        });
        for (let e = 0; e < gateways.length && out.length < 6; e += 1) {
          const gateway = gateways[e];
          const directs = await resolveGateway(net, gateway, postUrl, deadline);
          for (let d = 0; d < directs.length && out.length < 6; d += 1) {
            const direct = directs[d];
            const key = direct.split('?')[0].split('/').slice(-1)[0];
            if (seen[key]) continue;
            seen[key] = true;
            const qText = group.heading.match(/(2160p|1440p|1080p|720p|480p|4k|2k)/i);
            const q = qText ? (qText[1].toLowerCase() === '4k' ? '4K' : qText[1].toLowerCase()) : '';
            out.push({
              provider: module.exports.name,
              url: direct,
              type: 'mp4',
              quality: util.qualityLabel(h),
              height: h,
              language: langLabel,
              size: size,
              title: (module.exports.name + ' ' + (q || util.qualityLabel(h))).trim(),
              releaseText: String(postTitle).slice(0, 160),
              headers: { Referer: base + '/', 'User-Agent': http.DEFAULT_UA },
            });
          }
        }
      }
      if (out.length) break;
    }
    return out;
  },
};

async function resolveBase(net, deadline) {
  if (healedBase && Date.now() - healedAt < HEAL_TTL_MS) return healedBase;
  for (let i = 0; i < SEEDS.length; i += 1) {
    if (Date.now() > deadline) break;
    const seed = SEEDS[i];
    try {
      const probe = await net.getJson(seed + PROROBE, {
        timeoutMs: 12000,
        headers: { Referer: seed + '/', 'User-Agent': http.DEFAULT_UA, Accept: 'application/json' },
      });
      if (probe && (typeof probe.found === 'number' || Array.isArray(probe.hits))) {
        healedBase = seed;
        healedAt = Date.now();
        return seed;
      }
    } catch (e) { /* next seed */ }
  }
  return '';
}

function parseSearchHits(json, base) {
  if (!json || typeof json !== 'object') return [];
  const hits = Array.isArray(json.hits) ? json.hits : [];
  const out = [];
  for (let i = 0; i < hits.length; i += 1) {
    const doc = hits[i] && hits[i].document;
    if (!doc) continue;
    const title = String(doc.post_title || '').trim();
    const permalink = String(doc.permalink || '').trim();
    if (!title || !permalink) continue;
    const url = permalink.indexOf('http') === 0 ? permalink : base + '/' + permalink.replace(/^\/+/, '');
    const category = Array.isArray(doc.category) ? doc.category : [];
    out.push({ url: url, title: title, category: category, imdbId: String(doc.imdb_id || '') });
  }
  return out;
}

function rankSearch(hits, title, year, type) {
  const wanted = String(title || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  const tokens = wanted.split(/\s+/).filter(Boolean);
  return hits
    .map(function (hit) {
      const t = hit.title.toLowerCase();
      const matchYear = year && /\((\d{4})\)/.exec(t) ? Number(/\((\d{4})\)/.exec(t)[1]) === Number(year) : false;
      const tokenHits = tokens.filter(function (tok) { return t.indexOf(tok) >= 0; }).length;
      const score = tokens.length ? tokenHits / tokens.length : 0;
      return { hit: hit, score: score, matchYear: matchYear };
    })
    .filter(function (r) { return r.score >= 0.6; })
    .sort(function (a, b) {
      if (a.matchYear !== b.matchYear) return a.matchYear ? -1 : 1;
      return b.score - a.score;
    })
    .slice(0, 3)
    .map(function (r) { return r.hit; });
}

function heightOf(text) {
  return util.parseHeight(String(text || ''));
}

function extractDownloadGroups(documentText) {
  const source = String(documentText || '');
  const tokens = [];
  const headingRe = new RegExp(HEADING_RE.source, 'gi');
  let match;
  while ((match = headingRe.exec(source))) {
    tokens.push({ kind: 'heading', text: match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), pos: match.index });
  }
  const btnRe = new RegExp(DOWNLOAD_BTN_RE.source, 'gi');
  while ((match = btnRe.exec(source))) {
    tokens.push({ kind: 'btn', href: match[1], pos: match.index });
  }
  tokens.sort(function (a, b) { return a.pos - b.pos; });
  const groups = [];
  let heading = '';
  let embeds = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.kind === 'heading') {
      if (heading && embeds.length) groups.push({ heading: heading, embeds: embeds });
      heading = t.text;
      embeds = [];
      continue;
    }
    embeds.push(t.href);
  }
  if (heading && embeds.length) groups.push({ heading: heading, embeds: embeds });
  return groups;
}

async function resolveGateway(net, gatewayUrl, referer, deadline) {
  let body = '';
  try {
    body = await net.getText(gatewayUrl, {
      timeoutMs: 15000,
      headers: { Referer: referer, 'User-Agent': http.DEFAULT_UA, Accept: 'text/html' },
    });
  } catch (e) { return []; }
  if (!body) return [];
  const out = [];
  const fastdls = body.match(FASTDL_RE) || [];
  for (let i = 0; i < fastdls.length; i += 1) {
    if (Date.now() > deadline) break;
    const direct = await resolveFastdl(net, fastdls[i], gatewayUrl);
    if (direct) out.push(direct);
  }
  const vclouds = body.match(VCLOUD_RE) || [];
  for (let i = 0; i < vclouds.length; i += 1) {
    if (Date.now() > deadline) break;
    const directs = await resolveVcloud(net, vclouds[i], gatewayUrl);
    for (let j = 0; j < directs.length; j += 1) out.push(directs[j]);
  }
  return out;
}

async function resolveFastdl(net, embedUrl, referer) {
  let body = '';
  try {
    body = await net.getText(embedUrl, {
      timeoutMs: 15000,
      headers: { Referer: referer, 'User-Agent': http.DEFAULT_UA, Accept: 'text/html' },
    });
  } catch (e) { return ''; }
  if (!body) return '';
  const m = body.match(REURL_RE);
  if (m) return m[1].trim();
  const direct = body.match(DIRECT_RE);
  return direct ? direct[0] : '';
}

async function resolveVcloud(net, vcloudUrl, referer) {
  let page = '';
  try {
    page = await net.getText(vcloudUrl, {
      timeoutMs: 15000,
      headers: { Referer: referer, 'User-Agent': http.DEFAULT_UA },
    });
  } catch (e) { return []; }
  const m = page.match(/var\s+url\s*=\s*atob\s*\(\s*atob\s*\(\s*['"]([A-Za-z0-9+/=]{16,})/);
  if (!m) return [];
  const decode = function (blob) {
    try {
      const inner = Buffer.from(blob.trim(), 'base64').toString('utf8');
      return Buffer.from(inner.trim(), 'base64').toString('utf8');
    } catch (e) { return ''; }
  };
  const inner = decode(m[1]);
  if (!inner || inner.indexOf('http') !== 0) return [];
  let token = '';
  try {
    token = await net.getText(inner, { timeoutMs: 15000, headers: { Referer: vcloudUrl, 'User-Agent': http.DEFAULT_UA } });
  } catch (e) { return []; }
  if (!token) return [];
  const out = [];
  const re = /<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/gi;
  let a;
  while ((a = re.exec(token))) {
    const href = a[1];
    if ((/r2\.cloudflarestorage\.com/i.test(href) || /\.r2\.dev\//i.test(href)) && out.indexOf(href) < 0) out.push(href);
  }
  return out;
}

function languageFrom(text) {
  return util.languageNames(String(text || ''));
}

function groupAudioLabel(heading, fallback) {
  const h = String(heading || '');
  const names = util.languageNames(h);
  if (names.length) return names.join(', ');
  return fallback || '';
}

function groupAudio(headings) {
  const names = [];
  (headings || []).forEach(function (h) {
    util.languageNames(h).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
  });
  return names.join(', ');
}

module.exports._test = {
  parseSearchHits: parseSearchHits,
  rankSearch: rankSearch,
  extractDownloadGroups: extractDownloadGroups,
  heightOf: heightOf,
};
