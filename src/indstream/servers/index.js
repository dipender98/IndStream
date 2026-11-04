'use strict';

const vidrift = require('./vidrift');
const bingr = require('./bingr');
const moviebox = require('./moviebox');
const hub4k = require('./hub4k');
const fsl = require('./fsl');
const hdhub = require('./hdhub');

const SERVERS = [hdhub, vidrift, bingr, moviebox, hub4k, fsl];

const BY_ID = {};
SERVERS.forEach(function (server) {
  BY_ID[server.id] = server;
});

module.exports = {
  SERVERS: SERVERS,
  BY_ID: BY_ID,
};
