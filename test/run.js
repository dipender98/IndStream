'use strict';

const assert = require('assert');

const util = require('../src/indstream/util');
const html = require('../src/indstream/html');
const settings = require('../src/indstream/settings');
const vidrift = require('../src/indstream/servers/vidrift');
const bingr = require('../src/indstream/servers/bingr');
const moviebox = require('../src/indstream/servers/moviebox');
const hub4k = require('../src/indstream/servers/hub4k');
const fsl = require('../src/indstream/servers/fsl');
const filehost = require('../src/indstream/servers/filehost');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ok ' + name);
  } catch (error) {
    failed += 1;
    console.log('  FAIL ' + name + ': ' + error.message);
  }
}

console.log('util');
test('parseHeight basics', function () {
  assert.strictEqual(util.parseHeight('1080p'), 1080);
  assert.strictEqual(util.parseHeight('4K'), 2160);
  assert.strictEqual(util.parseHeight('UHD'), 2160);
  assert.strictEqual(util.parseHeight('2160p UHD BluRay'), 2160);
  assert.strictEqual(util.parseHeight('720p HEVC'), 720);
  assert.strictEqual(util.parseHeight('480p'), 480);
});
test('qualityLabel', function () {
  assert.strictEqual(util.qualityLabel(2160), '4K');
  assert.strictEqual(util.qualityLabel(1080), '1080p');
  assert.strictEqual(util.qualityLabel(720), '720p');
  assert.strictEqual(util.qualityLabel(0), '');
});
test('isKnownBelowFloor', function () {
  assert.strictEqual(util.isKnownBelowFloor(480, 720), true);
  assert.strictEqual(util.isKnownBelowFloor(720, 720), false);
  assert.strictEqual(util.isKnownBelowFloor(1080, 720), false);
  assert.strictEqual(util.isKnownBelowFloor(0, 720), false);
});
test('languageNames/languageLabel - source-declared only', function () {
  assert.deepStrictEqual(util.languageNames('Hindi, English'), ['Hindi', 'English']);
  assert.deepStrictEqual(util.languageNames('Hindi DDP 5.1 + English DTS-HD MA 5.1'), ['Hindi', 'English']);
  assert.strictEqual(util.languageLabel('Hindi DDP 5.1'), 'Hindi');
  assert.strictEqual(util.languageLabel('Dual Audio'), 'Multi');
  assert.strictEqual(util.languageLabel(''), '');
  assert.strictEqual(util.languageLabel('BluRay 2160p'), '');
});
test('titleScore', function () {
  assert.ok(util.titleScore('Inception', 'Inception (2010)', '2010', '2010') >= 0.9);
  assert.ok(util.titleScore('Inception', 'Inception 2010 Hindi Dual Audio', '2010', '2010') >= 0.8);
  assert.ok(util.titleScore('Inception', 'Titanic', '2010', '1997') < 0.4);
});
test('dedupeStreams by url and host', function () {
  const streams = [
    { url: 'https://a.com/1?x=1' },
    { url: 'https://a.com/1' },
    { url: 'https://a.com/2' },
  ];
  const out = util.dedupeStreams(streams);
  assert.strictEqual(out.length, 2);
});
test('b64decode + rot13', function () {
  assert.strictEqual(util.b64decode('aGVsbG8='), 'hello');
  assert.strictEqual(util.rot13('nop'), 'abc');
  assert.strictEqual(util.rot13('ABC'), 'NOP');
});
test('qualityText/normalizeSizeToken', function () {
  assert.strictEqual(util.qualityText('4K UHD'), '4K');
  assert.strictEqual(util.qualityText('1080p WEB'), '1080p');
  assert.strictEqual(util.qualityText('BluRay'), '');
  assert.strictEqual(util.normalizeSizeToken('65.95 GB'), '65.95GB');
  assert.strictEqual(util.normalizeSizeToken('450MB'), '450MB');
});
test('displayName prism-style naming', function () {
  assert.strictEqual(util.displayName('4KHDHub', 'Hindi, English', null, '65.95GB', ''), '4KHDHub (🇮🇳 Hindi, 🇬🇧 English) 65.95GB');
  assert.strictEqual(util.displayName('Bingr', 'Original', null, '', ''), 'Bingr (Original)');
  assert.strictEqual(util.displayName('MovieBox', '', null, '', ''), 'MovieBox (Unknown)');
});
test('episodeMatches/episodeOrSeason', function () {
  assert.strictEqual(util.episodeMatches('S01E05', 1, 5), true);
  assert.strictEqual(util.episodeMatches('S01E05', 1, 6), false);
  assert.strictEqual(util.episodeMatches('Episode 5', 1, 5), true);
  assert.strictEqual(util.episodeMatches('Season 1 Complete', 1, 5), false);
  assert.ok(util.seasonPackMatches('Season 1 Complete', 1));
  const groups = [
    { heading: 'Movie 1080p' },
    { heading: 'S01E05 720p' },
    { heading: 'S01E06 720p' },
  ];
  const tv = util.episodeOrSeason(groups, function (g) { return g.heading; }, 'tv', 1, 5);
  assert.strictEqual(tv.length, 1);
  assert.strictEqual(tv[0].heading, 'S01E05 720p');
  const movie = util.episodeOrSeason(groups, function (g) { return g.heading; }, 'movie', 0, 0);
  assert.strictEqual(movie.length, 3);
});

