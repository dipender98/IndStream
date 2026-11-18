'use strict';

const http = require('../http');
const util = require('../util');
const tmdb = require('../tmdb');

const CATALOG = 'https://watchanimeworld.one';
const PLAYER = 'https://play.zephyrix.org';
const CATALOG_REFERER = CATALOG + '/';
const PLAYER_REFERER = PLAYER + '/';
const HEADERS = { 'User-Agent': http.DEFAULT_UA, Accept: 'application/json, text/plain, */*' };

const EPISODE_RE = /\/episode\/[a-z0-9-]+?-(\d+)x(\d+)\//i;
const CARD_RE = /<article class="post[^"]*"([\s\S]*?)<\/article>/gi;
const CARD_TITLE_RE = /<h2 class="entry-title"[^>]*>([\s\S]*?)<\/h2>/i;
const CARD_LINK_RE = /href="([^"]+)"[^>]*class="lnk-blk"/i;
const PLAYER_ID_RE = /play\.zephyrix\.org\/video\/([A-Za-z0-9]+)/i;

module.exports = {
  id: 'animeworld',
  name: 'AnimeWorld',
  mark: 'AW',
  tags: ['1080p', 'Anime', 'Multi-Audio', 'Stream', 'Normal'],
  speed: 'normal',
  supports: { movie: true, tv: true },
  raceTimeoutMs: 9000,
  toggle: {
    key: 'sourceAnimeworld',
    label: 'AnimeWorld',
    description: 'Anime catalogue with multi-audio HLS episodes.',
  },

  async resolve(ctx) {
    const net = ctx.http || http;
    const meta = await tmdb.awaitMeta(ctx, 800);
    if (meta && Array.isArray(meta.genres) && meta.genres.length &&
        !meta.genres.some(function (genre) { return /animation|anime/i.test(String(genre)); })) {
      return [];
    }
    const titles = [meta && meta.title, meta && meta.originalTitle].filter(Boolean);
    if (!titles.length) {
      ctx.log('animeworld: missing title, skipping');
      return [];
    }

    const deadline = Number(ctx.deadline) || 0;
    const opts = function (ms, referer) {
      return {
        timeoutMs: Math.min(ms, Number(ctx.timeoutMs) || ms),
        deadline: deadline,
        headers: Object.assign({}, HEADERS, { Referer: referer || CATALOG_REFERER }),
      };
    };
    const alive = function (reserve) {
      return !deadline || Date.now() < deadline - (reserve || 500);
    };

    const movie = ctx.type === 'movie';
    const searchHtml = await net.getText(searchUrl(String(titles[0])), opts(5000));
    const card = pickAnimeCard(parseAnimeCards(searchHtml), titles, meta && meta.year, movie);
    if (!card || !alive()) return [];

    const seriesHtml = await net.getText(card.url, opts(5000));
    if (!seriesHtml || !alive()) return [];

    let pageUrl = card.url;
    let pageHtml = seriesHtml;
    if (!movie) {
      const postId = animePostId(seriesHtml);
      const episodeUrl = postId
        ? await findAnimeEpisode(net, seriesHtml, postId, Math.max(1, Number(ctx.season) || 1), Math.max(1, Number(ctx.episode) || 1), opts(4000))
        : '';
      if (!episodeUrl || !alive()) return [];
      pageUrl = episodeUrl;
      pageHtml = await net.getText(episodeUrl, opts(5000));
      if (!pageHtml || !alive()) return [];
    }

    const playerId = animePlayerId(pageHtml);
    if (!playerId || !alive()) return [];
    const masterUrl = await playerStream(net, playerId, opts(5000));
    if (!masterUrl || !alive()) return [];

    const manifest = await net.getText(masterUrl, opts(4000, PLAYER_REFERER));
    const info = masterInfo(manifest, masterUrl);
    if (info.height > 0 && info.height < 720) return [];

    const out = [{
      provider: module.exports.name,
      url: masterUrl,
      type: 'hls',
      quality: util.qualityLabel(info.height),
      height: info.height,
      // Only the master manifest's own audio renditions are declared here.
      language: info.languages.join(', '),
      size: '',
      title: '',
      releaseText: '',
      headers: { Referer: PLAYER_REFERER, 'User-Agent': http.DEFAULT_UA },
      subtitles: info.subtitles,
    }];
    await tmdb.awaitMeta(ctx, 300);
    ctx.log('animeworld: ' + out.length + ' streams');
    return out;
  },
};

function searchUrl(title) {
  return CATALOG + '/?s=' + encodeURIComponent(String(title || ''));
}

