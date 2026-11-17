'use strict';

const assert = require('assert');

const util = require('../src/indstream/util');
const html = require('../src/indstream/html');
const factory = require('../src/indstream/factory');
const http = require('../src/indstream/http');
const finalize = require('../src/indstream/finalize');
const settings = require('../src/indstream/settings');
const tmdb = require('../src/indstream/tmdb');
const providers = require('../src/indstream/providers');
const racer = require('../src/indstream/racer');
const cacheLib = require('../src/indstream/cache');
const hdhub = require('../src/indstream/providers/hdhub');
const vidrift = require('../src/indstream/providers/vidrift');
const bingr = require('../src/indstream/providers/bingr');
const moviebox = require('../src/indstream/providers/moviebox');
const hub4k = require('../src/indstream/providers/hub4k');
const netmirror = require('../src/indstream/providers/netmirror');
const atlantic = require('../src/indstream/providers/atlantic');
const vidly = require('../src/indstream/providers/vidly');
const filehost = require('../src/indstream/filehost');

const queue = [];
let passed = 0;
let failed = 0;

function section(name) {
  queue.push({ section: name });
}

function test(name, fn) {
  queue.push({ name: name, fn: fn });
}

async function main() {
  for (let i = 0; i < queue.length; i += 1) {
    const item = queue[i];
    if (item.section) {
      console.log(item.section);
      continue;
    }
    try {
      await item.fn();
      passed += 1;
      console.log('  ok ' + item.name);
    } catch (error) {
      failed += 1;
      console.log('  FAIL ' + item.name + ': ' + error.message);
    }
  }
  console.log('');
  console.log(passed + ' passed, ' + failed + ' failed');
  process.exitCode = failed > 0 ? 1 : 0;
}

