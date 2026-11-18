'use strict';

const wecollege = require('./wecollege');

module.exports = wecollege.createProvider({
  id: 'movy',
  name: 'Movy',
  speed: 'fast',
  raceTimeoutMs: 15000,
  referer: 'https://www.movy.sx/',
  lanes: [
    'denver', 'atlanta', 'phoenix', 'portland', 'seattle', 'miami', 'boise', 'paris',
    'cancun', 'austin', 'dallas', 'delhi', 'munich', 'orlando', 'tampa', 'berlin',
  ],
  toggle: {
    key: 'sourceMovy',
    label: 'Movy',
    description: 'Multi-lane encrypted HLS API with 4K and multi-audio.',
  },
});
