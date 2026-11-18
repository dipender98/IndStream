'use strict';

const http = require('../http');
const util = require('../util');
const tmdb = require('../tmdb');

const BASE = 'https://hianime.at';
const HEADERS = { 'User-Agent': http.DEFAULT_UA, 'X-Requested-With': 'XMLHttpRequest' };
// The embed player ships its config as base64 text XORed with this repeating key.
const EMBED_KEY = 'otaku-embed-v1';

module.exports = {
  id: 'hianime',
  name: 'Hianime',
  mark: 'HI',
  tags: ['1080p', 'Anime', 'Stream', 'Fast'],
  speed: 'normal',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 9000,
  toggle: {
    key: 'sourceHianime',
    label: 'Hianime',
    description: 'Anime episode source with sub and dub server lanes.',
  },

  async resolve(ctx) {
    const net = ctx.http || http;
    const meta = await tmdb.awaitMeta(ctx, 800);
    const titles = [meta && meta.title, meta && meta.originalTitle].filter(Boolean);
    if (!titles.length) {
      ctx.log('hianime: missing title, skipping');
      return [];
    }

    const deadline = Number(ctx.deadline) || 0;
    const opts = function (ms) {
      return { timeoutMs: Math.min(ms, Number(ctx.timeoutMs) || ms), deadline: deadline, headers: HEADERS };
    };
    const alive = function (reserve) {
      return !deadline || Date.now() < deadline - (reserve || 500);
    };

    const searchHtml = await net.getText(BASE + '/search?keyword=' + encodeURIComponent(String(titles[0])) + '&page=1', opts(5000));
    const anime = pickAnime(parseSearch(searchHtml), titles);
    if (!anime || !alive()) return [];

    const listJson = await net.getJson(BASE + '/api/theme/episode/list/' + encodeURIComponent(anime.id.split('-').pop()), opts(4000));
    const episodes = parseEpisodeList(listJson && listJson.html);
    if (!episodes.length || !alive()) return [];

    const wanted = ctx.type === 'movie' ? episodes[0] : episodes.filter(function (ep) {
      return Number(ep.number) === Math.max(1, Number(ctx.episode) || 1);
    })[0];
    if (!wanted || !alive()) return [];

    const serversJson = await net.getJson(BASE + '/api/theme/episode/servers?episodeId=' + encodeURIComponent(wanted.episodeId), opts(4000));
    const servers = pickServers(parseServerItems(serversJson && serversJson.html));
    if (!servers.length || !alive()) return [];

    const out = [];
    for (let i = 0; i < servers.length && out.length < 8 && alive(300); i += 1) {
      const streams = await resolveEmbed(net, servers[i], opts(3500));
      streams.forEach(function (stream) {
        out.push(stream);
      });
    }

    const seen = {};
    const unique = out.filter(function (stream) {
      if (seen[stream.url]) return false;
      seen[stream.url] = true;
      return true;
    });
    unique.sort(function (a, b) { return (b.height || 0) - (a.height || 0); });
    if (unique.length) await tmdb.awaitMeta(ctx, 300);
    ctx.log('hianime: ' + unique.length + ' streams');
    return unique.slice(0, 12);
  },
};