section('util');
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
  assert.strictEqual(util.isKnownBelowFloor(480, 0), false);
});
test('isJunkStreamUrl', function () {
  assert.strictEqual(util.isJunkStreamUrl('https://a.com/inception_1080p.mp4'), false);
  assert.strictEqual(util.isJunkStreamUrl('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'), true);
  assert.strictEqual(util.isJunkStreamUrl('https://test-videos.co.uk/vids/bigbuckbunny/mp4/hvc1/720/Big_Buck_Bunny_720_10s_1MB.mp4'), true);
  assert.strictEqual(util.isJunkStreamUrl('https://a.com/sample.mp4'), true);
  assert.strictEqual(util.isJunkStreamUrl(''), false);
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
test('dedupeStreams strips query and keeps the best duplicate', function () {
  const streams = [
    { url: 'https://a.com/1?x=1', height: 720 },
    { url: 'https://a.com/1', height: 1080 },
    { url: 'https://a.com/2', height: 720 },
  ];
  assert.strictEqual(util.dedupeStreams(streams).length, 2);
  const best = util.dedupeStreams(streams, function (a, b) {
    return (b.height || 0) - (a.height || 0);
  });
  assert.strictEqual(best.length, 2);
  assert.strictEqual(best[0].height, 1080);
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

section('finalize');
const FAKE_PROVIDERS = [
  { id: 'alpha', name: 'Alpha' },
  { id: 'beta', name: 'Beta' },
];
function fakeStream(overrides) {
  return Object.assign(
    { url: '', type: 'mp4', quality: '', height: 0, language: '', provider: 'Alpha', providerId: 'alpha' },
    overrides
  );
}
test('floor and dash filtering', function () {
  const out = finalize.finalizeStreams([
    fakeStream({ url: 'https://x/480', quality: '480p', height: 480 }),
    fakeStream({ url: 'https://x/720', quality: '720p', height: 720 }),
    fakeStream({ url: 'https://x/unknown', quality: '' }),
    fakeStream({ url: 'https://x/dash.mpd', type: 'dash', quality: '1080p', height: 1080 }),
  ], { minQuality: 720, includeDash: false, providers: FAKE_PROVIDERS });
  assert.deepStrictEqual(out.map(function (s) { return s.url; }), ['https://x/720', 'https://x/unknown']);
});
test('junk samples and non-http urls are dropped', function () {
  const out = finalize.finalizeStreams([
    fakeStream({ url: 'https://x/720', height: 720 }),
    fakeStream({ url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', height: 720 }),
    fakeStream({ url: 'https://x/sample.mp4?a=1', height: 720 }),
    fakeStream({ url: 'rtmp://x/live', height: 720 }),
  ], { minQuality: 720, providers: FAKE_PROVIDERS });
  assert.deepStrictEqual(out.map(function (s) { return s.url; }), ['https://x/720']);
});
test('dedupe keeps the best duplicate regardless of arrival order', function () {
  const low = fakeStream({ url: 'https://x/1?token=a', height: 720, provider: 'Beta', providerId: 'beta' });
  const high = fakeStream({ url: 'https://x/1?token=b', height: 1080, provider: 'Alpha', providerId: 'alpha' });
  const one = finalize.finalizeStreams([low, high], { minQuality: 720, providers: FAKE_PROVIDERS });
  const two = finalize.finalizeStreams([high, low], { minQuality: 720, providers: FAKE_PROVIDERS });
  assert.strictEqual(one.length, 1);
  assert.strictEqual(one[0].url, high.url);
  assert.deepStrictEqual(one, two);
});
test('sort uses height, language, provider rank and url', function () {
  const out = finalize.finalizeStreams([
    fakeStream({ url: 'https://x/720', height: 720, language: 'Hindi' }),
    fakeStream({ url: 'https://x/4k', height: 2160, language: 'English' }),
    fakeStream({ url: 'https://x/1080b', height: 1080, language: 'Hindi', provider: 'Beta', providerId: 'beta' }),
    fakeStream({ url: 'https://x/1080a', height: 1080, language: 'Hindi', provider: 'Alpha', providerId: 'alpha' }),
  ], { minQuality: 720, providers: FAKE_PROVIDERS });
  assert.deepStrictEqual(out.map(function (s) { return s.url; }), [
    'https://x/4k',
    'https://x/1080a',
    'https://x/1080b',
    'https://x/720',
  ]);
});
test('result limit applies after sorting', function () {
  const out = finalize.finalizeStreams([
    fakeStream({ url: 'https://x/720', height: 720 }),
    fakeStream({ url: 'https://x/1080', height: 1080 }),
  ], { minQuality: 720, resultLimit: 1, providers: FAKE_PROVIDERS });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].url, 'https://x/1080');
});


section('html');
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

section('settings');
test('defaults', function () {
  globalThis.SCRAPER_SETTINGS = undefined;
  const s = settings.getSettings();
  assert.strictEqual(s.minQuality, 720);
  assert.strictEqual(s.resultLimit, 40);
  assert.strictEqual(s.includeDash, true);
  assert.strictEqual(s.requestTimeout, 5);
});
test('override', function () {
  globalThis.SCRAPER_SETTINGS = JSON.stringify({
    minQuality: '1080',
    resultLimit: '20',
    includeDash: false,
  });
  const s = settings.getSettings();
  assert.strictEqual(s.minQuality, 1080);
  assert.strictEqual(s.resultLimit, 20);
  assert.strictEqual(s.includeDash, false);
});
test('onSettings shape', function () {
  const layout = settings.onSettings();
  assert.ok(Array.isArray(layout));
  const keys = layout.filter(function (item) { return item.key; }).map(function (item) { return item.key; });
  ['minQuality', 'resultLimit', 'requestTimeout', 'probeQuality', 'includeDash', 'debug'].forEach(function (key) {
    assert.ok(keys.indexOf(key) >= 0, 'missing key ' + key);
  });
  assert.strictEqual(typeof settings.onSettings, 'function');
});

section('http');
test('request honors its deadline', async function () {
  const original = globalThis.fetch;
  globalThis.fetch = function (url, init) {
    return new Promise(function (resolve, reject) {
      if (init && init.signal && typeof init.signal.addEventListener === 'function') {
        init.signal.addEventListener('abort', function () {
          reject(new Error('aborted'));
        });
      }
    });
  };
  try {
    const res = await http.request('https://example.invalid', { timeoutMs: 30 });
    assert.strictEqual(res.ok, false);
  } finally {
    globalThis.fetch = original;
  }
});
test('external abort signal cancels a request', async function () {
  const original = globalThis.fetch;
  globalThis.fetch = function (url, init) {
    return new Promise(function (resolve, reject) {
      if (init && init.signal && typeof init.signal.addEventListener === 'function') {
        init.signal.addEventListener('abort', function () {
          reject(new Error('aborted'));
        });
      }
    });
  };
  const controller = new AbortController();
  try {
    const pending = http.request('https://example.invalid', { timeoutMs: 5000, signal: controller.signal });
    setTimeout(function () {
      controller.abort();
    }, 10);
    const res = await pending;
    assert.strictEqual(res.ok, false);
  } finally {
    globalThis.fetch = original;
  }
});

section('hdhub');
test('streamPath builds movie and tv paths from ids without metadata', async function () {
  assert.strictEqual(await hdhub._test.streamPath({ type: 'movie', tmdbId: 27205 }), 'tmdb:27205');
  assert.strictEqual(
    await hdhub._test.streamPath({ type: 'tv', tmdbId: 1399, season: 2, episode: 3 }),
    'tmdb:1399:2:3'
  );
  assert.strictEqual(await hdhub._test.streamPath({ type: 'movie', imdbId: 'tt1375666' }), 'tt1375666');
  assert.strictEqual(
    await hdhub._test.streamPath({ type: 'tv', imdbId: 'tt0944947', season: 1, episode: 5 }),
    'tt0944947:1:5'
  );
});
test('streamPath falls back to metadata only when no id exists', async function () {
  const meta = { id: 27205, imdbId: 'tt1375666' };
  assert.strictEqual(
    await hdhub._test.streamPath({ type: 'movie', meta: meta, metaPromise: Promise.resolve(meta) }),
    'tt1375666'
  );
});

section('vidrift');
test('vidriftStreams builds stream objects from orionStreams', function () {
  const meta = {
    orionStreams: [
      { name: 'Orion · Hindi', url: '/api/orion/a/master.m3u8', rungs: [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }], subtitleListUrl: '/api/orion/a/subtitles.json' },
      { name: 'Orion · Original', url: '/api/orion/b/master.m3u8', rungs: [{ width: 854, height: 480 }] },
    ],
    evionUrl: '',
  };
  const out = vidrift._test.vidriftStreams(meta);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].url, 'https://embed.vidrift.net/api/orion/a/master.m3u8');
  assert.strictEqual(out[0].type, 'hls');
  assert.strictEqual(out[0].height, 1080);
  assert.strictEqual(out[0].quality, '1080p');
  assert.strictEqual(out[0].language, 'Hindi');
  assert.strictEqual(out[0]._subtitleListUrl, '/api/orion/a/subtitles.json');
  assert.strictEqual(out[1].language, 'Original');
  assert.strictEqual(out[1].height, 480);
});
test('vidriftStreams falls back to evionUrl', function () {
  const meta = { orionStreams: [], evionUrl: 'https://cdn.example.com/master.m3u8' };
  const out = vidrift._test.vidriftStreams(meta);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].url, 'https://cdn.example.com/master.m3u8');
});
test('vidriftStreams returns nothing for empty meta', function () {
  assert.strictEqual(vidrift._test.vidriftStreams({}).length, 0);
});

