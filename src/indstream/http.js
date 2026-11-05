'use strict';

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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

function timeoutSignal(ms) {
  if (typeof AbortController === 'undefined') return { signal: undefined, cancel: function () {} };
  const controller = new AbortController();
  const timer = setTimeout(function () {
    try {
      controller.abort();
    } catch (error) {
      /* ignore */
    }
  }, Math.max(1000, ms || 12000));
  return {
    signal: controller.signal,
    cancel: function () {
      clearTimeout(timer);
    },
  };
}

async function request(url, options) {
  const opts = options || {};
  const guard = timeoutSignal(opts.timeoutMs || 12000);
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
    const response = await fetch(url, init);
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
    return { ok: false, status: 0, url: url, headers: null, text: '', error: message };
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

function withTimeout(promise, ms, fallback) {
  return new Promise(function (resolve) {
    let settled = false;
    const timer = setTimeout(function () {
      if (settled) return;
      settled = true;
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
}

module.exports = {
  DEFAULT_UA: DEFAULT_UA,
  request: request,
  getText: getText,
  getJson: getJson,
  postJson: postJson,
  postText: postText,
  parallelMap: parallelMap,
  withTimeout: withTimeout,
};
