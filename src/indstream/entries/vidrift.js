'use strict';

const factory = require('../factory');
const provider = require('../providers/vidrift');
const api = factory.createPlugin(provider);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.getStreams = api.getStreams;
  globalThis.onSettings = api.onSettings;
} else if (typeof global !== 'undefined') {
  global.getStreams = api.getStreams;
  global.onSettings = api.onSettings;
}