section('bingr');
test('bingrBody shape', function () {
  const body = bingr._test.bingrBody('s40', 'tv', '1399', 'Game of Thrones', '2011', 1, 5);
  assert.strictEqual(body.srv, 's40');
  assert.strictEqual(body.t, 'tv');
  assert.strictEqual(body.query.season, 1);
});
test('bingrBody omits absent title metadata', function () {
  const body = bingr._test.bingrBody('s70', 'movie', '27205', '', '', 0, 0);
  assert.deepStrictEqual(body.query, {});
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

section('moviebox');
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

section('hub4k');
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

section('netmirror');
test('streamsOf parses embed streams and resolution', function () {
  const root = { ok: true, streams: [{ url: 'https://cdn.example.com/a.mp4?x=1', resolution: 1080, size: 2414667149 }] };
  const out = netmirror._test.streamsOf(root, 'Hindi');
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].height, 1080);
  assert.strictEqual(out[0].language, 'Hindi');
  assert.strictEqual(out[0].size, '2.25 GB');
  assert.strictEqual(out[0].type, 'mp4');
});
test('streamsOf falls back to mp4 field and rejects bad roots', function () {
  const root = { ok: true, mp4: 'https://cdn.example.com/b.mp4', resolution: 720 };
  assert.strictEqual(netmirror._test.streamsOf(root, '').length, 1);
  assert.strictEqual(netmirror._test.streamsOf({ ok: false }, '').length, 0);
  assert.strictEqual(netmirror._test.streamsOf(null, '').length, 0);
  assert.strictEqual(netmirror._test.streamsOf('<meta name="viewport">', '').length, 0);
});
test('parseJson rejects interstitial html', function () {
  assert.strictEqual(netmirror._test.parseJson('<meta name="x">'), null);
  assert.deepStrictEqual(netmirror._test.parseJson('{"ok":true}'), { ok: true });
});
test('captionsOf resolves relative urls against the base', function () {
  const root = { captions: [{ lang: 'en', name: 'English', url: '/api/proxy/video?url=enc' }] };
  const out = netmirror._test.captionsOf(root);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].url, 'https://net79.cc/api/proxy/video?url=enc');
  assert.strictEqual(out[0].lang, 'en');
});
test('dubLabel maps dub suffixes to canonical languages', function () {
  assert.strictEqual(netmirror._test.dubLabel('Hindi dub', false), 'Hindi');
  assert.strictEqual(netmirror._test.dubLabel('Telugu dub', false), 'Telugu');
  assert.strictEqual(netmirror._test.dubLabel('Arabic sub', false), null);
  assert.strictEqual(netmirror._test.dubLabel('Default', false), null);
  assert.strictEqual(netmirror._test.dubLabel('Default', true), 'Original');
  assert.strictEqual(netmirror._test.dubLabel('esla dub', false), null);
});
test('dubSpecs prefers indian dubs, dedupes and caps at 4', function () {
  const variants = JSON.stringify({ variants: [
    { dubSubjectId: '1', language: 'Default', isOriginal: false, detailPath: 'd0' },
    { dubSubjectId: '2', language: 'French dub', isOriginal: false, detailPath: 'd1' },
    { dubSubjectId: '3', language: 'Hindi dub', isOriginal: false, detailPath: 'd2' },
    { dubSubjectId: '4', language: 'Telugu dub', isOriginal: false, detailPath: 'd3' },
    { dubSubjectId: '5', language: 'Tamil dub', isOriginal: false, detailPath: 'd4' },
    { dubSubjectId: '6', language: 'Malayalam dub', isOriginal: false, detailPath: 'd5' },
    { dubSubjectId: '7', language: 'Kannada dub', isOriginal: false, detailPath: 'd6' },
    { dubSubjectId: '3', language: 'Hindi dub', isOriginal: false, detailPath: 'd2' },
  ] });
  const out = netmirror._test.dubSpecs(variants);
  assert.deepStrictEqual(out.map(function (d) { return d.label; }), ['Hindi', 'Tamil', 'Telugu', 'Malayalam']);
});
test('sizeLabel formats bytes', function () {
  assert.strictEqual(netmirror._test.sizeLabel(2414667149), '2.25 GB');
  assert.strictEqual(netmirror._test.sizeLabel(734003200), '700 MB');
  assert.strictEqual(netmirror._test.sizeLabel(0), '');
});

