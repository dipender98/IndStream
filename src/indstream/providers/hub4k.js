'use strict';

const http = require('../http');
const html = require('../html');
const util = require('../util');
const filehost = require('../filehost');

const BASES = ['https://4khdhub.one', 'https://4khdhub.com'];
const HUB_LANG_RE = /\b(hindi|english|tamil|telugu|malayalam|kannada|bengali|marathi|punjabi|dual|multi)\b/i;
const HUB_OTHER_LANG_RE = /english|dual|multi|tamil|telugu|malayalam|kannada|bengali|marathi|punjabi|urdu|japanese|korean|chinese/;
const HUB_QUALITY_RE = /\b(2160p|1440p|1080p|720p|480p)\b/i;
const HUB_GATEWAY_HOST_RE = /greenmotors|hubcloud|hubdrive/i;
const OG_TITLE_RE = /<meta\s+property="og:title"\s+content="([^"]+)"/i;
const HTML_TITLE_RE = /<title>([^<]+)<\/title>/i;

module.exports = {
  id: 'hub4k',
  name: '4KHDHub',
  speed: 'slow',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 7000,
  toggle: {
    key: 'sourceHub4k',
    label: '4KHDHub',
    description: '4K-first release pages resolved through file-host gateways.',
  },

  async resolve(ctx) {
    const net = ctx.http || http;
    const meta = await http.withTimeout(ctx.metaPromise || Promise.resolve(ctx.meta || null), 6000, null);
    const title = meta && meta.title ? meta.title : '';
    const year = meta && meta.year ? meta.year : '';
    if (!title) {
      ctx.log('hub4k: missing title, skipping');
      return [];
    }

    const deadline = ctx.deadline || (Date.now() + ctx.timeoutMs);

    let base = '';
    let searchHtml = '';
    let fallback = null;
    for (let i = 0; i < BASES.length; i += 1) {
      if (Date.now() > deadline) break;
      const candidate = BASES[i];
      const h = await net.getText(candidate + '/?s=' + encodeURIComponent(title), {
        timeoutMs: 8000,
        headers: { Referer: candidate + '/' },
      });
      if (!h) continue;
      if (hubParseCards(h, candidate).length) {
        base = candidate;
        searchHtml = h;
        break;
      }
      if (!fallback) fallback = { base: candidate, html: h };
    }
    if (!base) {
      if (!fallback) return [];
      base = fallback.base;
      searchHtml = fallback.html;
    }

    const cards = hubParseCards(searchHtml, base);
    if (!cards.length) return [];
    const ranked = cards
      .map(function (card) { return { card: card, score: util.titleScore(title, card.title, year, util.titleYearOf(card.title)) }; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 3);
    if (!ranked.length || ranked[0].score < 0.6) return [];

    const out = [];
    const seen = {};
    for (let i = 0; i < Math.min(2, ranked.length); i += 1) {
      if (Date.now() > deadline) break;
      const card = ranked[i].card;
      const post = await net.getText(card.url, {
        timeoutMs: 8000,
        headers: { Referer: base + '/' },
      });
      if (!post) continue;
      if (!hubPostYearOk(post, year)) continue;
      const items = util.episodeOrSeason(hub4kItems(post), function (it) { return it.title; }, ctx.type, Number(ctx.season) || 0, Number(ctx.episode) || 0).slice(0, 4);

      for (let j = 0; j < items.length; j += 1) {
        if (Date.now() > deadline) break;
        const item = items[j];
        const langNames = util.languageNames(item.languages);
        const lang = langNames.join(', ');
        const audioLang = util.languageLabel(item.languages) || lang;
        const priority = hubLangOf(item.languages);

        for (let g = 0; g < item.gatewayUrls.length; g += 1) {
          if (Date.now() > deadline) break;
          const gateway = item.gatewayUrls[g];
          const gwPage = await net.getText(gateway, {
            timeoutMs: 10000,
            headers: { Referer: card.url },
          });
          if (!gwPage) continue;
          let resolvedDrive = '';
          [filehost.rotatorTarget(gwPage), filehost.jsRedirectTarget(gwPage)].forEach(function (target) {
            if (target && !resolvedDrive) resolvedDrive = util.resolveUrl(gateway, target);
          });
          if (!resolvedDrive) continue;

          let finalDrive = resolvedDrive;
          if (/hubdrive\./i.test(resolvedDrive)) {
            const innerPage = await net.getText(resolvedDrive, {
              timeoutMs: 8000,
              headers: { Referer: card.url },
            });
            if (!innerPage) continue;
            let mirror = '';
            html.anchors(innerPage).forEach(function (a) {
              if (!mirror && /hubcloud/i.test(a.href)) mirror = util.resolveUrl(resolvedDrive, a.href);
            });
            if (!mirror || mirror.indexOf('http') !== 0) continue;
            finalDrive = mirror;
          }

          const referer = util.originOf(finalDrive) || 'https://hubcloud.ist/';
          const files = await filehost.hubDriveFiles(finalDrive, card.url, net);
          for (let f = 0; f < files.length; f += 1) {
            if (Date.now() > deadline) break;
            const file = files[f];
            const qText = file.quality || (item.title.match(HUB_QUALITY_RE) || [])[0] || '';
            const fileAudio = util.languageLabel(file.language);
            const audio = fileAudio || audioLang || lang;
            if (seen[file.url]) continue;
            seen[file.url] = true;
            out.push({
              provider: module.exports.name,
              url: file.url,
              type: file.url.indexOf('.m3u8') >= 0 ? 'hls' : file.url.indexOf('.mpd') >= 0 ? 'dash' : 'mp4',
              quality: util.qualityLabel(util.parseHeight(qText || item.title)),
              height: util.parseHeight(qText || item.title),
              language: audio,
              size: item.size,
              title: (module.exports.name + ' ' + qText).trim(),
              headers: { Referer: referer, 'User-Agent': http.DEFAULT_UA },
            });
            if (out.length >= 6) break;
          }
          if (out.length >= 6) break;
        }
        if (out.length >= 6) break;
      }
      if (out.length) break;
    }
    return out;
  },
};

function hubParseCards(htmlText, base) {
  const out = [];
  const seen = {};
  html.anchors(htmlText).forEach(function (a) {
    if (!/movie-card/.test(a.attrs.class || '')) return;
    const href = util.resolveUrl(base, a.href).trim();
    if (href.indexOf('http') !== 0) return;
    const title = String(a.attrs['aria-label'] || '')
      .replace(/ details$/i, '')
      .trim() || a.text.trim();
    if (!title || seen[href]) return;
    seen[href] = true;
    out.push({ url: href, title: title });
  });
  return out;
}

function hubPostYearOk(htmlText, year) {
  if (!year) return true;
  const title = (htmlText.match(OG_TITLE_RE) || [])[1] || (htmlText.match(HTML_TITLE_RE) || [])[1] || '';
  return title.indexOf(year) >= 0;
}

function hub4kItems(htmlText) {
  const out = [];
  html.blocks(htmlText, 'div', 'download-item').forEach(function (block) {
    html.blocks(block.inner, 'div', 'episode-download-item').forEach(function (ep) {
      out.push(itemFromBlock(ep));
    });
    const item = itemFromBlock(block);
    if (item) out.push(item);
  });
  return out.filter(function (item) { return item.gatewayUrls.length > 0; });
}

function itemFromBlock(block) {
  const header = html.firstTag(block.inner, 'div', 'download-header');
  const headerInner = header ? header.inner : block.inner;
  const title = html.firstTag(headerInner, 'div', 'flex-1') || html.firstTag(headerInner, 'div', 'font-semibold') ||
    html.firstTag(block.inner, 'div', 'file-title') || html.firstTag(block.inner, 'div', 'episode-file-title');
  const titleText = (title ? html.textOf(title.inner) : html.textOf(headerInner)).trim();
  if (!titleText) return null;

  const badges = [];
  html.eachTag(block.inner, 'span').forEach(function (s) {
    if (/badge/.test(s.attrs.class || '')) badges.push(html.textOf(s.inner).trim());
  });
  if (!badges.length) {
    html.eachTag(block.inner, 'code').forEach(function (c) {
      html.eachTag(c.inner, 'span').forEach(function (s) {
        badges.push(html.textOf(s.inner).trim());
      });
    });
  }
  let size = '';
  badges.forEach(function (badge) {
    const tok = util.normalizeSizeToken(badge);
    if (tok && !size) {
      size = tok;
    }
  });
  const langs = badges.filter(function (badge) { return HUB_LANG_RE.test(badge); }).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).join(' ');

  const gateways = [];
  const seen = {};
  html.anchors(block.inner).forEach(function (a) {
    if (a.href.indexOf('http') !== 0) return;
    if (!HUB_GATEWAY_HOST_RE.test(a.href)) return;
    if (seen[a.href]) return;
    seen[a.href] = true;
    gateways.push({ url: a.href, cloud: /hubcloud/i.test(a.text) });
  });
  gateways.sort(function (a, b) { return Number(b.cloud) - Number(a.cloud); });

  return { title: titleText, size: size, languages: langs, gatewayUrls: gateways.map(function (g) { return g.url; }) };
}

function hubLangOf(languages) {
  const s = String(languages || '').toLowerCase();
  if (s.indexOf('hindi') >= 0 && HUB_OTHER_LANG_RE.test(s)) return 'Multi';
  if (s.indexOf('hindi') >= 0) return 'Hindi';
  return util.languageLabel(languages);
}

module.exports._test = {
  hubParseCards: hubParseCards,
  hubPostYearOk: hubPostYearOk,
  hub4kItems: hub4kItems,
  hubLangOf: hubLangOf,
};
