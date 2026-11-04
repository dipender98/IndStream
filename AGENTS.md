# AGENTS.md

Project rules for every AI agent or contributor working in **IndflixNuvio**.

## What this repository is

A [Nuvio](https://nuvio.tv) plugin repository. It ships exactly **one** provider: `IndStream`.

- `manifest.json` — repository manifest consumed by Nuvio.
- `providers/indstream.js` — the compiled, distributable provider. Never edit by hand.
- `src/indstream/` — readable source. All changes belong here.
- `build.js` — bundles `src/indstream/index.js` into `providers/indstream.js`.
- `test/` — Node-based logic tests and live smoke checks.

## Hard rules

1. **One provider only.** Do not add another scraper to `manifest.json`. IndStream is the product.
2. **Build, never hand-edit the bundle.** After changing `src/`, run `npm run build`. Commit both source and bundle.
3. **Hermes/QuickJS compatibility.** The provider runs inside Nuvio's QuickJS sandbox, not Node and not a browser:
   - No Node built-ins (`fs`, `path`, `crypto`, `buffer`, `stream`, `http`).
   - No DOM APIs beyond the polyfills Nuvio supplies (`fetch`, `URL`, `atob`/`btoa`, `TextDecoder`).
   - `require()` only for modules Nuvio bundles: `crypto-js`, `cheerio-without-node-native`, `axios`.
   - Use `crypto-js` for AES; implement exotic primitives in plain JS.
   - The bundle must not contain top-level `await` or top-level network calls.
4. **Quality floor.** Never return a stream whose height is known to be below **720p**. Unknown heights are allowed but must be labelled honestly.
5. **Honest labels.** Only label an audio language when the source actually declares it. Otherwise leave `language` empty; do not infer from a poster title.
6. **720p+ filter belongs in one place.** Use the shared quality helpers in `src/indstream/util.js`; do not re-implement the floor per server.
7. **No credentials in source.** TMDB keys, if used, must be public keys already shipped by the upstream project or supplied by Nuvio at runtime. Never commit user tokens.
8. **Resilience over completeness.** A failing server must never fail the whole request. Wrap each resolver, apply a per-server timeout, and return partial results.
9. **Deterministic output.** Sort results consistently and deduplicate by URL before returning.
10. **User-facing text is generic.** Comments, logs and labels must not name developers, sites or content beyond identifiers the code needs (domains, server names, URLs).

## Architecture

```
src/indstream/
  index.js        getStreams + onSettings entry points
  settings.js     defaults, parsing, Nuvio settings layout
  http.js         fetch wrapper, timeouts, text/json helpers
  tmdb.js         TMDB metadata + IMDb id resolution
  util.js         quality, language, matching, HLS parsing, dedupe
  servers/
    index.js      server registry
    <server>.js   one resolver per upstream
```

A resolver exports:

```js
module.exports = {
  id: 'server-id',
  name: 'Server Name',
  speed: 'fast',                 // very-fast | fast | normal | slow
  supports: { movie: true, tv: true },
  timeoutMs: 12000,
  resolve(ctx) { /* async -> stream[] */ }
};
```

`ctx` provides `{ tmdbId, imdbId, type, season, episode, meta, settings, log }`.
Resolvers return internal stream objects; the engine normalizes them and applies the floor.

## Verification

Before finishing any change:

```bash
npm run build
npm test          # offline logic tests
npm run smoke     # live probe (network; optional)
```

Also state plainly what could not be verified. Never claim a live source works without a probe.

## Git

- Commit source and rebuilt bundle together.
- Describe the change in the message, scaled to its size.
- Do not bump `manifest.json` / `package.json` versions or push tags unless asked.