section('atlantic');
test('bestHlsSource returns direct hls source with height hint', function () {
  const json = { sources: { Vidbox: { type: 'hls', url: 'https://cdn.example.com/master.m3u8', label: 'AUTO' } } };
  const out = atlantic._test.bestHlsSource(json);
  assert.strictEqual(out.url, 'https://cdn.example.com/master.m3u8');
});
test('bestHlsSource decrypts moscow ms_ payload', function () {
  const json = { sources: { Moscow: { type: 'hls', url: 'ms_7c30053082f4cb3c0a66080923cb4892a431e626185591ccf10398271cb9ff4562a620fe3bc148bffec508d18f8dc8a837541d134fc9f1cae298142a37efb4b79cea148af341d4c0f216f5b6cd8757b342e5fe247ac3faa2277b672a7e10075e2b92b63cffc1eed1e16a7a13f5b22d0731dbd7c97d63ef4fa3685f28f9fc7c4ec183cb0705' } } };
  const out = atlantic._test.bestHlsSource(json);
  assert.strictEqual(out.url, 'https://stream.hls.lol/nesterov/master.m3u8?i=0&k=321c4a86b689e1d51d52&s=7fa637452cd4e36e18b88266eb3855ff');
});
test('decryptMsUrl rejects garbage', function () {
  assert.strictEqual(atlantic._test.decryptMsUrl('ms_zzzz'), null);
  assert.strictEqual(atlantic._test.decryptMsUrl(''), null);
  assert.strictEqual(atlantic._test.decryptMsUrl(null), null);
});
test('localesOf extracts audio locales from a release label', function () {
  assert.strictEqual(atlantic._test.localesOf('BR 1080p (ru, uk, en-US)'), 'Russian, English');
  assert.strictEqual(atlantic._test.localesOf('AUTO'), '');
});
test('mboxTracks maps dash tracks with language labels', function () {
  const json = { tracks: [
    { id: '0', url: 'https://stream.hls.lol/mbox/mpd?q=a', kind: 'dash', quality: '1080p', lang: 'Original', mode: 'original' },
    { id: '5', url: 'https://stream.hls.lol/mbox/mpd?q=b', kind: 'dash', quality: '1080p', lang: 'Telugu', mode: 'dub' },
    { id: '6', url: 'https://stream.hls.lol/mbox/mpd?q=c', kind: 'dash', quality: '480p', lang: 'Hindi', mode: 'dub' },
    { id: '7', url: 'https://stream.hls.lol/mbox/mpd?q=d', kind: 'dash', quality: '1080p', lang: 'Arabic sub', mode: 'sub' },
  ] };
  const out = atlantic._test.mboxTracks(json);
  assert.strictEqual(out.length, 3);
  assert.strictEqual(out[0].type, 'dash');
  assert.strictEqual(out[0].language, 'Original');
  assert.strictEqual(out[0].height, 1080);
  assert.strictEqual(out[1].language, 'Telugu');
  assert.strictEqual(out[2].height, 480);
});
test('subtitlesOf maps mbox and q62 subtitle shapes', function () {
  const mbox = atlantic._test.subtitlesOf({ subtitles: [{ url: 'https://cdn.example.com/en.srt', lang: 'en', label: 'English' }] }, 'mbox');
  assert.strictEqual(mbox.length, 1);
  assert.strictEqual(mbox[0].id, 'atlantic-mbox-0');
  assert.strictEqual(mbox[0].label, 'English');
  const q62 = atlantic._test.subtitlesOf({ releases: [{ subtitles: [{ url: 'https://cdn.example.com/hi.srt', language: 'hi', label: 'Hindi' }] }] }, 'q62');
  assert.strictEqual(q62.length, 1);
  assert.strictEqual(q62[0].lang, 'hi');
  assert.strictEqual(atlantic._test.subtitlesOf({ subtitles: [{ url: 'not-http' }] }, 'mbox').length, 0);
});

