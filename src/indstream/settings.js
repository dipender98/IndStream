'use strict';

const DEFAULTS = {
  minQuality: '720',
  resultLimit: '40',
  requestTimeout: '15',
  probeQuality: false,
  includeDash: true,
  sourceHdhub: true,
  sourceVidrift: true,
  sourceBingr: true,
  sourceMoviebox: true,
  sourceHub4k: true,
  sourceFsl: true,
  debug: false,
};

const SETTINGS_LAYOUT = [
  {
    type: 'info',
    label: 'One settings page for IndStream. Every enabled provider runs independently and only contributes its own streams.',
  },
  {
    type: 'header',
    label: 'Playback',
  },
  {
    type: 'select',
    key: 'minQuality',
    label: 'Minimum quality',
    description: 'Streams whose height is known and below this are dropped. Unknown heights are kept.',
    defaultValue: '720',
    options: [
      { label: '720p', value: '720' },
      { label: '1080p', value: '1080' },
      { label: 'Best available', value: '0' },
    ],
  },
  {
    type: 'select',
    key: 'resultLimit',
    label: 'Maximum results',
    description: 'Caps how many streams are returned per request.',
    defaultValue: '40',
    options: [
      { label: '20', value: '20' },
      { label: '40', value: '40' },
      { label: '80', value: '80' },
      { label: 'No limit', value: '0' },
    ],
  },
  {
    type: 'select',
    key: 'requestTimeout',
    label: 'Provider timeout',
    description: 'Upper bound for a single provider. Providers that finish sooner still return first.',
    defaultValue: '15',
    options: [
      { label: '10 seconds', value: '10' },
      { label: '15 seconds', value: '15' },
      { label: '25 seconds', value: '25' },
    ],
  },
  {
    type: 'toggle',
    key: 'probeQuality',
    label: 'Probe unknown quality',
    description: 'Reads HLS/DASH manifests to detect the real height. Slower, but labels more streams.',
    defaultValue: false,
  },
  {
    type: 'toggle',
    key: 'includeDash',
    label: 'Include DASH streams',
    description: 'Adds DASH manifests, which not every player supports. Turn off if playback fails.',
    defaultValue: true,
  },
  {
    type: 'header',
    label: 'Providers',
  },
  {
    type: 'toggle',
    key: 'sourceHdhub',
    label: 'HdHub',
    description: 'Fast aggregator: instant HLS streams plus 4K file links.',
    defaultValue: true,
  },
  {
    type: 'toggle',
    key: 'sourceVidrift',
    label: 'Vidrift',
    description: 'Embed player with direct HLS/MP4 links.',
    defaultValue: true,
  },
  {
    type: 'toggle',
    key: 'sourceBingr',
    label: 'Bingr',
    description: 'Multi-server JSON API. Usually the fastest source.',
    defaultValue: true,
  },
  {
    type: 'toggle',
    key: 'sourceMoviebox',
    label: 'MovieBox',
    description: 'Title-keyed catalogue with download and playback renditions.',
    defaultValue: true,
  },
  {
    type: 'toggle',
    key: 'sourceHub4k',
    label: '4KHDHub',
    description: '4K-first release pages resolved through file-host gateways.',
    defaultValue: true,
  },
  {
    type: 'toggle',
    key: 'sourceFsl',
    label: 'FSL',
    description: 'Fast file links from release blogs. Heaviest source, so it runs last.',
    defaultValue: true,
  },
  {
    type: 'header',
    label: 'Diagnostics',
  },
  {
    type: 'toggle',
    key: 'debug',
    label: 'Verbose logging',
    description: 'Logs each source result count and timing. Useful when a source stops working.',
    defaultValue: false,
  },
];

// Provider toggles live on the single IndStream settings page so users do not
// have to configure every provider separately.
const PROVIDER_SETTINGS = {
  hdhub: 'sourceHdhub',
  vidrift: 'sourceVidrift',
  bingr: 'sourceBingr',
  moviebox: 'sourceMoviebox',
  hub4k: 'sourceHub4k',
  fsl: 'sourceFsl',
};

function readGlobalSettings() {
  const scope = typeof globalThis !== 'undefined' ? globalThis : {};
  let raw = scope.SCRAPER_SETTINGS;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (error) {
      raw = null;
    }
  }
  return raw && typeof raw === 'object' ? raw : {};
}

function normalizeBool(value, fallback) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function pick(value, allowed, fallback) {
  const text = value == null ? '' : String(value);
  return allowed.indexOf(text) >= 0 ? text : fallback;
}

function getSettings() {
  const raw = readGlobalSettings();
  const merged = Object.assign({}, DEFAULTS);
  Object.keys(raw).forEach(function (key) {
    if (raw[key] != null) merged[key] = raw[key];
  });

  const settings = {
    minQuality: Number(pick(merged.minQuality, ['0', '720', '1080'], DEFAULTS.minQuality)),
    resultLimit: Number(pick(merged.resultLimit, ['0', '20', '40', '80'], DEFAULTS.resultLimit)),
    requestTimeout: Number(pick(merged.requestTimeout, ['10', '15', '25'], DEFAULTS.requestTimeout)),
    probeQuality: normalizeBool(merged.probeQuality, DEFAULTS.probeQuality),
    includeDash: normalizeBool(merged.includeDash, DEFAULTS.includeDash),
    debug: normalizeBool(merged.debug, DEFAULTS.debug),
    sources: {},
  };
  Object.keys(PROVIDER_SETTINGS).forEach(function (id) {
    settings.sources[id] = normalizeBool(merged[PROVIDER_SETTINGS[id]], DEFAULTS[PROVIDER_SETTINGS[id]]);
  });
  if (!settings.minQuality) settings.minQuality = 0;
  if (!settings.requestTimeout) settings.requestTimeout = 15;
  return settings;
}

function onSettings() {
  return SETTINGS_LAYOUT;
}

module.exports = {
  DEFAULTS: DEFAULTS,
  SETTINGS_LAYOUT: SETTINGS_LAYOUT,
  PROVIDER_SETTINGS: PROVIDER_SETTINGS,
  getSettings: getSettings,
  onSettings: onSettings,
};
