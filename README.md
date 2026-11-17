# IndStream

A [Nuvio](https://nuvio.tv) plugin with independent stream scrapers for movies
and series. Each server has its own scraper and settings page, so its results
appear as soon as it finishes. Quality and language labels stay honest.

## Install

Open Nuvio, add a plugin by URL:

```
https://raw.githubusercontent.com/dipender98/IndStream/main/manifest.json
```

## Architecture

One repository, one Nuvio scraper per server. Nuvio runs each scraper in its
own runtime and adds that server's streams as soon as the scraper returns, so a
slow server never holds back a fast one.

Each provider under `src/indstream/providers/` is an independent module. It
knows nothing about the other providers, declares one timeout budget, and
returns raw stream entries. Each entry bundle includes only its own provider.
A provider that fails, rejects or times out contributes an empty result; it
never fails the request.

The engine then normalizes the results, applies the shared floor, deduplicates,
sorts with stable tie-breakers, and applies the result limit.

## IDs

Nuvio passes a numeric TMDB id (`27205`). `getStreams` also accepts an IMDb id
(`tt1375666`, or an IMDb title URL) for manual calls.

Metadata lookup runs alongside provider work, never before it. Providers that
need a title wait for it inside their own budget. HdHub, Vidrift and Bingr
start from the id alone; they only wait briefly at the end to label titles.

## Providers

| Provider | Type |
| --- | --- |
| HdHub | API |
| Vidrift | API |
| Bingr | API |
| MovieBox | API |
| 4KHDHub | Web scraper |
| FSL | Web scraper |

Each server has its own settings page and its own toggle. API providers are
fast; the web scrapers are slower and run with their own timeouts.

## Behavior

- **720p floor** — streams whose height is known to be below the configured
  minimum are dropped. Unknown heights are kept and labelled as-is.
- **Honest languages** — an audio language is only shown when the provider
  declares it. Nothing is inferred from titles.
- **Deterministic** — duplicates are resolved by quality, language, provider
  order and URL; the final sort uses the same stable keys.
- **Settings** — one page per server: minimum quality, result cap, provider
  timeout, DASH inclusion, quality probing, verbose logging.
- **Resilience** — independent scrapers, per-provider budgets, partial results.

## Development

```
npm install
npm run build       # bundles each entry -> providers/<id>.js
npm run build:watch # rebuilds every entry on change
npm test            # offline logic tests
npm run smoke       # live probe per server (network; optional)
```

`npm run smoke` probes every manifest scraper in parallel and prints each
server's result count and completion time. Pass `tv`, an id, a server id and
optional season/episode to narrow it:

```
npm run smoke -- movie 27205
npm run smoke -- tv 1399 hdhub 1 1
```

The plugin runs inside Nuvio's QuickJS sandbox. No Node built-ins, no DOM,
no top-level network calls. Build with `npm run build`; never edit the
generated files under `providers/` by hand.