section('vidly');
test('vidlyStreamUrls extracts distinct m3u8 urls and unescapes entities', function () {
  const html = '<script>self.__DATA__={"u":"https:\\/\\/gzip.rousav.tech\\/tv\\/ee3c2a52662960708707\\/index.m3u8?sig=a\\u0026x=1"}</script>' +
    '<source src="https:\\/\\/gzip.rousav.tech\\/tv\\/ee3c2a52662960708707\\/index.m3u8?sig=a&x=1">';
  const out = vidly._test.vidlyStreamUrls(html);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0], 'https://gzip.rousav.tech/tv/ee3c2a52662960708707/index.m3u8?sig=a&x=1');
});
test('vidlyStreamUrls returns empty for pages without streams', function () {
  assert.strictEqual(vidly._test.vidlyStreamUrls('<html>no streams</html>').length, 0);
});

section('filehost');
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
  const buttons = filehost._test.hubFileButtons(markup);
  assert.strictEqual(buttons.length, 1);
  assert.strictEqual(buttons[0].url, 'https://drive.workers.dev/1');
});

section('tmdb ids');
test('normalizeImdbId accepts bare ids and urls', function () {
  assert.strictEqual(tmdb.normalizeImdbId('tt1375666'), 'tt1375666');
  assert.strictEqual(tmdb.normalizeImdbId(' TT1375666 '), 'tt1375666');
  assert.strictEqual(tmdb.normalizeImdbId('https://www.imdb.com/title/tt1375666/'), 'tt1375666');
  assert.strictEqual(tmdb.normalizeImdbId('27205'), '');
  assert.strictEqual(tmdb.normalizeImdbId(''), '');
});
test('isImdbId distinguishes id formats', function () {
  assert.strictEqual(tmdb.isImdbId('tt1375666'), true);
  assert.strictEqual(tmdb.isImdbId('27205'), false);
  assert.strictEqual(tmdb.isImdbId('tt12'), false);
});
test('firstFindResult picks the requested media type', function () {
  const raw = {
    movie_results: [{ id: 27205, title: 'Inception', release_date: '2010-07-15' }],
    tv_results: [{ id: 1399, name: 'Game of Thrones', first_air_date: '2011-04-17' }],
  };
  assert.strictEqual(tmdb._test.firstFindResult(raw, 'movie').id, 27205);
  assert.strictEqual(tmdb._test.firstFindResult(raw, 'tv').id, 1399);
  assert.strictEqual(tmdb._test.firstFindResult(null, 'movie'), null);
});
test('awaitMeta reuses resolved metadata and respects expired budgets', async function () {
  const meta = { id: 27205, title: 'Inception', imdbId: 'tt1375666' };
  assert.strictEqual(await tmdb.awaitMeta({ meta: meta }), meta);
  assert.strictEqual(await tmdb.awaitMeta({ metaPromise: Promise.resolve(meta) }), meta);
  assert.strictEqual(
    await tmdb.awaitMeta({ metaPromise: new Promise(function () {}), deadline: Date.now() - 1 }),
    null
  );
});
test('awaitMeta fills ids on the provider scope', async function () {
  const meta = { id: 27205, title: 'Inception', imdbId: 'tt1375666' };
  const scope = { metaPromise: Promise.resolve(meta), tmdbId: 0, imdbId: '' };
  assert.strictEqual(await tmdb.awaitMeta(scope), meta);
  assert.strictEqual(scope.meta, meta);
  assert.strictEqual(scope.tmdbId, 27205);
  assert.strictEqual(scope.imdbId, 'tt1375666');
});

