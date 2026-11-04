'use strict';

const LANGUAGE_NAMES = [
  'Hindi', 'Urdu', 'Bengali', 'Bangla', 'Arabic', 'Russian', 'Chinese', 'Mandarin',
  'Japanese', 'Korean', 'French', 'Spanish', 'Portuguese', 'Filipino', 'Tagalog',
  'Indonesian', 'Malaysian', 'Vietnamese', 'English', 'Tamil', 'Telugu', 'Malayalam',
  'Kannada', 'Marathi', 'Punjabi', 'Gujarati', 'Nepali', 'Sinhala', 'Thai', 'Turkish',
  'German', 'Italian', 'Dutch', 'Polish',
];

const LANGUAGE_CODES = {
  hi: 'Hindi', hin: 'Hindi', en: 'English', eng: 'English', ta: 'Tamil', tam: 'Tamil',
  te: 'Telugu', tel: 'Telugu', ml: 'Malayalam', mal: 'Malayalam', kn: 'Kannada', kan: 'Kannada',
  bn: 'Bengali', ben: 'Bengali', bangla: 'Bengali', ur: 'Urdu', urd: 'Urdu',
  ar: 'Arabic', ara: 'Arabic', ru: 'Russian', rus: 'Russian', zh: 'Chinese', chi: 'Chinese',
  zho: 'Chinese', cmn: 'Mandarin', ja: 'Japanese', jpn: 'Japanese', ko: 'Korean', kor: 'Korean',
  fr: 'French', fre: 'French', fra: 'French', es: 'Spanish', spa: 'Spanish',
  pt: 'Portuguese', por: 'Portuguese', fil: 'Filipino', tl: 'Filipino', tgl: 'Filipino',
  id: 'Indonesian', ind: 'Indonesian', ms: 'Malaysian', may: 'Malaysian', msa: 'Malaysian',
  vi: 'Vietnamese', vie: 'Vietnamese', th: 'Thai', tha: 'Thai', tr: 'Turkish', tur: 'Turkish',
  de: 'German', ger: 'German', deu: 'German', it: 'Italian', ita: 'Italian',
  nl: 'Dutch', dut: 'Dutch', nld: 'Dutch', pl: 'Polish', pol: 'Polish',
  ne: 'Nepali', nep: 'Nepali', si: 'Sinhala', sin: 'Sinhala', gu: 'Gujarati', guj: 'Gujarati',
  pa: 'Punjabi', pan: 'Punjabi', mr: 'Marathi', mar: 'Marathi',
};

const LANGUAGE_ALIASES = {
  bangla: 'Bengali', mandarin: 'Chinese', tagalog: 'Filipino', 'brazilian portuguese': 'Portuguese',
  'latino spanish': 'Spanish', 'castilian spanish': 'Spanish', 'traditional chinese': 'Chinese',
  'simplified chinese': 'Chinese', 'cantonese chinese': 'Chinese',
};

const HEIGHT_SET = [240, 360, 480, 540, 576, 720, 1080, 1440, 2160];

const APOSTROPHES = /[\u2018\u2019\u02bc`]/g;

function normalizeTitle(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(APOSTROPHES, "'")
    .replace(/[''`]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function compactTitle(value) {
  return normalizeTitle(value).replace(/\s+/g, '');
}

