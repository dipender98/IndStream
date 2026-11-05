'use strict';

const plugin = require('../providers/indstream');

const TMDB = {
  inception: 27205,
  got: { id: 1399, season: 1, episode: 1 },
};

async function run() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'movie';
  const idArg = args[1] || '';
  const input = idArg || (mode === 'movie' ? TMDB.inception : TMDB.got.id);
  console.log('IndStream live smoke (' + mode + ', id ' + input + ')');

  globalThis.SCRAPER_SETTINGS = JSON.stringify({
    minQuality: '720',
    resultLimit: '20',
    requestTimeout: '25',
    probeQuality: false,
    debug: true,
  });

  let streams = [];
  const started = Date.now();
  if (mode === 'movie') {
    streams = await plugin.getStreams(input, 'movie', null, null);
  } else {
    streams = await plugin.getStreams(input, 'tv', TMDB.got.season, TMDB.got.episode);
  }
  const elapsed = Date.now() - started;
  console.log('elapsed: ' + elapsed + 'ms');
  console.log('total streams: ' + streams.length);
  streams.forEach(function (s, i) {
    console.log('  [' + i + '] ' + s.provider + ' | ' + s.quality + ' | ' + s.language + ' | ' + s.type + ' | ' + s.url.slice(0, 110));
  });

  const providers = {};
  streams.forEach(function (s) { providers[s.provider] = (providers[s.provider] || 0) + 1; });
  console.log('per provider: ' + JSON.stringify(providers));

  if (!streams.length) {
    console.log('SMOKE WARNING: no streams found (network-dependent)');
    return;
  }
  const bad = streams.filter(function (s) { return !s.url || !s.provider; });
  if (bad.length) {
    console.log('SMOKE FAIL: streams missing url/provider');
    process.exitCode = 1;
  }
}

run().catch(function (err) {
  console.error('SMOKE ERROR:', err);
  process.exitCode = 1;
});