section('providers');
test('registry contract', function () {
  const ids = {};
  providers.PROVIDERS.forEach(function (provider) {
    assert.ok(provider.id, 'missing id');
    assert.ok(!ids[provider.id], 'duplicate id ' + provider.id);
    ids[provider.id] = true;
    assert.ok(provider.name, provider.id + ' missing name');
    assert.strictEqual(typeof provider.resolve, 'function', provider.id + ' missing resolve');
    assert.ok(Number(provider.raceTimeoutMs) > 0, provider.id + ' missing raceTimeoutMs');
    assert.strictEqual(provider.timeoutMs, undefined, provider.id + ' must use one race budget');
    assert.ok(provider.supports && provider.supports.movie && provider.supports.tv, provider.id + ' missing supports');
    assert.ok(provider.toggle && provider.toggle.key, provider.id + ' missing toggle metadata');
    assert.strictEqual(providers.BY_ID[provider.id], provider);
  });
});
test('settings have no per-provider toggles', function () {
  const layout = settings.onSettings();
  const providerToggleKeys = layout.filter(function (item) {
    return item.key && /^source[A-Z]/.test(item.key);
  });
  assert.strictEqual(providerToggleKeys.length, 0);
});
test('enabled filters by source toggle and media type', function () {
  const fake = [
    { id: 'movie-only', supports: { movie: true, tv: false } },
    { id: 'both', supports: { movie: true, tv: true } },
  ];
  assert.deepStrictEqual(
    providers.enabled({}, 'tv', fake).map(function (provider) { return provider.id; }),
    ['both']
  );
  assert.deepStrictEqual(
    providers.enabled({ both: false }, 'movie', fake).map(function (provider) { return provider.id; }),
    ['movie-only']
  );
});
test('racer returns fast results and isolates failures', async function () {
  const logs = [];
  const out = await racer.race(
    [
      {
        id: 'fast',
        name: 'Fast',
        raceTimeoutMs: 1000,
        resolve: async function () { return [{ url: 'https://example.com/1.m3u8' }]; },
      },
      {
        id: 'bad',
        name: 'Bad',
        raceTimeoutMs: 300,
        resolve: async function () { throw new Error('boom'); },
      },
      {
        id: 'slow',
        name: 'Slow',
        raceTimeoutMs: 300,
        resolve: function () { return new Promise(function () {}); },
      },
    ],
    {
      settings: { requestTimeout: 10 },
      log: function (message) { logs.push(message); },
    },
    function (raw, provider) {
      return { url: raw.url, provider: provider.name };
    }
  );
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].provider, 'Fast');
  assert.ok(logs.some(function (message) { return message.indexOf('done:') >= 0; }));
});
test('racer normalizes with metadata resolved during provider work', async function () {
  let releaseMeta = null;
  const metaPromise = new Promise(function (resolve) { releaseMeta = resolve; });
  const out = await racer.race(
    [
      {
        id: 'metadata',
        name: 'Metadata',
        raceTimeoutMs: 1000,
        resolve: function () {
          return new Promise(function (resolve) {
            releaseMeta({ title: 'Inception' });
            setTimeout(function () {
              resolve([{ url: 'https://example.com/1.m3u8' }]);
            }, 10);
          });
        },
      },
    ],
    {
      settings: { requestTimeout: 10 },
      log: function () {},
      metaPromise: metaPromise,
    },
    function (raw, provider, ctx) {
      return { url: raw.url, title: ctx.meta && ctx.meta.title ? ctx.meta.title : '' };
    }
  );
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].title, 'Inception');
});
test('racer aborts unfinished providers when it finishes', async function () {
  let aborted = false;
  const out = await racer.race(
    [
      {
        id: 'fast',
        name: 'Fast',
        raceTimeoutMs: 1000,
        resolve: async function () { return [{ url: 'https://example.com/1.m3u8' }]; },
      },
      {
        id: 'slow',
        name: 'Slow',
        raceTimeoutMs: 5000,
        resolve: function (ctx) {
          return new Promise(function () {
            if (ctx.signal) {
              ctx.signal.addEventListener('abort', function () {
                aborted = true;
              });
            }
          });
        },
      },
    ],
    {
      settings: { requestTimeout: 10 },
      log: function () {},
    },
    function (raw, provider) {
      return { url: raw.url, provider: provider.name };
    }
  );
  await new Promise(function (resolve) { setTimeout(resolve, 50); });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(aborted, true);
});

section('factory');
test('provider work starts before metadata resolves', async function () {
  const original = tmdb.resolveMeta;
  let releaseMeta = null;
  const gate = new Promise(function (resolve) { releaseMeta = resolve; });
  let started = false;
  tmdb.resolveMeta = function () { return gate; };
  try {
    const provider = {
      id: 'fake',
      name: 'Fake',
      supports: { movie: true, tv: true },
      raceTimeoutMs: 1000,
      resolve: async function () {
        started = true;
        return [{ url: 'https://example.com/1.m3u8', type: 'hls', height: 1080 }];
      },
    };
    const api = factory.createPlugin(provider);
    const pending = api.getStreams('tt1375666', 'movie', null, null);
    await new Promise(function (resolve) { setTimeout(resolve, 20); });
    assert.strictEqual(started, true);
    releaseMeta(null);
    const streams = await pending;
    assert.strictEqual(streams.length, 1);
  } finally {
    tmdb.resolveMeta = original;
  }
});

