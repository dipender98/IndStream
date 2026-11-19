'use strict';

const http = require('../http');
const html = require('../html');
const util = require('../util');
const tmdb = require('../tmdb');
const filehost = require('../filehost');

const BASE = 'https://new8.movies4u.garden';
const GATEWAY_RE = /greenmotors|hubcdn|hubdrive|hubcloud/i;
const OG_TITLE_RE = /<meta\s+property="og:title"\s+content="([^"]+)"/i;
const HTML_TITLE_RE = /<title>([^<]+)<\/title>/i;
const HEADING_RE = /<h[45][^>]*>([\s\S]*?)<\/h[45]>/gi;
const BTN_CLASS_RE = /\bbtn\b/;

module.exports = {
  id: 'movies4u',
  name: 'Movies4u',
  speed: 'slow',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 10000,
  toggle: {
    key: 'sourceMovies4u',
    label: 'Movies4u',
    description: 'Bollywood/South releases resolved through file-host gateways.',
  },

  async resolve(ctx) {
    const net = ctx.http || http;
    const meta = await tmdb.awaitMeta(ctx);
    const title = meta && meta.title ? meta.title : '';
    const year = meta && meta.year ? meta.year : '';
    if (!title) {
      ctx.log('movies4u: missing title, skipping');
      return [];
    }

    const type = ctx.type === 'movie' ? 'movie' : 'tv';
    const season = Number(ctx.season) || 0;
    const episode = Number(ctx.episode) || 0;
    if (type === 'tv' && (season <= 0 || episode <= 0)) return [];

    const deadline = ctx.deadline || (Date.now() + (ctx.timeoutMs || 10000));
    const headers = { Referer: BASE + '/', 'User-Agent': http.DEFAULT_UA };

    const body = await net.getText(BASE + '/lookup.php?q=' + encodeURIComponent(title), {
      timeoutMs: 12000,
      headers: Object.assign({ Accept: 'application/json' }, headers),
    });
    const hits = m4uSearchHits(body || '');
    if (!hits.length) return [];

    const ranked = hits
      .map(function (hit) {
        return { hit: hit, score: util.titleScore(title, hit.title, year, util.yearFromText(hit.title)) };
      })
      .filter(function (entry) { return entry.score >= 0.6; })
      .sort(function (a, b) {
        const aExact = year && util.yearFromText(a.hit.title) === year ? 1 : 0;
        const bExact = year && util.yearFromText(b.hit.title) === year ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        return b.score - a.score;
      })
      .slice(0, 3);
    if (!ranked.length) return [];

    const out = [];
    const seen = {};
    const linksPageCache = {};
    for (let i = 0; i < ranked.length; i += 1) {
      if (Date.now() > deadline) break;
      const postUrl = ranked[i].hit.url;
      const post = await net.getText(postUrl, { timeoutMs: 12000, headers: headers });
      if (!post) continue;
      const postTitle = ((post.match(OG_TITLE_RE) || post.match(HTML_TITLE_RE) || [])[1] || ranked[i].hit.title).trim();
      const postYear = util.yearFromText(postTitle);
      if (!postYearMatches(year, postYear, type)) continue;

      const groups = m4uGroups(post).filter(function (group) {
        return heightOf(group.heading) >= 720;
      });
      if (!groups.length) continue;
      const postAudio = util.languageLabel(postTitle);

      if (type === 'movie') {
        const chosen = groups.slice().sort(function (a, b) { return heightOf(b.heading) - heightOf(a.heading); }).slice(0, 2);
        for (let g = 0; g < chosen.length && out.length < 6; g += 1) {
          await collectFromGroup(out, seen, chosen[g], postUrl, postAudio, deadline, net, linksPageCache);
        }
      } else {
        const chosen = groups
          .filter(function (group) { return util.seasonPackMatches(group.heading, season); })
          .sort(function (a, b) { return heightOf(b.heading) - heightOf(a.heading); })[0];
        if (chosen) {
          const audio = groupAudioLabel(chosen.heading, postAudio);
          const size = util.normalizeSizeToken(chosen.heading);
          const height = heightOf(chosen.heading);
          const direct = chosen.links.filter(function (url) { return GATEWAY_RE.test(url); });
          const pushFiles = async function (urls, pageUrl) {
            for (let j = 0; j < urls.length && out.length < 6; j += 1) {
              const files = await filehost.hubDriveFiles(urls[j], pageUrl, net);
              emitFiles(out, seen, files, { audio: audio, size: size, height: height, heading: chosen.heading, referer: postUrl });
            }
          };
          if (direct.length) {
            await pushFiles(direct.slice(0, 2), postUrl);
          } else {
            const linksPageUrl = chosen.links[0];
            const linksPage = linksPageUrl
              ? await net.getText(linksPageUrl, { timeoutMs: 12000, headers: Object.assign({ Referer: postUrl }, headers) })
              : null;
            const epGroups = linksPage ? m4uGroups(linksPage) : [];
            const exact = epGroups.filter(function (group) { return m4uEpisodeOf(group.heading) === episode; });
            const fallback = epGroups.filter(function (group) { return m4uEpisodeOf(group.heading) === null; });
            const picked = (exact.length ? exact : fallback).slice(0, 2);
            for (let p = 0; p < picked.length && out.length < 6; p += 1) {
              const targets = picked[p].links.filter(function (url) { return GATEWAY_RE.test(url); });
              await pushFiles(targets.slice(0, 2), linksPageUrl);
            }
          }
        }
      }
      if (out.length) break;
    }
    return out;
  },
};

