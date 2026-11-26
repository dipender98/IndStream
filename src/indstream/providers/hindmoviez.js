'use strict';

const http = require('../http');
const html = require('../html');
const util = require('../util');
const tmdb = require('../tmdb');

const SEEDS = [
  'https://hindmovie.one',
  'https://v5.hindmovie.im',
  'https://hindmoviez.cafe',
];
const HEAL_TTL_MS = 60 * 60 * 1000;
const FLOOR = 720;
const HS_RE = /(?:hshare\.lol|boldb\.site)\/\?id=/i;
const INDEX_RE = /mvlink|joshapp|links\./i;
const SEASON_RE = /\bseason\s*0*(\d{1,2})(?:\s*[-–]\s*0*(\d{1,2}))?/i;
const ZIP_RE = /\b(?:zip|batch|complete|season\s*pack)\b/i;
const GOOGLE_RE = /https?:\/\/video-downloads\.googleusercontent\.com\/[^"'\s<>]+/i;

let healedBase = '';
let healedAt = 0;

module.exports = {
  id: 'hindmoviez',
  name: 'HindMoviez',
  speed: 'slow',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 12000,
  toggle: {
    key: 'sourceHindmoviez',
    label: 'HindMoviez',
    description: 'Hindi-English movie and series files through GDShine and GDirect.',
  },

  async resolve(ctx) {
    const net = ctx.http || http;
    const meta = await tmdb.awaitMeta(ctx);
    const title = meta && meta.title ? meta.title : '';
    const year = meta && meta.year ? meta.year : '';
    const type = ctx.type === 'tv' || ctx.type === 'series' ? 'tv' : 'movie';
    const season = Number(ctx.season) || 0;
    const episode = Number(ctx.episode) || 0;
    if (!title) {
      ctx.log('hindmoviez: missing title, skipping');
      return [];
    }
    if (type === 'tv' && (season <= 0 || episode <= 0)) return [];
    const deadline = ctx.deadline || (Date.now() + (Number(ctx.timeoutMs) || 10000));

    const search = await searchSite(net, title, deadline);
    if (!search || !search.posts.length) {
      ctx.log('hindmoviez: no search results');
      return [];
    }
    const ranked = rankPosts(search.posts, title, year, type, season).slice(0, 2);
    if (!ranked.length) return [];

    const out = [];
    const seen = {};
    for (let i = 0; i < ranked.length; i += 1) {
      if (Date.now() > deadline) break;
      const post = ranked[i];
      const page = await net.getText(post.url, {
        timeoutMs: 8000,
        deadline: deadline,
        headers: { Referer: search.base + '/', 'User-Agent': http.DEFAULT_UA },
      });
      if (!page) continue;
      const groups = postGroups(page)
        .map(function (group) {
          return {
            heading: group.heading,
            indexUrl: group.indexUrl,
            height: util.parseHeight(group.heading),
            seasonMatch: seasonInHeading(group.heading, season),
            tv: SEASON_RE.test(group.heading),
          };
        })
        .filter(function (group) { return type === 'tv' ? group.tv && group.seasonMatch : !group.tv; })
        .filter(function (group) { return group.height >= FLOOR; })
        .sort(function (a, b) { return b.height - a.height; })
        .slice(0, 2);
      if (!groups.length) continue;

      const pages = await Promise.all(groups.map(function (group) {
        return net.getText(group.indexUrl, {
          timeoutMs: 8000,
          deadline: deadline,
          headers: { Referer: post.url, 'User-Agent': http.DEFAULT_UA },
        }).then(function (text) { return { group: group, text: text }; });
      }));

      for (let p = 0; p < pages.length; p += 1) {
        if (Date.now() > deadline) break;
        const index = pages[p];
        if (!index.text) continue;
        const indexTitle = pageTitle(index.text);
        if (!indexMatches(indexTitle, title, year, type, season)) continue;
        const files = indexFiles(index.text, type, season, episode);
        if (!files.length) continue;
        const file = files[0];
        const directs = await resolveHshare(net, file.url, index.group.indexUrl, deadline);
        for (let d = 0; d < directs.length; d += 1) {
          emit(out, seen, directs[d], file, index.group, indexTitle);
        }
      }
      if (out.length) break;
    }
    return out;
  },
};

async function searchSite(net, title, deadline) {
  const enc = encodeURIComponent(title);
  const probe = async function (base) {
    if (Date.now() > deadline) return null;
    const res = await net.request(base + '/?s=' + enc, {
      timeoutMs: 7000,
      deadline: deadline,
      headers: { Referer: base + '/', 'User-Agent': http.DEFAULT_UA },
    });
    if (!res || !res.ok || !/entry-title-link/i.test(res.text)) return null;
    const posts = searchCards(res.text);
    if (!posts.length) return null;
    return { base: util.originOf(res.url) || base, posts: posts };
  };

  if (healedBase && Date.now() - healedAt < HEAL_TTL_MS) {
    const cached = await probe(healedBase);
    if (cached) return cached;
  }
  for (let i = 0; i < SEEDS.length; i += 1) {
    const hit = await probe(SEEDS[i]);
    if (hit) {
      healedBase = hit.base;
      healedAt = Date.now();
      return hit;
    }
  }
  return null;
}

function searchCards(text) {
  const out = [];
  const seen = {};
  html.blocks(text, 'article').forEach(function (block) {
    const anchor = html.anchors(block.inner).find(function (item) {
      return /entry-title-link/i.test((item.attrs && item.attrs.class) || '');
    });
    if (!anchor || !anchor.href || !anchor.text || seen[anchor.href]) return;
    seen[anchor.href] = true;
    const label = util.decodeEntities(anchor.text);
    out.push({
      url: anchor.href,
      title: label,
      year: String(util.yearFromText(label) || ''),
    });
  });
  return out;
}

function rankPosts(posts, title, year, type, season) {
  return posts
    .map(function (post) {
      return {
        post: post,
        fits: util.titleFits(title, post.title, year),
        season: seasonInHeading(post.title, season),
        score: util.titleScore(title, post.title, year, post.year),
      };
    })
    .filter(function (entry) { return entry.fits; })
    .sort(function (a, b) {
      if (type === 'tv' && a.season !== b.season) return a.season ? -1 : 1;
      return b.score - a.score;
    })
    .map(function (entry) { return entry.post; });
}

function postGroups(text) {
  return groupTokens(text)
    .map(function (group) {
      const anchor = group.anchors.find(function (item) { return INDEX_RE.test(item.href); });
      if (!anchor) return null;
      return { heading: group.heading, indexUrl: anchor.href };
    })
    .filter(Boolean);
}

function indexFiles(text, type, season, episode) {
  const out = [];
  html.anchors(text).forEach(function (anchor) {
    if (!HS_RE.test(anchor.href)) return;
    const raw = (anchor.href.match(/[?&]id=([^&]+)/) || [])[1] || '';
    let file = '';
    try {
      file = decodeURIComponent(raw);
    } catch (error) {
      file = raw;
    }
    if (!file || /\.zip$/i.test(file) || ZIP_RE.test(file)) return;
    const height = util.parseHeight(file);
    if (util.isKnownBelowFloor(height, FLOOR)) return;
    if (type === 'tv' && !util.episodeMatches(file, season, episode)) return;
    if (!out.some(function (item) { return item.url === anchor.href; })) {
      out.push({ url: anchor.href, file: file, height: height });
    }
  });
  return out.sort(function (a, b) { return b.height - a.height; });
}

async function resolveHshare(net, hshareUrl, referer, deadline) {
  const page = await net.getText(hshareUrl, {
    timeoutMs: 8000,
    deadline: deadline,
    headers: { Referer: referer, 'User-Agent': http.DEFAULT_UA },
  });
  if (!page) return [];
  const anchors = html.anchors(page);
  const shine = anchors.find(function (anchor) { return /gdshine\.org\/s\//i.test(anchor.href); });
  const direct = anchors.find(function (anchor) { return /gdirect\.online\/redirect/i.test(anchor.href); });
  if (shine) {
    const url = await resolveGdShine(net, shine.href, hshareUrl, deadline);
    if (url) return [url];
  }
  if (direct) {
    const url = await resolveGDirect(net, direct.href, hshareUrl, deadline);
    if (url) return [url];
  }
  return [];
}

async function resolveGdShine(net, pageUrl, referer, deadline) {
  const short = String(pageUrl).match(/\/s\/([A-Za-z0-9_-]+)/);
  if (!short) return '';
  const headers = { Referer: referer, 'User-Agent': http.DEFAULT_UA };
  const info = await net.getJson('https://gdshine.org/api/files/s/' + short[1], {
    timeoutMs: 8000,
    deadline: deadline,
    headers: headers,
  });
  const id = info && info.data && info.data.id;
  if (!id) return '';
  const mirror = await net.getJson('https://gdshine.org/api/gp/mirror/' + id, {
    timeoutMs: 8000,
    deadline: deadline,
    headers: headers,
  });
  return mirror && mirror.data && mirror.data.url ? mirror.data.url : '';
}

async function resolveGDirect(net, url, referer, deadline) {
  const page = await net.getText(url, {
    timeoutMs: 8000,
    deadline: deadline,
    headers: { Referer: referer, 'User-Agent': http.DEFAULT_UA },
  });
  const match = String(page || '').match(GOOGLE_RE);
  return match ? util.decodeEntities(match[0]) : '';
}

function indexMatches(indexTitle, title, year, type, season) {
  if (!indexTitle) return false;
  if (type === 'tv' && !util.seasonPackMatches(indexTitle, season)) return false;
  return util.titleFits(title, indexTitle, year);
}

function seasonInHeading(text, season) {
  const match = String(text || '').match(SEASON_RE);
  if (!match) return false;
  const first = Number(match[1]);
  const last = match[2] ? Number(match[2]) : first;
  return Number(season) >= first && Number(season) <= last;
}

function emit(out, seen, direct, file, group, indexTitle) {
  if (!direct || seen[direct]) return;
  seen[direct] = true;
  const height = file.height || util.parseHeight(file.file) || group.height || 0;
  if (util.isKnownBelowFloor(height, FLOOR)) return;
  const language = util.languageLabel(file.file) ||
    util.languageLabel(group.heading) ||
    '';
  out.push({
    provider: module.exports.name,
    url: direct,
    type: 'mp4',
    quality: util.qualityLabel(height),
    height: height,
    language: language,
    size: util.normalizeSizeToken(indexTitle) || util.normalizeSizeToken(group.heading),
    title: (module.exports.name + ' ' + util.qualityLabel(height)).trim(),
    releaseText: (file.file + ' ' + group.heading).trim().slice(0, 300),
    headers: { 'User-Agent': http.DEFAULT_UA },
  });
}

function groupTokens(text) {
  const source = String(text || '');
  const tokens = [];
  let match;
  const headingRe = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
  while ((match = headingRe.exec(source))) {
    const label = util.decodeEntities(util.stripTags(match[2]));
    if (label) tokens.push({ kind: 'heading', text: label, pos: match.index, link: /<a\b/i.test(match[2]) });
  }
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  while ((match = anchorRe.exec(source))) {
    const href = (match[1].match(/href\s*=\s*"([^"]+)"/i) || [])[1];
    if (!href) continue;
    tokens.push({
      kind: 'anchor',
      href: util.decodeEntities(href),
      text: util.decodeEntities(util.stripTags(match[2])),
      pos: match.index,
    });
  }
  tokens.sort(function (a, b) { return a.pos - b.pos; });
  const groups = [];
  let heading = '';
  let anchors = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.kind === 'heading') {
      if (token.link && heading) continue;
      if (heading && anchors.length) groups.push({ heading: heading, anchors: anchors });
      heading = token.text;
      anchors = [];
    } else if (heading) {
      anchors.push(token);
    }
  }
  if (heading && anchors.length) groups.push({ heading: heading, anchors: anchors });
  return groups;
}

function pageTitle(text) {
  const og = String(text || '').match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  if (og) return util.decodeEntities(og[1]);
  const title = String(text || '').match(/<title>([^<]+)<\/title>/i);
  return title ? util.decodeEntities(title[1]) : '';
}

module.exports._test = {
  searchCards: searchCards,
  rankPosts: rankPosts,
  postGroups: postGroups,
  indexFiles: indexFiles,
  indexMatches: indexMatches,
  seasonInHeading: seasonInHeading,
  groupTokens: groupTokens,
};
