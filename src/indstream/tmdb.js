'use strict';

const http = require('./http');

const PUBLIC_KEYS = ['e6333b32409e02a4a6eba6fb7ff866bb', 'a721dd910292becd0d78ed436463db21'];
const API_HOSTS = ['https://api.themoviedb.org/3', 'https://api.tmdb.org/3'];

const metaCache = {};
const imdbCache = {};

function runtimeKey() {
  const scope = typeof globalThis !== 'undefined' ? globalThis : {};
  const key = scope.TMDB_API_KEY;
  return typeof key === 'string' && key.length > 8 ? key : '';
}

function keys() {
  const out = [];
  const key = runtimeKey();
  if (key) out.push(key);
  PUBLIC_KEYS.forEach(function (item) {
    if (out.indexOf(item) < 0) out.push(item);
  });
  return out;
}

function query(params) {
  const pairs = [];
  Object.keys(params || {}).forEach(function (name) {
    const value = params[name];
    if (value == null || value === '') return;
    pairs.push(encodeURIComponent(name) + '=' + encodeURIComponent(String(value)));
  });
  return pairs.join('&');
}

async function apiGet(path, params) {
  const allKeys = keys();
  const suffix = query(Object.assign({}, params || {}));
  for (let i = 0; i < allKeys.length; i += 1) {
    for (let h = 0; h < API_HOSTS.length; h += 1) {
      const url =
        API_HOSTS[h] +
        path +
        '?api_key=' +
        encodeURIComponent(allKeys[i]) +
        (suffix ? '&' + suffix : '');
      const json = await http.getJson(url, { timeoutMs: 3000 });
      if (json && !json.status_code) return json;
    }
  }
  return null;
}

function yearOf(meta) {
  const raw = String(
    (meta && (meta.release_date || meta.first_air_date || meta.year)) || ''
  );
  const match = raw.match(/^(19|20)\d{2}/);
  return match ? raw.slice(0, 4) : '';
}

function normalizeMeta(raw, type) {
  if (!raw) return null;
  const title = raw.title || raw.name || raw.original_title || raw.original_name || '';
  return {
    id: raw.id,
    type: type,
    title: title,
    originalTitle: raw.original_title || raw.original_name || title,
    year: yearOf(raw),
    releaseDate: raw.release_date || raw.first_air_date || '',
    originalLanguage: raw.original_language || '',
    overview: raw.overview || '',
    runtime: raw.runtime || (raw.episode_run_time && raw.episode_run_time[0]) || 0,
    genres: (raw.genres || []).map(function (item) {
      return item && item.name ? item.name : '';
    }),
    imdbId: (raw.external_ids && raw.external_ids.imdb_id) || raw.imdb_id || '',
    seasons: raw.number_of_seasons || 0,
    episodes: raw.number_of_episodes || 0,
    poster: raw.poster_path ? 'https://image.tmdb.org/t/p/w500' + raw.poster_path : '',
    backdrop: raw.backdrop_path ? 'https://image.tmdb.org/t/p/w780' + raw.backdrop_path : '',
    popularity: raw.popularity || 0,
    isAnime: (raw.genres || []).some(function (item) {
      return item && item.id === 16;
    }),
  };
}

async function fetchMeta(tmdbId, type) {
  const id = String(tmdbId || '').trim();
  if (!id) return null;
  const kind = type === 'tv' || type === 'series' ? 'tv' : 'movie';
  const cacheKey = kind + ':' + id;
  if (metaCache[cacheKey]) return metaCache[cacheKey];
  const raw = await apiGet('/' + kind + '/' + id, { append_to_response: 'external_ids' });
  if (!raw) return null;
  const meta = normalizeMeta(raw, kind);
  if (meta) metaCache[cacheKey] = meta;
  return meta;
}

async function resolveImdbId(tmdbId, type, meta) {
  const id = String(tmdbId || '').trim();
  if (!id) return '';
  const kind = type === 'tv' || type === 'series' ? 'tv' : 'movie';
  const cacheKey = kind + ':' + id;
  if (imdbCache[cacheKey]) return imdbCache[cacheKey];
  if (meta && meta.imdbId) {
    imdbCache[cacheKey] = meta.imdbId;
    return meta.imdbId;
  }
  const raw = await apiGet('/' + kind + '/' + id + '/external_ids');
  const imdb = raw && raw.imdb_id ? String(raw.imdb_id) : '';
  if (imdb) imdbCache[cacheKey] = imdb;
  return imdb;
}

async function searchTitle(title, type, year) {
  if (!title) return [];
  const kind = type === 'tv' || type === 'series' ? 'tv' : 'movie';
  const params = { query: title };
  if (year) params.year = year;
  const raw = await apiGet('/search/' + kind, params);
  if (!raw || !Array.isArray(raw.results)) return [];
  return raw.results.map(function (item) {
    return normalizeMeta(item, kind);
  }).filter(Boolean);
}

async function fetchSeasonEpisodes(tmdbId, season) {
  const raw = await apiGet('/tv/' + String(tmdbId) + '/season/' + String(season));
  if (!raw || !Array.isArray(raw.episodes)) return [];
  return raw.episodes.map(function (ep) {
    return { number: ep.episode_number, name: ep.name || '', airDate: ep.air_date || '' };
  });
}

async function absoluteToSeason(tmdbId, episodeNumber) {
  const absolute = Number(episodeNumber) || 0;
  if (absolute <= 0) return { season: 1, episode: Math.max(1, absolute) };
  let remaining = absolute;
  for (let season = 1; season <= 30; season += 1) {
    const episodes = await fetchSeasonEpisodes(tmdbId, season);
    if (!episodes.length) break;
    if (remaining <= episodes.length) return { season: season, episode: remaining };
    remaining -= episodes.length;
  }
  return { season: 1, episode: absolute };
}

module.exports = {
  fetchMeta: fetchMeta,
  resolveImdbId: resolveImdbId,
  searchTitle: searchTitle,
  fetchSeasonEpisodes: fetchSeasonEpisodes,
  absoluteToSeason: absoluteToSeason,
  yearOf: yearOf,
};
