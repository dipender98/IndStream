'use strict';

const util = require('./util');

const STYLE_OPTIONS = [
  { id: 'indstream', label: 'IndStream (default)' },
  { id: 'lightgdrive', label: 'LightGDrive' },
  { id: 'gdrive', label: 'GDrive' },
  { id: 'minimalisticgdrive', label: 'MinimalisticGDrive' },
  { id: 'prism', label: 'Prism' },
  { id: 'torrentio-minimalist', label: 'Torrentio Minimalist' },
  { id: 'mediafusion-pro', label: 'MediaFusion Pro' },
  { id: 'torrentio', label: 'Torrentio' },
  { id: 'torbox', label: 'TorBox' },
];
const STYLE_IDS = STYLE_OPTIONS.map(function (s) { return s.id; });
const DEFAULT_STYLE = 'indstream';

// Spec tokens are only read from source-declared text (release text the
// provider forwarded). Anything not declared stays off the badge.
function parseSpecs(text) {
  const t = String(text == null ? '' : text);
  const specs = { source: '', codec: '', hdr: [], audio: [], channels: '', tag: '', filename: '' };

  const sourceMatch = /BluRay|Blu-Ray|BDRip|BRRip/i.test(t) ? 'BluRay'
    : (/WEB-DL/i.test(t) ? 'WEB-DL'
      : (/WEBRip/i.test(t) ? 'WEBRip'
        : (/HDTV/i.test(t) ? 'HDTV'
          : (/DVDRip|DVD\b/i.test(t) ? 'DVDRip'
            : (/HDRip/i.test(t) ? 'HDRip'
              : (/\bCAM\b|\bHDTS\b|TELESYNC/i.test(t) ? 'CAM'
                : (/\bREMUX\b/i.test(t) ? 'REMUX' : '')))))));
  specs.source = sourceMatch;

  if (/HEVC|H\.?265|x265/i.test(t)) specs.codec = 'HEVC';
  else if (/H\.?264|x264|AVC/i.test(t)) specs.codec = 'H.264';
  else if (/AV1/i.test(t)) specs.codec = 'AV1';
  else if (/VP9/i.test(t)) specs.codec = 'VP9';
  else if (/XviD/i.test(t)) specs.codec = 'XviD';

  if (/\bHDR10\+|\bHDR\b|HDR10/i.test(t)) specs.hdr.push('HDR');
  if (/\bDV\b|Dolby ?Vision/i.test(t)) specs.hdr.push('DV');
  if (/10[- ]?bit/i.test(t)) specs.hdr.push('10bit');

  if (/Atmos/i.test(t)) specs.audio.push('Atmos');
  if (/TrueHD/i.test(t)) specs.audio.push('TrueHD');
  if (/DD\+|DDP|E-?AC-?3/i.test(t)) specs.audio.push('DD+');
  else if (/\bDTS/i.test(t)) specs.audio.push('DTS');
  else if (/\bAC3|AC-3|\bDD\b/i.test(t)) specs.audio.push('DD');
  if (/\bAAC/i.test(t)) specs.audio.push('AAC');
  if (/\bFLAC/i.test(t)) specs.audio.push('FLAC');

  const channels = t.match(/(?:^|[^0-9])([257]\.[01])(?![0-9])/);
  if (channels) specs.channels = channels[1];

  const epTag = t.match(/s\d{2}e\d{2}/i);
  if (/\bREMUX\b/i.test(t)) specs.tag = 'remux';
  else if (epTag) specs.tag = epTag[0].toLowerCase();
  else {
    const other = t.match(/\b(proper|repack|extended|unrated)\b/i);
    if (other) specs.tag = other[1].toLowerCase();
  }

  const file = t.match(/([^\s/\\"']+?\.(?:mkv|mp4|avi|m4v|webm|ts))(?:[?\s"']|$)/i);
  if (file) specs.filename = file[1];

  return specs;
}

function specTextOf(raw) {
  return [raw && raw.releaseText, raw && raw.title, raw && raw.quality]
    .filter(Boolean)
    .join(' ');
}

function resolutionOf(raw) {
  const height = Number(raw && raw.height) || util.parseHeight(raw && raw.quality);
  if (height) return height + 'p';
  const quality = String(raw && raw.quality || '').trim();
  return /^\d{3,4}p$/i.test(quality) ? quality.toLowerCase() : (quality || 'Auto');
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function episodeTag(ctx) {
  const season = ctx ? Number(ctx.season) || 0 : 0;
  const episode = ctx ? Number(ctx.episode) || 0 : 0;
  return season > 0 && episode > 0 ? 'S' + pad2(season) + 'E' + pad2(episode) : '';
}

function episodeLong(ctx) {
  const season = ctx ? Number(ctx.season) || 0 : 0;
  const episode = ctx ? Number(ctx.episode) || 0 : 0;
  return season > 0 && episode > 0 ? '🍂 S' + pad2(season) + ' 🎞️ E' + pad2(episode) : '';
}

function episodeShort(ctx) {
  const season = ctx ? Number(ctx.season) || 0 : 0;
  const episode = ctx ? Number(ctx.episode) || 0 : 0;
  return season > 0 && episode > 0 ? 'S' + pad2(season) + 'E' + pad2(episode) : '';
}

function metaBits(provider, raw, ctx) {
  const providerName = String((provider && (provider.name || provider.id)) || 'IndStream').trim() || 'IndStream';
  const meta = (ctx && ctx.meta) || null;
  const rawTitle = String((meta && (meta.title || meta.name)) || '').trim();
  const title = rawTitle || (String(raw && raw.title || '').trim() ? String(raw.title).trim().split(/\s+/)[0] : providerName);
  const year = meta && meta.year ? (String(meta.year).match(/\b(19|20)\d{2}\b/) || [])[0] || '' : '';
  const res = resolutionOf(raw);
  const specs = parseSpecs(specTextOf(raw));
  const size = String(raw && raw.size || '').trim();
  const metaLanguage = util.languageNames(meta && meta.originalLanguage)[0] || '';
  return { providerName: providerName, title: title, year: year, res: res, specs: specs, size: size, originalLanguage: metaLanguage };
}

function languageNamesOf(raw) {
  return util.languageNames(raw && raw.language);
}

// Display lines cap at 3 audio languages; over that renders as Multi.
function displayAudioNames(raw, bits) {
  return util.capDisplayLanguages(languageNamesOf(raw), bits.originalLanguage);
}

function subNamesOf(raw) {
  const subs = Array.isArray(raw && raw.subtitles) ? raw.subtitles : [];
  const text = subs.map(function (s) {
    return String((s && (s.label || s.name || s.lang)) || '').trim();
  }).filter(Boolean).join(' ');
  const names = util.languageNames(text);
  return names.length ? names : [];
}

function flagOnlyOf(names) {
  return names.map(function (name) {
    return util.flagOf(name) || name;
  });
}

function joinPresent(parts, separator) {
  return parts.filter(Boolean).join(separator);
}

function fileLine(bits) {
  const s = bits.specs;
  const parts = [];
  if (s.source) parts.push('🎥 ' + s.source);
  if (s.codec) parts.push('🎞️ ' + s.codec);
  if (s.tag) parts.push('🏷️ ' + s.tag);
  return parts.join(' ');
}

function hdrLine(bits) {
  return bits.specs.hdr.length ? '📺 ' + bits.specs.hdr.join(' • ') : '';
}

function audioLine(bits) {
  const s = bits.specs;
  const parts = [];
  if (s.audio.length) parts.push('🎧 ' + s.audio.join(' • '));
  if (s.channels) parts.push('🔊 ' + s.channels);
  return parts.join(' ');
}

function gdriveSpecsLine(bits) {
  const parts = [];
  const file = fileLine(bits);
  const hdr = bits.specs.hdr.length ? '📺 ' + bits.specs.hdr.join(' | ') : '';
  const audio = bits.specs.audio.length ? '🎧 ' + bits.specs.audio.join(' | ') : '';
  if (file) parts.push(file);
  if (hdr) parts.push(hdr);
  if (audio) parts.push(audio);
  if (bits.specs.channels) parts.push('🔊 ' + bits.specs.channels);
  return parts.join(' ');
}

function sizeSourceLine(bits) {
  if (bits.size) return '📦 ' + bits.size + ' 🔍 ' + bits.providerName;
  return '🔍 ' + bits.providerName;
}

function audioFlagsLine(raw, originalLanguage) {
  const names = util.capDisplayLanguages(languageNamesOf(raw), originalLanguage);
  const subs = subNamesOf(raw);
  const audio = flagOnlyOf(names);
  const sub = flagOnlyOf(subs);
  let line = '';
  if (audio.length) line = '🌐 ' + audio.join(' / ');
  if (sub.length) line += '📝 ' + sub.join(' ');
  if (!line && raw && raw.language) return '🌐 ' + String(raw.language).trim();
  return line;
}

// IndStream signature: a brand badge, then one icon per meaning.
// Content type, media origin, dynamic range, codec, size, audio, channels,
// languages and subtitles each get a single, fixed mark.
const MEDIA_ORIGIN_ICONS = {
  BluRay: '💿',
  REMUX: '💿',
  DVDRip: '📀',
  'WEB-DL': '☁️',
  WEBRip: '☁️',
  HDTV: '📡',
  CAM: '📹',
  HDRip: '🎥',
};

function originGroup(bits, ep) {
  const s = bits.specs;
  const tag = s.tag && (!ep || s.tag.toLowerCase() !== ep.toLowerCase()) ? s.tag.toUpperCase() : '';
  if (s.source) {
    const extra = tag && tag !== s.source.toUpperCase() ? tag : '';
    return (MEDIA_ORIGIN_ICONS[s.source] || '🎥') + ' ' + joinPresent([s.source, extra], ' ');
  }
  return tag ? '🏷️ ' + tag : '';
}

function hdrGroup(bits) {
  const parts = ['DV', 'HDR'].filter(function (name) {
    return bits.specs.hdr.indexOf(name) >= 0;
  });
  return parts.length ? '🔆 ' + parts.join(' ') : '';
}

function codecGroup(bits) {
  const parts = [];
  if (bits.specs.codec) parts.push(bits.specs.codec);
  if (bits.specs.hdr.indexOf('10bit') >= 0) parts.push('10bit');
  return parts.length ? '🎞️ ' + parts.join(' ') : '';
}

function sizeGroup(bits) {
  return bits.size ? '📦 ' + bits.size : '';
}

function audioGroup(bits) {
  const parts = [];
  if (bits.specs.audio.length) parts.push('🎧 ' + bits.specs.audio.join(' · '));
  if (bits.specs.channels) parts.push('🔊 ' + bits.specs.channels);
  return parts.join(' · ');
}

function flaggedName(name) {
  const flag = util.flagOf(name);
  return flag ? name + ' ' + flag : name;
}

function audioLanguageLine(raw, bits) {
  const names = displayAudioNames(raw, bits);
  if (names.length === 1 && names[0] === 'Multi') return 'Lang: Multi 🌐';
  if (names.length > 1) {
    return 'Lang: Multi 🌐 ' + names.map(flaggedName).join(' ');
  }
  if (names.length === 1) return 'Lang: ' + flaggedName(names[0]);
  const rawLabel = String((raw && raw.language) || '').trim();
  if (!rawLabel) return '';
  if (/^multi$/i.test(rawLabel)) return 'Lang: Multi 🌐';
  return 'Lang: ' + rawLabel;
}

function subtitleLine(raw) {
  const names = subNamesOf(raw);
  if (!names.length) return '';
  return 'Subtitle: ' + names.map(function (name) {
    return '💬 ' + name;
  }).join(' ');
}

function renderIndstream(bits, raw, ctx) {
  const ep = episodeTag(ctx);
  const isSeries = !!(ctx && (ctx.type === 'tv' || Number(ctx.season) > 0));
  const quality = bits.res === '2160p' ? '4K' : bits.res;
  const lines = [];
  lines.push(
    (isSeries ? '📺' : '🎬') + ' ' + bits.title +
    (bits.year ? ' (' + bits.year + ')' : '') +
    (ep ? ' · ' + ep : '')
  );
  const media = joinPresent([
    originGroup(bits, ep),
    hdrGroup(bits),
    codecGroup(bits),
    sizeGroup(bits),
  ], ' · ');
  if (media) lines.push(media);
  const audio = audioGroup(bits);
  if (audio) lines.push(audio);
  const language = audioLanguageLine(raw, bits);
  if (language) lines.push(language);
  const subtitles = subtitleLine(raw);
  if (subtitles) lines.push(subtitles);
  return { name: 'IND ' + quality + ' · ' + bits.providerName, title: lines.join('\n') };
}

// --- preset renderers ---
// Each returns { name, title }. Unknown pieces are omitted, never invented.

function renderLightgdrive(bits, raw, ctx) {
  const ep = episodeTag(ctx);
  const lines = [];
  lines.push('📁 ' + bits.title + (bits.year ? ' (' + bits.year + ')' : '') + (ep ? ' ' + ep : ''));
  const file = fileLine(bits);
  if (file) lines.push(file);
  const media = joinPresent([hdrLine(bits), audioLine(bits)], ' ');
  if (media) lines.push(media);
  lines.push(sizeSourceLine(bits));
  const audio = audioFlagsLine(raw, bits.originalLanguage);
  if (audio) lines.push(audio);
  return { name: bits.providerName + ' ' + bits.res, title: lines.join('\n') };
}

function renderGdrive(bits, raw, ctx) {
  const lines = [];
  const specs = gdriveSpecsLine(bits);
  if (specs) lines.push(specs);
  lines.push(sizeSourceLine(bits));
  const names = displayAudioNames(raw, bits);
  if (names.length) lines.push('🌎 ' + names.join(' | '));
  if (bits.specs.filename) lines.push('📁 ' + bits.specs.filename + '/' + bits.specs.filename);
  return { name: bits.providerName + ' ' + bits.res, title: lines.join('\n') };
}

function renderMinimalistic(bits, raw, ctx) {
  const is4k = Number(raw && raw.height) >= 2160 || /2160|4k|uhd/i.test(String(raw && raw.quality || ''));
  const name = is4k ? '✨ 4K' : '🧿' + bits.res;
  const lines = [];
  const media = joinPresent([
    bits.specs.hdr.length ? '🔆 ' + bits.specs.hdr.join(' • ') : '',
    bits.specs.audio.length ? '🔊 ' + bits.specs.audio.join(' • ') : '',
  ], ' ');
  if (media) lines.push(media);
  const parts = [];
  if (bits.size) parts.push('📦 ' + bits.size);
  const names = displayAudioNames(raw, bits);
  if (names.length) parts.push('🌎 ' + names.join(' • '));
  const subs = subNamesOf(raw);
  if (subs.length) parts.push('📝 ' + subs.join(' • '));
  if (parts.length) lines.push(parts.join(' ').replace(' 📝', '📝'));
  if (!lines.length) lines.push('📦 ' + bits.res);
  return { name: name, title: lines.join('\n') };
}

function renderPrism(bits, raw, ctx) {
  const is4k = Number(raw && raw.height) >= 2160 || /2160|4k|uhd/i.test(String(raw && raw.quality || ''));
  const is1080 = Number(raw && raw.height) === 1080 || /1080/i.test(String(raw && raw.quality || ''));
  const name = is4k ? '🔥4K UHD' : is1080 ? '🚀 FHD' : '🚀 ' + bits.res;
  const epLong = episodeLong(ctx);
  const lines = [];
  const names = displayAudioNames(raw, bits);
  const subs = subNamesOf(raw);
  const flagPart = flagOnlyOf(names).join(' / ');
  const subPart = flagOnlyOf(subs).join(' ');
  const mediaParts = [];
  const file = fileLine(bits);
  if (file) mediaParts.push(file);
  if (bits.specs.hdr.length) mediaParts.push('📺 ' + bits.specs.hdr.join(' | '));
  if (bits.specs.codec && !file) mediaParts.push('🎞️ ' + bits.specs.codec);
  if (bits.specs.audio.length) mediaParts.push('🎧 ' + bits.specs.audio.join(' | '));
  if (bits.specs.channels) mediaParts.push('🔊 ' + bits.specs.channels);
  let head = '🎬 ' + bits.title + (bits.year ? ' (' + bits.year + ')' : '');
  if (epLong) head += ' ' + epLong;
  if (mediaParts.length || flagPart) {
    head += ' ' + joinPresent(mediaParts.concat([flagPart ? '🗣️ ' + flagPart + (subPart ? '📝 ' + subPart : '') : '']), ' ');
  }
  lines.push(head.replace(/\s+/g, ' ').trim());
  const tail = [];
  if (bits.size) tail.push('📦 ' + bits.size);
  if (bits.specs.tag) tail.push('🏷️ ' + bits.specs.tag);
  tail.push('📡 ' + bits.providerName);
  tail.push('💻 Web Link');
  tail.push('🔍' + bits.providerName);
  lines.push(tail.join(' '));
  return { name: name, title: lines.join('\n') };
}

function plainSpecsLine(bits) {
  const tokens = [bits.res]
    .concat(bits.specs.source ? [bits.specs.source] : [])
    .concat(bits.specs.codec ? [bits.specs.codec] : [])
    .concat(bits.specs.hdr)
    .concat(bits.specs.audio)
    .concat(bits.specs.channels ? [bits.specs.channels] : []);
  return tokens.join(' ');
}

function renderTorrentioMinimalist(bits, raw, ctx) {
  const ep = episodeShort(ctx);
  const lines = [];
  lines.push(bits.title + (ep ? ' - ' + ep : ''));
  const spec = [plainSpecsLine(bits), bits.size, bits.providerName].filter(Boolean).join(' | ');
  lines.push(spec);
  const names = displayAudioNames(raw, bits);
  const subs = subNamesOf(raw);
  let audioLineOut = names.length ? 'Audio: ' + names.join(',') : '';
  if (subs.length) audioLineOut += (audioLineOut ? ' | ' : '') + 'Subs: ' + subs.join(',');
  if (audioLineOut) lines.push(audioLineOut);
  return { name: bits.res + ' • ' + bits.providerName, title: lines.join('\n') };
}

function renderMediafusionPro(bits, raw, ctx) {
  const ep = episodeTag(ctx);
  const is4k = Number(raw && raw.height) >= 2160 || /2160|4k|uhd/i.test(String(raw && raw.quality || ''));
  const lines = [];
  lines.push('🎬 ' + bits.title + (ep ? ' (' + ep + ')' : ''));
  const tokens = [bits.res]
    .concat(bits.specs.source ? [bits.specs.source] : [])
    .concat(bits.specs.hdr)
    .concat(bits.specs.codec ? [bits.specs.codec] : [])
    .concat(bits.specs.audio)
    .concat(bits.specs.channels ? [bits.specs.channels] : []);
  lines.push('⚙️ Specs: ' + tokens.join(' • '));
  lines.push(bits.size ? '📦 Size: ' + bits.size + ' • Host: ' + bits.providerName : '📦 Host: ' + bits.providerName);
  const names = displayAudioNames(raw, bits);
  const subs = subNamesOf(raw);
  if (names.length) lines.push('🔊 Audio: ' + names.join(','));
  if (subs.length) lines.push('📝 Subs: ' + subs.join(','));
  return { name: '⚡ IndStream | ' + (is4k ? '💎 4K UHD' : '📺 ' + bits.res) + ' | ' + bits.providerName, title: lines.join('\n') };
}

function renderTorrentio(bits, raw, ctx) {
  const lines = [];
  if (bits.specs.filename) lines.push(bits.specs.filename);
  if (bits.size) lines.push('💾' + bits.size + '⚙️' + bits.providerName);
  else lines.push('⚙️' + bits.providerName);
  const names = displayAudioNames(raw, bits);
  const subs = subNamesOf(raw);
  let line = flagOnlyOf(names).join(' / ');
  if (subs.length) line += (line ? ' Subs / ' : 'Subs / ') + flagOnlyOf(subs).join(' / ');
  if (line) lines.push(line);
  return { name: bits.providerName + ' ' + bits.res, title: lines.join('\n') };
}

function renderTorbox(bits, raw, ctx) {
  const lines = [];
  lines.push('Quality: ' + (bits.specs.source || bits.res));
  lines.push('Name: ' + (bits.specs.filename || 'Unknown'));
  const names = displayAudioNames(raw, bits);
  const subs = subNamesOf(raw);
  const parts = [];
  if (bits.size) parts.push('Size: ' + bits.size);
  parts.push('Source: ' + bits.providerName);
  if (names.length) parts.push('Languages: ' + names.join(', '));
  if (subs.length) parts.push('Subtitles: ' + subs.join(', '));
  lines.push(parts.join(' | '));
  return { name: bits.providerName + ' (' + bits.res + ')', title: lines.join('\n') };
}

const RENDERERS = {
  indstream: renderIndstream,
  lightgdrive: renderLightgdrive,
  gdrive: renderGdrive,
  minimalisticgdrive: renderMinimalistic,
  prism: renderPrism,
  'torrentio-minimalist': renderTorrentioMinimalist,
  'mediafusion-pro': renderMediafusionPro,
  torrentio: renderTorrentio,
  torbox: renderTorbox,
};

function renderNameTitle(provider, raw, ctx, style) {
  const id = STYLE_IDS.indexOf(style) >= 0 ? style : DEFAULT_STYLE;
  const bits = metaBits(provider, raw, ctx);
  return RENDERERS[id](bits, raw, ctx);
}

// Sample data used by the configure page preview. Fictional files, same
// shape as a real full/episode/basic stream.
const SAMPLES = [
  {
    label: 'Full details · 2160p movie',
    raw: { url: 'https://example.com/inception.2160p.mkv', type: 'mp4', quality: '2160p', height: 2160, size: '65.95 GB', language: 'English, Hindi', releaseText: 'Inception.2010.2160p.BluRay.REMUX.DV.HDR.10bit.HEVC.Hindi.DDP.English.Atmos.5.1.mkv' },
    ctx: { type: 'movie', season: 0, episode: 0, meta: { title: 'Inception', year: '2010', originalLanguage: 'English' } },
  },
  {
    label: 'Episode · 1080p series',
    raw: { url: 'https://example.com/stranger.things.s01e01.1080p.mkv', type: 'mp4', quality: '1080p', height: 1080, size: '2.1 GB', language: 'English', subtitles: [{ label: 'English' }, { label: 'Hindi' }], releaseText: 'Stranger.Things.S01E01.1080p.WEB-DL.DDP5.1.H.264.mkv' },
    ctx: { type: 'tv', season: 1, episode: 1, meta: { title: 'Stranger Things', year: '2016', originalLanguage: 'English' } },
  },
  {
    label: 'Basic · 1080p movie',
    raw: { url: 'https://example.com/hocus.pocus.1080p.mkv', type: 'mp4', quality: '1080p', height: 1080, size: '1.6 GB', language: 'English', releaseText: 'Hocus.Pocus.1993.1080p.WEB-DL.x264.mkv' },
    ctx: { type: 'movie', season: 0, episode: 0, meta: { title: 'Hocus Pocus', year: '1993', originalLanguage: 'English' } },
  },
];

function previewSamples(style) {
  const provider = { id: 'hdhub', name: 'HdHub' };
  return SAMPLES.map(function (sample) {
    const rendered = renderNameTitle(provider, sample.raw, sample.ctx, style);
    return { label: sample.label, name: rendered.name, title: rendered.title };
  });
}

module.exports = {
  STYLE_OPTIONS: STYLE_OPTIONS,
  STYLE_IDS: STYLE_IDS,
  DEFAULT_STYLE: DEFAULT_STYLE,
  renderNameTitle: renderNameTitle,
  previewSamples: previewSamples,
  _test: {
    parseSpecs: parseSpecs,
    resolutionOf: resolutionOf,
  },
};
