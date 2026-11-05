# IndStream

A [Nuvio](https://nuvio.tv) plugin that races independent stream providers for
movies and series. One plugin, one settings page, honest quality and language
labels.

## Install

Open Nuvio, add a plugin by URL:

```
https://raw.githubusercontent.com/dipender98/IndStream/main/manifest.json
```

## Architecture

One repository, multiple Nuvio scrapers (one per server).

Each provider under `src/indstream/providers/` is an independent module. It
knows nothing about the other providers, declares one race budget, and returns
raw stream entries. The racer runs every enabled provider concurrently and
returns as soon as results settle or the grace window elapses. A provider that
fails, rejects or times out contributes an empty result; it never fails the
request. When the race finishes, unfinished providers are aborted.

The engine then normalizes the results, applies the shared floor, deduplicates,
sorts with stable tie-breakers, and applies the result limit.

## IDs

`getStreams` accepts either a numeric TMDB id (`27205`) or an IMDb id
(`tt1375666`, or an IMDb title URL). IMDb ids are mapped to TMDB metadata
before the providers race, so both forms return the same results.

## Providers

| Provider | Type |
| --- | --- |
| HdHub | API |
| Vidrift | API |
| Bingr | API |
| MovieBox | API |
| 4KHDHub | Web scraper |
| FSL | Web scraper |

All providers can be toggled from the single IndStream settings page. API
providers are fast; the scrapers are slower and run with their own timeouts.

## Behavior

- **720p floor** — streams whose height is known to be below the configured
  minimum are dropped. Unknown heights are kept and labelled as-is.
- **Honest languages** — an audio language is only shown when the provider
  declares it. Nothing is inferred from titles.
- **Deterministic** — duplicates are resolved by quality, language, provider
  order and URL; the final sort uses the same stable keys.
- **Settings** — one plugin-level page: minimum quality, result cap, provider
  timeout, provider toggles, DASH inclusion, quality probing, verbose logging.
- **Resilience** — concurrent racing, per-provider budgets, partial results.

## Development

```
npm install
npm run build       # bundles src/indstream -> providers/indstream.js
npm run build:watch # rebuilds on change
npm test            # offline logic tests
npm run smoke       # live probe (network; optional)
```

The plugin runs inside Nuvio's QuickJS sandbox. No Node built-ins, no DOM,
no top-level network calls. Build with `npm run build`; never edit
`providers/indstream.js` by hand.