console.log('html');
test('blocks extracts nested download-item blocks', function () {
  const markup =
    '<div class="download-item">' +
    '<div class="download-header">Inception 2160p</div>' +
    '<div class="inner"><a href="https://greenmotors.club/?id=abc">Download HubDrive</a>' +
    '<a href="https://greenmotors.club/?id=def">Download HubCloud</a></div>' +
    '</div>';
  const blocks = html.blocks(markup, 'div', 'download-item');
  assert.strictEqual(blocks.length, 1);
  assert.ok(blocks[0].inner.indexOf('greenmotors') >= 0);
});
test('anchors parse href/text', function () {
  const anchors = html.anchors('<a href="https://x.com/a" class="btn">Download File [10 GB]</a>');
  assert.strictEqual(anchors.length, 1);
  assert.strictEqual(anchors[0].href, 'https://x.com/a');
  assert.strictEqual(anchors[0].text, 'Download File [10 GB]');
});
test('orderedTokens keeps document order', function () {
  const tokens = html.orderedTokens(
    '<h2>1080p</h2><a href="https://vcloud.xyz/abc123">Download</a>' +
    '<h3>720p</h3><a href="https://vcloud.xyz/def456">Server 1</a>'
  );
  assert.strictEqual(tokens.length, 4);
  assert.strictEqual(tokens[0].kind, 'heading');
  assert.strictEqual(tokens[1].kind, 'anchor');
});

console.log('settings');
test('defaults', function () {
  globalThis.SCRAPER_SETTINGS = undefined;
  const s = settings.getSettings();
  assert.strictEqual(s.minQuality, 720);
  assert.strictEqual(s.resultLimit, 40);
  assert.strictEqual(s.sources.vidrift, true);
  assert.strictEqual(s.sources.fsl, true);
  assert.strictEqual(s.includeDash, true);
});
test('override and source disable', function () {
  globalThis.SCRAPER_SETTINGS = JSON.stringify({
    minQuality: '1080',
    resultLimit: '20',
    sourceFsl: false,
    includeDash: false,
  });
  const s = settings.getSettings();
  assert.strictEqual(s.minQuality, 1080);
  assert.strictEqual(s.resultLimit, 20);
  assert.strictEqual(s.sources.fsl, false);
  assert.strictEqual(s.sources.bingr, true);
  assert.strictEqual(s.includeDash, false);
});
test('onSettings shape', function () {
  const layout = settings.onSettings();
  assert.ok(Array.isArray(layout));
  const keys = layout.filter(function (item) { return item.key; }).map(function (item) { return item.key; });
  ['vidrift', 'bingr', 'moviebox', 'hub4k', 'fsl'].forEach(function (id) {
    assert.ok(keys.indexOf('source' + id.charAt(0).toUpperCase() + id.slice(1)) >= 0, 'missing source key for ' + id);
  });
});

console.log('vidrift');
test('vidriftStreams parses orionStreams', function () {
  const fixture =
    '<script>var embedMeta = {"orionStreams":[{"name":"Hindi","url":"https://cdn.example.com/hi.m3u8"},' +
    '{"name":"English","url":"https://cdn.example.com/en.m3u8"}],"evionUrl":""}</script>';
  const out = vidrift._test.vidriftStreams(fixture);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0][1], 'Hindi');
});
test('vidriftStreams falls back to evionUrl', function () {
  const fixture = '<script>var embedMeta = {"evionUrl":"https://cdn.example.com/master.m3u8"}</script>';
  const out = vidrift._test.vidriftStreams(fixture);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0][0], 'https://cdn.example.com/master.m3u8');
});

