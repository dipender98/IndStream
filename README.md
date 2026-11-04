# Indflix Nuvio

A [Nuvio](https://nuvio.tv) plugin that ships one provider: **IndStream**.

IndStream searches five independent sources for movies and series and returns
playable streams with honest quality and language labels.

## Install

Open Nuvio, add a plugin by URL:

```
https://raw.githubusercontent.com/dipender98/IndflixNuvio/main/manifest.json
```

## Sources

| Source | Type |
| --- | --- |
| Vidrift | API |
| Bingr | API |
| MovieBox | API |
| 4KHDHub | Web scraper |
| FSL | Web scraper |

All five can be toggled independently in the plugin settings. API sources are
fast; the scrapers are slower and run with their own timeouts. A failing source
never fails a request — partial results are returned.

## Behavior

- **720p floor** — streams whose height is known to be below the configured
  minimum are dropped. Unknown heights are kept and labelled as-is.
- **Honest languages** — an audio language is only shown when the source
  declares it. Nothing is inferred from titles.
- **Deterministic** — results are deduplicated by URL and sorted by height.
- **Settings** — minimum quality, result cap, per-source timeout, source
  toggles, DASH inclusion, quality probing, verbose logging.

## Development

```
npm install
npm run build     # bundles src/indstream -> providers/indstream.js
npm test          # offline logic tests
npm run smoke      # live probe (network; optional)
```

The provider runs inside Nuvio's QuickJS sandbox. No Node built-ins, no DOM,
no top-level network calls. Build with `npm run build`; never edit
`providers/indstream.js` by hand.
