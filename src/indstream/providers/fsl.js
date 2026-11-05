'use strict';

const http = require('../http');
const html = require('../html');
const util = require('../util');
const filehost = require('../filehost');

const SEEDS = [
  { family: 'vegamovies', seed: 'https://new1.vegamovies.lease', bootstrap: 'https://new2.vegamovies.futbol' },
  { family: 'rogmovies', seed: 'https://rogmovies.one', bootstrap: null },
];
const FSL_LANDING_PROBE = '/?re=vg&t=2';
const FSL_GATEWAY_LINK_RE = /https?:\/\/[a-z0-9.\-]*(?:nexdrive|gdflix|filepress|vcloud)\.[a-z]{2,10}\/[^\s"'<\\]+/i;
const HEADING_TAG_RE = /^h[1-6]$/;
const DOWNLOAD_HEADING_RE = /(\d{3,4}p\b|4K|\d+(?:\.\d+)?\s?(?:GB|MB)|\/ZiP|\/ZIP|\bZIP\b|Batch|Season\s*\d|\bPack\b|DUAL\s*[- ]?AUDIO|HINDI|TAMIL|TELUGU|\bEP(?:\.|ISODE)?\s*\d|S\d{1,2}[\s._-]?E\d{1,3})/i;
const HEADING_SIZE_RE = /\[\s*(\d+(?:\.\d+)?\s*(?:GB|MB)(?:\/E\b|\/EP\b|\/ZiP|\/ZIP)?)\s*]/i;
const SERVER_LABEL_ACTION_RE = /^(?:download|file|watch|play|get|stream|online)\b/i;
const SERVER_LABEL_TRAILING_RE = /\s*\bserver\b\s*$/i;
const QUALITY_TEXT_RE = /\b(2160p|1440p|1080p|720p|480p|4k)\b/i;
const FASTDL_LINK_RE = /https?:\/\/fastdl\.[a-z]{2,10}\/embed(?:\.php)?\?download=[A-Za-z0-9_\-]+/gi;
const VCLOUD_LINK_RE = /https?:\/\/vcloud\.[a-z]{2,10}\/[A-Za-z0-9_\-]{6,}/g;

const baseCache = {};

module.exports = {
  id: 'fsl',
  name: 'FSL',
  speed: 'slow',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 6000,
  toggle: {
    key: 'sourceFsl',
    label: 'FSL',
    description: 'Fast file links from release blogs. Heaviest source, so it runs last.',
  },

  async resolve(ctx) {
    const meta = await http.withTimeout(ctx.metaPromise || Promise.resolve(ctx.meta || null), 3000, null);
    const title = meta && meta.title ? meta.title : '';
    const year = meta && meta.year ? meta.year : '';
    if (!title) {
      ctx.log('fsl: missing title, skipping');
      return [];
    }

    const deadline = ctx.deadline || (Date.now() + ctx.timeoutMs);

    const out = [];
    const seen = {};
    for (let s = 0; s < SEEDS.length; s += 1) {
      if (Date.now() > deadline) break;
      const seed = SEEDS[s];
      const base = await fslBase(seed, ctx);
      if (!base) continue;
      const json = await fslGet(base + '/ts-search.php?q=' + encodeURIComponent(title) + '&page=1', base, 8000, ctx);
      if (!json) continue;
      const hits = fslSearchHits(json);
      if (!hits.length) continue;
      const ranked = hits
        .map(function (hit) { return { hit: hit, score: util.titleScore(title, hit.title, year, util.titleYearOf(hit.title)) }; })
        .filter(function (row) { return !year || !util.titleYearOf(row.hit.title) || row.score > 0.5; })
        .sort(function (a, b) { return b.score - a.score; })
        .slice(0, 2);
      for (let r = 0; r < ranked.length; r += 1) {
        if (Date.now() > deadline) break;
        const permalink = util.resolveUrl(base, ranked[r].hit.permalink);
        const post = await fslGet(permalink, base, 10000, ctx);
        if (!post) continue;
        const groups = util.episodeOrSeason(fslGroups(post), function (g) { return g.heading; }, ctx.type, Number(ctx.season) || 0, Number(ctx.episode) || 0).slice(0, 4);
        for (let g = 0; g < groups.length; g += 1) {
          if (Date.now() > deadline) break;
          const group = groups[g];
          const size = headingSizeOf(group.heading);
          const priorityLang = releaseLanguageOf(group.heading);
          const lang = util.languageLabel(group.heading) || priorityLang;
          const qText = (group.heading.match(/\b(2160p|1440p|1080p|720p|480p)\b/i) || [])[0] || '';
          let perGroup = 0;
          for (let gw = 0; gw < group.gateways.length; gw += 1) {
            if (Date.now() > deadline) break;
            const gateway = group.gateways[gw];
            let cloudLinks = [];
            if (/vcloud\./i.test(gateway)) {
              cloudLinks = [gateway];
            } else {
              const expanded = await fslGet(gateway, base, 15000, ctx);
              if (!expanded) continue;
              cloudLinks = gatewayLinksOf(expanded).cloud;
            }
            const ordered = episodeFirstOrder(cloudLinks, ctx.type, Number(ctx.season) || 0, Number(ctx.episode) || 0);
            for (let v = 0; v < ordered.length; v += 1) {
              if (Date.now() > deadline) break;
              const links = await filehost.vcloudR2Links(ordered[v], gateway, ctx.type, Number(ctx.season) || 0, Number(ctx.episode) || 0, ctx);
              for (let l = 0; l < links.length; l += 1) {
                if (Date.now() > deadline) break;
                const link = links[l];
                if (seen[link.url]) continue;
                seen[link.url] = true;
                const serverName = [fslServerLabel(link.label, module.exports.name), qText].filter(Boolean).join(' ');
                out.push({
                  provider: module.exports.name,
                  url: link.url,
                  type: link.url.indexOf('.m3u8') >= 0 ? 'hls' : link.url.indexOf('.mpd') >= 0 ? 'dash' : 'mp4',
                  quality: util.qualityLabel(util.parseHeight(qText || group.heading)),
                  height: util.parseHeight(qText || group.heading),
                  language: lang,
                  size: size,
                  title: serverName,
                  headers: { Referer: util.originOf(link.url), 'User-Agent': http.DEFAULT_UA },
                });
                perGroup += 1;
                if (perGroup >= 2) break;
              }
              if (perGroup >= 2) break;
            }
            if (perGroup >= 2) break;
          }
          if (out.length >= 6) break;
        }
        if (out.length) break;
      }
      if (out.length) break;
    }
    return out;
  },
};

async function fslGet(url, referer, timeoutMs, ctx) {
  const net = (ctx && ctx.http) || http;
  const maxTimeout = (ctx && ctx.timeoutMs) || 30000;
  const t = Math.min(timeoutMs || 12000, maxTimeout);
  const res = await net.request(url, { timeoutMs: t, headers: { Referer: referer || url } });
  return res.ok ? res.text : '';
}

async function fslBase(seed, ctx) {
  const cached = baseCache[seed.family];
  if (cached && Date.now() - cached.at < 30 * 60 * 1000) return cached.base;
  const live = await fslLive(seed, ctx);
  if (!live) return '';
  const liveBase = fslDomainPick(live.html, seed.family) || util.originOf(live.url);
  baseCache[seed.family] = { base: liveBase, at: Date.now() };
  return liveBase;
}

async function fslLive(seed, ctx) {
  let html0 = await fslGet(seed.seed, seed.seed, 10000, ctx);
  let url0 = seed.seed;
  if (!html0 && seed.bootstrap) {
    html0 = await fslGet(seed.bootstrap, seed.bootstrap, 10000, ctx);
    url0 = seed.bootstrap || url0;
  }
  if (!html0) return null;
  if (!fslIsLanding(html0)) return { html: html0, url: url0 };
  const origin = util.originOf(url0);
  if (!origin) return null;
  const probed = await fslGet(origin + FSL_LANDING_PROBE, origin, 12000, ctx);
  if (!probed || fslIsLanding(probed)) return null;
  return { html: probed, url: origin };
}

function fslIsLanding(htmlText) {
  return htmlText.indexOf('qikly.pro/host') >= 0 || htmlText.indexOf('id="stx"') >= 0;
}

function fslDomainPick(htmlText, family) {
  const counts = {};
  const re = new RegExp('https?:\\/\\/[a-z0-9.\\-]*' + family + '\\.[a-z]{2,10}', 'ig');
  let match;
  while ((match = re.exec(htmlText))) {
    const value = match[0].toLowerCase();
    if (value.indexOf('apk') >= 0 || value.slice(-4) === '.cfd') continue;
    counts[value] = (counts[value] || 0) + 1;
  }
  let best = '';
  let bestCount = 0;
  Object.keys(counts).forEach(function (key) {
    if (counts[key] > bestCount) {
      best = key;
      bestCount = counts[key];
    }
  });
  return best;
}

function fslSearchHits(jsonText) {
  let root = null;
  try {
    root = JSON.parse(jsonText);
  } catch (error) {
    return [];
  }
  const out = [];
  (Array.isArray(root.hits) ? root.hits : []).forEach(function (hit) {
    const doc = hit && hit.document ? hit.document : {};
    const permalink = String(doc.permalink || '');
    const title = String(doc.post_title || '');
    if (permalink && title) out.push({ permalink: permalink, title: title });
  });
  return out;
}

function fslGroups(htmlText) {
  const groups = [];
  let heading = '';
  let anchors = [];
  const close = function () {
    if (anchors.length && heading) groups.push({ heading: heading, gateways: anchors.filter(function (v, i) { return anchors.indexOf(v) === i; }) });
    anchors = [];
  };
  html.orderedTokens(htmlText).forEach(function (token) {
    if (token.kind === 'heading') {
      const t = token.text.trim();
      if (t && t.length < 220) {
        if (anchors.length) close();
        heading = downloadHeadingShaped(t) ? t : '';
      }
    } else {
      if (FSL_GATEWAY_LINK_RE.test(token.href)) {
        anchors.push(/vcloud\./i.test(token.href) ? token.href : token.href.replace(/\/+$/, '') + '/');
      }
    }
  });
  close();
  const merged = {};
  groups.forEach(function (group) {
    if (!merged[group.heading]) merged[group.heading] = [];
    merged[group.heading] = merged[group.heading].concat(group.gateways);
  });
  return Object.keys(merged).map(function (key) {
    return { heading: key, gateways: merged[key].filter(function (v, i) { return merged[key].indexOf(v) === i; }) };
  }).filter(function (group) { return group.gateways.length > 0; });
}

function downloadHeadingShaped(text) {
  return DOWNLOAD_HEADING_RE.test(text);
}

function headingSizeOf(heading) {
  const match = heading.match(HEADING_SIZE_RE);
  if (match) return util.normalizeSizeToken(match[1]).replace('/ZIP', '');
  return util.normalizeSizeToken(heading);
}

function releaseLanguageOf(text) {
  const upper = String(text || '').toUpperCase();
  if (/\bHINDI\b/.test(upper)) return 'Hindi';
  if (/\bTAMIL\b/.test(upper)) return 'Tamil';
  if (/\bTELUGU\b/.test(upper)) return 'Telugu';
  if (/\b(?:MULTI|DUAL|BOTH)\b/.test(upper)) return 'Multi';
  if (/\bENGLISH\b|\bENG\b/.test(upper)) return 'English';
  return '';
}

function fslServerLabel(tag, fallback) {
  const label = String(tag == null ? '' : tag).trim();
  if (!label) return fallback;
  if (util.languageLabel(label)) return fallback;
  if (SERVER_LABEL_ACTION_RE.test(label)) return fallback;
  if (QUALITY_TEXT_RE.test(label)) return fallback;
  return label.replace(SERVER_LABEL_TRAILING_RE, '').trim() || fallback;
}

function gatewayLinksOf(htmlText) {
  const normalized = String(htmlText || '').replace(/\\\//g, '/');
  const fastdl = [];
  const vcloud = [];
  let match;
  FASTDL_LINK_RE.lastIndex = 0;
  while ((match = FASTDL_LINK_RE.exec(normalized))) {
    if (fastdl.indexOf(match[0]) < 0) fastdl.push(match[0]);
  }
  VCLOUD_LINK_RE.lastIndex = 0;
  while ((match = VCLOUD_LINK_RE.exec(htmlText))) {
    if (vcloud.indexOf(match[0]) < 0) vcloud.push(match[0]);
  }
  return { fastdl: fastdl, cloud: vcloud };
}

function episodeFirstOrder(all, type, season, episode) {
  const list = all || [];
  if (type !== 'tv' || !season || !episode || list.length <= 1) return list;
  const start = Math.max(0, Math.min(episode - 1, list.length - 1));
  return list.slice(start).concat(list.slice(0, start));
}

module.exports._test = {
  fslIsLanding: fslIsLanding,
  fslDomainPick: fslDomainPick,
  fslSearchHits: fslSearchHits,
  fslGroups: fslGroups,
  headingSizeOf: headingSizeOf,
  releaseLanguageOf: releaseLanguageOf,
  fslServerLabel: fslServerLabel,
  gatewayLinksOf: gatewayLinksOf,
  episodeFirstOrder: episodeFirstOrder,
};
