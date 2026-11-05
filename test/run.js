'use strict';

const assert = require('assert');

const util = require('../src/indstream/util');
const html = require('../src/indstream/html');
const http = require('../src/indstream/http');
const finalize = require('../src/indstream/finalize');
const settings = require('../src/indstream/settings');
const tmdb = require('../src/indstream/tmdb');
const providers = require('../src/indstream/providers');
const racer = require('../src/indstream/racer');
const vidrift = require('../src/indstream/providers/vidrift');
const bingr = require('../src/indstream/providers/bingr');
const moviebox = require('../src/indstream/providers/moviebox');
const hub4k = require('../src/indstream/providers/hub4k');
const fsl = require('../src/indstream/providers/fsl');
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
});
test('override and source disable', function () {
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

section('vidrift');
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

section('bingr');
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

section('fsl');
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
test('settings are shared (no per-provider toggles)', function () {
  const layout = settings.onSettings();
  const providerToggleKeys = layout.filter(function (item) {
    return item.key && /^source[A-Z]/.test(item.key);
  });
  assert.strictEqual(providerToggleKeys.length, 0);
  assert.strictEqual(Object.keys(settings.PROVIDER_SETTINGS).length, 0);
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

main();