function seasonUrl(postId, season) {
  return CATALOG + '/wp-admin/admin-ajax.php?action=action_select_season&season=' +
    Number(season) + '&post=' + encodeURIComponent(String(postId));
}

function playerUrl(playerId) {
  return PLAYER + '/player/index.php?data=' + encodeURIComponent(String(playerId)) + '&do=getVideo';
}

function unescapeHtml(value) {
  return util.decodeEntities(String(value == null ? '' : value).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseAnimeCards(html) {
  const source = String(html == null ? '' : html);
  const out = [];
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(source))) {
    const block = match[1];
    const title = unescapeHtml((block.match(CARD_TITLE_RE) || [])[1]);
    const href = String((block.match(CARD_LINK_RE) || [])[1] || '').trim();
    const movie = href.indexOf('/movies/') >= 0;
    if (!title || !href || (!movie && href.indexOf('/series/') < 0)) continue;
    out.push({ url: util.resolveUrl(CATALOG_REFERER, href), title: title, movie: movie });
  }
  const seen = {};
  return out.filter(function (card) {
    if (seen[card.url]) return false;
    seen[card.url] = true;
    return true;
  });
}

function pickAnimeCard(cards, titles, year, movie) {
  const wanted = (titles || []).filter(Boolean).map(String);
  let best = null;
  let bestScore = 0;
  (cards || []).forEach(function (card) {
    if (!card || card.movie !== !!movie) return;
    const cardYear = util.yearFromText(card.title);
    if (year && cardYear && Number(year) !== cardYear) return;
    let score = 0;
    wanted.forEach(function (title) { score = Math.max(score, util.titleScore(title, card.title)); });
    if (score > bestScore) {
      bestScore = score;
      best = card;
    }
  });
  return bestScore >= 0.7 ? best : null;
}

function animePostId(html) {
  const source = String(html == null ? '' : html);
  return (source.match(/data-post="(\d+)"/i) || source.match(/id="post-(\d+)"/i) || [])[1] || '';
}

function animeSeasonNumbers(html) {
  const numbers = [];
  const re = /data-season="(\d+)"/gi;
  let match;
  while ((match = re.exec(String(html == null ? '' : html)))) {
    const n = Number(match[1]);
    if (n > 0 && numbers.indexOf(n) < 0) numbers.push(n);
  }
  return numbers.sort(function (a, b) { return a - b; });
}

function animeEpisodeLinks(html) {
  const out = [];
  const re = /href="([^"]*\/episode\/[^"]+)"/gi;
  let match;
  while ((match = re.exec(String(html == null ? '' : html)))) {
    if (out.indexOf(match[1]) < 0) out.push(match[1]);
  }
  return out;
}

function animeEpisodeSeason(url) {
  return Number((String(url || '').match(EPISODE_RE) || [])[1]) || 0;
}

function animeEpisodeNumber(url) {
  return Number((String(url || '').match(EPISODE_RE) || [])[2]) || 0;
}

function animeBucketGuess(episode, maxSeason, maxEpisode) {
  if (episode <= 1 || maxSeason <= 1 || maxEpisode <= 1) return 1;
  const guess = 1 + (episode - 1) * (maxSeason - 1) / (maxEpisode - 1);
  return Math.max(1, Math.min(maxSeason, Math.floor(guess)));
}

function pickEpisodeOf(links, season, episode) {
  const list = links || [];
  const byNumber = list.filter(function (url) { return animeEpisodeNumber(url) === episode; });
  const pool = season > 1 && byNumber.length ? byNumber : list;
  if (season > 1) {
    const atPosition = pool.sort(function (a, b) {
      return (animeEpisodeNumber(a) || 9999) - (animeEpisodeNumber(b) || 9999);
    })[episode - 1];
    if (atPosition) return atPosition;
  }
  return byNumber[0] || '';
}