section('styles');
const styles = require('../src/indstream/styles');
const HDR_RAW = {
  url: 'https://example.com/inception.2160p.mkv',
  type: 'mp4',
  quality: '2160p',
  height: 2160,
  size: '65.95 GB',
  language: 'English, Hindi',
  releaseText: 'Inception.2010.2160p.BluRay.REMUX.DV.HDR.10bit.HEVC.Hindi.DDP.English.Atmos.5.1.mkv',
};
const HDR_CTX = { season: 0, episode: 0, meta: { title: 'Inception', year: '2010' } };
test('lightgdrive renders declared specs only', function () {
  const out = styles.renderNameTitle({ id: 'hdhub', name: 'HdHub' }, HDR_RAW, HDR_CTX, 'lightgdrive');
  assert.strictEqual(out.name, 'HdHub 2160p');
  assert.ok(out.title.indexOf('📁 Inception (2010)') === 0);
  assert.ok(out.title.indexOf('BluRay') >= 0);
  assert.ok(out.title.indexOf('HEVC') >= 0);
  assert.ok(out.title.indexOf('📦 65.95 GB') >= 0);
  assert.ok(out.title.indexOf('🇬🇧') >= 0);
});
test('lightgdrive episode tag', function () {
  const raw = Object.assign({}, HDR_RAW, { quality: '1080p', height: 1080, releaseText: 'Stranger.Things.S01E01.1080p.WEB-DL.DDP5.1.H.264.mkv' });
  const ctx = { season: 1, episode: 1, meta: { title: 'Stranger Things', year: '2016' } };
  const out = styles.renderNameTitle({ id: 'netmirror', name: 'NetMirror' }, raw, ctx, 'lightgdrive');
  assert.strictEqual(out.name, 'NetMirror 1080p');
  assert.ok(out.title.indexOf('S01E01') >= 0);
  assert.ok(out.title.indexOf('WEB-DL') >= 0);
});
test('unknown release text omits spec lines instead of guessing', function () {
  const raw = { url: 'https://example.com/v.mp4', type: 'mp4', quality: '1080p', height: 1080, language: '' };
  const out = styles.renderNameTitle({ id: 'bingr', name: 'Bingr' }, raw, { season: 0, episode: 0 }, 'lightgdrive');
  assert.ok(out.title.indexOf('🎥') < 0);
  assert.ok(out.title.indexOf('📺') < 0);
  assert.ok(out.title.indexOf('🔍 Bingr') >= 0);
});
test('invalid style falls back to lightgdrive', function () {
  const out = styles.renderNameTitle({ id: 'hdhub', name: 'HdHub' }, HDR_RAW, HDR_CTX, 'nope');
  assert.strictEqual(out.name, 'HdHub 2160p');
});
test('every preset renders without throwing', function () {
  styles.STYLE_IDS.forEach(function (id) {
    const samples = styles.previewSamples(id);
    assert.strictEqual(samples.length, 3);
    samples.forEach(function (sample) {
      assert.ok(sample.name && sample.title, 'empty render for ' + id);
    });
  });
});

section('display languages');
test('sortDisplayLanguages orders original first, then hindi, then english', function () {
  assert.deepStrictEqual(util.sortDisplayLanguages(['English', 'Hindi', 'French', 'German'], 'German'), ['German', 'Hindi', 'English', 'French']);
  assert.deepStrictEqual(util.sortDisplayLanguages(['English', 'Telugu', 'Tamil'], 'Tamil'), ['Tamil', 'English', 'Telugu']);
  assert.deepStrictEqual(util.sortDisplayLanguages(['English', 'Hindi'], ''), ['Hindi', 'English']);
});
test('capDisplayLanguages caps at three and renders Multi beyond', function () {
  assert.deepStrictEqual(util.capDisplayLanguages(['Hindi', 'English', 'German'], ''), ['Hindi', 'English', 'German']);
  assert.deepStrictEqual(util.capDisplayLanguages(['Hindi', 'English', 'German', 'French'], ''), ['Multi']);
  assert.deepStrictEqual(util.capDisplayLanguages(['Tamil', 'English', 'Hindi', 'Telugu'], ''), ['Multi']);
});
test('renderNameTitle caps embedded language lists at Multi', function () {
  const raw = { url: 'https://example.com/x.m3u8', type: 'hls', quality: '1080p', height: 1080, language: 'German, English, Spanish, French, Hindi, Italian, Japanese, Polish, Portuguese, Turkish' };
  const ctx = { season: 0, episode: 0, meta: { title: 'Inception', year: '2010' } };
  const out = styles.renderNameTitle({ id: 'vidly', name: 'Vidly' }, raw, ctx, 'lightgdrive');
  assert.ok(out.title.indexOf('Multi') >= 0);
  assert.ok(out.title.indexOf('German') < 0);
  assert.ok(out.title.indexOf('Japanese') < 0);
});
test('renderNameTitle shows original first then hindi then english', function () {
  const raw = { url: 'https://example.com/x.mp4', type: 'mp4', quality: '1080p', height: 1080, language: 'English, Hindi, French' };
  const ctx = { season: 0, episode: 0, meta: { title: 'Inception', year: '2010', originalLanguage: 'fr' } };
  const out = styles.renderNameTitle({ id: 'hdhub', name: 'HdHub' }, raw, ctx, 'gdrive');
  const fr = out.title.indexOf('French');
  const hi = out.title.indexOf('Hindi');
  const en = out.title.indexOf('English');
  assert.ok(fr >= 0 && hi > fr && en > hi, 'expected French, Hindi, English order in: ' + out.title);
});

