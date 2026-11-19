'use strict';

const http = require('./http');
const finalize = require('./finalize');
const util = require('./util');

// Live manifests cannot be scrubbed; VOD playlists are finite.
function isLiveManifest(text, type) {
  const source = String(text || '');
  if (type === 'dash') {
    return /<MPD\b[^>]*\btype\s*=\s*["']dynamic["']/i.test(source);
  }
  if (source.indexOf('#EXTM3U') < 0) return false;
  if (/#EXT-X-PLAYLIST-TYPE\s*:\s*LIVE/i.test(source)) return true;
  if (/#EXT-X-PLAYLIST-TYPE\s*:\s*VOD/i.test(source)) return false;
  // A master playlist has no ENDLIST; its variant playlists carry the answer.
  if (source.indexOf('#EXT-X-STREAM-INF') >= 0) return false;
  return source.indexOf('#EXT-X-ENDLIST') < 0;
}

// A definitive answer from a byte-range probe; null means the host did not
// answer clearly and the stream should be left alone.
function rangeSeekable(response) {
  if (!response) return null;
  const range = (response.headers && response.headers.get && response.headers.get('content-range')) || '';
  if (response.status === 206 && range) return true;
  if (response.status === 200 && !range) return false;
  return null;
}

function firstVariant(text, base) {
  const lines = String(text || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^#EXT-X-STREAM-INF:/i.test(lines[i].trim())) continue;
    for (let j = i + 1; j < lines.length; j += 1) {
      const candidate = lines[j].trim();
      if (candidate && candidate.charAt(0) !== '#') return util.resolveUrl(base, candidate);
    }
  }
  return '';
}

async function probeStream(stream, ctx) {
  const s = (ctx && ctx.settings) || {};
  const wantQuality = s.probeQuality === true &&
    (!finalize.streamHeight(stream) || !String(stream.language || '').trim());
  const url = String((stream && stream.url) || '');
  const isDash = stream.type === 'dash' || url.indexOf('.mpd') >= 0;
  const isHls = stream.type === 'hls' || url.indexOf('.m3u8') >= 0;
  const isMp4 = !isDash && !isHls && (stream.type === 'mp4' || /\.(mp4|mkv|mov|webm)(?:[?#]|$)/i.test(url));
  const wantSeek = s.hideNonSeekable === true && stream.seekable !== false && (isDash || isHls || isMp4);
  if (!wantQuality && !wantSeek) return stream;

  if (wantSeek && isMp4) {
    const res = await http.request(url, {
      timeoutMs: 3000,
      maxBytes: 2048,
      headers: Object.assign({}, stream.headers || {}, { Range: 'bytes=0-0' }),
    });
    const ok = rangeSeekable(res);
    if (ok !== null) stream.seekable = ok;
    return stream;
  }
  if (!isDash && !isHls && url.indexOf('.m3u8') < 0 && url.indexOf('.mpd') < 0) return stream;

  let text = await http.getText(url, {
    timeoutMs: 3000,
    headers: stream.headers || {},
  });
  if (!text) return stream;

  const manifestText = text;
  const dash = isDash || (!isHls && text.indexOf('<MPD') >= 0);
  let seekText = text;
  if (wantSeek && !dash && text.indexOf('#EXT-X-STREAM-INF') >= 0 &&
      !/#EXT-X-PLAYLIST-TYPE\s*:\s*(LIVE|VOD)/i.test(text)) {
    const variantUrl = firstVariant(text, url);
    if (variantUrl) {
      const variantText = await http.getText(variantUrl, {
        timeoutMs: 3000,
        headers: stream.headers || {},
      });
      if (variantText && variantText.indexOf('#EXT-X-STREAM-INF') < 0) seekText = variantText;
    }
  }
  if (wantQuality) {
    const result = dash ? util.parseDashHeights(manifestText) : util.parseHlsMaster(manifestText);
    if (!finalize.streamHeight(stream) && result.height > 0) {
      stream.height = result.height;
      stream.quality = util.qualityLabel(result.height);
    }
    if (!String(stream.language || '').trim() && result.languages && result.languages.length) {
      stream.language = result.languages.join(', ');
    }
  }
  if (wantSeek) {
    stream.seekable = !isLiveManifest(seekText, dash ? 'dash' : 'hls');
  }
  return stream;
}

module.exports = {
  isLiveManifest: isLiveManifest,
  rangeSeekable: rangeSeekable,
  firstVariant: firstVariant,
  probeStream: probeStream,
};
