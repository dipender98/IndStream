'use strict';

const http = require('./http');

const GRACE_MS = 2000;
const OVERALL_MAX_MS = 14000;

// Each provider owns its race budget. A settings-level timeout still acts as
// the upper bound so a slow provider can never stall the whole request.
function capOf(provider, settings) {
  const own = Number(provider.raceTimeoutMs) || Number(provider.timeoutMs) || 12000;
  const ceiling = (Number(settings.requestTimeout) || 15) * 1000 + 5000;
  return Math.min(own, ceiling);
}

// Runs all providers concurrently. Resolves as soon as one of these happens:
// - every provider has settled, or
// - at least one stream arrived and the grace window has elapsed, or
// - the overall deadline passed.
// A provider that throws, rejects or times out contributes an empty result and
// never fails the request.
function race(providers, context, normalize) {
  return new Promise(function (resolve) {
    const total = providers.length;
    const collected = [];
    let settled = 0;
    let finished = false;
    let graceTimer = null;

    if (!total) {
      resolve(collected);
      return;
    }

    const caps = providers.map(function (provider) {
      return capOf(provider, context.settings);
    });
    const overallMs = Math.min(OVERALL_MAX_MS, Math.max.apply(null, caps) + 9000);
    const overallTimer = setTimeout(finish, overallMs);

    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(overallTimer);
      if (graceTimer) clearTimeout(graceTimer);
      context.log('done: ' + collected.length + ' streams from ' + settled + '/' + total + ' providers');
      resolve(collected.slice());
    }

    function onFirstStream() {
      if (graceTimer) return;
      graceTimer = setTimeout(finish, GRACE_MS);
    }

    function settle() {
      settled += 1;
      if (settled >= total) finish();
    }

    providers.forEach(function (provider, i) {
      const startedAt = Date.now();
      const scope = Object.assign({}, context, { deadline: Date.now() + caps[i] - 1000 });

      const work = Promise.resolve().then(function () {
        return provider.resolve(scope);
      });

      http.withTimeout(work, caps[i], []).then(function (list) {
        const normalized = [];
        (list || []).forEach(function (raw) {
          try {
            const stream = normalize(raw, provider);
            if (stream) normalized.push(stream);
          } catch (error) {
            /* skip malformed entries, keep the rest of the provider's output */
          }
        });

        context.log(provider.name + ': ' + normalized.length + ' streams in ' + (Date.now() - startedAt) + 'ms');
        if (normalized.length) {
          Array.prototype.push.apply(collected, normalized);
          onFirstStream();
        }
        settle();
      });
    });
  });
}

module.exports = {
  GRACE_MS: GRACE_MS,
  OVERALL_MAX_MS: OVERALL_MAX_MS,
  capOf: capOf,
  race: race,
};