console.log('bingr');
test('bingrBody shape', function () {
  const body = bingr._test.bingrBody('s40', 'tv', '1399', 'Game of Thrones', '2011', 1, 5);
  assert.strictEqual(body.srv, 's40');
  assert.strictEqual(body.t, 'tv');
  assert.strictEqual(body.query.season, 1);
});
test('bingrSources parses', function () {
  const json = JSON.stringify({ sources: [
    { url: 'https://cdn.example.com/1080.m3u8', quality: '1080p', language: '' },
    { url: 'not-http', quality: '720p' },
  ] });
  const out = bingr._test.bingrSources(json);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].quality, '1080p');
});
test('isChallengeHtml rejects cloudflare pages', function () {
  const cf = '<!DOCTYPE html><html><head><title>Attention Required! | bingr.one</title></head><body>Just a moment...</body></html>';
  assert.strictEqual(bingr._test.isChallengeHtml(cf), true);
  assert.strictEqual(bingr._test.isChallengeHtml('{"sources":[]}'), false);
  assert.strictEqual(bingr._test.isChallengeHtml(''), false);
  assert.strictEqual(bingr._test.bingrSources(cf).length, 0);
});

console.log('moviebox');
test('seasonEndOf', function () {
  assert.strictEqual(moviebox._test.seasonEndOf('Show S1'), 1);
  assert.strictEqual(moviebox._test.seasonEndOf('Show S1-S2'), 2);
  assert.strictEqual(moviebox._test.seasonEndOf('Show'), 0);
});
test('matchSubjects exact title', function () {
  const items = [
    { subjectId: '1', title: 'Inception (2010)' },
    { subjectId: '2', title: 'Inception 2' },
    { subjectId: '3', title: 'Other Movie' },
  ];
  const subjects = moviebox._test.matchSubjects(items, 'Inception', 'movie', 1);
  assert.strictEqual(subjects.length, 2);
  assert.strictEqual(subjects[0].id, '1');
});
test('matchSubjects reverse prefix', function () {
  const items = [{ subjectId: '9', title: 'The Fast and the Furious (2001)' }];
  const subjects = moviebox._test.matchSubjects(items, 'The Fast', 'movie', 1);
  assert.strictEqual(subjects.length, 1);
});
test('cloudFrontCookie filters blanks', function () {
  const cookie = moviebox._test.cloudFrontCookie('CloudFront-Policy="abc"; CloudFront-Signature=""; CloudFront-Key-Pair-Id="k1"');
  assert.ok(cookie.indexOf('CloudFront-Policy="abc"') >= 0);
  assert.ok(cookie.indexOf('CloudFront-Signature') < 0);
});
test('isNoticeUrl', function () {
  assert.strictEqual(moviebox._test.isNoticeUrl('https://macdn.aoneroom.com/other/notice'), true);
  assert.strictEqual(moviebox._test.isNoticeUrl('https://cdn.example.com/v.mpd'), false);
});

console.log('hub4k');
test('hubParseCards', function () {
  const markup =
    '<div class="card-grid"><a href="/inception-movie-509/" class="movie-card" aria-label="Inception details">' +
    '<img src="x.jpg" alt="Inception"></a></div>';
  const cards = hub4k._test.hubParseCards(markup, 'https://4khdhub.one');
  assert.strictEqual(cards.length, 1);
  assert.strictEqual(cards[0].title, 'Inception');
  assert.strictEqual(cards[0].url, 'https://4khdhub.one/inception-movie-509/');
});
test('hub4kItems extracts title/size/langs/gateways', function () {
  const markup =
    '<div class="download-item">' +
    '<div class="download-header"><div class="flex-1">Inception (2160p BluRay REMUX) ' +
    '<code><span class="badge">65.95 GB</span> <span class="badge">Hindi, English</span></code></div></div>' +
    '<div><a href="https://greenmotors.club/?id=abc">Download HubDrive</a>' +
    '<a href="https://greenmotors.club/?id=def">Download HubCloud</a></div>' +
    '</div>';
  const items = hub4k._test.hub4kItems(markup);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].size, '65.95GB');
  assert.strictEqual(items[0].languages, 'Hindi, English');
  assert.strictEqual(items[0].gatewayUrls.length, 2);
  assert.strictEqual(items[0].gatewayUrls[0], 'https://greenmotors.club/?id=def');
});
test('hubLangOf', function () {
  assert.strictEqual(hub4k._test.hubLangOf('Hindi'), 'Hindi');
  assert.strictEqual(hub4k._test.hubLangOf('Hindi, English'), 'Multi');
  assert.strictEqual(hub4k._test.hubLangOf('Tamil'), 'Tamil');
});

