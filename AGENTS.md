# AGENTS.md

Project rules for every AI agent or contributor working in **IndStream**.

Use logic and judgment on every task. If two rules conflict, correctness wins.

## 1. Code style

- Add a comment only when it is necessary. Keep it short and generic.
- Never put specific developer, site, or content names in comments, logs, or user-facing text. Word such text generically. Exception: identifiers the code needs to work (domains, URLs, provider names, setting keys, displayed plugin name).
- Refactor or change code only when the result is correct, lower-maintenance, and no slower.
- Match the existing structure, naming, and style.

## 2. Architecture

- One repository with multiple independent scrapers. `manifest.json` exposes one scraper per server (hdhub, vidrift, bingr, moviebox, hub4k, fsl), each backed by its own bundle under `providers/`. Providers are independent modules under `src/indstream/providers/`.
- Check the existing codebase first. Create a new file only when it clearly improves separation; keep related logic together.
- Settings are per scraper. Each bundle exports `onSettings()` for its own scraper id; Nuvio stores settings per scraper id.
- Each scraper runs a single provider. Provider toggles are no longer used.
- Keep the dependency direction: entry point -> racer/finalize -> providers -> shared libraries. Shared libraries must not import providers.

```
src/indstream/
  index.js        getStreams + onSettings entry points
  racer.js        concurrent provider racer, budgets, abort, partial results
  finalize.js     normalization, floor, deterministic dedupe/sort, result limit
  settings.js     plugin-level settings schema, built from provider toggle metadata
  http.js         fetch wrapper, deadline/signal propagation, text/json helpers
  tmdb.js         TMDB metadata + IMDb <-> TMDB resolution
  util.js         quality, language, matching, HLS parsing, shared helpers
  filehost.js     shared gateway/file-host resolver used by providers
  providers/
    index.js      registry, lookup, enabled-provider selection
    <provider>.js one independent provider
```

A provider exports:

```js
module.exports = {
  id: 'provider-id',
  name: 'Provider Name',
  speed: 'fast',                 // very-fast | fast | normal | slow
  supports: { movie: true, tv: true },
  raceTimeoutMs: 5000,           // the only race/request budget
  toggle: {
    key: 'sourceProviderId',     // stable setting key
    label: 'Provider Name',
    description: 'Short generic description.',
  },
  resolve(ctx) { /* async -> raw stream[] */ },
};
```

`ctx` provides `{ inputId, tmdbId, imdbId, type, season, episode, meta, metaPromise, settings, deadline, timeoutMs, signal, http, log }`.

- Use `ctx.http` for provider requests. It inherits the provider deadline and abort signal.
- Check `ctx.deadline` in loops and before expensive steps.
- Return raw streams; the engine normalizes them and applies the shared floor.

## 3. Implementation

- Understand the relevant code and execution flow before changing it.
- Use references when a protocol, API, or upstream behavior is uncertain.
- Never return a stream whose height is known to be below 720p. The default floor is 720p; the `0` setting means no floor.
- Keep the floor in one place: `util.isKnownBelowFloor` and `finalize.finalizeStreams`.
- Only label an audio language when the source declares it. Do not infer it from a poster or title.
- No credentials in source. TMDB keys must be public or supplied at runtime.
- Providers are independent: one failure never fails the request.
- Output must be deterministic: sort with stable tie-breakers and pick a deterministic dedupe winner.

## 4. Verification

- Fix the root cause, not only the visible symptom.
- Run the relevant tests and build whenever possible.
- Review the diff for regressions, unneeded files, and unrelated edits.
- Validate the final sources once. Write build/test logs to a file when output is long; do not hide progress with tail filters.
- If something could not be verified, say so plainly. Never claim a live source works without a probe.

## 5. Decision-making

- Think long-term: choose the solution that stays correct, fast, and maintainable.
- Prefer correctness over completeness or speed of delivery.
- If a decision is unclear, ask the user or check a reliable source.

## 6. Build, test, git

```bash
npm run build     # bundles src/indstream into providers/indstream.js
npm test          # offline logic tests
npm run smoke     # live probe (network; optional)
```

- Never edit `providers/indstream.js` by hand. After changing `src/`, run `npm run build` and commit source plus bundle together.
- Commit only when asked. Never push, tag, or bump versions until the user explicitly says so.
- When bumping, update `manifest.json`, `package.json`, and `package-lock.json` together.
- Describe the change in the commit message, scaled to its size.
