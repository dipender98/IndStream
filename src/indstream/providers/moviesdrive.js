'use strict';

const http = require('../http');
const util = require('../util');
const tmdb = require('../tmdb');
const filehost = require('../filehost');

const SEEDS = [
  'https://new5.moviesdrive.cyou',
  'https://new4.moviesdrive.cyou',
  'https://new3.moviesdrive.cyou',
  'https://new2.moviesdrive.cyou',
];
const HEAL_TTL_MS = 60 * 60 * 1000;
const FLOOR = 720;
const ARCHIVE_RE = /\/archive\/\d+/i;
const HUB_RE = /hubcloud\.[a-z]/i;
const SEASON_RE = /\bseason\s*0*(\d{1,2})(?:\s*[-–]\s*0*(\d{1,2}))?/i;
const ZIP_RE = /\b(?:zip|batch|complete|season\s*pack)\b/i;
const ARCHIVE_FILE_RE = /\.(?:zip|rar|7z|tar|gz)(?:[?#]|$)/i;

let healedBase = '';
let healedAt = 0;

module.exports = {
  id: 'moviesdrive',
  name: 'MoviesDrive',
  speed: 'slow',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 12000,
  toggle: {
    key: 'sourceMoviesdrive',
    label: 'MoviesDrive',
    description: 'Hindi-English releases resolved through HubCloud and Pixeldrain mirrors.',
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
      ctx.log('moviesdrive: missing title, skipping');
      return [];
    }
    if (type === 'tv' && (season <= 0 || episode <= 0)) return [];
    const deadline = ctx.deadline || (Date.now() + (Number(ctx.timeoutMs) || 10000));

    const search = await searchSite(net, title, deadline);
    if (!search || !search.cards.length) {
      ctx.log('moviesdrive: no search results');
      return [];
    }
    const ranked = rankCards(search.cards, title, year, type, season).slice(0, 2);
    if (!ranked.length) return [];

    const out = [];
    const seen = {};
    for (let i = 0; i < ranked.length; i += 1) {
      if (Date.now() > deadline) break;
      const card = ranked[i];
      const post = await net.getText(card.url, {
        timeoutMs: 8000,
        deadline: deadline,
        headers: { Referer: search.base + '/', 'User-Agent': http.DEFAULT_UA },
      });
      if (!post) continue;
      const postTitle = pageTitle(post) || card.title;
      const groups = postGroups(post)
        .filter(function (group) { return !ZIP_RE.test(group.label); })
        .map(function (group) {
          const height = util.parseHeight(group.label) || util.parseHeight(group.heading);
          return {
            heading: group.heading,
            label: group.label,
            archive: group.archive,
            height: height,
            season: seasonInHeading(group.heading, season),
          };
        })
        .filter(function (group) { return group.height >= FLOOR; })
        .filter(function (group) { return type !== 'tv' || group.season !== false; })
        .sort(function (a, b) { return b.height - a.height; })
        .slice(0, 2);
      if (!groups.length) continue;

      const pages = await Promise.all(groups.map(function (group) {
        return net.getText(group.archive, {
          timeoutMs: 8000,
          deadline: deadline,
          headers: { Referer: card.url, 'User-Agent': http.DEFAULT_UA },
        }).then(function (text) { return { group: group, text: text }; });
      }));

      for (let p = 0; p < pages.length; p += 1) {
        if (Date.now() > deadline) break;
        const page = pages[p];
        if (!page.text) continue;
        const items = archiveItems(page.text, type, season, episode);
        for (let j = 0; j < items.length; j += 1) {
          if (Date.now() > deadline) break;
          const item = items[j];
          const files = await resolveLinks(net, item.links, page.group.archive, deadline);
          for (let f = 0; f < files.length; f += 1) {
            emit(out, seen, files[f], item, page.group, postTitle, card.url);
          }
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
    const res = await net.request(base + '/search/' + enc + '/', {
      timeoutMs: 7000,
      deadline: deadline,
      headers: { Referer: base + '/', 'User-Agent': http.DEFAULT_UA },
    });
    if (!res || !res.ok || !/poster-card/i.test(res.text)) return null;
    const cards = searchCards(res.text);
    if (!cards.length) return null;
    return { base: util.originOf(res.url) || base, cards: cards };
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
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(String(text || '')))) {
    const inner = match[2];
    if (inner.indexOf('poster-card') < 0) continue;
    const href = (match[1].match(/href\s*=\s*"([^"]+)"/i) || [])[1];
    const titleMatch = inner.match(/class="[^"]*poster-title[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const label = util.stripTags(titleMatch ? titleMatch[1] : '');
    if (!href || !label || seen[href]) continue;
    seen[href] = true;
    out.push({ url: util.decodeEntities(href), title: label, year: String(util.yearFromText(label) || '') });
  }
  return out;
}

function rankCards(cards, title, year, type, season) {
  return cards
    .map(function (card) {
      return {
        card: card,
        fits: util.titleFits(title, card.title, year),
        season: type === 'tv' ? seasonInHeading(card.title, season) : true,
        yearMatch: !!(year && card.year && Number(year) === Number(card.year)),
      };
    })
    .filter(function (entry) { return entry.fits && (type !== 'tv' || entry.season !== false); })
    .sort(function (a, b) {
      if (a.season !== b.season) return a.season ? -1 : 1;
      if (a.yearMatch !== b.yearMatch) return a.yearMatch ? -1 : 1;
      return util.titleScore(title, b.card.title, year, b.card.year) -
        util.titleScore(title, a.card.title, year, a.card.year);
    })
    .map(function (entry) { return entry.card; });
}

function seasonInHeading(text, season) {
  const match = String(text || '').match(SEASON_RE);
  if (!match) return null;
  const first = Number(match[1]);
  const last = match[2] ? Number(match[2]) : first;
  return Number(season) >= first && Number(season) <= last;
}

function postGroups(text) {
  return groupTokens(text)
    .map(function (group) {
      const anchor = group.anchors.find(function (item) { return ARCHIVE_RE.test(item.href); });
      if (!anchor) return null;
      return { heading: group.heading, label: anchor.text, archive: anchor.href };
    })
    .filter(Boolean);
}

function archiveItems(text, type, season, episode) {
  const out = [];
  groupTokens(text).forEach(function (group) {
    const heading = group.heading;
    const height = util.parseHeight(heading);
    if (type === 'tv') {
      if (!util.episodeMatches(heading, season, episode)) return;
      if (util.isKnownBelowFloor(height, FLOOR)) return;
    } else if (util.isKnownBelowFloor(height, FLOOR)) {
      return;
    }
    const links = group.anchors.filter(function (anchor) { return HUB_RE.test(anchor.href); });
    if (!links.length) return;
    out.push({
      heading: heading,
      height: height,
      size: util.normalizeSizeToken(heading),
      links: links,
    });
  });
  return out;
}

async function resolveLinks(net, links, referer, deadline) {
  const ordered = links.slice().sort(function (a, b) {
    const ad = /\/drive\//i.test(a.href) ? 1 : 0;
    const bd = /\/drive\//i.test(b.href) ? 1 : 0;
    return bd - ad;
  });
  for (let i = 0; i < ordered.length; i += 1) {
    if (Date.now() > deadline) break;
    const files = await filehost.hubDriveFiles(ordered[i].href, referer, net);
    const usable = (files || []).filter(usableFile);
    if (usable.length) return usable;
  }
  return [];
}

function usableFile(file) {
  const url = String((file && file.url) || '');
  if (!/^https?:\/\//i.test(url)) return false;
  if (/workers\.dev/i.test(url)) return false;
  if (/\bgpdl\d*\./i.test(url)) return false;
  if (/hubcloud|hubdrive/i.test(url)) return false;
  if (ARCHIVE_FILE_RE.test(url)) return false;
  return true;
}

function emit(out, seen, file, item, group, postTitle, pageUrl) {
  const url = String(file.url);
  if (seen[url]) return;
  seen[url] = true;
  const height = util.parseHeight(file.quality) || item.height || group.height || util.parseHeight(url);
  if (util.isKnownBelowFloor(height, FLOOR)) return;
  const language = util.languageLabel(file.language) ||
    util.languageLabel(item.heading) ||
    util.languageLabel(group.heading) ||
    util.languageLabel(postTitle) ||
    '';
  out.push({
    provider: module.exports.name,
    url: url,
    type: /\.m3u8(\?|$)/i.test(url) ? 'hls' : /\.mpd(\?|$)/i.test(url) ? 'dash' : 'mp4',
    quality: util.qualityLabel(height),
    height: height,
    language: language,
    size: item.size || group.size || '',
    title: (module.exports.name + ' ' + util.qualityLabel(height)).trim(),
    releaseText: (postTitle + ' ' + item.heading).trim().slice(0, 300),
    headers: { Referer: pageUrl, 'User-Agent': http.DEFAULT_UA },
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
  rankCards: rankCards,
  postGroups: postGroups,
  archiveItems: archiveItems,
  groupTokens: groupTokens,
};
