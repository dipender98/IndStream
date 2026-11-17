'use strict';

const path = require('path');
const manifest = require('../manifest.json');

const ROOT = path.join(__dirname, '..');
const TMDB = {
  inception: 27205,
  got: { id: 1399, season: 1, episode: 1 },
};

function elapsed(started) {
  return String(Date.now() - started).padStart(5, ' ') + 'ms';
}

async function run() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'movie';
  const idArg = args[1] || '';
  const only = args[2] || '';
  const season = Number(args[3]) || TMDB.got.season;
  const episode = Number(args[4]) || TMDB.got.episode;
  const input = idArg || (mode === 'movie' ? TMDB.inception : TMDB.got.id);

  const scrapers = manifest.scrapers.filter(function (scraper) {
    return scraper.filename && (!only || scraper.id === only);
  });
  if (!scrapers.length) {
    console.error('No scraper matched: ' + only);
    process.exitCode = 1;
    return;
  }

  globalThis.SCRAPER_SETTINGS = JSON.stringify({
    minQuality: '720',
    resultLimit: '40',
    requestTimeout: '15',
    probeQuality: false,
    debug: false,
  });

  console.log('IndStream live probe (' + mode + ', id ' + input + ', ' + scrapers.length + ' scrapers)');
  const apis = scrapers.map(function (scraper) {
    return { scraper: scraper, api: require(path.join(ROOT, scraper.filename)) };
  });
  const started = Date.now();

  const results = await Promise.all(
    apis.map(async function (entry) {
      const name = entry.scraper.name || entry.scraper.id;
      try {
        const streams = mode === 'tv'
          ? await entry.api.getStreams(input, 'tv', season, episode)
          : await entry.api.getStreams(input, 'movie', null, null);
        console.log('[' + elapsed(started) + '] ' + name + ' -> ' + streams.length + ' streams');
        return { scraper: entry.scraper, streams: streams, error: null };
      } catch (error) {
        console.log('[' + elapsed(started) + '] ' + name + ' failed: ' + (error.message || error));
        return { scraper: entry.scraper, streams: [], error: error };
      }
    })
  );

  let total = 0;
  results.forEach(function (result) {
    total += result.streams.length;
  });

  console.log('total: ' + total + ' streams in ' + (Date.now() - started) + 'ms');

  const bad = [];
  results.forEach(function (result) {
    result.streams.forEach(function (stream) {
      if (!stream.url || !stream.provider) bad.push(stream);
    });
  });
  if (bad.length) {
    console.log('SMOKE FAIL: ' + bad.length + ' streams missing url/provider');
    process.exitCode = 1;
  }
}

run().catch(function (error) {
  console.error('SMOKE ERROR:', error);
  process.exitCode = 1;
});
