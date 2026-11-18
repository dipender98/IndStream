'use strict';

const styles = require('./styles');

const QUALITY_KEYS = ['2160', '1440', '1080', '720', 'auto', 'unknown'];
const DEFAULT_QUALITY_ORDER = QUALITY_KEYS.slice();

const CORE_DEFAULTS = {
  resultLimit: '40',
  requestTimeout: '5',
  probeQuality: false,
  includeDash: true,
  debug: false,
  streamStyle: styles.DEFAULT_STYLE,
};

const DEFAULTS = Object.assign({}, CORE_DEFAULTS);

const SETTINGS_LAYOUT = [
  {
    type: 'info',
    label: 'Settings for this IndStream server. Each server keeps its own copy.',
  },
  {
    type: 'header',
    label: 'Playback',
  },
  {
    type: 'info',
    label: 'Quality order and language ranking are configured on the IndStream web page. Known streams below 720p are always hidden.',
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
    defaultValue: '5',
    options: [
      { label: '5 seconds', value: '5' },
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
    label: 'Display',
  },
  {
    type: 'select',
    key: 'streamStyle',
    label: 'Stream style',
    description: 'How each stream is labelled in the list. Badge shows source and quality.',
    defaultValue: styles.DEFAULT_STYLE,
    options: styles.STYLE_OPTIONS.map(function (opt) {
      return { label: opt.label.replace(' (default)', ''), value: opt.id };
    }),
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

function normalizeQualityOrder(value) {
  const order = [];
  if (Array.isArray(value)) {
    value.forEach(function (key) {
      const text = String(key == null ? '' : key);
      if (QUALITY_KEYS.indexOf(text) >= 0 && order.indexOf(text) < 0) order.push(text);
    });
  }
  QUALITY_KEYS.forEach(function (key) {
    if (order.indexOf(key) < 0) order.push(key);
  });
  return order;
}

function normalizeQualityOff(value) {
  const off = [];
  if (!Array.isArray(value)) return off;
  value.forEach(function (key) {
    const text = String(key == null ? '' : key);
    if (QUALITY_KEYS.indexOf(text) >= 0 && off.indexOf(text) < 0) off.push(text);
  });
  return off;
}

function legacyQualityOff(minQuality) {
  return String(minQuality) === '1080' ? ['720', 'auto'] : [];
}

function qualityPreferences(merged) {
  const order = normalizeQualityOrder(merged.qualityOrder);
  const off = Array.isArray(merged.qualityOrder)
    ? normalizeQualityOff(merged.qualityOff)
    : legacyQualityOff(merged.minQuality);
  const enabled = order.filter(function (key) { return off.indexOf(key) < 0; });
  return {
    qualityOrder: enabled.length ? enabled : [order[0]],
    qualityOff: off,
  };
}

function getSettings() {
  const raw = readGlobalSettings();
  const merged = Object.assign({}, DEFAULTS);
  Object.keys(raw).forEach(function (key) {
    if (raw[key] != null) merged[key] = raw[key];
  });

  const quality = qualityPreferences(merged);
  const settings = {
    qualityOrder: quality.qualityOrder,
    qualityOff: quality.qualityOff,
    resultLimit: Number(pick(merged.resultLimit, ['0', '20', '40', '80'], DEFAULTS.resultLimit)),
    requestTimeout: Number(pick(merged.requestTimeout, ['5', '10', '15', '25'], DEFAULTS.requestTimeout)),
    probeQuality: normalizeBool(merged.probeQuality, DEFAULTS.probeQuality),
    includeDash: normalizeBool(merged.includeDash, DEFAULTS.includeDash),
    debug: normalizeBool(merged.debug, DEFAULTS.debug),
    streamStyle: pick(merged.streamStyle, styles.STYLE_IDS, DEFAULTS.streamStyle),
  };
  if (!settings.requestTimeout) settings.requestTimeout = 5;
  return settings;
}

function onSettings() {
  return SETTINGS_LAYOUT;
}

module.exports = {
  DEFAULTS: DEFAULTS,
  QUALITY_KEYS: QUALITY_KEYS,
  DEFAULT_QUALITY_ORDER: DEFAULT_QUALITY_ORDER,
  SETTINGS_LAYOUT: SETTINGS_LAYOUT,
  getSettings: getSettings,
  normalizeQualityOrder: normalizeQualityOrder,
  normalizeQualityOff: normalizeQualityOff,
  onSettings: onSettings,
};
