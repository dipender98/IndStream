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

module.exports = {
  PROVIDERS: PROVIDERS,
  BY_ID: BY_ID,
};
