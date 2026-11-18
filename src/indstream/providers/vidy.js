'use strict';

const wecollege = require('./wecollege');

module.exports = wecollege.createProvider({
  id: 'vidy',
  name: 'Vidy',
  speed: 'fast',
  raceTimeoutMs: 15000,
  referer: 'https://www.vidy.st/',
  lanes: [
    'miami', 'boise', 'vegas', 'reno', 'oakland', 'seattle', 'phoenix', 'atlanta',
    'portland', 'austin', 'dallas', 'tampa', 'orlando', 'munich', 'berlin', 'paris',
    'delhi', 'cancun',
  ],
  toggle: {
    key: 'sourceVidy',
    label: 'Vidy',
    description: 'Multi-lane encrypted HLS API with 4K and multi-audio.',
  },
});
