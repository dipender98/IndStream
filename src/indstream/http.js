'use strict';

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function noop() {}

function baseHeaders(extra) {
  const headers = {
    'User-Agent': DEFAULT_UA,
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  if (extra) {
    Object.keys(extra).forEach(function (key) {
      const value = extra[key];
      if (value == null) delete headers[key];
      else headers[key] = String(value);
    });
  }
  return headers;
}

function createAbortController() {
  if (typeof AbortController === 'undefined') return null;
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
    /* ignore */
  }
}

// Combines the request timeout with the provider's abort signal.
function timeoutSignal(ms, externalSignal) {
  const controller = createAbortController();
  if (!controller) return { signal: externalSignal, cancel: noop, controlled: false };

  const onAbort = function () {
    abort(controller);
  };
  const timer = setTimeout(onAbort, Math.max(1, ms || 12000));

  if (externalSignal) {
    if (externalSignal.aborted) {
      onAbort();
    } else if (typeof externalSignal.addEventListener === 'function') {
      externalSignal.addEventListener('abort', onAbort);
    }
  }

  return {
    signal: controller.signal,
    controlled: true,
    cancel: function () {
      clearTimeout(timer);
      if (externalSignal && typeof externalSignal.removeEventListener === 'function') {
        externalSignal.removeEventListener('abort', onAbort);
      }
    },
  };
}

function failure(url, message) {
  return { ok: false, status: 0, url: url, headers: null, text: '', error: message };
}

// Timer fallback for runtimes without AbortController. The underlying request
// cannot be cancelled there, but the caller still stops waiting.
function timed(promise, ms) {
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      resolve(null);
    }, Math.max(1, ms || 12000));
    promise.then(
      function (value) {
        clearTimeout(timer);
        resolve(value);
      },
      function (error) {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function request(url, options) {
  const opts = options || {};
  if (opts.signal && opts.signal.aborted) return failure(url, 'aborted');

  const deadline = Number(opts.deadline) || 0;
  let timeoutMs = Number(opts.timeoutMs) || 12000;
  if (deadline) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return failure(url, 'deadline exceeded');
    timeoutMs = Math.min(timeoutMs, remaining);
  }

  const guard = timeoutSignal(timeoutMs, opts.signal);
  const headers = baseHeaders(opts.headers);
  const init = {
    method: opts.method || 'GET',
    headers: headers,
    redirect: 'follow',
  };
  if (guard.signal) init.signal = guard.signal;
  if (opts.body != null) init.body = opts.body;
  if (opts.credentials) init.credentials = opts.credentials;

  try {
    const pending = guard.controlled ? fetch(url, init) : timed(fetch(url, init), timeoutMs);
    const response = await pending;
    if (!response) return failure(url, 'timeout');
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      url: response.url || url,
      headers: response.headers,
      text: text,
    };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    return failure(url, message);
  } finally {
    guard.cancel();
  }
}

function getText(url, options) {
  return request(url, options).then(function (res) {
    return res.ok ? res.text : '';
  });
}

function getJson(url, options) {
  return request(url, options).then(function (res) {
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
  const payload = typeof body === 'string' ? body : JSON.stringify(body || {});
  return request(url, {
    method: 'POST',
    body: payload,
    timeoutMs: opts.timeoutMs,
    deadline: opts.deadline,
    signal: opts.signal,
    headers: Object.assign(
      {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
      },
      opts.headers || {}
    ),
  }).then(function (res) {
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
  const payload = typeof body === 'string' ? body : JSON.stringify(body || {});
  return request(url, {
    method: 'POST',
    body: payload,
    timeoutMs: opts.timeoutMs,
    deadline: opts.deadline,
    signal: opts.signal,
    headers: Object.assign(
      {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
      },
      opts.headers || {}
    ),
  }).then(function (res) {
    return res.ok ? res.text : '';
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
    return Promise.resolve()
      .then(function () {
        return worker(list[index], index);
      })
      .then(
        function (value) {
          results[index] = value;
        },
        function () {
          results[index] = null;
        }
      )
      .then(run);
  }

  const workers = [];
  for (let i = 0; i < size; i += 1) workers.push(run());
  return Promise.all(workers).then(function () {
    return results;
  });
}

// Resolves with the fallback on timeout; onTimeout aborts provider work.
function withTimeout(promise, ms, fallback, onTimeout) {
  let settled = false;
  let timer = null;
  const wrapped = new Promise(function (resolve) {
    timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      if (onTimeout) {
        try {
          onTimeout();
        } catch (error) {
          /* ignore */
        }
      }
      resolve(fallback);
    }, Math.max(250, ms || 12000));

    Promise.resolve(promise).then(
      function (value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });

  wrapped.cancel = function () {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
  };
  return wrapped;
}

// Binds a client to one provider's deadline and abort signal.
function scope(ctx) {
  const base = ctx || {};

  function merge(options) {
    const opts = Object.assign({}, options || {});
    if (opts.deadline == null && base.deadline) opts.deadline = base.deadline;
    if (opts.signal == null && base.signal) opts.signal = base.signal;
    return opts;
  }

  return {
    request: function (url, options) {
      return request(url, merge(options));
    },
    getText: function (url, options) {
      return getText(url, merge(options));
    },
    getJson: function (url, options) {
      return getJson(url, merge(options));
    },
    postJson: function (url, body, options) {
      return postJson(url, body, merge(options));
    },
    postText: function (url, body, options) {
      return postText(url, body, merge(options));
    },
  };
}

module.exports = {
  DEFAULT_UA: DEFAULT_UA,
  createAbortController: createAbortController,
  abort: abort,
  scope: scope,
  request: request,
  getText: getText,
  getJson: getJson,
  postJson: postJson,
  postText: postText,
  parallelMap: parallelMap,
  withTimeout: withTimeout,
};
