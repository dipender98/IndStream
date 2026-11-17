"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/indstream/http.js
var require_http = __commonJS({
  "src/indstream/http.js"(exports2, module2) {
    "use strict";
    var DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    function noop() {
    }
    function baseHeaders(extra) {
      const headers = {
        "User-Agent": DEFAULT_UA,
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9"
      };
      if (extra) {
        Object.keys(extra).forEach(function(key) {
          const value = extra[key];
          if (value == null) delete headers[key];
          else headers[key] = String(value);
        });
      }
      return headers;
    }
    function createAbortController() {
      if (typeof AbortController === "undefined") return null;
      try {
        return new AbortController();
      } catch (error) {
        return null;
      }
    }
    function abort(controller) {
      if (!controller) return;
      try {
        controller.abort();
      } catch (error) {
      }
    }
    function timeoutSignal(ms, externalSignal) {
      const controller = createAbortController();
      if (!controller) return { signal: externalSignal, cancel: noop, controlled: false };
      const onAbort = function() {
        abort(controller);
      };
      const timer = setTimeout(onAbort, Math.max(1, ms || 12e3));
      if (externalSignal) {
        if (externalSignal.aborted) {
          onAbort();
        } else if (typeof externalSignal.addEventListener === "function") {
          externalSignal.addEventListener("abort", onAbort);
        }
      }
      return {
        signal: controller.signal,
        controlled: true,
        cancel: function() {
          clearTimeout(timer);
          if (externalSignal && typeof externalSignal.removeEventListener === "function") {
            externalSignal.removeEventListener("abort", onAbort);
          }
        }
      };
    }
    function failure(url, message) {
      return { ok: false, status: 0, url, headers: null, text: "", error: message };
    }
    function timed(promise, ms) {
      return new Promise(function(resolve, reject) {
        const timer = setTimeout(function() {
          resolve(null);
        }, Math.max(1, ms || 12e3));
        promise.then(
          function(value) {
            clearTimeout(timer);
            resolve(value);
          },
          function(error) {
            clearTimeout(timer);
            reject(error);
          }
        );
      });
    }
    function request(url, options) {
      return __async(this, null, function* () {
        const opts = options || {};
        if (opts.signal && opts.signal.aborted) return failure(url, "aborted");
        const deadline = Number(opts.deadline) || 0;
        let timeoutMs = Number(opts.timeoutMs) || 12e3;
        if (deadline) {
          const remaining = deadline - Date.now();
          if (remaining <= 0) return failure(url, "deadline exceeded");
          timeoutMs = Math.min(timeoutMs, remaining);
        }
        const guard = timeoutSignal(timeoutMs, opts.signal);
        const headers = baseHeaders(opts.headers);
        const init = {
          method: opts.method || "GET",
          headers,
          redirect: "follow"
        };
        if (guard.signal) init.signal = guard.signal;
        if (opts.body != null) init.body = opts.body;
        if (opts.credentials) init.credentials = opts.credentials;
        try {
          const pending = guard.controlled ? fetch(url, init) : timed(fetch(url, init), timeoutMs);
          const response = yield pending;
          if (!response) return failure(url, "timeout");
          const text = yield response.text();
          return {
            ok: response.ok,
            status: response.status,
            url: response.url || url,
            headers: response.headers,
            text
          };
        } catch (error) {
          const message = error && error.message ? error.message : String(error);
          return failure(url, message);
        } finally {
          guard.cancel();
        }
      });
    }
    function getText(url, options) {
      return request(url, options).then(function(res) {
        return res.ok ? res.text : "";
      });
    }
    function getJson(url, options) {
      return request(url, options).then(function(res) {
        if (!res.ok || !res.text) return null;
        try {
          return JSON.parse(res.text);
        } catch (error) {
          return null;
        }
      });
    }
    function postJson(url, body, options) {
      const opts = options || {};
      const payload = typeof body === "string" ? body : JSON.stringify(body || {});
      return request(url, {
        method: "POST",
        body: payload,
        timeoutMs: opts.timeoutMs,
        deadline: opts.deadline,
        signal: opts.signal,
        headers: Object.assign(
          {
            "Content-Type": "application/json",
            Accept: "application/json, text/plain, */*"
          },
          opts.headers || {}
        )
      }).then(function(res) {
        if (!res.ok || !res.text) return null;
        try {
          return JSON.parse(res.text);
        } catch (error) {
          return null;
        }
      });
    }
    function postText(url, body, options) {
      const opts = options || {};
      const payload = typeof body === "string" ? body : JSON.stringify(body || {});
      return request(url, {
        method: "POST",
        body: payload,
        timeoutMs: opts.timeoutMs,
        deadline: opts.deadline,
        signal: opts.signal,
        headers: Object.assign(
          {
            "Content-Type": "application/json",
            Accept: "application/json, text/plain, */*"
          },
          opts.headers || {}
        )
      }).then(function(res) {
        return res.ok ? res.text : "";
      });
    }
    function parallelMap(items, limit, worker) {
      const list = items || [];
      const size = Math.max(1, Math.min(limit || 4, list.length || 1));
      const results = new Array(list.length);
      let cursor = 0;
      function run() {
        if (cursor >= list.length) return Promise.resolve();
        const index = cursor;
        cursor += 1;
        return Promise.resolve().then(function() {
          return worker(list[index], index);
        }).then(
          function(value) {
            results[index] = value;
          },
          function() {
            results[index] = null;
          }
        ).then(run);
      }
      const workers = [];
      for (let i = 0; i < size; i += 1) workers.push(run());
      return Promise.all(workers).then(function() {
        return results;
      });
    }
    function withTimeout(promise, ms, fallback, onTimeout) {
      let settled = false;
      let timer = null;
      const wrapped = new Promise(function(resolve) {
        timer = setTimeout(function() {
          if (settled) return;
          settled = true;
          if (onTimeout) {
            try {
              onTimeout();
            } catch (error) {
            }
          }
          resolve(fallback);
        }, Math.max(250, ms || 12e3));
        Promise.resolve(promise).then(
          function(value) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
          },
          function() {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(fallback);
          }
        );
      });
      wrapped.cancel = function() {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
      };
      return wrapped;
    }
    function scope(ctx) {
      const base = ctx || {};
      function merge(options) {
        const opts = Object.assign({}, options || {});
        if (opts.deadline == null && base.deadline) opts.deadline = base.deadline;
        if (opts.signal == null && base.signal) opts.signal = base.signal;
        return opts;
      }
      return {
        request: function(url, options) {
          return request(url, merge(options));
        },
        getText: function(url, options) {
          return getText(url, merge(options));
        },
        getJson: function(url, options) {
          return getJson(url, merge(options));
        },
        postJson: function(url, body, options) {
          return postJson(url, body, merge(options));
        },
        postText: function(url, body, options) {
          return postText(url, body, merge(options));
        }
      };
    }
    module2.exports = {
      DEFAULT_UA,
      createAbortController,
      abort,
      scope,
      request,
      getText,
      getJson,
      postJson,
      postText,
      parallelMap,
      withTimeout
    };
  }
});