console.log('fsl');
test('fslIsLanding', function () {
  assert.strictEqual(fsl._test.fslIsLanding('<script src="https://qikly.pro/host"></script>'), true);
  assert.strictEqual(fsl._test.fslIsLanding('<div id="stx"></div>'), true);
  assert.strictEqual(fsl._test.fslIsLanding('<html><body>movies</body></html>'), false);
});
test('fslDomainPick picks most frequent family domain', function () {
  const htmlText = '<a href="https://vegamovies.lease/x">1</a><a href="https://vegamovies.lease/y">2</a>' +
    '<a href="https://1vegamovies.asia/z">3</a>';
  assert.strictEqual(fsl._test.fslDomainPick(htmlText, 'vegamovies'), 'https://vegamovies.lease');
});
test('fslSearchHits', function () {
  const json = JSON.stringify({ hits: [
    { document: { permalink: '/inception-2010/', post_title: 'Download Inception (2010)' } },
    { document: { permalink: '', post_title: 'No link' } },
  ] });
  const hits = fsl._test.fslSearchHits(json);
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].permalink, '/inception-2010/');
});
test('fslGroups heading-gated gateways', function () {
  const markup =
    '<div class="entry-content">' +
    '<h2>Inception (2010) 1080p [3.2GB]</h2>' +
    '<a href="https://vcloud.xyz/abc123">Download</a>' +
    '<a href="https://filepress.link/xyz">FilePress</a>' +
    '<h3>Random section</h3>' +
    '<a href="https://vcloud.xyz/zzz999">Download</a>' +
    '</div>';
  const groups = fsl._test.fslGroups(markup);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].gateways.length, 2);
});
test('headingSizeOf', function () {
  assert.strictEqual(fsl._test.headingSizeOf('Movie [1.3GB] 720p'), '1.3GB');
  assert.strictEqual(fsl._test.headingSizeOf('Movie [900MB/EP] 720p'), '900MB');
});
test('releaseLanguageOf', function () {
  assert.strictEqual(fsl._test.releaseLanguageOf('Hindi 720p'), 'Hindi');
  assert.strictEqual(fsl._test.releaseLanguageOf('Dual Audio'), 'Multi');
});
test('fslServerLabel', function () {
  assert.strictEqual(fsl._test.fslServerLabel('Download', 'FSL'), 'FSL');
  assert.strictEqual(fsl._test.fslServerLabel('Hindi', 'FSL'), 'FSL');
  assert.strictEqual(fsl._test.fslServerLabel('Mirror 1 Server', 'FSL'), 'Mirror 1');
});

console.log('filehost');
test('rotatorTarget decodes gateway blob', function () {
  const blob = 'Y214WE0xWjNZbXRhVUdwMmIxQldObFo2ZFRCeFZVOXRRbmxxYVV0UU9XRndla2w1YjNveGFYRlVPV3h3YkRWM1RERnFhVzVVT1dkTlNtdDFiM3BGZVhCNWFtbFdkbXAyYjJ4V05sWjZVMVpJZDA5M1JsSXdNa2RWZURWdk1rVkxSbnBuZDI5S2FteEtlVm94YmtsNVRFWkxUVzV2U210dFNubGFORnBTTlRaSlIwbENSVk5JYWtkaFkwMWFlRFV6UTBjd2RuTkVQVDA9';
  const page = "<script>s('o','" + blob + "');</script>";
  const target = filehost.rotatorTarget(page);
  assert.ok(target.indexOf('hubdrive.bar/file/') >= 0 || target.indexOf('hubcloud') >= 0, target);
});
test('hubFileButtons filters non-btn and archive links', function () {
  const markup =
    '<a class="btn btn-success" href="https://drive.workers.dev/1">Download File [10 GB]</a>' +
    '<a class="btn" href="https://r2.dev/2.zip">ZIP</a>' +
    '<a class="plain" href="https://drive.workers.dev/3">No btn</a>' +
    '<a class="btn" href="https://pixel.hubcloud.ist/?id=1">Pixel</a>';
  const buttons = filehost.hubFileButtons(markup);
  assert.strictEqual(buttons.length, 1);
  assert.strictEqual(buttons[0].url, 'https://drive.workers.dev/1');
});
test('pixeldrainDirect', function () {
  assert.strictEqual(filehost.pixeldrainDirect('https://pixeldrain.com/u/AbCdEf'), 'https://pixeldrain.com/api/file/AbCdEf');
  assert.strictEqual(filehost.pixeldrainDirect('https://x.com/a'), '');
});

console.log('');
console.log((passed + ' passed, ' + failed + ' failed'));
process.exitCode = failed > 0 ? 1 : 0;
