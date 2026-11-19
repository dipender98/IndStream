'use strict';

const http = require('../http');
const html = require('../html');
const util = require('../util');
const tmdb = require('../tmdb');
const filehost = require('../filehost');

const BASE = 'https://m1.multimovies.courses';
const HUBCLOUD_RE = /hubcloud\.[a-z]/i;
const EMPTY_RE = /<div[^>]*class="[^"]*dl-empty-box/;
const OG_TITLE_RE = /<meta\s+property="og:title"\s+content="([^"]+)"/i;
const HTML_TITLE_RE = /<title>([^<]+)<\/title>/i;

module.exports = {
  id: 'multimovies',
  name: 'MultiMovies',
  speed: 'slow',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 10000,
  toggle: {
    key: 'sourceMultimovies',
    label: 'MultiMovies',
    description: 'Multi-language releases resolved through HubCloud file mirrors.',
  },

  async resolve(ctx) {
    const net = ctx.http || http;
    const meta = await tmdb.awaitMeta(ctx);
    const title = meta && meta.title ? meta.title : '';
    const year = meta && meta.year ? meta.year : '';
    if (!title) {
      ctx.log('multimovies: missing title, skipping');
      return [];
    }

    const type = ctx.type === 'series' ? 'tv' : 'movie';
    const season = Number(ctx.season) || 0;
    const episode = Number(ctx.episode) || 0;
    if (type === 'tv' && (season <= 0 || episode <= 0)) return [];

    const deadline = ctx.deadline || (Date.now() + (Number(ctx.timeoutMs) || 10000));
    const headers = { Referer: BASE + '/', 'User-Agent': http.DEFAULT_UA };

    const search = await net.getText(BASE + '/search?q=' + encodeURIComponent(title), {
      timeoutMs: 8000,
      deadline: deadline,
      headers: headers,
    });
    const cards = searchCards(search);
    if (!cards.length) {
      ctx.log('multimovies: no search results');
      return [];
    }
    const ranked = cards
      .filter(function (card) { return card.type === type; })
      .map(function (card) {
        const score = util.titleScore(title, card.title, year, card.year);
        const exact = year && card.year && Number(year) === Number(card.year) ? 1 : 0;
        return { card: card, score: score, exact: exact };
      })
      .filter(function (entry) { return entry.score >= 0.6; })
      .sort(function (a, b) {
        if (a.exact !== b.exact) return b.exact - a.exact;
        return b.score - a.score;
      })
      .slice(0, 2);
    if (!ranked.length) return [];

    const out = [];
    const seen = {};
    for (let i = 0; i < ranked.length; i += 1) {
      if (Date.now() > deadline) break;
      const card = ranked[i].card;
      let pageUrl = BASE + '/download/' + card.slug;
      if (type === 'tv') {
        pageUrl += '?season=' + season + '&episode=' + episode;
      }
      const page = await net.getText(pageUrl, {
        timeoutMs: 8000,
        deadline: deadline,
        headers: headers,
      });
      if (!page || EMPTY_RE.test(page)) continue;
      const postTitle = ((page.match(OG_TITLE_RE) || page.match(HTML_TITLE_RE) || [])[1] || card.title).trim();

      const packages = downloadPackages(page);
      for (let p = 0; p < packages.length && out.length < 6; p += 1) {
        if (Date.now() > deadline) break;
        const pkg = packages[p];
        for (let g = 0; g < pkg.hubUrls.length && out.length < 6; g += 1) {
          if (Date.now() > deadline) break;
          const files = await filehost.hubDriveFiles(pkg.hubUrls[g], pageUrl, net);
          emitFiles(out, seen, files, {
            package: pkg,
            postTitle: postTitle,
            pageUrl: pageUrl,
          });
        }
      }
      if (out.length) break;
    }
    return out;
  },
};

function searchCards(htmlText) {
  const out = [];
  const seen = {};
  html.blocks(htmlText, 'article', 'poster-card').forEach(function (card) {
    const inner = card.inner;
    const anchor = html.anchors(inner).find(function (a) {
      return /^\/(movie|series)\/[a-z0-9-]+\/?$/i.test(a.href);
    });
    if (!anchor) return;
    const match = anchor.href.match(/^\/(movie|series)\/([a-z0-9-]+)\/?$/i);
    if (!match) return;
    const type = match[1].toLowerCase() === 'series' ? 'tv' : 'movie';
    const slug = match[2];
    const title = String(anchor.attrs['aria-label'] || anchor.text || '').trim();
    if (!title) return;
    const yearMatch = inner.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? yearMatch[0] : '';
    if (seen[slug]) return;
    seen[slug] = true;
    out.push({ slug: slug, title: title, year: year, type: type });
  });
  return out;
}

function downloadPackages(pageHtml) {
  const out = [];
  html.blocks(pageHtml, 'div', 'dl-package-card').forEach(function (card) {
    const inner = card.inner;
    const qualityMatch = inner.match(/dl-package-quality[\s\S]*?<span>([^<]+)<\/span>/);
    const quality = qualityMatch ? decodeText(qualityMatch[1]).trim() : '';
    const sizeMatch = inner.match(/dl-size-badge">([^<]+)</);
    const size = sizeMatch ? util.normalizeSizeToken(decodeText(sizeMatch[1]).trim()) : '';
    const hubUrls = [];
    html.anchors(inner).forEach(function (a) {
      if (a.href.indexOf('http') !== 0) return;
      if (!HUBCLOUD_RE.test(a.href)) return;
      if (hubUrls.indexOf(a.href) >= 0) return;
      hubUrls.push(a.href);
    });
    if (!hubUrls.length) return;
    out.push({ quality: quality, size: size, hubUrls: hubUrls });
  });
  return out;
}

function emitFiles(out, seen, files, info) {
  (Array.isArray(files) ? files : []).forEach(function (file) {
    if (!file || !file.url || file.url.indexOf('http') !== 0) return;
    if (seen[file.url]) return;
    seen[file.url] = true;
    const url = file.url;
    const height = util.parseHeight(file.quality || '') ||
      util.parseHeight(info.package.quality) ||
      util.parseHeight(url) ||
      0;
    const audio = util.languageLabel(file.language || '') ||
      util.languageLabel(info.package.quality) ||
      '';
    out.push({
      provider: module.exports.name,
      url: url,
      type: /\.m3u8(\?|$)/i.test(url) ? 'hls' : /\.mpd(\?|$)/i.test(url) ? 'dash' : 'mp4',
      quality: util.qualityLabel(height),
      height: height,
      language: audio,
      size: info.package.size || '',
      title: (module.exports.name + ' ' + (info.package.quality || '')).trim(),
      releaseText: (info.postTitle + ' ' + info.package.quality).trim().slice(0, 300),
      headers: { Referer: info.pageUrl, 'User-Agent': http.DEFAULT_UA },
    });
  });
}

function decodeText(value) {
  return String(value == null ? '' : value)
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); });
}

module.exports._test = {
  searchCards: searchCards,
  downloadPackages: downloadPackages,
};