async function collectFromGroup(out, seen, group, postUrl, postAudio, deadline, net, linksPageCache) {
  const audio = groupAudioLabel(group.heading, postAudio);
  const size = util.normalizeSizeToken(group.heading);
  const height = heightOf(group.heading);
  const direct = group.links.filter(function (url) { return GATEWAY_RE.test(url); });
  const emit = function (files) {
    emitFiles(out, seen, files, { audio: audio, size: size, height: height, heading: group.heading, referer: postUrl });
  };
  if (direct.length) {
    for (let i = 0; i < direct.length && out.length < 6; i += 1) {
      emit(await filehost.hubDriveFiles(direct[i], postUrl, net));
      if (Date.now() > deadline) break;
    }
    return;
  }
  const linksPageUrl = group.links[0];
  if (!linksPageUrl) return;
  if (Date.now() > deadline) return;
  let fileGroups = linksPageCache[linksPageUrl];
  if (!fileGroups) {
    const linksPage = await net.getText(linksPageUrl, {
      timeoutMs: 12000,
      headers: { Referer: postUrl, 'User-Agent': http.DEFAULT_UA },
    });
    fileGroups = m4uGroups(linksPage || '');
    linksPageCache[linksPageUrl] = fileGroups;
  }
  if (!fileGroups.length) return;
  const target = matchGroup(fileGroups, group, size, height);
  if (!target) return;
  const targets = target.links.filter(function (url) { return GATEWAY_RE.test(url); });
  for (let i = 0; i < targets.length && out.length < 6; i += 1) {
    emit(await filehost.hubDriveFiles(targets[i], linksPageUrl, net));
    if (Date.now() > deadline) break;
  }
}

function emitFiles(out, seen, files, info) {
  (files || []).forEach(function (file) {
    if (out.length >= 6) return;
    const url = String(file.url || '');
    if (url.indexOf('http') !== 0 || seen[url]) return;
    seen[url] = true;
    const qText = file.quality || (info.heading.match(/2160p|1440p|1080p|720p|480p|4k/i) || [])[0] || '';
    const qHeight = util.parseHeight(qText) || info.height || 0;
    const fileAudio = util.languageLabel(file.language || '');
    const audio = fileAudio || info.audio || '';
    out.push({
      provider: module.exports.name,
      url: url,
      type: /\.m3u8(\?|$)/i.test(url) ? 'hls' : /\.mpd(\?|$)/i.test(url) ? 'dash' : 'mp4',
      quality: util.qualityLabel(qHeight),
      height: qHeight,
      language: audio,
      size: info.size || '',
      title: (module.exports.name + ' ' + (qText || (util.qualityLabel(qHeight) || ''))).trim(),
      releaseText: String(info.heading || '').slice(0, 300),
      headers: { Referer: info.referer, 'User-Agent': http.DEFAULT_UA },
    });
  });
}

