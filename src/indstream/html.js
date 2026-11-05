'use strict';

const util = require('./util');

function attrMap(tagText) {
  const out = {};
  const source = String(tagText || '');
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = re.exec(source))) {
    const name = match[1].toLowerCase();
    const value = match[2] != null ? match[2] : match[3] != null ? match[3] : match[4];
    out[name] = util.decodeEntities(value || '');
  }
  return out;
}

function hasClass(attrs, token) {
  if (!token) return true;
  const list = String((attrs && attrs.class) || '').split(/\s+/);
  return list.indexOf(token) >= 0;
}

function eachTag(html, tagName) {
  const source = String(html || '');
  const name = String(tagName || 'div');
  const openRe = new RegExp('<' + name + '\\b[^>]*>', 'gi');
  const closeToken = '</' + name + '>';
  const out = [];
  let match;
  while ((match = openRe.exec(source))) {
    const close = source.toLowerCase().indexOf(closeToken, openRe.lastIndex);
    if (close < 0) break;
    out.push({
      attrs: attrMap(match[0]),
      inner: source.slice(openRe.lastIndex, close),
      outer: source.slice(match.index, close + closeToken.length),
      start: match.index,
      end: close + closeToken.length,
    });
    openRe.lastIndex = close + closeToken.length;
  }
  return out;
}

function blocks(html, tagName, classToken) {
  const source = String(html || '');
  const name = String(tagName || 'div');
  const openRe = new RegExp('<' + name + '\\b[^>]*>', 'gi');
  const closeToken = '</' + name + '>';
  const scanRe = new RegExp('<\\/?' + name + '\\b[^>]*>', 'gi');
  const out = [];
  let match;
  while ((match = openRe.exec(source))) {
    const attrs = attrMap(match[0]);
    if (!hasClass(attrs, classToken)) continue;
    let depth = 1;
    let end = -1;
    scanRe.lastIndex = openRe.lastIndex;
    let token;
    while ((token = scanRe.exec(source))) {
      if (token[0].charAt(1) === '/') depth -= 1;
      else depth += 1;
      if (depth === 0) {
        end = token.index;
        break;
      }
    }
    if (end < 0) break;
    out.push({
      attrs: attrs,
      inner: source.slice(openRe.lastIndex, end),
      outer: source.slice(match.index, end + closeToken.length),
      start: match.index,
      end: end + closeToken.length,
    });
    openRe.lastIndex = end + closeToken.length;
  }
  return out;
}

function anchors(html) {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(String(html || '')))) {
    const attrs = attrMap(match[1]);
    if (!attrs.href) continue;
    out.push({ href: attrs.href, text: util.stripTags(match[2]), attrs: attrs });
  }
  return out;
}

function orderedTokens(html) {
  const out = [];
  const re = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>|<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  const source = String(html || '');
  let match;
  while ((match = re.exec(source))) {
    if (match[1]) {
      const text = util.stripTags(match[2]);
      if (text) out.push({ kind: 'heading', text: text });
    } else {
      const attrs = attrMap(match[3]);
      if (!attrs.href) continue;
      out.push({ kind: 'anchor', href: attrs.href, text: util.stripTags(match[4]), attrs: attrs });
    }
  }
  return out;
}

function firstTag(html, tagName, classToken) {
  const list = eachTag(html, tagName);
  for (let i = 0; i < list.length; i += 1) {
    if (hasClass(list[i].attrs, classToken)) return list[i];
  }
  return null;
}

function textOf(html) {
  return util.stripTags(html);
}

module.exports = {
  blocks: blocks,
  anchors: anchors,
  orderedTokens: orderedTokens,
  eachTag: eachTag,
  firstTag: firstTag,
  textOf: textOf,
};