async function findAnimeEpisode(net, seriesHtml, postId, season, episode, options) {
  if (episode <= 0) return '';
  const seasons = animeSeasonNumbers(seriesHtml);
  if (!seasons.length) return '';
  const rendered = animeEpisodeLinks(seriesHtml);
  const renderedSeason = rendered.length ? animeEpisodeSeason(rendered[0]) : 0;
  const maxEpisode = rendered.reduce(function (max, url) { return Math.max(max, animeEpisodeNumber(url)); }, 0);
  const cache = {};
  if (renderedSeason) cache[renderedSeason] = rendered;

  const links = async function (seasonNumber) {
    if (seasons.indexOf(seasonNumber) < 0) return null;
    if (cache[seasonNumber]) return cache[seasonNumber];
    const html = await net.getText(seasonUrl(postId, seasonNumber), options);
    if (!html) return null;
    cache[seasonNumber] = animeEpisodeLinks(html);
    return cache[seasonNumber];
  };

  const top = seasons[seasons.length - 1];
  const guess = animeBucketGuess(episode, top, maxEpisode || episode);
  const candidates = [];
  if (season > 1) candidates.push(season);
  [guess, guess - 1, guess + 1, top, 1].forEach(function (n) {
    if (n > 0 && candidates.indexOf(n) < 0) candidates.push(n);
  });

  let budget = 3;
  for (let i = 0; i < candidates.length; i += 1) {
    const n = candidates[i];
    if (seasons.indexOf(n) < 0) continue;
    if (!cache[n]) {
      if (budget <= 0) continue;
      budget -= 1;
    }
    const list = await links(n);
    if (!list || !list.length) continue;
    const found = pickEpisodeOf(list, n, episode);
    if (found) return util.resolveUrl(CATALOG_REFERER, found);
  }
  return '';
}

function animePlayerId(html) {
  return (String(html == null ? '' : html).match(PLAYER_ID_RE) || [])[1] || '';
}

function playerSource(text) {
  let json = null;
  try {
    json = JSON.parse(String(text == null ? '' : text));
  } catch (error) {
    return '';
  }
  const url = String((json && (json.securedLink || json.videoSource)) || '');
  return /^https?:\/\//i.test(url) ? url : '';
}

function masterInfo(text, masterUrl) {
  const source = String(text == null ? '' : text);
  const out = { height: 0, languages: [], subtitles: [] };
  if (source.indexOf('#EXTM3U') < 0 && source.indexOf('#EXT-X-STREAM-INF') < 0) return out;

  const mediaRe = /#EXT-X-MEDIA:([^\n\r]+)/gi;
  const tracks = {};
  let match;
  while ((match = mediaRe.exec(source))) {
    const attrs = match[1];
    const type = (attrs.match(/TYPE=([^,]+)/i) || [])[1] || '';
    const name = (attrs.match(/NAME="?([^",]+)"?/i) || [])[1] || '';
    const lang = (attrs.match(/LANGUAGE="?([^",]+)"?/i) || [])[1] || '';
    const uri = (attrs.match(/URI="?([^",]+)"?/i) || [])[1] || '';
    if (/AUDIO/i.test(type)) {
      util.languageNames(name + ' ' + lang).forEach(function (language) {
        if (out.languages.indexOf(language) < 0) out.languages.push(language);
      });
    } else if (/SUBTITLES/i.test(type) && uri) {
      const label = name || lang || '';
      const url = util.resolveUrl(masterUrl, uri.replace(/&amp;/gi, '&'));
      if (/^https?:\/\//i.test(url) && !tracks[url]) {
        tracks[url] = true;
        out.subtitles.push({ url: url, lang: lang, label: label });
      }
    }
  }

  const re = /#EXT-X-STREAM-INF:[^\n]*RESOLUTION=(\d+)x(\d+)/gi;
  while ((match = re.exec(source))) {
    out.height = Math.max(out.height, Number(match[2]));
  }
  return out;
}

async function playerStream(net, playerId, options) {
  const res = await net.request(playerUrl(playerId), {
    method: 'POST',
    timeoutMs: options.timeoutMs,
    deadline: options.deadline,
    signal: options.signal,
    headers: Object.assign({}, options.headers, {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: PLAYER,
      Referer: CATALOG_REFERER,
      'X-Requested-With': 'XMLHttpRequest',
    }),
    body: 'hash=' + encodeURIComponent(playerId) + '&r=' + encodeURIComponent(CATALOG_REFERER),
  });
  if (!res || !res.ok || !res.text) return '';
  return playerSource(res.text);
}

module.exports._test = {
  searchUrl: searchUrl,
  seasonUrl: seasonUrl,
  playerUrl: playerUrl,
  parseAnimeCards: parseAnimeCards,
  pickAnimeCard: pickAnimeCard,
  animePostId: animePostId,
  animeSeasonNumbers: animeSeasonNumbers,
  animeEpisodeLinks: animeEpisodeLinks,
  animeEpisodeSeason: animeEpisodeSeason,
  animeEpisodeNumber: animeEpisodeNumber,
  animeBucketGuess: animeBucketGuess,
  pickEpisodeOf: pickEpisodeOf,
  animePlayerId: animePlayerId,
  playerSource: playerSource,
  masterInfo: masterInfo,
};