function matchGroup(fileGroups, group, size, height) {
  if (size) {
    const exact = fileGroups.filter(function (fileGroup) {
      return util.normalizeSizeToken(fileGroup.heading) === size;
    })[0];
    if (exact) return exact;
  }
  const sameHeight = fileGroups.filter(function (fileGroup) {
    return heightOf(fileGroup.heading) === height;
  })[0];
  if (sameHeight) return sameHeight;
  return fileGroups.slice().sort(function (a, b) {
    return heightOf(b.heading) - heightOf(a.heading);
  })[0] || null;
}

function m4uSearchHits(json) {
  let root = null;
  try {
    root = JSON.parse(String(json || ''));
  } catch (error) {
    return [];
  }
  if (!root || root.ok === false || !Array.isArray(root.hits)) return [];
  const out = [];
  root.hits.forEach(function (hit) {
    if (!hit || typeof hit !== 'object') return;
    const title = String(hit.post_title || '').trim();
    const permalink = String(hit.permalink || '').replace(/\\\//g, '/').trim();
    if (!title || !permalink) return;
    const url = permalink.indexOf('http') === 0 ? permalink : BASE + '/' + permalink.replace(/^\/+/, '');
    out.push({ url: url, title: title });
  });
  return out;
}

function m4uGroups(documentText) {
  const source = String(documentText || '');
  const out = [];
  const re = new RegExp(HEADING_RE.source, 'gi');
  let match;
  while ((match = re.exec(source))) {
    const heading = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const after = source.slice(re.lastIndex, re.lastIndex + 6000);
    const box = after.match(/<div[^>]*class="[^"]*downloads-btns-div[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (!box) continue;
    const links = [];
    html.anchors(box[1]).forEach(function (a) {
      if (a.href.indexOf('http') !== 0) return;
      if (!BTN_CLASS_RE.test((a.attrs && a.attrs.class) || '')) return;
      if (links.indexOf(a.href) < 0) links.push(a.href);
    });
    if (!links.length) continue;
    out.push({ heading: heading, links: links });
  }
  return out;
}

function m4uEpisodeOf(heading) {
  const text = String(heading || '');
  let match = /episodes?[\s._:\-]*0?(\d{1,4})/i.exec(text);
  if (match) return Number(match[1]);
  match = /\bS\d{1,2}[\s._-]*E0?(\d{1,3})\b/i.exec(text);
  if (match) return Number(match[1]);
  match = /\bE(?:P|PISODE)?[\s._-]*0?(\d{1,3})\b/i.exec(text);
  if (match) return Number(match[1]);
  return null;
}

function groupAudioLabel(heading, postAudio) {
  const headingAudio = util.languageLabel(heading);
  const postRicher = util.languageNames(postAudio).length > util.languageNames(headingAudio).length;
  if (postRicher && (!headingAudio || /multi|dual|both/i.test(String(heading || '')))) return postAudio;
  return headingAudio || postAudio || '';
}

function postYearMatches(expectedYear, candidateYear, type) {
  const expected = Number(String(expectedYear || '').slice(0, 4)) || 0;
  const candidate = Number(String(candidateYear || '').slice(0, 4)) || 0;
  if (!expected || !candidate) return true;
  if (type === 'movie') return expected === candidate;
  return candidate >= expected - 1;
}

function heightOf(text) {
  return util.parseHeight(String(text || ''));
}

module.exports._test = {
  m4uSearchHits: m4uSearchHits,
  m4uGroups: m4uGroups,
  m4uEpisodeOf: m4uEpisodeOf,
  groupAudioLabel: groupAudioLabel,
  postYearMatches: postYearMatches,
  matchGroup: matchGroup,
};
