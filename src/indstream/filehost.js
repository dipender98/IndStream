'use strict';

const http = require('./http');
const html = require('./html');
const util = require('./util');

const ROTATOR_BLOB_RE = /'o'\s*,\s*'([A-Za-z0-9+/=]{16,})[^']*'/;
const ROTATOR_WP_BLOB_RE = /ck\('_wp_http_\d+','([^']+)'/;
const ROTATOR_O_TOKEN_RE = /"o"\s*:\s*"([A-Za-z0-9+/=]{10,})/;
const JS_LOCATION_RE = /(?:window\.)?location(?:\.href)?\s*=\s*['"](https?:\/\/[^'"]+)['"]/i;
const META_REFRESH_RE = /<meta\s+http-equiv=["']refresh["'][^>]*content=["'][^;]*;\s*url=([^"']+)/i;
const STORED_REDIRECT_RE = /s\('o','([A-Za-z0-9+/=]+)'/;
const DIRECT_URL_RE = /https?:\/\/[^\s"'<\\]+/;
const REURL_VAR_RE = /var\s+reurl\s*=\s*"([^"]+)"/;
const HUB_DRIVE_NEXT_RE = /https?:\/\/hubcloud\.[a-z.]+\/drive\/[A-Za-z0-9]+/;
const TOKEN_URL_ABS_RE = /https?:\/\/[^"' ]*?(?:hubcloud|hubdrive)\.php\?[^"' ]+/;
const TOKEN_URL_REL_RE = /(?:hubcloud|hubdrive)\.php\?[^"' ]+/;
const GOOGLE_VIDEO_RE = /(https?:\/\/video-downloads\.googleusercontent\.com\/[^"'\s<>]+)/;
const PIXELDRAIN_SHORT_RE = /pixeldrain\.[a-z]+\/u\/([a-zA-Z0-9]+)/;
const ARCHIVE_URL_RE = /\.(?:zip|rar|7z|tar|gz)(?:[?#]|$)/i;
const BTN_CLASS_RE = /\bbtn\b/;

function isArchiveUrl(url) {
  return ARCHIVE_URL_RE.test(String(url || ''));
}

function rotatorTarget(pageHtml) {
  const blob = (pageHtml.match(ROTATOR_BLOB_RE) || [])[1] ||
    (pageHtml.match(ROTATOR_WP_BLOB_RE) || [])[1];
  if (!blob) return '';
  const l1 = util.b64decode(blob);
  if (!l1) return '';
  const l2 = util.b64decode(l1);
  if (!l2) return '';
  const jsonText = util.b64decode(util.rot13(l2));
  if (!jsonText) return '';
  const oToken = (jsonText.match(ROTATOR_O_TOKEN_RE) || [])[1];
  let wrapped = null;
  try {
    wrapped = JSON.parse(jsonText);
  } catch (error) {
    if (oToken && util.b64decode(oToken).indexOf('http') === 0) {
      try {
        wrapped = JSON.parse('{"o":"' + oToken + '"}');
      } catch (inner) {
        wrapped = null;
      }
    }
  }
  if (!wrapped || typeof wrapped !== 'object') return '';
  const url = util.b64decode(wrapped.o || '').trim();
  return url.indexOf('http') === 0 ? url : '';
}

function jsRedirectTarget(pageHtml) {
  const location = (pageHtml.match(JS_LOCATION_RE) || [])[1];
  if (location) return location;
  const metaUrl = (pageHtml.match(META_REFRESH_RE) || [])[1];
  if (metaUrl) return metaUrl.trim();
  const stored = (pageHtml.match(STORED_REDIRECT_RE) || [])[1];
  if (!stored) return '';
  let payload = stored;
  for (let i = 0; i < 6; i += 1) {
    const decoded = util.b64decode(payload);
    if (!decoded) return '';
    const direct = decoded.match(DIRECT_URL_RE);
    if (direct) return direct[0];
    payload = decoded;
  }
  return '';
}

function hubFileButtons(pageHtml) {
  const headQ = util.parseHeight((html.firstTag(pageHtml, 'div', 'card-header') || {}).inner || '');
  const out = [];
  const seen = {};
  html.anchors(pageHtml).forEach(function (a) {
    if (!BTN_CLASS_RE.test(a.attrs.class || '')) return;
    let url = a.href;
    if (url.indexOf('http') !== 0) return;
    if (isArchiveUrl(url)) return;
    if (/facebook\.|twitter\.|t\.me|\/tg\/|pixel\.|\/admin/.test(url)) return;
    const pixel = url.match(PIXELDRAIN_SHORT_RE);
    if (pixel) url = url.replace('/u/' + pixel[1], '/api/file/' + pixel[1]);
    if (seen[url]) return;
    seen[url] = true;
    const q = util.parseHeight(a.text);
    out.push({ url: url, quality: q > 0 ? q + 'p' : headQ > 0 ? headQ + 'p' : '', language: util.languageLabel(a.text) });
  });
  return out;
}

async function hubDriveFiles(driveUrl, referer, client) {
  const net = client || http;
  const url = String(driveUrl || '');
  if (/hubdrive\.|hubcdn\./i.test(url)) {
    const index = await net.getText(url, { timeoutMs: 10000, headers: { Referer: referer } });
    if (!index) return [];
    const reurl = (index.match(REURL_VAR_RE) || [])[1];
    if (reurl) {
      const direct = util.b64decode(reurl.slice(reurl.indexOf('r=') + 2).replace(/-/g, '+').replace(/_/g, '/'));
      if (direct) {
        const link = direct.slice(direct.indexOf('link=') + 5);
        if (link.indexOf('http') === 0) return [{ url: link, quality: util.qualityText(link), language: '' }];
      }
    }
    const next = (index.match(HUB_DRIVE_NEXT_RE) || [])[0];
    return next ? hubDriveFiles(next, url, net) : [];
  }

  const page = await net.getText(url, { timeoutMs: 10000, headers: { Referer: referer } });
  if (!page) return [];
  const google = googleVideoLink(page, url);
  if (google) return [{ url: google, quality: util.qualityText(page), language: '' }];

  const tokenAbs = (page.match(TOKEN_URL_ABS_RE) || [])[0];
  const tokenRel = (page.match(TOKEN_URL_REL_RE) || [])[0];
  if (!tokenAbs && !tokenRel) return [];
  const origin = util.originOf(url);
  const tokenUrl = tokenAbs || origin + '/' + tokenRel;
  const tokenPage = await net.getText(tokenUrl, { timeoutMs: 10000, headers: { Referer: url } });
  if (!tokenPage) return [];
  return hubFileButtons(tokenPage).slice(0, 4);
}

function googleVideoLink(htmlText, finalUrl) {
  let raw = (htmlText.match(GOOGLE_VIDEO_RE) || [])[1];
  if (!raw) {
    const after = finalUrl.split('dl.php?link=')[1] || '';
    if (after.indexOf('http') === 0) raw = after;
  }
  if (!raw) return '';
  let decoded = '';
  try {
    decoded = decodeURIComponent(raw.replace(/&amp;/g, '&'));
  } catch (error) {
    decoded = raw.replace(/&amp;/g, '&');
  }
  return decoded.indexOf('http') === 0 ? decoded : '';
}

const VCLOUD_BTN_RE = /<a\b[^>]*href="([^"]+)"[^>]*>\s*(?:<[^>]+>\s*)*([^<]*(?:Download|Server|File)[^<]*)(?:<[^>]+>\s*)*<\/a>/gi;
const VCLOUD_ATOB_RE = /var\s+url\s*=\s*atob\s*\(\s*atob\s*\(\s*['"]([A-Za-z0-9+/=]{16,})['"]\s*\)\s*\)/;
const BRACKET_LABEL_RE = /\[([^\]]+)]/;
const R2_HOST_RE = /(r2\.cloudflarestorage\.com|r2\.dev)/i;
const GPDL_URL_RE = /https?:\/\/[^"' ]*gpdl[^"' ]*hubcloud[^"' ]+/i;
const VCLOUD_EPISODE_TAG_RE = /\bS\d{1,2}[\s._-]?E\d{1,3}\b/i;
const HTML_TITLE_RE = /<title>([^<]+)<\/title>/i;
const ARCHIVE_TITLE_RE = /archive(?:\.org)?|web\.archive|\.zip|\.rar|\.7z|\.tar|\.gz/i;

function vcloudDoubleAtob(blob) {
  const inner = util.b64decode(blob.trim());
  if (!inner) return '';
  return util.b64decode(inner.trim());
}

function vcloudPageMatchesEpisode(pageTitle, type, season, episode) {
  if (type !== 'tv' || !season || !episode) return true;
  return !VCLOUD_EPISODE_TAG_RE.test(pageTitle) || util.episodeMatches(pageTitle, season, episode);
}

async function vcloudR2Links(vcloudUrl, referer, type, season, episode, ctx) {
  const net = ctx && ctx.http ? ctx.http : http;
  const timeoutMs = typeof ctx === 'number' ? ctx : (ctx && ctx.timeoutMs) || 15000;
  const page = await net.getText(vcloudUrl, { timeoutMs: timeoutMs, headers: { Referer: referer } });
  if (!page) return [];
  const pageTitle = (page.match(HTML_TITLE_RE) || [])[1] || '';
  if (ARCHIVE_TITLE_RE.test(pageTitle) || /complete season/i.test(pageTitle)) return [];
  if (!vcloudPageMatchesEpisode(pageTitle, type, season, episode)) return [];

  const blob = (page.match(VCLOUD_ATOB_RE) || [])[1];
  if (!blob) return [];
  const tokenUrl = vcloudDoubleAtob(blob);
  if (!tokenUrl || tokenUrl.indexOf('http') !== 0) return [];
  const token = await net.getText(tokenUrl, { timeoutMs: timeoutMs, headers: { Referer: vcloudUrl } });
  if (!token) return [];

  const out = [];
  const seen = {};
  const origin = util.originOf(tokenUrl);
  let match;
  VCLOUD_BTN_RE.lastIndex = 0;
  while ((match = VCLOUD_BTN_RE.exec(token))) {
    const raw = match[1].trim();
    const inner = match[2].trim();
    const bracket = inner.match(BRACKET_LABEL_RE);
    const label = (bracket ? bracket[1] : inner).trim();
    const abs = raw.indexOf('http') === 0 ? raw : origin + (raw.charAt(0) === '/' ? raw : '/' + raw);
    if (isArchiveUrl(abs)) continue;
    if (R2_HOST_RE.test(abs) && !seen[abs]) {
      seen[abs] = true;
      out.push({ url: abs, label: label.slice(0, 20) });
    }
  }
  const gpdl = token.match(GPDL_URL_RE) || [];
  for (let i = 0; i < gpdl.length; i += 1) {
    const files = await hubDriveFiles(gpdl[i], tokenUrl, net);
    files.forEach(function (file) {
      if (!seen[file.url]) {
        seen[file.url] = true;
        out.push({ url: file.url, label: file.quality });
      }
    });
  }
  return out;
}

module.exports = {
  rotatorTarget: rotatorTarget,
  jsRedirectTarget: jsRedirectTarget,
  hubDriveFiles: hubDriveFiles,
  vcloudR2Links: vcloudR2Links,
  _test: {
    hubFileButtons: hubFileButtons,
  },
};
