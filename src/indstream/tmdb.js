'use strict';

const http = require('./http');

const PUBLIC_KEYS = ['e6333b32409e02a4a6eba6fb7ff866bb', 'a721dd910292becd0d78ed436463db21'];
const API_HOSTS = ['https://api.themoviedb.org/3', 'https://api.tmdb.org/3'];

const metaCache = {};
const imdbCache = {};
const findCache = {};

const IMDB_ID_RE = /\btt(\d{7,10})\b/i;

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

// Accepts a bare IMDb id or any text containing one (for example an IMDb URL).
function normalizeImdbId(value) {
  const match = String(value == null ? '' : value).match(IMDB_ID_RE);
  return match ? 'tt' + match[1].toLowerCase() : '';
}

function isImdbId(value) {
  return !!normalizeImdbId(value);
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

function firstFindResult(raw, type) {
  if (!raw) return null;
  const kind = type === 'tv' || type === 'series' ? 'tv' : 'movie';
  const list = kind === 'tv' ? raw.tv_results : raw.movie_results;
  return Array.isArray(list) && list.length ? list[0] : null;
}

async function findMetaByImdb(imdbId, type) {
  const id = normalizeImdbId(imdbId);
  if (!id) return null;
  const kind = type === 'tv' || type === 'series' ? 'tv' : 'movie';
  const cacheKey = kind + ':' + id;
  if (findCache[cacheKey]) return findCache[cacheKey];
  const raw = await apiGet('/find/' + id, { external_source: 'imdb_id' });
  const item = firstFindResult(raw, kind);
  if (!item) return null;
  const meta = normalizeMeta(item, kind);
  if (!meta) return null;
  meta.imdbId = id;
  findCache[cacheKey] = meta;
  if (meta.id) metaCache[kind + ':' + meta.id] = meta;
  return meta;
}

// Resolves either a numeric TMDB id or an IMDb id (including IMDb URLs).
async function resolveMeta(value, type) {
  const imdbId = normalizeImdbId(value);
  if (imdbId) return findMetaByImdb(imdbId, type);
  return fetchMeta(String(value == null ? '' : value).trim(), type);
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

module.exports = {
  normalizeImdbId: normalizeImdbId,
  isImdbId: isImdbId,
  fetchMeta: fetchMeta,
  findMetaByImdb: findMetaByImdb,
  resolveMeta: resolveMeta,
  resolveImdbId: resolveImdbId,
  _test: {
    firstFindResult: firstFindResult,
  },
};
