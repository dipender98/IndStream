'use strict';

const hdhub = require('./hdhub');
const vidrift = require('./vidrift');
const bingr = require('./bingr');
const moviebox = require('./moviebox');
const hub4k = require('./hub4k');
const netmirror = require('./netmirror');
const atlantic = require('./atlantic');
const vidly = require('./vidly');
const vidbolt = require('./vidbolt');
const movy = require('./movy');
const vidy = require('./vidy');
const vidlink = require('./vidlink');

// Every entry is an independent provider. The racer runs them concurrently;
// none of them knows about the others.
const PROVIDERS = [hdhub, vidrift, bingr, moviebox, hub4k, netmirror, atlantic, vidly, vidbolt, movy, vidy, vidlink];

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