function titleYearOf(meta) {
  const raw = String((meta && (meta.year || meta.release_date || meta.first_air_date)) || '');
  const match = raw.match(/\b(19\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : 0;
}

function titleScore(query, candidate, year, candidateYear) {
  const a = compactTitle(query);
  const b = compactTitle(candidate);
  if (!a || !b) return 0;
  let score = 0;
  if (a === b) score = 1;
  else if (b.indexOf(a) === 0 || a.indexOf(b) === 0) score = 0.86;
  else if (b.indexOf(a) >= 0 || a.indexOf(b) >= 0) score = 0.68;
  else {
    const at = normalizeTitle(a).split(' ').filter(Boolean);
    const bt = normalizeTitle(b).split(' ').filter(Boolean);
    if (at.length && bt.length) {
      const common = at.filter((token) => bt.indexOf(token) >= 0).length;
      score = common / Math.max(at.length, bt.length) * 0.6;
    }
  }
  if (year && candidateYear && Number(year) === Number(candidateYear)) score += 0.08;
  return Math.min(1, score);
}

function parseHeight(text) {
  const value = String(text == null ? '' : text);
  if (!value) return 0;
  const fourK = /(?:^|[^a-z0-9])(?:4k|uhd)(?:[^a-z0-9]|$)/i.test(value);
  const pMatch = value.match(/(?:^|[^0-9])(\d{3,4})\s*p(?:\s*\d{2,3})?(?:[^0-9]|$)/i);
  const byP = pMatch ? Number(pMatch[1]) : 0;
  const bySet = value.match(/\b(240|360|480|540|576|720|1080|1440|2160)\b/);
  const bySetNum = bySet ? Number(bySet[1]) : 0;
  let height = Math.max(byP, bySetNum, fourK ? 2160 : 0);
  if (height > 4320) height = 0;
  if (HEIGHT_SET.indexOf(height) < 0 && height < 720) return 0;
  return height;
}

function qualityLabel(height) {
  const value = Number(height) || 0;
  if (value >= 2160) return '4K';
  if (value >= 1440) return '1440p';
  if (value >= 1080) return '1080p';
  if (value >= 720) return '720p';
  if (value >= 480) return '480p';
  return value ? value + 'p' : '';
}

function isKnownBelowFloor(height, floor) {
  const value = Number(height) || 0;
  const minimum = Number(floor) || 720;
  return value > 0 && value < minimum;
}

function languageNames(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return [];
  const out = [];
  const tokens = text.split(/[\s+,&/|.:;_()\[\]{}-]+|\band\b/gi);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i].trim();
    if (token.length < 2) continue;
    const lower = token.toLowerCase();
    let canonical = '';
    for (let j = 0; j < LANGUAGE_NAMES.length; j += 1) {
      if (LANGUAGE_NAMES[j].toLowerCase() === lower) {
        canonical = LANGUAGE_NAMES[j];
        break;
      }
    }
    if (!canonical && LANGUAGE_CODES[lower]) canonical = LANGUAGE_CODES[lower];
    if (!canonical && LANGUAGE_ALIASES[lower]) canonical = LANGUAGE_ALIASES[lower];
    if (canonical && out.indexOf(canonical) < 0) out.push(canonical);
  }
  return out;
}

function languageLabel(raw, originalLanguage) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return originalLanguage ? languageLabel(originalLanguage) : '';
  const lower = text.toLowerCase();
  if (lower === 'original' || lower === 'orig' || lower === 'org' || lower === 'default') {
    return originalLanguage ? languageLabel(originalLanguage) || 'Original' : 'Original';
  }
  const names = languageNames(text);
  if (names.length === 1) return names[0];
  if (names.length > 1) return names.join(', ');
  if (/\b(?:multi|dual|both)(?:\s*-?\s*audio)?\b/i.test(text)) return 'Multi';
  return '';
}

function languagePriority(label) {
  const value = String(label || '');
  if (value.indexOf('Hindi') >= 0) return 4;
  if (value.indexOf(',') >= 0 || value === 'Multi') return 2;
  if (value.indexOf('English') >= 0) return 3;
  return value ? 1 : 0;
}

function decodeEntities(value) {
  return String(value == null ? '' : value)
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
    .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); });
}