// src/indstream/tmdb.js
var require_tmdb = __commonJS({
  "src/indstream/tmdb.js"(exports2, module2) {
    "use strict";
    var http = require_http();
    var PUBLIC_KEYS = ["e6333b32409e02a4a6eba6fb7ff866bb", "a721dd910292becd0d78ed436463db21"];
    var API_HOSTS = ["https://api.themoviedb.org/3", "https://api.tmdb.org/3"];
    var metaCache = {};
    var imdbCache = {};
    var findCache = {};
    var IMDB_ID_RE = /\btt(\d{7,10})\b/i;
    function runtimeKey() {
      const scope = typeof globalThis !== "undefined" ? globalThis : {};
      const key = scope.TMDB_API_KEY;
      return typeof key === "string" && key.length > 8 ? key : "";
    }
    function keys() {
      const out = [];
      const key = runtimeKey();
      if (key) out.push(key);
      PUBLIC_KEYS.forEach(function(item) {
        if (out.indexOf(item) < 0) out.push(item);
      });
      return out;
    }
    function query(params) {
      const pairs = [];
      Object.keys(params || {}).forEach(function(name) {
        const value = params[name];
        if (value == null || value === "") return;
        pairs.push(encodeURIComponent(name) + "=" + encodeURIComponent(String(value)));
      });
      return pairs.join("&");
    }
    function apiGet(path, params, opts) {
      return __async(this, null, function* () {
        const allKeys = keys();
        const suffix = query(Object.assign({}, params || {}));
        const options = opts || {};
        for (let i = 0; i < allKeys.length; i += 1) {
          for (let h = 0; h < API_HOSTS.length; h += 1) {
            if (options.deadline && Date.now() >= options.deadline) return null;
            if (options.signal && options.signal.aborted) return null;
            const url = API_HOSTS[h] + path + "?api_key=" + encodeURIComponent(allKeys[i]) + (suffix ? "&" + suffix : "");
            const json = yield http.getJson(url, {
              timeoutMs: 3e3,
              deadline: options.deadline,
              signal: options.signal
            });
            if (json && !json.status_code) return json;
          }
        }
        return null;
      });
    }
    function normalizeImdbId(value) {
      const match = String(value == null ? "" : value).match(IMDB_ID_RE);
      return match ? "tt" + match[1].toLowerCase() : "";
    }
    function isImdbId(value) {
      return !!normalizeImdbId(value);
    }
    function yearOf(meta) {
      const raw = String(
        meta && (meta.release_date || meta.first_air_date || meta.year) || ""
      );
      const match = raw.match(/^(19|20)\d{2}/);
      return match ? raw.slice(0, 4) : "";
    }
    function normalizeMeta(raw, type) {
      if (!raw) return null;
      const title = raw.title || raw.name || raw.original_title || raw.original_name || "";
      return {
        id: raw.id,
        type,
        title,
        originalTitle: raw.original_title || raw.original_name || title,
        year: yearOf(raw),
        releaseDate: raw.release_date || raw.first_air_date || "",
        originalLanguage: raw.original_language || "",
        overview: raw.overview || "",
        runtime: raw.runtime || raw.episode_run_time && raw.episode_run_time[0] || 0,
        genres: (raw.genres || []).map(function(item) {
          return item && item.name ? item.name : "";
        }),
        imdbId: raw.external_ids && raw.external_ids.imdb_id || raw.imdb_id || "",
        seasons: raw.number_of_seasons || 0,
        episodes: raw.number_of_episodes || 0,
        poster: raw.poster_path ? "https://image.tmdb.org/t/p/w500" + raw.poster_path : "",
        backdrop: raw.backdrop_path ? "https://image.tmdb.org/t/p/w780" + raw.backdrop_path : "",
        popularity: raw.popularity || 0,
        isAnime: (raw.genres || []).some(function(item) {
          return item && item.id === 16;
        })
      };
    }
    function fetchMeta(tmdbId, type, opts) {
      return __async(this, null, function* () {
        const id = String(tmdbId || "").trim();
        if (!id) return null;
        const kind = type === "tv" || type === "series" ? "tv" : "movie";
        const cacheKey = kind + ":" + id;
        if (metaCache[cacheKey]) return metaCache[cacheKey];
        const raw = yield apiGet("/" + kind + "/" + id, { append_to_response: "external_ids" }, opts);
        if (!raw) return null;
        const meta = normalizeMeta(raw, kind);
        if (meta) metaCache[cacheKey] = meta;
        return meta;
      });
    }
    function firstFindResult(raw, type) {
      if (!raw) return null;
      const kind = type === "tv" || type === "series" ? "tv" : "movie";
      const list = kind === "tv" ? raw.tv_results : raw.movie_results;
      return Array.isArray(list) && list.length ? list[0] : null;
    }
    function findMetaByImdb(imdbId, type, opts) {
      return __async(this, null, function* () {
        const id = normalizeImdbId(imdbId);
        if (!id) return null;
        const kind = type === "tv" || type === "series" ? "tv" : "movie";
        const cacheKey = kind + ":" + id;
        if (findCache[cacheKey]) return findCache[cacheKey];
        const raw = yield apiGet("/find/" + id, { external_source: "imdb_id" }, opts);
        const item = firstFindResult(raw, kind);
        if (!item) return null;
        const meta = normalizeMeta(item, kind);
        if (!meta) return null;
        meta.imdbId = id;
        findCache[cacheKey] = meta;
        if (meta.id) metaCache[kind + ":" + meta.id] = meta;
        return meta;
      });
    }
    function resolveMeta(value, type, opts) {
      return __async(this, null, function* () {
        const imdbId = normalizeImdbId(value);
        if (imdbId) return findMetaByImdb(imdbId, type, opts);
        return fetchMeta(String(value == null ? "" : value).trim(), type, opts);
      });
    }
    function applyMeta(scope, meta) {
      if (!meta) return meta;
      scope.meta = meta;
      if (!scope.tmdbId && Number(meta.id)) scope.tmdbId = Number(meta.id);
      if (!scope.imdbId && meta.imdbId) scope.imdbId = meta.imdbId;
      return meta;
    }
    function awaitMeta(ctx, capMs) {
      const scope = ctx || {};
      if (scope.meta) return Promise.resolve(applyMeta(scope, scope.meta));
      if (!scope.metaPromise) return Promise.resolve(null);
      const cap = Number(capMs) > 0 ? Number(capMs) : 2e3;
      let wait = cap;
      if (scope.deadline) {
        const remaining = scope.deadline - Date.now();
        if (remaining <= 0) return Promise.resolve(null);
        wait = Math.min(wait, remaining);
      }
      return http.withTimeout(scope.metaPromise, wait, null).then(function(meta) {
        return applyMeta(scope, meta);
      });
    }
    function resolveImdbId(tmdbId, type, meta, opts) {
      return __async(this, null, function* () {
        const id = String(tmdbId || "").trim();
        if (!id) return "";
        const kind = type === "tv" || type === "series" ? "tv" : "movie";
        const cacheKey = kind + ":" + id;
        if (imdbCache[cacheKey]) return imdbCache[cacheKey];
        if (meta && meta.imdbId) {
          imdbCache[cacheKey] = meta.imdbId;
          return meta.imdbId;
        }
        const raw = yield apiGet("/" + kind + "/" + id + "/external_ids", null, opts);
        const imdb = raw && raw.imdb_id ? String(raw.imdb_id) : "";
        if (imdb) imdbCache[cacheKey] = imdb;
        return imdb;
      });
    }
    module2.exports = {
      normalizeImdbId,
      isImdbId,
      fetchMeta,
      findMetaByImdb,
      resolveMeta,
      awaitMeta,
      resolveImdbId,
      _test: {
        firstFindResult
      }
    };
  }
});

// src/indstream/settings.js
var require_settings = __commonJS({
  "src/indstream/settings.js"(exports2, module2) {
    "use strict";
    var CORE_DEFAULTS = {
      minQuality: "720",
      resultLimit: "40",
      requestTimeout: "15",
      probeQuality: false,
      includeDash: true,
      debug: false
    };
    var DEFAULTS = Object.assign({}, CORE_DEFAULTS);
    var SETTINGS_LAYOUT = [
      {
        type: "info",
        label: "Settings for this IndStream server. Each server keeps its own copy."
      },
      {
        type: "header",
        label: "Playback"
      },
      {
        type: "select",
        key: "minQuality",
        label: "Minimum quality",
        description: "Streams whose height is known and below this are dropped. Unknown heights are kept.",
        defaultValue: "720",
        options: [
          { label: "720p", value: "720" },
          { label: "1080p", value: "1080" },
          { label: "Best available", value: "0" }
        ]
      },
      {
        type: "select",
        key: "resultLimit",
        label: "Maximum results",
        description: "Caps how many streams are returned per request.",
        defaultValue: "40",
        options: [
          { label: "20", value: "20" },
          { label: "40", value: "40" },
          { label: "80", value: "80" },
          { label: "No limit", value: "0" }
        ]
      },
      {
        type: "select",
        key: "requestTimeout",
        label: "Provider timeout",
        description: "Upper bound for a single provider. Providers that finish sooner still return first.",
        defaultValue: "15",
        options: [
          { label: "10 seconds", value: "10" },
          { label: "15 seconds", value: "15" },
          { label: "25 seconds", value: "25" }
        ]
      },
      {
        type: "toggle",
        key: "probeQuality",
        label: "Probe unknown quality",
        description: "Reads HLS/DASH manifests to detect the real height. Slower, but labels more streams.",
        defaultValue: false
      },
      {
        type: "toggle",
        key: "includeDash",
        label: "Include DASH streams",
        description: "Adds DASH manifests, which not every player supports. Turn off if playback fails.",
        defaultValue: true
      },
      {
        type: "header",
        label: "Diagnostics"
      },
      {
        type: "toggle",
        key: "debug",
        label: "Verbose logging",
        description: "Logs each source result count and timing. Useful when a source stops working.",
        defaultValue: false
      }
    ];
    function readGlobalSettings() {
      const scope = typeof globalThis !== "undefined" ? globalThis : {};
      let raw = scope.SCRAPER_SETTINGS;
      if (typeof raw === "string") {
        try {
          raw = JSON.parse(raw);
        } catch (error) {
          raw = null;
        }
      }
      return raw && typeof raw === "object" ? raw : {};
    }
    function normalizeBool(value, fallback) {
      if (value === true || value === "true" || value === 1 || value === "1") return true;
      if (value === false || value === "false" || value === 0 || value === "0") return false;
      return fallback;
    }
    function pick(value, allowed, fallback) {
      const text = value == null ? "" : String(value);
      return allowed.indexOf(text) >= 0 ? text : fallback;
    }
    function getSettings() {
      const raw = readGlobalSettings();
      const merged = Object.assign({}, DEFAULTS);
      Object.keys(raw).forEach(function(key) {
        if (raw[key] != null) merged[key] = raw[key];
      });
      const settings = {
        minQuality: Number(pick(merged.minQuality, ["0", "720", "1080"], DEFAULTS.minQuality)),
        resultLimit: Number(pick(merged.resultLimit, ["0", "20", "40", "80"], DEFAULTS.resultLimit)),
        requestTimeout: Number(pick(merged.requestTimeout, ["10", "15", "25"], DEFAULTS.requestTimeout)),
        probeQuality: normalizeBool(merged.probeQuality, DEFAULTS.probeQuality),
        includeDash: normalizeBool(merged.includeDash, DEFAULTS.includeDash),
        debug: normalizeBool(merged.debug, DEFAULTS.debug)
      };
      if (!settings.requestTimeout) settings.requestTimeout = 15;
      return settings;
    }
    function onSettings() {
      return SETTINGS_LAYOUT;
    }
    module2.exports = {
      DEFAULTS,
      SETTINGS_LAYOUT,
      getSettings,
      onSettings
    };
  }
});

