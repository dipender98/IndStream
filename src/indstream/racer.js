'use strict';

const http = require('./http');

// After the first stream, keep waiting for providers running under their own caps.
const GRACE_MS = 5000;
const OVERALL_MAX_MS = 14000;

// Each provider owns its race budget; settings set the upper bound.
function capOf(provider, settings) {
  const own = Number(provider.raceTimeoutMs) || 12000;
  const ceiling = (Number(settings.requestTimeout) || 15) * 1000 + 5000;
  return Math.min(own, ceiling);
}

// Runs providers concurrently and resolves with partial results.
function race(providers, context, normalize) {
  return new Promise(function (resolve) {
    const total = providers.length;
    const collected = [];
    const guards = [];
    const controllers = [];
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
      guards.forEach(function (guard) {
        if (guard && typeof guard.cancel === 'function') guard.cancel();
      });
      controllers.forEach(function (controller) {
        http.abort(controller);
      });
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
      const cap = caps[i];
      const controller = http.createAbortController();
      if (controller) controllers.push(controller);

      // Keep a short reserve for cleanup, but leave most of small budgets usable.
      const reserve = Math.min(1000, Math.max(250, Math.floor(cap / 5)));
      const scope = Object.assign({}, context, {
        deadline: Date.now() + cap - reserve,
        timeoutMs: Math.max(1000, cap - reserve),
        signal: controller ? controller.signal : undefined,
      });
      scope.http = http.scope(scope);
      if (scope.metaPromise) {
        scope.metaPromise.then(function (meta) {
          if (meta && !scope.meta) scope.meta = meta;
        });
      }

      const startedAt = Date.now();
      const work = Promise.resolve().then(function () {
        return provider.resolve(scope);
      });

      const guard = http.withTimeout(work, cap, [], function () {
        http.abort(controller);
      });
      guards.push(guard);

      guard.then(function (list) {
        if (finished) return;
        const normalized = [];
        (list || []).forEach(function (raw) {
          try {
            const stream = normalize(raw, provider, scope);
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
