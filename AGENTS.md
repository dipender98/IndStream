# AGENTS.md

Project rules for every AI agent or contributor working in **IndStream**.

## What this repository is

A [Nuvio](https://nuvio.tv) plugin repository. It ships exactly **one** plugin: `IndStream`.

- `manifest.json` — repository manifest consumed by Nuvio.
- `providers/indstream.js` — the compiled, distributable plugin. Never edit by hand.
- `src/indstream/` — readable source. All changes belong here.
- `src/indstream/providers/` — one independent provider module per upstream.
- `src/indstream/racer.js` — provider-agnostic concurrent racer.
- `build.js` — bundles `src/indstream/index.js` into `providers/indstream.js`.
- `test/` — Node-based logic tests and live smoke checks.

## Hard rules

1. **One plugin only.** Do not add another scraper to `manifest.json`. Providers are internal modules, not separate Nuvio plugins. IndStream is the product.
2. **Build, never hand-edit the bundle.** After changing `src/`, run `npm run build`. Commit both source and bundle.
3. **Hermes/QuickJS compatibility.** The plugin runs inside Nuvio's QuickJS sandbox, not Node and not a browser:
   - No Node built-ins (`fs`, `path`, `crypto`, `buffer`, `stream`, `http`).
   - No DOM APIs beyond the polyfills Nuvio supplies (`fetch`, `URL`, `atob`/`btoa`, `TextDecoder`).
   - `require()` only for modules Nuvio bundles: `crypto-js`, `cheerio-without-node-native`, `axios`.
   - Use `crypto-js` for AES; implement exotic primitives in plain JS.
   - The bundle must not contain top-level `await` or top-level network calls.
4. **Quality floor.** Never return a stream whose height is known to be below **720p**. Unknown heights are allowed but must be labelled honestly.
5. **Honest labels.** Only label an audio language when the source actually declares it. Otherwise leave `language` empty; do not infer from a poster title.
6. **720p+ filter belongs in one place.** Use the shared quality helpers in `src/indstream/util.js`; do not re-implement the floor per provider.
7. **No credentials in source.** TMDB keys, if used, must be public keys already shipped by the upstream project or supplied by Nuvio at runtime. Never commit user tokens.
8. **Resilience over completeness.** Providers are independent. A failing provider must never fail the whole request. Wrap each resolver, apply its race budget, and return partial results.
9. **Deterministic output.** Sort results consistently and deduplicate by URL before returning.
10. **User-facing text is generic.** Comments, logs and labels must not name developers, sites or content beyond identifiers the code needs (domains, provider names, URLs).
11. **One settings page.** Settings belong to the plugin as a whole. Do not add per-provider settings screens; provider toggles live in the shared layout in `settings.js`.
12. **Accept both IDs.** `getStreams` accepts a numeric TMDB id or an IMDb id/URL. Resolve through `tmdb.js`; do not duplicate ID logic in providers.

## Architecture

```
src/indstream/
  index.js        getStreams + onSettings entry points
  racer.js        concurrent provider racer, grace window, partial results
  settings.js     one settings schema for the whole plugin
  http.js         fetch wrapper, timeouts, text/json helpers
  tmdb.js         TMDB metadata + IMDb <-> TMDB resolution
  util.js         quality, language, matching, HLS parsing, dedupe
  providers/
    index.js      provider registry
    <provider>.js one independent provider
```

A provider exports:

```js
module.exports = {
  id: 'provider-id',
  name: 'Provider Name',
  speed: 'fast',                 // very-fast | fast | normal | slow
  supports: { movie: true, tv: true },
  raceTimeoutMs: 5000,           // budget used by the racer
  timeoutMs: 12000,              // internal request ceiling
  resolve(ctx) { /* async -> raw stream[] */ }
};
```

`ctx` provides `{ inputId, tmdbId, imdbId, type, season, episode, meta, metaPromise, settings, log }`.
Providers return raw stream objects; the engine normalizes them and applies the floor.

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