function parseSearch(html) {
  const source = String(html == null ? '' : html);
  const out = [];
  const re = /<a\b([^>]*\bclass\s*=\s*["'][^"']*\bdynamic-name\b[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(source))) {
    const href = attr(match[1], 'href');
    const id = href.split(/[?#]/)[0].split('/').filter(Boolean).pop() || '';
    const name = util.stripTags(match[2]) || util.decodeEntities(attr(match[1], 'title'));
    if (!id || !name) continue;
    out.push({ id: id, name: name, jname: util.decodeEntities(attr(match[1], 'data-jname')) });
  }
  return out;
}

function pickAnime(items, titles) {
  const list = Array.isArray(items) ? items : [];
  const wanted = (titles || []).filter(Boolean).map(String);
  let best = null;
  let bestScore = 0;
  list.forEach(function (item) {
    let score = 0;
    [item.name, item.jname].filter(Boolean).forEach(function (name) {
      wanted.forEach(function (title) { score = Math.max(score, util.titleScore(title, name)); });
    });
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  });
  return bestScore >= 0.6 ? best : null;
}

function parseEpisodeList(html) {
  const source = String(html == null ? '' : html);
  const out = [];
  const re = /<a\b([^>]*\bdata-id\s*=[^>]*)>/gi;
  let match;
  while ((match = re.exec(source))) {
    const number = Number(attr(match[1], 'data-number'));
    const episodeId = attr(match[1], 'data-id');
    if (!number || !episodeId) continue;
    out.push({ number: number, episodeId: episodeId, href: attr(match[1], 'href') });
  }
  out.sort(function (a, b) { return a.number - b.number; });
  return out;
}

function parseServerItems(html) {
  const source = String(html == null ? '' : html);
  const out = [];
  const re = /<[a-z][^>]*\bdata-hash\s*=[^>]*>/gi;
  let match;
  while ((match = re.exec(source))) {
    const hash = attr(match[0], 'data-hash');
    if (!hash) continue;
    out.push({
      type: attr(match[0], 'data-type'),
      name: attr(match[0], 'data-server-name'),
      hash: hash,
    });
  }
  return out;
}

function pickServers(items) {
  const list = (items || []).filter(function (item) { return item && item.hash; });
  list.sort(function (a, b) {
    const aKnown = /zokoanime/i.test(a.name || '') ? 0 : 1;
    const bKnown = /zokoanime/i.test(b.name || '') ? 0 : 1;
    return aKnown - bKnown;
  });
  return list.slice(0, 3);
}

function attr(tag, name) {
  const quoted = tag.match(new RegExp('\\b' + name + '\\s*=\\s*(["\'])([^"\']*)\\1', 'i'));
  if (quoted) return quoted[2].trim();
  const bare = tag.match(new RegExp('\\b' + name + '\\s*=\\s*([^\\s>]+)', 'i'));
  return bare ? bare[1].replace(/^["']|["']$/g, '') : '';
}

function deobfuscateBlob(blob) {
  let decoded = '';
  try {
    decoded = util.b64decode(blob);
  } catch (error) {
    return '';
  }
  if (!decoded) return '';
  let out = '';
  for (let i = 0; i < decoded.length; i += 1) {
    out += String.fromCharCode(decoded.charCodeAt(i) ^ EMBED_KEY.charCodeAt(i % EMBED_KEY.length));
  }
  return out;
}

function embedInfo(text) {
  const blob = String(text || '').match(/window\.__P\s*=\s*["']([^"']+)["']/i);
  if (!blob) return null;
  const plain = deobfuscateBlob(blob[1]);
  let json = null;
  try {
    json = JSON.parse(plain);
  } catch (error) {
    return null;
  }
  const src = String((json && (json.src || (json.sources && json.sources.file))) || '');
  if (!/^https?:\/\//i.test(src)) return null;
  const subtitles = [];
  (json.subtitles || []).forEach(function (sub) {
    if (!sub || typeof sub.src !== 'string' || !/^https?:\/\//i.test(sub.src)) return;
    subtitles.push({
      url: sub.src,
      lang: String(sub.lang || ''),
      label: String(sub.label || sub.lang || ''),
    });
  });
  return { src: src, subtitles: subtitles };
}

function extractMediaUrls(text, base) {
  const source = String(text == null ? '' : text)
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003D/gi, '=');
  const found = [];
  const re = /https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4)(?:[?#][^\s"'<>\\]*)?/gi;
  let match;
  while ((match = re.exec(source))) {
    if (found.indexOf(match[0]) < 0) found.push(match[0]);
  }
  const relativeRe = /["']([^"']+\.(?:m3u8|mp4)(?:[?#][^"']*)?)["']/gi;
  while ((match = relativeRe.exec(source))) {
    const url = util.resolveUrl(base, match[1]);
    if (/^https?:\/\//i.test(url) && found.indexOf(url) < 0) found.push(url);
  }
  return found.slice(0, 8);
}

function parseMaster(text, masterUrl) {
  const lines = String(text == null ? '' : text).split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!/^#EXT-X-STREAM-INF/i.test(line)) continue;
    const uri = (lines[i + 1] || '').trim();
    if (!uri || uri.charAt(0) === '#') continue;
    const res = line.match(/RESOLUTION\s*=\s*(\d+)x(\d+)/i);
    const height = res ? Number(res[2]) : 0;
    if (height > 0 && height < 720) continue;
    const url = util.resolveUrl(masterUrl, uri);
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({ url: url, height: height });
  }
  if (!out.length && /#EXTM3U/i.test(String(text || ''))) out.push({ url: masterUrl, height: 0 });
  return out;
}

async function masterStreams(net, url, headers, options, subtitles) {
  const text = await net.getText(url, Object.assign({}, options, { headers: headers }));
  return parseMaster(text, url).map(function (variant) {
    return {
      provider: module.exports.name,
      url: variant.url,
      type: 'hls',
      quality: util.qualityLabel(variant.height),
      height: variant.height,
      language: '',
      size: '',
      title: '',
      releaseText: '',
      headers: headers,
      subtitles: subtitles || [],
    };
  });
}

async function resolveEmbed(net, server, options) {
  let embed = '';
  try {
    embed = util.b64decode(server.hash);
  } catch (error) {
    embed = '';
  }
  if (!/^https?:\/\//i.test(embed)) return [];
  const origin = util.originOf(embed);
  const headers = { Referer: origin + '/', 'User-Agent': http.DEFAULT_UA };
  const page = await net.getText(embed, Object.assign({}, options, { headers: headers }));
  const info = embedInfo(page);
  if (info) return masterStreams(net, info.src, headers, options, info.subtitles);

  const urls = extractMediaUrls(page, embed);
  const out = [];
  for (let i = 0; i < urls.length && out.length < 8; i += 1) {
    if (/\.m3u8(?:[?#]|$)/i.test(urls[i])) {
      Array.prototype.push.apply(out, await masterStreams(net, urls[i], headers, options, []));
    } else {
      out.push({
        provider: module.exports.name,
        url: urls[i],
        type: 'mp4',
        quality: '',
        height: 0,
        language: '',
        size: '',
        title: '',
        releaseText: '',
        headers: headers,
      });
    }
    if (options.deadline && Date.now() >= options.deadline) break;
  }
  return out;
}

module.exports._test = {
  parseSearch: parseSearch,
  pickAnime: pickAnime,
  parseEpisodeList: parseEpisodeList,
  parseServerItems: parseServerItems,
  pickServers: pickServers,
  deobfuscateBlob: deobfuscateBlob,
  embedInfo: embedInfo,
  extractMediaUrls: extractMediaUrls,
  parseMaster: parseMaster,
};