function stripTags(value) {
  return decodeEntities(String(value == null ? '' : value).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function resolveUrl(base, relative) {
  const ref = String(relative == null ? '' : relative).trim();
  if (!ref) return '';
  if (/^https?:\/\//i.test(ref)) return ref;
  if (ref.indexOf('//') === 0) return 'https:' + ref;
  const originMatch = String(base).match(/^https?:\/\/[^/]+/i);
  const origin = originMatch ? originMatch[0] : '';
  if (!origin) return ref;
  if (ref.charAt(0) === '/') return origin + ref;
  const path = String(base).split('?')[0].split('#')[0];
  const dir = path.slice(0, path.lastIndexOf('/') + 1);
  return dir + ref;
}

function originOf(url) {
  const match = String(url || '').match(/^https?:\/\/[^/]+/i);
  return match ? match[0] : '';
}

function hostOf(url) {
  return originOf(url).replace(/^https?:\/\//i, '').replace(/^www\./i, '');
}

function extractBalancedJson(text, startIndex) {
  const source = String(text || '');
  let start = startIndex;
  if (start < 0) start = source.indexOf('{');
  if (start < 0) return '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

function parseHlsMaster(text) {
  const source = String(text || '');
  const result = { height: 0, languages: [], variants: 0, audioNames: [] };
  if (source.indexOf('#EXTM3U') < 0 && source.indexOf('#EXT-X-STREAM-INF') < 0) return result;

  const audioByGroup = {};
  const mediaRe = /#EXT-X-MEDIA:([^\n\r]+)/gi;
  let media;
  while ((media = mediaRe.exec(source))) {
    const attrs = media[1];
    const type = (attrs.match(/TYPE=([^,]+)/i) || [])[1] || '';
    if (!/AUDIO/i.test(type)) continue;
    const group = (attrs.match(/GROUP-ID="?([^",]+)"?/i) || [])[1] || '';
    const name = (attrs.match(/NAME="?([^",]+)"?/i) || [])[1] || '';
    const lang = (attrs.match(/LANGUAGE="?([^",]+)"?/i) || [])[1] || '';
    if (!group) continue;
    audioByGroup[group] = audioByGroup[group] || [];
    if (name) audioByGroup[group].push(name);
    if (lang) audioByGroup[group].push(lang);
  }

  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
    result.variants += 1;
    const resolution = line.match(/RESOLUTION=(\d+)x(\d+)/i);
    if (resolution) {
      const height = Number(resolution[2]);
      if (height > result.height) result.height = height;
    }
    const frameRate = line.match(/FRAME-RATE=([\d.]+)/i);
    if (!resolution && frameRate) {
      const guess = parseHeight(line);
      if (guess > result.height) result.height = guess;
    }
    const audioGroup = (line.match(/AUDIO="([^"]+)"/i) || [])[1];
    if (audioGroup && audioByGroup[audioGroup]) {
      audioByGroup[audioGroup].forEach(function (name) {
        if (result.audioNames.indexOf(name) < 0) result.audioNames.push(name);
      });
    }
  }
  result.languages = languageNames(result.audioNames.join(' '));
  if (!result.height) {
    result.height = parseHeight(source.slice(0, 4000));
  }
  return result;
}

function parseDashHeights(text) {
  const result = { height: 0, languages: [] };
  const re = /(?:height|resolutions?)=["']?(\d{3,4})["']?/gi;
  let match;
  while ((match = re.exec(String(text || '')))) {
    const height = Number(match[1]);
    if (height >= 240 && height <= 4320 && height > result.height) result.height = height;
  }
  const langRe = /(?:lang|language)=["']([a-zA-Z-]+)["']/gi;
  const langs = [];
  while ((match = langRe.exec(String(text || '')))) langs.push(match[1]);
  result.languages = languageNames(langs.join(' '));
  return result;
}

function dedupeStreams(streams) {
  const seen = {};
  const out = [];
  (streams || []).forEach(function (stream) {
    if (!stream || !stream.url) return;
    let key = stream.url;
    const noQuery = key.split('#')[0].split('?')[0];
    if (seen[key] || seen[noQuery]) return;
    seen[key] = true;
    seen[noQuery] = true;
    out.push(stream);
  });
  return out;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64decode(input) {
  const clean = String(input == null ? '' : input).replace(/[^A-Za-z0-9+/=]/g, '');
  if (!clean || clean.length % 4 === 1) return '';
  const pad = (4 - (clean.length % 4)) % 4;
  const padded = clean + '===='.slice(0, pad);
  if (typeof atob === 'function') {
    try {
      return atob(padded);
    } catch (error) {
      /* fall through to the manual decoder */
    }
  }
  const bytes = [];
  for (let i = 0; i < padded.length; i += 4) {
    const c0 = BASE64_ALPHABET.indexOf(padded.charAt(i));
    const c1 = BASE64_ALPHABET.indexOf(padded.charAt(i + 1));
    const c2 = BASE64_ALPHABET.indexOf(padded.charAt(i + 2));
    const c3 = BASE64_ALPHABET.indexOf(padded.charAt(i + 3));
    if (c0 < 0 || c1 < 0) break;
    bytes.push((c0 << 2) | (c1 >> 4));
    if (c2 >= 0) bytes.push(((c1 & 15) << 4) | (c2 >> 2));
    if (c3 >= 0) bytes.push(((c2 & 3) << 6) | c3);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

function rot13(value) {
  return String(value == null ? '' : value).replace(/[a-zA-Z]/g, function (ch) {
    const code = ch.charCodeAt(0);
    const base = code >= 97 ? 97 : 65;
    return String.fromCharCode(base + ((code - base + 13) % 26));
  });
}

const QUALITY_RE = /\b(2160p|1440p|1080p|720p|480p|4k)\b/i;
const SIZE_RE = /\d+(?:\.\d+)?\s?(?:GB|MB)/i;

function qualityText(value) {
  const match = String(value == null ? '' : value).match(QUALITY_RE);
  if (!match) return '';
  return match[1].toLowerCase() === '4k' ? '4K' : match[1].toLowerCase();
}

function normalizeSizeToken(value) {
  const match = String(value == null ? '' : value).match(SIZE_RE);
  return match ? match[0].replace(/\s+/g, '').toUpperCase() : '';
}

function episodeMatches(text, season, episode) {
  const source = String(text == null ? '' : text);
  const ep = '0?' + episode;
  const exact = new RegExp('\\bS0?' + season + '[\\s._-]*(?:E|EP|EPISODE)[\\s._-]*' + ep + '\\b', 'i');
  if (exact.test(source)) return true;
  const cross = new RegExp('\\b' + season + '\\s*x\\s*' + ep + '\\b', 'i');
  if (cross.test(source)) return true;
  const taggedSeason = /\bS\d{1,2}\b|\bSeason\s*\d/i.test(source);
  if (taggedSeason) return false;
  return new RegExp('\\b(?:EP?|EPISODE)[\\s._-]*' + ep + '\\b', 'i').test(source);
}

function seasonPackMatches(text, season) {
  const source = String(text == null ? '' : text);
  return (
    new RegExp('\\bS0?' + season + '(?!\\s*[._-]?E\\d)', 'i').test(source) ||
    new RegExp('\\bSeason\\s*0?' + season + '\\b', 'i').test(source)
  );
}

function episodeOrSeason(list, textOf, type, season, episode) {
  const items = list || [];
  if (type === 'movie' || !season) return items;
  const exact = items.filter(function (item) {
    return episodeMatches(textOf(item), season, episode);
  });
  if (exact.length) return exact;
  return items.filter(function (item) {
    return seasonPackMatches(textOf(item), season);
  });
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function truncate(value, length) {
  const text = String(value == null ? '' : value);
  return text.length > length ? text.slice(0, length) + '…' : text;
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, Math.max(0, ms)); });
}

module.exports = {
  LANGUAGE_NAMES: LANGUAGE_NAMES,
  LANGUAGE_CODES: LANGUAGE_CODES,
  normalizeTitle: normalizeTitle,
  compactTitle: compactTitle,
  titleYearOf: titleYearOf,
  titleScore: titleScore,
  parseHeight: parseHeight,
  qualityLabel: qualityLabel,
  isKnownBelowFloor: isKnownBelowFloor,
  languageNames: languageNames,
  languageLabel: languageLabel,
  languagePriority: languagePriority,
  decodeEntities: decodeEntities,
  stripTags: stripTags,
  resolveUrl: resolveUrl,
  originOf: originOf,
  hostOf: hostOf,
  extractBalancedJson: extractBalancedJson,
  parseHlsMaster: parseHlsMaster,
  parseDashHeights: parseDashHeights,
  dedupeStreams: dedupeStreams,
  b64decode: b64decode,
  rot13: rot13,
  qualityText: qualityText,
  normalizeSizeToken: normalizeSizeToken,
  episodeMatches: episodeMatches,
  seasonPackMatches: seasonPackMatches,
  episodeOrSeason: episodeOrSeason,
  chunk: chunk,
  truncate: truncate,
  sleep: sleep,
};