// src/indstream/racer.js
var require_racer = __commonJS({
  "src/indstream/racer.js"(exports2, module2) {
    "use strict";
    var http = require_http();
    var GRACE_MS = 1e3;
    var OVERALL_MAX_MS = 14e3;
    function capOf(provider2, settings) {
      const own = Number(provider2.raceTimeoutMs) || 12e3;
      const ceiling = (Number(settings.requestTimeout) || 15) * 1e3 + 5e3;
      return Math.min(own, ceiling);
    }
    function race(providers, context, normalize) {
      return new Promise(function(resolve) {
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
        const caps = providers.map(function(provider2) {
          return capOf(provider2, context.settings);
        });
        const overallMs = Math.min(OVERALL_MAX_MS, Math.max.apply(null, caps) + 9e3);
        const overallTimer = setTimeout(finish, overallMs);
        function finish() {
          if (finished) return;
          finished = true;
          clearTimeout(overallTimer);
          if (graceTimer) clearTimeout(graceTimer);
          guards.forEach(function(guard) {
            if (guard && typeof guard.cancel === "function") guard.cancel();
          });
          controllers.forEach(function(controller) {
            http.abort(controller);
          });
          context.log("done: " + collected.length + " streams from " + settled + "/" + total + " providers");
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
        providers.forEach(function(provider2, i) {
          const cap = caps[i];
          const controller = http.createAbortController();
          if (controller) controllers.push(controller);
          const reserve = Math.min(1e3, Math.max(250, Math.floor(cap / 5)));
          const scope = Object.assign({}, context, {
            deadline: Date.now() + cap - reserve,
            timeoutMs: Math.max(1e3, cap - reserve),
            signal: controller ? controller.signal : void 0
          });
          scope.http = http.scope(scope);
          if (scope.metaPromise) {
            scope.metaPromise.then(function(meta) {
              if (meta && !scope.meta) scope.meta = meta;
            });
          }
          const startedAt = Date.now();
          const work = Promise.resolve().then(function() {
            return provider2.resolve(scope);
          });
          const guard = http.withTimeout(work, cap, [], function() {
            http.abort(controller);
          });
          guards.push(guard);
          guard.then(function(list) {
            if (finished) return;
            const normalized = [];
            (list || []).forEach(function(raw) {
              try {
                const stream = normalize(raw, provider2, scope);
                if (stream) normalized.push(stream);
              } catch (error) {
              }
            });
            context.log(provider2.name + ": " + normalized.length + " streams in " + (Date.now() - startedAt) + "ms");
            if (normalized.length) {
              Array.prototype.push.apply(collected, normalized);
              onFirstStream();
            }
            settle();
          });
        });
      });
    }
    module2.exports = {
      GRACE_MS,
      OVERALL_MAX_MS,
      capOf,
      race
    };
  }
});

// src/indstream/util.js
var require_util = __commonJS({
  "src/indstream/util.js"(exports2, module2) {
    "use strict";
    var LANGUAGE_NAMES = [
      "Hindi",
      "Urdu",
      "Bengali",
      "Bangla",
      "Arabic",
      "Russian",
      "Chinese",
      "Mandarin",
      "Japanese",
      "Korean",
      "French",
      "Spanish",
      "Portuguese",
      "Filipino",
      "Tagalog",
      "Indonesian",
      "Malaysian",
      "Vietnamese",
      "English",
      "Tamil",
      "Telugu",
      "Malayalam",
      "Kannada",
      "Marathi",
      "Punjabi",
      "Gujarati",
      "Nepali",
      "Sinhala",
      "Thai",
      "Turkish",
      "German",
      "Italian",
      "Dutch",
      "Polish"
    ];
    var LANGUAGE_CODES = {
      hi: "Hindi",
      hin: "Hindi",
      en: "English",
      eng: "English",
      ta: "Tamil",
      tam: "Tamil",
      te: "Telugu",
      tel: "Telugu",
      ml: "Malayalam",
      mal: "Malayalam",
      kn: "Kannada",
      kan: "Kannada",
      bn: "Bengali",
      ben: "Bengali",
      bangla: "Bengali",
      ur: "Urdu",
      urd: "Urdu",
      ar: "Arabic",
      ara: "Arabic",
      ru: "Russian",
      rus: "Russian",
      zh: "Chinese",
      chi: "Chinese",
      zho: "Chinese",
      cmn: "Mandarin",
      ja: "Japanese",
      jpn: "Japanese",
      ko: "Korean",
      kor: "Korean",
      fr: "French",
      fre: "French",
      fra: "French",
      es: "Spanish",
      spa: "Spanish",
      pt: "Portuguese",
      por: "Portuguese",
      fil: "Filipino",
      tl: "Filipino",
      tgl: "Filipino",
      id: "Indonesian",
      ind: "Indonesian",
      ms: "Malaysian",
      may: "Malaysian",
      msa: "Malaysian",
      vi: "Vietnamese",
      vie: "Vietnamese",
      th: "Thai",
      tha: "Thai",
      tr: "Turkish",
      tur: "Turkish",
      de: "German",
      ger: "German",
      deu: "German",
      it: "Italian",
      ita: "Italian",
      nl: "Dutch",
      dut: "Dutch",
      nld: "Dutch",
      pl: "Polish",
      pol: "Polish",
      ne: "Nepali",
      nep: "Nepali",
      si: "Sinhala",
      sin: "Sinhala",
      gu: "Gujarati",
      guj: "Gujarati",
      pa: "Punjabi",
      pan: "Punjabi",
      mr: "Marathi",
      mar: "Marathi"
    };
    var LANGUAGE_ALIASES = {
      bangla: "Bengali",
      mandarin: "Chinese",
      tagalog: "Filipino",
      "brazilian portuguese": "Portuguese",
      "latino spanish": "Spanish",
      "castilian spanish": "Spanish",
      "traditional chinese": "Chinese",
      "simplified chinese": "Chinese",
      "cantonese chinese": "Chinese"
    };
    var HEIGHT_SET = [240, 360, 480, 540, 576, 720, 1080, 1440, 2160];
    var APOSTROPHES = /[\u2018\u2019\u02bc`]/g;
    function normalizeTitle(value) {
      return String(value == null ? "" : value).toLowerCase().replace(APOSTROPHES, "'").replace(/[''`]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
    }
    function compactTitle(value) {
      return normalizeTitle(value).replace(/\s+/g, "");
    }
    function titleYearOf(meta) {
      const raw = String(meta && (meta.year || meta.release_date || meta.first_air_date) || "");
      const match = raw.match(/\b(19\d{2}|20\d{2})\b/);
      return match ? Number(match[1]) : 0;
    }
    function titleScore(query, candidate, year, candidateYear) {
      const a = compactTitle(query);
      const b = compactTitle(candidate);
      if (!a || !b) return 0;
      let score = 0;
      if (a === b) score = 1;
      else if (b.indexOf(a) === 0 || a.indexOf(b) === 0) score = 0.86;
      else if (b.indexOf(a) >= 0 || a.indexOf(b) >= 0) score = 0.68;
      else {
        const at = normalizeTitle(a).split(" ").filter(Boolean);
        const bt = normalizeTitle(b).split(" ").filter(Boolean);
        if (at.length && bt.length) {
          const common = at.filter((token) => bt.indexOf(token) >= 0).length;
          score = common / Math.max(at.length, bt.length) * 0.6;
        }
      }
      if (year && candidateYear && Number(year) === Number(candidateYear)) score += 0.08;
      return Math.min(1, score);
    }
    function parseHeight(text) {
      const value = String(text == null ? "" : text);
      if (!value) return 0;
      const fourK = /(?:^|[^a-z0-9])(?:4k|uhd)(?:[^a-z0-9]|$)/i.test(value);
      const pMatch = value.match(/(?:^|[^0-9])(\d{3,4})\s*p(?:\s*\d{2,3})?(?:[^0-9]|$)/i);
      const byP = pMatch ? Number(pMatch[1]) : 0;
      const bySet = value.match(/\b(240|360|480|540|576|720|1080|1440|2160)\b/);
      const bySetNum = bySet ? Number(bySet[1]) : 0;
      let height = Math.max(byP, bySetNum, fourK ? 2160 : 0);
      if (height > 4320) height = 0;
      if (HEIGHT_SET.indexOf(height) < 0 && height < 720) return 0;
      return height;
    }
    function qualityLabel(height) {
      const value = Number(height) || 0;
      if (value >= 2160) return "4K";
      if (value >= 1440) return "1440p";
      if (value >= 1080) return "1080p";
      if (value >= 720) return "720p";
      if (value >= 480) return "480p";
      return value ? value + "p" : "";
    }
    function isKnownBelowFloor(height, floor) {
      const value = Number(height) || 0;
      const raw = floor == null || floor === "" ? 720 : Number(floor);
      const minimum = Number.isFinite(raw) ? raw : 720;
      return value > 0 && minimum > 0 && value < minimum;
    }
    var JUNK_URL_RE = new RegExp(
      "(commondatastorage\\.googleapis\\.com\\/gtv-videos-bucket|storage\\.googleapis\\.com\\/gtv-videos-bucket|test-videos\\.co\\.uk|sample\\.mp4($|[?#])|\\/(bigbuckbunny|elephantsdream|forbiggerblazes|forbiggermthan|sintel|subaruoutback|tears-of-steel)\\b)",
      "i"
    );
    function isJunkStreamUrl(url) {
      return JUNK_URL_RE.test(String(url == null ? "" : url));
    }
    function languageNames(raw) {
      const text = String(raw == null ? "" : raw).trim();
      if (!text) return [];
      const out = [];
      const tokens = text.split(/[\s+,&/|.:;_()\[\]{}-]+|\band\b/gi);
      for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i].trim();
        if (token.length < 2) continue;
        const lower = token.toLowerCase();
        let canonical = "";
        for (let j = 0; j < LANGUAGE_NAMES.length; j += 1) {
          if (LANGUAGE_NAMES[j].toLowerCase() === lower) {
            canonical = LANGUAGE_NAMES[j];
            break;
          }
        }
        if (!canonical && LANGUAGE_CODES[lower]) canonical = LANGUAGE_CODES[lower];
        if (!canonical && LANGUAGE_ALIASES[lower]) canonical = LANGUAGE_ALIASES[lower];
        if (canonical && out.indexOf(canonical) < 0) out.push(canonical);
      }
      return out;
    }
    function languageLabel(raw, originalLanguage) {
      const text = String(raw == null ? "" : raw).trim();
      if (!text) return originalLanguage ? languageLabel(originalLanguage) : "";
      const lower = text.toLowerCase();
      if (lower === "original" || lower === "orig" || lower === "org" || lower === "default") {
        return originalLanguage ? languageLabel(originalLanguage) || "Original" : "Original";
      }
      const names = languageNames(text);
      if (names.length === 1) return names[0];
      if (names.length > 1) return names.join(", ");
      if (/\b(?:multi|dual|both)(?:\s*-?\s*audio)?\b/i.test(text)) return "Multi";
      return "";
    }
    function languagePriority(label) {
      const value = String(label || "");
      if (value.indexOf("Hindi") >= 0) return 4;
      if (value.indexOf(",") >= 0 || value === "Multi") return 2;
      if (value.indexOf("English") >= 0) return 3;
      return value ? 1 : 0;
    }
    function decodeEntities(value) {
      return String(value == null ? "" : value).replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&nbsp;/gi, " ").replace(/&#(\d+);/g, function(_, n) {
        return String.fromCharCode(Number(n));
      }).replace(/&#x([0-9a-f]+);/gi, function(_, n) {
        return String.fromCharCode(parseInt(n, 16));
      });
    }
    function stripTags(value) {
      return decodeEntities(String(value == null ? "" : value).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    }
    function resolveUrl(base, relative) {
      const ref = String(relative == null ? "" : relative).trim();
      if (!ref) return "";
      if (/^https?:\/\//i.test(ref)) return ref;
      if (ref.indexOf("//") === 0) return "https:" + ref;
      const originMatch = String(base).match(/^https?:\/\/[^/]+/i);
      const origin = originMatch ? originMatch[0] : "";
      if (!origin) return ref;
      if (ref.charAt(0) === "/") return origin + ref;
      const path = String(base).split("?")[0].split("#")[0];
      const dir = path.slice(0, path.lastIndexOf("/") + 1);
      return dir + ref;
    }
    function originOf(url) {
      const match = String(url || "").match(/^https?:\/\/[^/]+/i);
      return match ? match[0] : "";
    }
    function extractBalancedJson(text, startIndex) {
      const source = String(text || "");
      let start = startIndex;
      if (start < 0) start = source.indexOf("{");
      if (start < 0) return "";
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = start; i < source.length; i += 1) {
        const ch = source[i];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\" && inString) {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;
        if (ch === "{") depth += 1;
        else if (ch === "}") {
          depth -= 1;
          if (depth === 0) return source.slice(start, i + 1);
        }
      }
      return "";
    }
    function parseHlsMaster(text) {
      const source = String(text || "");
      const result = { height: 0, languages: [], variants: 0, audioNames: [] };
      if (source.indexOf("#EXTM3U") < 0 && source.indexOf("#EXT-X-STREAM-INF") < 0) return result;
      const audioByGroup = {};
      const mediaRe = /#EXT-X-MEDIA:([^\n\r]+)/gi;
      let media;
      while (media = mediaRe.exec(source)) {
        const attrs = media[1];
        const type = (attrs.match(/TYPE=([^,]+)/i) || [])[1] || "";
        if (!/AUDIO/i.test(type)) continue;
        const group = (attrs.match(/GROUP-ID="?([^",]+)"?/i) || [])[1] || "";
        const name = (attrs.match(/NAME="?([^",]+)"?/i) || [])[1] || "";
        const lang = (attrs.match(/LANGUAGE="?([^",]+)"?/i) || [])[1] || "";
        if (!group) continue;
        audioByGroup[group] = audioByGroup[group] || [];
        if (name) audioByGroup[group].push(name);
        if (lang) audioByGroup[group].push(lang);
      }
      const lines = source.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].trim();
        if (line.indexOf("#EXT-X-STREAM-INF") !== 0) continue;
        result.variants += 1;
        const resolution = line.match(/RESOLUTION=(\d+)x(\d+)/i);
        if (resolution) {
          const height = Number(resolution[2]);
          if (height > result.height) result.height = height;
        }
        const frameRate = line.match(/FRAME-RATE=([\d.]+)/i);
        if (!resolution && frameRate) {
          const guess = parseHeight(line);
          if (guess > result.height) result.height = guess;
        }
        const audioGroup = (line.match(/AUDIO="([^"]+)"/i) || [])[1];
        if (audioGroup && audioByGroup[audioGroup]) {
          audioByGroup[audioGroup].forEach(function(name) {
            if (result.audioNames.indexOf(name) < 0) result.audioNames.push(name);
          });
        }
      }
      result.languages = languageNames(result.audioNames.join(" "));
      if (!result.height) {
        result.height = parseHeight(source.slice(0, 4e3));
      }
      return result;
    }
    function parseDashHeights(text) {
      const result = { height: 0, languages: [] };
      const re = /(?:height|resolutions?)=["']?(\d{3,4})["']?/gi;
      let match;
      while (match = re.exec(String(text || ""))) {
        const height = Number(match[1]);
        if (height >= 240 && height <= 4320 && height > result.height) result.height = height;
      }
      const langRe = /(?:lang|language)=["']([a-zA-Z-]+)["']/gi;
      const langs = [];
      while (match = langRe.exec(String(text || ""))) langs.push(match[1]);
      result.languages = languageNames(langs.join(" "));
      return result;
    }
    function dedupeStreams(streams, compare) {
      const byKey = {};
      (streams || []).forEach(function(stream) {
        if (!stream || !stream.url) return;
        const key = String(stream.url).split("#")[0].split("?")[0];
        const existing = byKey[key];
        if (!existing) {
          byKey[key] = stream;
          return;
        }
        if (compare && compare(stream, existing) < 0) byKey[key] = stream;
      });
      const out = [];
      Object.keys(byKey).forEach(function(key) {
        out.push(byKey[key]);
      });
      return out;
    }
    var BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    function b64decode(input) {
      const clean = String(input == null ? "" : input).replace(/[^A-Za-z0-9+/=]/g, "");
      if (!clean || clean.length % 4 === 1) return "";
      const pad = (4 - clean.length % 4) % 4;
      const padded = clean + "====".slice(0, pad);
      if (typeof atob === "function") {
        try {
          return atob(padded);
        } catch (error) {
        }
      }
      const bytes = [];
      for (let i = 0; i < padded.length; i += 4) {
        const c0 = BASE64_ALPHABET.indexOf(padded.charAt(i));
        const c1 = BASE64_ALPHABET.indexOf(padded.charAt(i + 1));
        const c2 = BASE64_ALPHABET.indexOf(padded.charAt(i + 2));
        const c3 = BASE64_ALPHABET.indexOf(padded.charAt(i + 3));
        if (c0 < 0 || c1 < 0) break;
        bytes.push(c0 << 2 | c1 >> 4);
        if (c2 >= 0) bytes.push((c1 & 15) << 4 | c2 >> 2);
        if (c3 >= 0) bytes.push((c2 & 3) << 6 | c3);
      }
      let out = "";
      for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
      return out;
    }
    function rot13(value) {
      return String(value == null ? "" : value).replace(/[a-zA-Z]/g, function(ch) {
        const code = ch.charCodeAt(0);
        const base = code >= 97 ? 97 : 65;
        return String.fromCharCode(base + (code - base + 13) % 26);
      });
    }
    var QUALITY_RE = /\b(2160p|1440p|1080p|720p|480p|4k)\b/i;
    var SIZE_RE = /\d+(?:\.\d+)?\s?(?:GB|MB)/i;
    function qualityText(value) {
      const match = String(value == null ? "" : value).match(QUALITY_RE);
      if (!match) return "";
      return match[1].toLowerCase() === "4k" ? "4K" : match[1].toLowerCase();
    }
    function normalizeSizeToken(value) {
      const match = String(value == null ? "" : value).match(SIZE_RE);
      return match ? match[0].replace(/\s+/g, "").toUpperCase() : "";
    }
    function episodeMatches(text, season, episode) {
      const source = String(text == null ? "" : text);
      const ep = "0?" + episode;
      const exact = new RegExp("\\bS0?" + season + "[\\s._-]*(?:E|EP|EPISODE)[\\s._-]*" + ep + "\\b", "i");
      if (exact.test(source)) return true;
      const cross = new RegExp("\\b" + season + "\\s*x\\s*" + ep + "\\b", "i");
      if (cross.test(source)) return true;
      const taggedSeason = /\bS\d{1,2}\b|\bSeason\s*\d/i.test(source);
      if (taggedSeason) return false;
      return new RegExp("\\b(?:EP?|EPISODE)[\\s._-]*" + ep + "\\b", "i").test(source);
    }
    function seasonPackMatches(text, season) {
      const source = String(text == null ? "" : text);
      return new RegExp("\\bS0?" + season + "(?!\\s*[._-]?E\\d)", "i").test(source) || new RegExp("\\bSeason\\s*0?" + season + "\\b", "i").test(source);
    }
    function episodeOrSeason(list, textOf, type, season, episode) {
      const items = list || [];
      if (type === "movie" || !season) return items;
      const exact = items.filter(function(item) {
        return episodeMatches(textOf(item), season, episode);
      });
      if (exact.length) return exact;
      return items.filter(function(item) {
        return seasonPackMatches(textOf(item), season);
      });
    }
    var FLAG_MAP = {
      Hindi: "\u{1F1EE}\u{1F1F3}",
      English: "\u{1F1EC}\u{1F1E7}",
      Tamil: "\u{1F1EE}\u{1F1F3}",
      Telugu: "\u{1F1EE}\u{1F1F3}",
      Malayalam: "\u{1F1EE}\u{1F1F3}",
      Urdu: "\u{1F1F5}\u{1F1F0}",
      Bengali: "\u{1F1E7}\u{1F1E9}",
      Arabic: "\u{1F1F8}\u{1F1E6}",
      Russian: "\u{1F1F7}\u{1F1FA}",
      Chinese: "\u{1F1E8}\u{1F1F3}",
      Mandarin: "\u{1F1E8}\u{1F1F3}",
      Japanese: "\u{1F1EF}\u{1F1F5}",
      Korean: "\u{1F1F0}\u{1F1F7}",
      French: "\u{1F1EB}\u{1F1F7}",
      Spanish: "\u{1F1EA}\u{1F1F8}",
      Portuguese: "\u{1F1F5}\u{1F1F9}",
      Filipino: "\u{1F1F5}\u{1F1ED}",
      Indonesian: "\u{1F1EE}\u{1F1E9}",
      Malaysian: "\u{1F1F2}\u{1F1FE}",
      Vietnamese: "\u{1F1FB}\u{1F1F3}",
      Nepali: "\u{1F1F3}\u{1F1F5}",
      Sinhala: "\u{1F1F1}\u{1F1F0}",
      Thai: "\u{1F1F9}\u{1F1ED}",
      Turkish: "\u{1F1F9}\u{1F1F7}",
      German: "\u{1F1E9}\u{1F1EA}",
      Italian: "\u{1F1EE}\u{1F1F9}",
      Dutch: "\u{1F1F3}\u{1F1F1}",
      Polish: "\u{1F1F5}\u{1F1F1}"
    };
    function flagOf(tag) {
      return FLAG_MAP[tag] || "";
    }
    var RESOLUTION_TOKEN_RE = /\\s*(?:\\d{3,4}\\s*p(?:\\d{2,3})?|[24]\\s*k)\\b/gi;
    var QUALITY_ALIAS_RE = /(?:\\s*\\b(?:FHD|UHD|QHD)\\b)|(?:\\s+\\bHD\\b(?=\\s*$))/gi;
    var TRAILING_LANGUAGE_RE = /(?:[\\s,+/&()\\[\\]{}-]*\\b(?:hindi|english|tamil|telugu|malayalam|kannada|bengali|bangla|marathi|punjabi|gujarati|urdu|nepali|sinhala|arabic|russian|chinese|mandarin|japanese|korean|french|spanish|portuguese|filipino|tagalog|indonesian|malaysian|vietnamese|thai|turkish|german|italian|dutch|polish|multi|dual)\\b(?:\\s*[(\\[]?\\s*(?:audio|dub|dubbed)\\s*[)\\]]?)?[^\\n]*)+$/i;
    function stripQualityText(value) {
      return String(value == null ? "" : value).replace(RESOLUTION_TOKEN_RE, " ").replace(QUALITY_ALIAS_RE, " ").replace(/\\s+/g, " ").trim();
    }
    function displayLanguageNamesFixed(audioLabel, mediaLabel) {
      const audio = languageNames(audioLabel);
      const media = languageNames(mediaLabel);
      if (audio.length >= 2 && audio.length >= media.length) return audio;
      if (media.length > audio.length) return media;
      if (audio.length) return audio;
      if (media.length) return media;
      return [];
    }
    function languageTagPart(label, names) {
      const parts = names && names.length ? names : String(label || "").split(",").map(function(p) {
        return p.trim();
      }).filter(Boolean);
      if (parts.length >= 2 && !parts.some(function(p) {
        return p === "Multi" || p === "Unknown" || p === "Original";
      })) {
        return "(" + parts.map(function(p) {
          const f2 = flagOf(p);
          return f2 ? f2 + " " + p : p;
        }).join(", ") + ")";
      }
      const single = parts.length === 1 ? parts[0] : null;
      const f = single ? flagOf(single) : "";
      return f ? "(" + f + " " + single + ")" : "(" + label + ")";
    }
    function displayName(serverName, audioLabel, subIndicator, sizeLabel, mediaLabel) {
      const rawName = String(serverName == null ? "" : serverName).trim() || "Server";
      let cleanName = stripQualityText(rawName) || "Server";
      const composed = subIndicator ? (cleanName + " " + String(subIndicator).trim()).trim() : cleanName;
      let named = stripQualityText(String(composed).replace(TRAILING_LANGUAGE_RE, "")).trim() || "Server";
      named = stripQualityText(named).trim() || "Server";
      const names = displayLanguageNamesFixed(audioLabel, mediaLabel);
      const tag = names.length === 1 ? names[0] : names.length > 1 ? names.join(", ") : languageLabel(audioLabel) || languageLabel(mediaLabel) || "Unknown";
      const tagPart = languageTagPart(tag, names);
      const sizePart = String(sizeLabel == null ? "" : sizeLabel).trim();
      return [named, tagPart, sizePart].filter(Boolean).join(" ");
    }
    function streamTitle(provider2, raw, ctx) {
      const providerName = String(provider2 && (provider2.name || provider2.id) || "IndStream").trim() || "IndStream";
      const height = Number(raw && raw.height) || 0;
      const quality = String(raw && raw.quality || "").trim();
      const resolution = quality || (height ? height + "p" : "Auto");
      const is4k = height >= 2160 || /2160|4k|uhd/i.test(quality);
      const is1080 = height === 1080 || /1080/i.test(quality);
      const icon = is4k ? "\u2744\uFE0F 4K" : is1080 ? "\u{1F9CA} " + resolution : "\u{1F427} " + resolution;
      const type = String(raw && raw.type || "").trim();
      const streamType = type ? type === "hls" ? "HLS" : type === "dash" ? "DASH" : type.toUpperCase() : "HLS";
      const size = String(raw && raw.size || "").trim();
      const langs = [];
      const audio = raw && raw.language || "";
      if (audio) {
        audio.split(",").map(function(p) {
          return p.trim();
        }).filter(Boolean).forEach(function(name) {
          const f = flagOf(name);
          langs.push(f ? f + " " + name : name);
        });
      }
      const langLine = langs.length ? "\u{1F3A7} Audio: " + langs.join(", ") : "";
      const subs = Array.isArray(raw && raw.subtitles) ? raw.subtitles : [];
      const subNames = subs.map(function(s) {
        return String(s && (s.label || s.name || s.lang) || "").trim();
      }).filter(Boolean);
      const subLine = subNames.length ? "\u{1F4DD} Subtitles: " + subNames.join(", ") : "\u{1F64A} No included subtitles";
      const meta = ctx && ctx.meta || null;
      const title = meta && (meta.title || meta.name) || "";
      const season = ctx ? Number(ctx.season) || 0 : 0;
      const episode = ctx ? Number(ctx.episode) || 0 : 0;
      const seasonEpisode = season > 0 && episode > 0 ? "S" + String(season).padStart(2, "0") + "E" + String(episode).padStart(2, "0") : "";
      const lines = [];
      lines.push("\u{1F427} " + providerName + " " + icon + " \u2022 " + providerName);
      lines.push("");
      if (seasonEpisode) {
        lines.push("\u{1F4E1} " + (title || providerName) + " \u2022 " + seasonEpisode);
      } else {
        lines.push("\u{1F37F} " + (title || providerName + " stream"));
      }
      lines.push("\u{1F39E}\uFE0F " + resolution + " \u2022 " + streamType);
      lines.push("\u{1F6F0}\uFE0F Source: " + providerName);
      if (size) lines.push("\u{1F4BE} " + size);
      if (langLine) lines.push(langLine);
      lines.push(subLine);
      return lines.join("\n");
    }
    function sleep(ms) {
      return new Promise(function(resolve) {
        setTimeout(resolve, Math.max(0, ms));
      });
    }
    module2.exports = {
      titleYearOf,
      titleScore,
      parseHeight,
      qualityLabel,
      isKnownBelowFloor,
      languageNames,
      languageLabel,
      isJunkStreamUrl,
      languagePriority,
      decodeEntities,
      stripTags,
      resolveUrl,
      originOf,
      extractBalancedJson,
      parseHlsMaster,
      parseDashHeights,
      dedupeStreams,
      b64decode,
      rot13,
      qualityText,
      normalizeSizeToken,
      episodeMatches,
      seasonPackMatches,
      episodeOrSeason,
      streamTitle,
      sleep,
      displayName
    };
  }
});

