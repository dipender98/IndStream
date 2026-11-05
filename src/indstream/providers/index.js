'use strict';

const hdhub = require('./hdhub');
const vidrift = require('./vidrift');
const bingr = require('./bingr');
const moviebox = require('./moviebox');
const hub4k = require('./hub4k');
const fsl = require('./fsl');

// Every entry is an independent provider. The racer runs them concurrently;
// none of them knows about the others.
const PROVIDERS = [hdhub, vidrift, bingr, moviebox, hub4k, fsl];

const BY_ID = {};
PROVIDERS.forEach(function (provider) {
  BY_ID[provider.id] = provider;
});

function enabled(sources, type, list) {
  return (list || PROVIDERS).filter(function (provider) {
    if (sources && sources[provider.id] === false) return false;
    if (provider.supports && provider.supports[type] === false) return false;
    return true;
  });
}

module.exports = {
  PROVIDERS: PROVIDERS,
  BY_ID: BY_ID,
  enabled: enabled,
};