section('racer');
test('capOf honors the ui timeout per provider', function () {
  assert.strictEqual(racer.capOf({ raceTimeoutMs: 9000 }, { requestTimeout: 5 }), 5000);
  assert.strictEqual(racer.capOf({ raceTimeoutMs: 3000 }, { requestTimeout: 5 }), 5000);
  assert.strictEqual(racer.capOf({ raceTimeoutMs: 3000 }, { requestTimeout: 10 }), 10000);
  assert.strictEqual(racer.capOf({ raceTimeoutMs: 4321 }, {}), 4321);
  assert.strictEqual(racer.capOf({ raceTimeoutMs: 0 }, { requestTimeout: 0 }), 12000);
});

section('cache');
test('cached values are reused without re-running the producer', async function () {
  const calls = { n: 0 };
  const cache = cacheLib.createTtlCache({ ttlMs: 60000, maxEntries: 10, now: function () { return 1000; } });
  const first = await cache.get('k', async function () { calls.n += 1; return [{ url: 'a' }]; });
  const second = await cache.get('k', async function () { calls.n += 1; return [{ url: 'b' }]; });
  assert.strictEqual(calls.n, 1);
  assert.strictEqual(first.cached, false);
  assert.strictEqual(second.cached, true);
  assert.strictEqual(second.value[0].url, 'a');
});
test('empty results are never cached', async function () {
  const calls = { n: 0 };
  const cache = cacheLib.createTtlCache({ ttlMs: 60000, maxEntries: 10, now: function () { return 1000; } });
  await cache.get('k', async function () { calls.n += 1; return []; });
  const again = await cache.get('k', async function () { calls.n += 1; return []; });
  assert.strictEqual(calls.n, 2);
  assert.strictEqual(again.cached, false);
});
test('entries expire after the ttl', async function () {
  let t = 1000;
  const calls = { n: 0 };
  const cache = cacheLib.createTtlCache({ ttlMs: 1000, maxEntries: 10, now: function () { return t; } });
  await cache.get('k', async function () { calls.n += 1; return [{ url: 'a' }]; });
  t = 2500;
  const fresh = await cache.get('k', async function () { calls.n += 1; return [{ url: 'b' }]; });
  assert.strictEqual(calls.n, 2);
  assert.strictEqual(fresh.value[0].url, 'b');
});
test('oldest entries are evicted past maxEntries', async function () {
  const cache = cacheLib.createTtlCache({ ttlMs: 60000, maxEntries: 2, now: function () { return 1000; } });
  const mk = function (id) { return async function () { return [{ url: id }]; }; };
  await cache.get('a', mk('a'));
  await cache.get('b', mk('b'));
  await cache.get('c', mk('c'));
  assert.strictEqual(cache.size(), 2);
  const a = await cache.get('a', mk('a2'));
  assert.strictEqual(a.value[0].url, 'a2');
  assert.strictEqual(a.cached, false);
});
test('concurrent identical requests join a single producer', async function () {
  const calls = { n: 0 };
  const cache = cacheLib.createTtlCache({ ttlMs: 60000, maxEntries: 10, now: function () { return 1000; } });
  const producer = async function () {
    calls.n += 1;
    await new Promise(function (resolve) { setImmediate(resolve); });
    return [{ url: 'x' }];
  };
  const out = await Promise.all([cache.get('k', producer), cache.get('k', producer)]);
  assert.strictEqual(calls.n, 1);
  assert.strictEqual(out[0].value[0].url, 'x');
  assert.strictEqual(out[1].value[0].url, 'x');
});

main();