// src/indstream/finalize.js
var require_finalize = __commonJS({
  "src/indstream/finalize.js"(exports2, module2) {
    "use strict";
    var util = require_util();
    function streamHeight(stream) {
      if (!stream) return 0;
      return Number(stream.height) || util.parseHeight(stream.quality);
    }
    function normalizeStream(raw, provider2, ctx) {
      if (!raw || !raw.url) return null;
      const url = String(raw.url);
      const type = raw.type || (url.indexOf(".m3u8") >= 0 ? "hls" : url.indexOf(".mpd") >= 0 ? "dash" : "mp4");
      const declaredHeight = Number(raw.height) || 0;
      const quality = raw.quality || util.qualityLabel(declaredHeight);
      const height = declaredHeight || util.parseHeight(quality);
      const stream = {
        title: util.streamTitle(provider2, raw, ctx),
        name: provider2.name || "",
        url,
        type,
        quality,
        height,
        size: raw.size || "",
        language: raw.language || "",
        provider: provider2.name || "",
        providerId: provider2.id || "",
        headers: raw.headers || {}
      };
      if (Array.isArray(raw.subtitles) && raw.subtitles.length) {
        stream.subtitles = raw.subtitles;
      }
      return stream;
    }
    function rankMaps(providers) {
      const byId = {};
      const byName = {};
      (providers || []).forEach(function(provider2, index) {
        if (provider2.id) byId[provider2.id] = index;
        if (provider2.name) byName[provider2.name] = index;
      });
      return { byId, byName };
    }
    function rankOf(stream, ranks) {
      if (stream.providerId != null && ranks.byId[stream.providerId] != null) {
        return ranks.byId[stream.providerId];
      }
      if (stream.provider && ranks.byName[stream.provider] != null) {
        return ranks.byName[stream.provider];
      }
      return 1e3;
    }
    function compareStreams(a, b, ranks) {
      const ha = streamHeight(a);
      const hb = streamHeight(b);
      if (hb !== ha) return hb - ha;
      const la = util.languagePriority(a.language);
      const lb = util.languagePriority(b.language);
      if (lb !== la) return lb - la;
      const ra = rankOf(a, ranks);
      const rb = rankOf(b, ranks);
      if (ra !== rb) return ra - rb;
      const ua = String(a.url || "");
      const ub = String(b.url || "");
      if (ua < ub) return -1;
      if (ua > ub) return 1;
      return 0;
    }
    function finalizeStreams(streams, options) {
      const opts = options || {};
      const ranks = rankMaps(opts.providers || []);
      const includeDash = opts.includeDash !== false;
      const filtered = (streams || []).filter(function(stream) {
        if (!stream || !stream.url) return false;
        if (!/^https?:\/\//i.test(stream.url)) return false;
        if (util.isJunkStreamUrl(stream.url)) return false;
        if (!includeDash && stream.type === "dash") return false;
        return !util.isKnownBelowFloor(streamHeight(stream), opts.minQuality);
      });
      const deduped = util.dedupeStreams(filtered, function(a, b) {
        return compareStreams(a, b, ranks);
      });
      deduped.sort(function(a, b) {
        return compareStreams(a, b, ranks);
      });
      const limit = Number(opts.resultLimit) || 0;
      return limit > 0 && deduped.length > limit ? deduped.slice(0, limit) : deduped;
    }
    module2.exports = {
      normalizeStream,
      finalizeStreams,
      streamHeight,
      _test: {
        compareStreams,
        rankMaps
      }
    };
  }
});

// src/indstream/factory.js
var require_factory = __commonJS({
  "src/indstream/factory.js"(exports2, module2) {
    "use strict";
    var http = require_http();
    var tmdb = require_tmdb();
    var settings = require_settings();
    var racer = require_racer();
    var finalize = require_finalize();
    var util = require_util();
    var TMDB_META_CAP_MS = 2e3;
    function safeInt(value) {
      const n = parseInt(value, 10);
      return Number.isFinite(n) ? n : 0;
    }
    function probeUnknownQuality(stream, ctx) {
      return __async(this, null, function* () {
        if (!ctx.settings.probeQuality) return stream;
        if (finalize.streamHeight(stream)) return stream;
        const url = stream.url;
        if (url.indexOf(".m3u8") < 0 && url.indexOf(".mpd") < 0) return stream;
        const text = yield http.getText(url, {
          timeoutMs: 4e3,
          headers: stream.headers || {}
        });
        if (!text) return stream;
        let result = { height: 0, languages: [] };
        if (url.indexOf(".mpd") >= 0) result = util.parseDashHeights(text);
        else if (text.indexOf("#EXTM3U") >= 0) result = util.parseHlsMaster(text);
        if (result.height > 0) {
          stream.height = result.height;
          stream.quality = util.qualityLabel(result.height);
        }
        return stream;
      });
    }
    function createPlugin(provider2) {
      const activeProvider = provider2 || {};
      const providerList = provider2 ? [provider2] : [];
      function getStreams(mediaId, mediaType, season, episode) {
        return __async(this, null, function* () {
          const type = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";
          const s = settings.getSettings();
          const inputId = String(mediaId == null ? "" : mediaId).trim();
          const inputImdbId = tmdb.normalizeImdbId(inputId);
          const inputTmdbId = inputImdbId ? 0 : safeInt(inputId);
          const context = {
            inputId,
            tmdbId: inputTmdbId,
            imdbId: inputImdbId,
            type,
            season: safeInt(season),
            episode: safeInt(episode),
            settings: s,
            timeoutMs: s.requestTimeout * 1e3,
            log: s.debug ? function(message) {
              console.log("[IndStream] " + message);
            } : function() {
            }
          };
          if (!context.tmdbId && !context.imdbId) return [];
          const metaController = http.createAbortController();
          const metaPromise = http.withTimeout(
            tmdb.resolveMeta(inputId, type, {
              deadline: Date.now() + TMDB_META_CAP_MS,
              signal: metaController ? metaController.signal : void 0
            }),
            TMDB_META_CAP_MS,
            null,
            function() {
              http.abort(metaController);
            }
          ).catch(function() {
            return null;
          }).then(function(meta) {
            if (meta) {
              context.meta = meta;
              if (!context.tmdbId && Number(meta.id)) context.tmdbId = Number(meta.id);
              if (!context.imdbId && meta.imdbId) context.imdbId = meta.imdbId;
            }
            context.log(
              "lookup: " + inputId + " -> " + (meta && meta.title ? '"' + meta.title + '" (' + (meta.year || "?") + ")" : "metadata unavailable") + (context.tmdbId ? " [tmdb:" + context.tmdbId + "]" : "") + (context.imdbId ? " [imdb:" + context.imdbId + "]" : "")
            );
            return meta;
          });
          context.metaPromise = metaPromise;
          context.meta = null;
          const wanted = !activeProvider.supports || activeProvider.supports[type] !== false ? providerList : [];
          if (!wanted.length) return [];
          let streams = yield racer.race(wanted, context, finalize.normalizeStream);
          if (s.probeQuality) {
            streams = yield http.parallelMap(streams, 4, function(stream) {
              return probeUnknownQuality(stream, context);
            });
          }
          return finalize.finalizeStreams(streams, {
            minQuality: s.minQuality,
            includeDash: s.includeDash,
            resultLimit: s.resultLimit,
            providers: providerList
          });
        });
      }
      function onSettings() {
        return __async(this, null, function* () {
          return settings.onSettings();
        });
      }
      const api2 = {
        getStreams,
        onSettings
      };
      return api2;
    }
    module2.exports = {
      createPlugin
    };
  }
});

// src/indstream/html.js
var require_html = __commonJS({
  "src/indstream/html.js"(exports2, module2) {
    "use strict";
    var util = require_util();
    function attrMap(tagText) {
      const out = {};
      const source = String(tagText || "");
      const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
      let match;
      while (match = re.exec(source)) {
        const name = match[1].toLowerCase();
        const value = match[2] != null ? match[2] : match[3] != null ? match[3] : match[4];
        out[name] = util.decodeEntities(value || "");
      }
      return out;
    }
    function hasClass(attrs, token) {
      if (!token) return true;
      const list = String(attrs && attrs.class || "").split(/\s+/);
      return list.indexOf(token) >= 0;
    }
    function eachTag(html, tagName) {
      const source = String(html || "");
      const name = String(tagName || "div");
      const openRe = new RegExp("<" + name + "\\b[^>]*>", "gi");
      const closeToken = "</" + name + ">";
      const out = [];
      let match;
      while (match = openRe.exec(source)) {
        const close = source.toLowerCase().indexOf(closeToken, openRe.lastIndex);
        if (close < 0) break;
        out.push({
          attrs: attrMap(match[0]),
          inner: source.slice(openRe.lastIndex, close),
          outer: source.slice(match.index, close + closeToken.length),
          start: match.index,
          end: close + closeToken.length
        });
        openRe.lastIndex = close + closeToken.length;
      }
      return out;
    }
    function blocks(html, tagName, classToken) {
      const source = String(html || "");
      const name = String(tagName || "div");
      const openRe = new RegExp("<" + name + "\\b[^>]*>", "gi");
      const closeToken = "</" + name + ">";
      const scanRe = new RegExp("<\\/?" + name + "\\b[^>]*>", "gi");
      const out = [];
      let match;
      while (match = openRe.exec(source)) {
        const attrs = attrMap(match[0]);
        if (!hasClass(attrs, classToken)) continue;
        let depth = 1;
        let end = -1;
        scanRe.lastIndex = openRe.lastIndex;
        let token;
        while (token = scanRe.exec(source)) {
          if (token[0].charAt(1) === "/") depth -= 1;
          else depth += 1;
          if (depth === 0) {
            end = token.index;
            break;
          }
        }
        if (end < 0) break;
        out.push({
          attrs,
          inner: source.slice(openRe.lastIndex, end),
          outer: source.slice(match.index, end + closeToken.length),
          start: match.index,
          end: end + closeToken.length
        });
        openRe.lastIndex = end + closeToken.length;
      }
      return out;
    }
    function anchors(html) {
      const out = [];
      const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
      let match;
      while (match = re.exec(String(html || ""))) {
        const attrs = attrMap(match[1]);
        if (!attrs.href) continue;
        out.push({ href: attrs.href, text: util.stripTags(match[2]), attrs });
      }
      return out;
    }
    function orderedTokens(html) {
      const out = [];
      const re = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>|<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
      const source = String(html || "");
      let match;
      while (match = re.exec(source)) {
        if (match[1]) {
          const text = util.stripTags(match[2]);
          if (text) out.push({ kind: "heading", text });
        } else {
          const attrs = attrMap(match[3]);
          if (!attrs.href) continue;
          out.push({ kind: "anchor", href: attrs.href, text: util.stripTags(match[4]), attrs });
        }
      }
      return out;
    }
    function firstTag(html, tagName, classToken) {
      const list = eachTag(html, tagName);
      for (let i = 0; i < list.length; i += 1) {
        if (hasClass(list[i].attrs, classToken)) return list[i];
      }
      return null;
    }
    function textOf(html) {
      return util.stripTags(html);
    }
    module2.exports = {
      blocks,
      anchors,
      orderedTokens,
      eachTag,
      firstTag,
      textOf
    };
  }
});

// src/indstream/filehost.js
var require_filehost = __commonJS({
  "src/indstream/filehost.js"(exports2, module2) {
    "use strict";
    var http = require_http();
    var html = require_html();
    var util = require_util();
    var ROTATOR_BLOB_RE = /'o'\s*,\s*'([A-Za-z0-9+/=]{16,})[^']*'/;
    var ROTATOR_WP_BLOB_RE = /ck\('_wp_http_\d+','([^']+)'/;
    var ROTATOR_O_TOKEN_RE = /"o"\s*:\s*"([A-Za-z0-9+/=]{10,})/;
    var JS_LOCATION_RE = /(?:window\.)?location(?:\.href)?\s*=\s*['"](https?:\/\/[^'"]+)['"]/i;
    var META_REFRESH_RE = /<meta\s+http-equiv=["']refresh["'][^>]*content=["'][^;]*;\s*url=([^"']+)/i;
    var STORED_REDIRECT_RE = /s\('o','([A-Za-z0-9+/=]+)'/;
    var DIRECT_URL_RE = /https?:\/\/[^\s"'<\\]+/;
    var REURL_VAR_RE = /var\s+reurl\s*=\s*"([^"]+)"/;
    var HUB_DRIVE_NEXT_RE = /https?:\/\/hubcloud\.[a-z.]+\/drive\/[A-Za-z0-9]+/;
    var TOKEN_URL_ABS_RE = /https?:\/\/[^"' ]*?(?:hubcloud|hubdrive)\.php\?[^"' ]+/;
    var TOKEN_URL_REL_RE = /(?:hubcloud|hubdrive)\.php\?[^"' ]+/;
    var GOOGLE_VIDEO_RE = /(https?:\/\/video-downloads\.googleusercontent\.com\/[^"'\s<>]+)/;
    var PIXELDRAIN_SHORT_RE = /pixeldrain\.[a-z]+\/u\/([a-zA-Z0-9]+)/;
    var ARCHIVE_URL_RE = /\.(?:zip|rar|7z|tar|gz)(?:[?#]|$)/i;
    var BTN_CLASS_RE = /\bbtn\b/;
    function isArchiveUrl(url) {
      return ARCHIVE_URL_RE.test(String(url || ""));
    }
    function rotatorTarget(pageHtml) {
      const blob = (pageHtml.match(ROTATOR_BLOB_RE) || [])[1] || (pageHtml.match(ROTATOR_WP_BLOB_RE) || [])[1];
      if (!blob) return "";
      const l1 = util.b64decode(blob);
      if (!l1) return "";
      const l2 = util.b64decode(l1);
      if (!l2) return "";
      const jsonText = util.b64decode(util.rot13(l2));
      if (!jsonText) return "";
      const oToken = (jsonText.match(ROTATOR_O_TOKEN_RE) || [])[1];
      let wrapped = null;
      try {
        wrapped = JSON.parse(jsonText);
      } catch (error) {
        if (oToken && util.b64decode(oToken).indexOf("http") === 0) {
          try {
            wrapped = JSON.parse('{"o":"' + oToken + '"}');
          } catch (inner) {
            wrapped = null;
          }
        }
      }
      if (!wrapped || typeof wrapped !== "object") return "";
      const url = util.b64decode(wrapped.o || "").trim();
      return url.indexOf("http") === 0 ? url : "";
    }
    function jsRedirectTarget(pageHtml) {
      const location = (pageHtml.match(JS_LOCATION_RE) || [])[1];
      if (location) return location;
      const metaUrl = (pageHtml.match(META_REFRESH_RE) || [])[1];
      if (metaUrl) return metaUrl.trim();
      const stored = (pageHtml.match(STORED_REDIRECT_RE) || [])[1];
      if (!stored) return "";
      let payload = stored;
      for (let i = 0; i < 6; i += 1) {
        const decoded = util.b64decode(payload);
        if (!decoded) return "";
        const direct = decoded.match(DIRECT_URL_RE);
        if (direct) return direct[0];
        payload = decoded;
      }
      return "";
    }
    function hubFileButtons(pageHtml) {
      const headQ = util.parseHeight((html.firstTag(pageHtml, "div", "card-header") || {}).inner || "");
      const out = [];
      const seen = {};
      html.anchors(pageHtml).forEach(function(a) {
        if (!BTN_CLASS_RE.test(a.attrs.class || "")) return;
        let url = a.href;
        if (url.indexOf("http") !== 0) return;
        if (isArchiveUrl(url)) return;
        if (/facebook\.|twitter\.|t\.me|\/tg\/|pixel\.|\/admin/.test(url)) return;
        const pixel = url.match(PIXELDRAIN_SHORT_RE);
        if (pixel) url = url.replace("/u/" + pixel[1], "/api/file/" + pixel[1]);
        if (seen[url]) return;
        seen[url] = true;
        const q = util.parseHeight(a.text);
        out.push({ url, quality: q > 0 ? q + "p" : headQ > 0 ? headQ + "p" : "", language: util.languageLabel(a.text) });
      });
      return out;
    }
    function hubDriveFiles(driveUrl, referer, client) {
      return __async(this, null, function* () {
        const net = client || http;
        const url = String(driveUrl || "");
        if (/hubdrive\.|hubcdn\./i.test(url)) {
          const index = yield net.getText(url, { timeoutMs: 1e4, headers: { Referer: referer } });
          if (!index) return [];
          const reurl = (index.match(REURL_VAR_RE) || [])[1];
          if (reurl) {
            const direct = util.b64decode(reurl.slice(reurl.indexOf("r=") + 2).replace(/-/g, "+").replace(/_/g, "/"));
            if (direct) {
              const link = direct.slice(direct.indexOf("link=") + 5);
              if (link.indexOf("http") === 0) return [{ url: link, quality: util.qualityText(link), language: "" }];
            }
          }
          const next = (index.match(HUB_DRIVE_NEXT_RE) || [])[0];
          return next ? hubDriveFiles(next, url, net) : [];
        }
        const page = yield net.getText(url, { timeoutMs: 1e4, headers: { Referer: referer } });
        if (!page) return [];
        const google = googleVideoLink(page, url);
        if (google) return [{ url: google, quality: util.qualityText(page), language: "" }];
        const tokenAbs = (page.match(TOKEN_URL_ABS_RE) || [])[0];
        const tokenRel = (page.match(TOKEN_URL_REL_RE) || [])[0];
        if (!tokenAbs && !tokenRel) return [];
        const origin = util.originOf(url);
        const tokenUrl = tokenAbs || origin + "/" + tokenRel;
        const tokenPage = yield net.getText(tokenUrl, { timeoutMs: 1e4, headers: { Referer: url } });
        if (!tokenPage) return [];
        return hubFileButtons(tokenPage).slice(0, 4);
      });
    }
    function googleVideoLink(htmlText, finalUrl) {
      let raw = (htmlText.match(GOOGLE_VIDEO_RE) || [])[1];
      if (!raw) {
        const after = finalUrl.split("dl.php?link=")[1] || "";
        if (after.indexOf("http") === 0) raw = after;
      }
      if (!raw) return "";
      let decoded = "";
      try {
        decoded = decodeURIComponent(raw.replace(/&amp;/g, "&"));
      } catch (error) {
        decoded = raw.replace(/&amp;/g, "&");
      }
      return decoded.indexOf("http") === 0 ? decoded : "";
    }
    var VCLOUD_BTN_RE = /<a\b[^>]*href="([^"]+)"[^>]*>\s*(?:<[^>]+>\s*)*([^<]*(?:Download|Server|File)[^<]*)(?:<[^>]+>\s*)*<\/a>/gi;
    var VCLOUD_ATOB_RE = /var\s+url\s*=\s*atob\s*\(\s*atob\s*\(\s*['"]([A-Za-z0-9+/=]{16,})['"]\s*\)\s*\)/;
    var BRACKET_LABEL_RE = /\[([^\]]+)]/;
    var R2_HOST_RE = /(r2\.cloudflarestorage\.com|r2\.dev)/i;
    var GPDL_URL_RE = /https?:\/\/[^"' ]*gpdl[^"' ]*hubcloud[^"' ]+/i;
    var VCLOUD_EPISODE_TAG_RE = /\bS\d{1,2}[\s._-]?E\d{1,3}\b/i;
    var HTML_TITLE_RE = /<title>([^<]+)<\/title>/i;
    var ARCHIVE_TITLE_RE = /archive(?:\.org)?|web\.archive|\.zip|\.rar|\.7z|\.tar|\.gz/i;
    function vcloudDoubleAtob(blob) {
      const inner = util.b64decode(blob.trim());
      if (!inner) return "";
      return util.b64decode(inner.trim());
    }
    function vcloudPageMatchesEpisode(pageTitle, type, season, episode) {
      if (type !== "tv" || !season || !episode) return true;
      return !VCLOUD_EPISODE_TAG_RE.test(pageTitle) || util.episodeMatches(pageTitle, season, episode);
    }
    function vcloudR2Links(vcloudUrl, referer, type, season, episode, ctx) {
      return __async(this, null, function* () {
        const net = ctx && ctx.http ? ctx.http : http;
        const timeoutMs = typeof ctx === "number" ? ctx : ctx && ctx.timeoutMs || 15e3;
        const page = yield net.getText(vcloudUrl, { timeoutMs, headers: { Referer: referer } });
        if (!page) return [];
        const pageTitle = (page.match(HTML_TITLE_RE) || [])[1] || "";
        if (ARCHIVE_TITLE_RE.test(pageTitle) || /complete season/i.test(pageTitle)) return [];
        if (!vcloudPageMatchesEpisode(pageTitle, type, season, episode)) return [];
        const blob = (page.match(VCLOUD_ATOB_RE) || [])[1];
        if (!blob) return [];
        const tokenUrl = vcloudDoubleAtob(blob);
        if (!tokenUrl || tokenUrl.indexOf("http") !== 0) return [];
        const token = yield net.getText(tokenUrl, { timeoutMs, headers: { Referer: vcloudUrl } });
        if (!token) return [];
        const out = [];
        const seen = {};
        const origin = util.originOf(tokenUrl);
        let match;
        VCLOUD_BTN_RE.lastIndex = 0;
        while (match = VCLOUD_BTN_RE.exec(token)) {
          const raw = match[1].trim();
          const inner = match[2].trim();
          const bracket = inner.match(BRACKET_LABEL_RE);
          const label = (bracket ? bracket[1] : inner).trim();
          const abs = raw.indexOf("http") === 0 ? raw : origin + (raw.charAt(0) === "/" ? raw : "/" + raw);
          if (isArchiveUrl(abs)) continue;
          if (R2_HOST_RE.test(abs) && !seen[abs]) {
            seen[abs] = true;
            out.push({ url: abs, label: label.slice(0, 20) });
          }
        }
        const gpdl = token.match(GPDL_URL_RE) || [];
        for (let i = 0; i < gpdl.length; i += 1) {
          const files = yield hubDriveFiles(gpdl[i], tokenUrl, net);
          files.forEach(function(file) {
            if (!seen[file.url]) {
              seen[file.url] = true;
              out.push({ url: file.url, label: file.quality });
            }
          });
        }
        return out;
      });
    }
    module2.exports = {
      rotatorTarget,
      jsRedirectTarget,
      hubDriveFiles,
      vcloudR2Links,
      _test: {
        hubFileButtons
      }
    };
  }
});

// src/indstream/providers/hub4k.js
var require_hub4k = __commonJS({
  "src/indstream/providers/hub4k.js"(exports2, module2) {
    "use strict";
    var http = require_http();
    var html = require_html();
    var util = require_util();
    var tmdb = require_tmdb();
    var filehost = require_filehost();
    var BASES = ["https://4khdhub.one", "https://4khdhub.com"];
    var HUB_LANG_RE = /\b(hindi|english|tamil|telugu|malayalam|kannada|bengali|marathi|punjabi|dual|multi)\b/i;
    var HUB_OTHER_LANG_RE = /english|dual|multi|tamil|telugu|malayalam|kannada|bengali|marathi|punjabi|urdu|japanese|korean|chinese/;
    var HUB_QUALITY_RE = /\b(2160p|1440p|1080p|720p|480p)\b/i;
    var HUB_GATEWAY_HOST_RE = /greenmotors|hubcloud|hubdrive/i;
    var OG_TITLE_RE = /<meta\s+property="og:title"\s+content="([^"]+)"/i;
    var HTML_TITLE_RE = /<title>([^<]+)<\/title>/i;
    module2.exports = {
      id: "hub4k",
      name: "4KHDHub",
      speed: "slow",
      supports: { movie: true, tv: true },
      raceTimeoutMs: 5e3,
      toggle: {
        key: "sourceHub4k",
        label: "4KHDHub",
        description: "4K-first release pages resolved through file-host gateways."
      },
      resolve(ctx) {
        return __async(this, null, function* () {
          const net = ctx.http || http;
          const meta = yield tmdb.awaitMeta(ctx);
          const title = meta && meta.title ? meta.title : "";
          const year = meta && meta.year ? meta.year : "";
          if (!title) {
            ctx.log("hub4k: missing title, skipping");
            return [];
          }
          const deadline = ctx.deadline || Date.now() + ctx.timeoutMs;
          let base = "";
          let searchHtml = "";
          let fallback = null;
          for (let i = 0; i < BASES.length; i += 1) {
            if (Date.now() > deadline) break;
            const candidate = BASES[i];
            const h = yield net.getText(candidate + "/?s=" + encodeURIComponent(title), {
              timeoutMs: 5e3,
              headers: { Referer: candidate + "/" }
            });
            if (!h) continue;
            if (hubParseCards(h, candidate).length) {
              base = candidate;
              searchHtml = h;
              break;
            }
            if (!fallback) fallback = { base: candidate, html: h };
          }
          if (!base) {
            if (!fallback) return [];
            base = fallback.base;
            searchHtml = fallback.html;
          }
          const cards = hubParseCards(searchHtml, base);
          if (!cards.length) return [];
          const ranked = cards.map(function(card) {
            return { card, score: util.titleScore(title, card.title, year, util.titleYearOf(card.title)) };
          }).sort(function(a, b) {
            return b.score - a.score;
          }).slice(0, 3);
          if (!ranked.length || ranked[0].score < 0.6) return [];
          const out = [];
          const seen = {};
          for (let i = 0; i < Math.min(2, ranked.length); i += 1) {
            if (Date.now() > deadline) break;
            const card = ranked[i].card;
            const post = yield net.getText(card.url, {
              timeoutMs: 5e3,
              headers: { Referer: base + "/" }
            });
            if (!post) continue;
            if (!hubPostYearOk(post, year)) continue;
            const items = util.episodeOrSeason(hub4kItems(post), function(it) {
              return it.title;
            }, ctx.type, Number(ctx.season) || 0, Number(ctx.episode) || 0).slice(0, 4);
            for (let j = 0; j < items.length; j += 1) {
              if (Date.now() > deadline) break;
              const item = items[j];
              const langNames = util.languageNames(item.languages);
              const lang = langNames.join(", ");
              const audioLang = util.languageLabel(item.languages) || lang;
              const priority = hubLangOf(item.languages);
              for (let g = 0; g < item.gatewayUrls.length; g += 1) {
                if (Date.now() > deadline) break;
                const gateway = item.gatewayUrls[g];
                const gwPage = yield net.getText(gateway, {
                  timeoutMs: 6e3,
                  headers: { Referer: card.url }
                });
                if (!gwPage) continue;
                let resolvedDrive = "";
                [filehost.rotatorTarget(gwPage), filehost.jsRedirectTarget(gwPage)].forEach(function(target) {
                  if (target && !resolvedDrive) resolvedDrive = util.resolveUrl(gateway, target);
                });
                if (!resolvedDrive) continue;
                let finalDrive = resolvedDrive;
                if (/hubdrive\./i.test(resolvedDrive)) {
                  const innerPage = yield net.getText(resolvedDrive, {
                    timeoutMs: 5e3,
                    headers: { Referer: card.url }
                  });
                  if (!innerPage) continue;
                  let mirror = "";
                  html.anchors(innerPage).forEach(function(a) {
                    if (!mirror && /hubcloud/i.test(a.href)) mirror = util.resolveUrl(resolvedDrive, a.href);
                  });
                  if (!mirror || mirror.indexOf("http") !== 0) continue;
                  finalDrive = mirror;
                }
                const referer = util.originOf(finalDrive) || "https://hubcloud.ist/";
                const files = yield filehost.hubDriveFiles(finalDrive, card.url, net);
                for (let f = 0; f < files.length; f += 1) {
                  if (Date.now() > deadline) break;
                  const file = files[f];
                  const qText = file.quality || (item.title.match(HUB_QUALITY_RE) || [])[0] || "";
                  const fileAudio = util.languageLabel(file.language);
                  const audio = fileAudio || audioLang || lang;
                  if (seen[file.url]) continue;
                  seen[file.url] = true;
                  out.push({
                    provider: module2.exports.name,
                    url: file.url,
                    type: file.url.indexOf(".m3u8") >= 0 ? "hls" : file.url.indexOf(".mpd") >= 0 ? "dash" : "mp4",
                    quality: util.qualityLabel(util.parseHeight(qText || item.title)),
                    height: util.parseHeight(qText || item.title),
                    language: audio,
                    size: item.size,
                    title: (module2.exports.name + " " + qText).trim(),
                    headers: { Referer: referer, "User-Agent": http.DEFAULT_UA }
                  });
                  if (out.length >= 6) break;
                }
                if (out.length >= 6) break;
              }
              if (out.length >= 6) break;
            }
            if (out.length) break;
          }
          return out;
        });
      }
    };
    function hubParseCards(htmlText, base) {
      const out = [];
      const seen = {};
      html.anchors(htmlText).forEach(function(a) {
        if (!/movie-card/.test(a.attrs.class || "")) return;
        const href = util.resolveUrl(base, a.href).trim();
        if (href.indexOf("http") !== 0) return;
        const title = String(a.attrs["aria-label"] || "").replace(/ details$/i, "").trim() || a.text.trim();
        if (!title || seen[href]) return;
        seen[href] = true;
        out.push({ url: href, title });
      });
      return out;
    }
    function hubPostYearOk(htmlText, year) {
      if (!year) return true;
      const title = (htmlText.match(OG_TITLE_RE) || [])[1] || (htmlText.match(HTML_TITLE_RE) || [])[1] || "";
      return title.indexOf(year) >= 0;
    }
    function hub4kItems(htmlText) {
      const out = [];
      html.blocks(htmlText, "div", "download-item").forEach(function(block) {
        html.blocks(block.inner, "div", "episode-download-item").forEach(function(ep) {
          out.push(itemFromBlock(ep));
        });
        const item = itemFromBlock(block);
        if (item) out.push(item);
      });
      return out.filter(function(item) {
        return item.gatewayUrls.length > 0;
      });
    }
    function itemFromBlock(block) {
      const header = html.firstTag(block.inner, "div", "download-header");
      const headerInner = header ? header.inner : block.inner;
      const title = html.firstTag(headerInner, "div", "flex-1") || html.firstTag(headerInner, "div", "font-semibold") || html.firstTag(block.inner, "div", "file-title") || html.firstTag(block.inner, "div", "episode-file-title");
      const titleText = (title ? html.textOf(title.inner) : html.textOf(headerInner)).trim();
      if (!titleText) return null;
      const badges = [];
      html.eachTag(block.inner, "span").forEach(function(s) {
        if (/badge/.test(s.attrs.class || "")) badges.push(html.textOf(s.inner).trim());
      });
      if (!badges.length) {
        html.eachTag(block.inner, "code").forEach(function(c) {
          html.eachTag(c.inner, "span").forEach(function(s) {
            badges.push(html.textOf(s.inner).trim());
          });
        });
      }
      let size = "";
      badges.forEach(function(badge) {
        const tok = util.normalizeSizeToken(badge);
        if (tok && !size) {
          size = tok;
        }
      });
      const langs = badges.filter(function(badge) {
        return HUB_LANG_RE.test(badge);
      }).filter(function(v, i, arr) {
        return arr.indexOf(v) === i;
      }).join(" ");
      const gateways = [];
      const seen = {};
      html.anchors(block.inner).forEach(function(a) {
        if (a.href.indexOf("http") !== 0) return;
        if (!HUB_GATEWAY_HOST_RE.test(a.href)) return;
        if (seen[a.href]) return;
        seen[a.href] = true;
        gateways.push({ url: a.href, cloud: /hubcloud/i.test(a.text) });
      });
      gateways.sort(function(a, b) {
        return Number(b.cloud) - Number(a.cloud);
      });
      return { title: titleText, size, languages: langs, gatewayUrls: gateways.map(function(g) {
        return g.url;
      }) };
    }
    function hubLangOf(languages) {
      const s = String(languages || "").toLowerCase();
      if (s.indexOf("hindi") >= 0 && HUB_OTHER_LANG_RE.test(s)) return "Multi";
      if (s.indexOf("hindi") >= 0) return "Hindi";
      return util.languageLabel(languages);
    }
    module2.exports._test = {
      hubParseCards,
      hubPostYearOk,
      hub4kItems,
      hubLangOf
    };
  }
});

// src/indstream/entries/hub4k.js
var factory = require_factory();
var provider = require_hub4k();
var api = factory.createPlugin(provider);
if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.getStreams = api.getStreams;
  globalThis.onSettings = api.onSettings;
} else if (typeof global !== "undefined") {
  global.getStreams = api.getStreams;
  global.onSettings = api.onSettings;
}
