'use strict';

const http = require('./http');

// Providers run until they settle or reach their own per-provider upper bound.
const OVERALL_MAX_MS = 90000;

// The UI timeout is the per-provider budget; providers fall back to their own cap.
function capOf(provider, settings) {
  const uiMs = Number(settings && settings.requestTimeout);
  if (Number.isFinite(uiMs) && uiMs > 0) return Math.floor(uiMs * 1000);
  return Number(provider.raceTimeoutMs) || 12000;
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
      guards.forEach(function (guard) {
        if (guard && typeof guard.cancel === 'function') guard.cancel();
      });
      controllers.forEach(function (controller) {
        http.abort(controller);
      });
      context.log('done: ' + collected.length + ' streams from ' + settled + '/' + total + ' providers');
      resolve(collected.slice());
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
      let failed = false;
      const work = Promise.resolve().then(function () {
        return provider.resolve(scope);
      }).catch(function () {
        failed = true;
        return [];
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

        const ms = Date.now() - startedAt;
        context.log(provider.name + ': ' + normalized.length + ' streams in ' + ms + 'ms');
        if (typeof context.onProviderResult === 'function') {
          context.onProviderResult({
            id: provider.id,
            name: provider.name,
            state: normalized.length ? 'live' : (failed || ms >= cap - 50 ? 'error' : 'empty'),
            streams: normalized.length,
            ms: ms,
          });
        }
        if (normalized.length) {
          Array.prototype.push.apply(collected, normalized);
        }
        settle();
      });
    });
  });
}

module.exports = {
  OVERALL_MAX_MS: OVERALL_MAX_MS,
  capOf: capOf,
  race: race,
};
