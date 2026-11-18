# Rejected / abandoned providers

Read this **before** researching, testing, adding or replacing any stream provider.

- Do **not** re-add a listed source without fresh live-probe evidence that the
  underlying issue is fixed, recorded in the commit/notes.
- When you reject a source, record it here with the reason and the evidence you saw.
- "Rejected" means rejected for now / at the recorded time, not necessarily forever.
- Evidence marked "Indflix research" was recorded in `dipender98/Indflix` (IndStream plugin);
  it was not re-verified on this machine unless a row is marked "local probe".

## Local probes (2026-11-18, this machine)

| Provider | Endpoint | Result | Why not used |
|---|---|---|---|
| hdhub | `hdhub.thevolecitor.qzz.io` | HTTP 200 but “No streams found” for every probe title; then HTTP 429 | Upstream serves an empty catalogue and rate-limits. Effectively unusable. |
| bingr | `api.bingr.one/api/stream` | HTTP 403 from **all 11** servers | Blocked/forbidden from this network (Cloudflare-style). Not a code bug. |
| netmirror | `net79.cc` | ISP court-orders intercept page instead of JSON | Domain is current upstream (see Indflix below), but it is blocked on this network. Region/ISP-level, not a code fix. |

Probe titles used: Inception, John Wick, Stranger Things (normal); Your Name, Spirited Away,
Attack on Titan (anime). Rule applied: 0 streams = down, ≥1 stream = up.

## Indflix researched-and-rejected list (imported 2026-11-18, attribution: dipender98/Indflix `RejectedServers.kt`)

| Provider | Name | Reason |
|---|---|---|
| vixsrc | VixSrc | Cloudflare bot challenge on the whole domain; cannot resolve streams client-side (v43) |
| videasy | Videasy | Upstream flappy; empty stream windows (v46/v62) |
| vidrock | VidRock | Removed as dead (v63) |
| vidrock-net | VidRock Net | Removed as dead (v63) |
| vidfast | VidFast | Dead embed source (v63) |
| autoembed | AutoEmbed | Dead embed source (v63) |
| vidphantom | VidPhantom | Dead embed source (v63) |
| vsembed | VSEmbed | Dead embed source (v63) |
| twoembed | 2Embed | Dead embed source (v63) |
| twoembed-skin | 2Embed Skin | Dead embed source (v63) |
| vidsrcme | VidSrc.me | Dead embed source (v63) |
| vidsrc-pm | VidSrc.pm | Dead embed source (v63) |
| rive | Rive | Dead embed source (v63) |
| vidsrcto | VidSrc.to | Dead embed source (v63) |
| nhd | NHD | Upstream movie pipeline 404; TV untested (v46) |
| vidapi | VidAPI | DNS dead (vaplayer.ru) (v46) |
| zxcstreams | ZXCStreams | Sub-server hosts NXDOMAIN; portal chain dead (v46) |
| vidsrc-to | VidSrc.to | Cloudflare bot challenge (v46) |
| nontongo | Nontongo | Cloudflare bot challenge (v46) |
| braflix | Braflix | Dead (v91) |
| onetouchtv | OneTouchTV | Dropped (v92) |
| vidcore | VidCore | Retired dead enc-dec upstream (v48) |
| vidcore-api | VidCore API | Soft miss; upstream dead (v48) |
| castletv | CastleTV | Free tier yields `index_preview` clips only, not streams (v65) |
| streamflix | StreamFlix | Catalogue ok; all mirrors dead (v65) |
| dudefilms | DudeFilms | Dead; replaced by KatMovieHD (v93) |
| multimovies | Multimovies | Dead/blocked (v93) |
| rivestream | Rivestream | Dead (v93) |
| katmoviehd | KatMovieHD | Dead (v94) |
| vaplayer | VaPlayer | Dead (v68) |
| videm | VidEm | IMDB-keyed; no working resolver |
| myflixer-hindi | MyFlixer Hindi | Dead |
| primesrc | PrimeSrc | Dead |
| vidup | VidUp | Dead (v63) |
| allmovieland | AllMovieLand | Not usable as a provider (v76) |
| vidnest | VidNest | Dead |
| mp4hydra | MP4Hydra | Dead |
| vidzee | VidZee | Dead |
| streamprovider | StreamProvider | Dead |
| 8stream | 8Stream | Shared Vercel hard 429/403 for unauthenticated traffic; unfixable client-side (v12) |
| dahmermovies | DahmerMovies | Dead (videasy/dahmer) |
| vidzy | VidZy | Ad-tainted fstream host (v41) |
| showbox | ShowBox | Dead |
| vidspark | VidSpark | Dead |
| hdmovie2 | HDMovie2 | Dead |
| olamovies | OlaMovies | Dead |
| ezvidapi | EzVidApi | Cloudflare 502 (v65) |
| hdghartv | HDGharTV | Dead (skipped) |
| newtv | NewTV | Alternate feed dropped; netmirror moved to net79 (v78) |
| dahmer | Dahmer | Dead (alias of dahmermovies) |
| vidking | VidKing | Dead (v32) |
| 111movies | 111Movies | Blocked (v43) |
| vidsync | VidSync | Dead (v44) |
| vidsrc-cc | Vidsrc.cc | HTTP 522 origin down (2026 sweep) |
| vidsrc-xyz | Vidsrc.xyz | DNS failure (2026 sweep) |
| vidsrc-in | Vidsrc.in | DNS failure (2026 sweep) |
| vidsrc-vip | Vidsrc.vip | DNS failure (2026 sweep) |
| vidsrc-pm-host | Vidsrc.pm (host) | HTTP 520 (2026 sweep) |
| vidsrc-net | Vidsrc.net | TLS failure / reset (2026 sweep) |
| vidsrc-wtf | Vidsrc.wtf | Parked (viduki.net) (2026 sweep) |
| viduki | Viduki.net | Parked (2026 sweep) |
| vidsrc-buzz | Vidsrc.buzz | Reset from region (2026 sweep) |
| vidora-me | Vidora.me | HTTP 503 (2026 sweep) |
| vidora-io | Vidora.io | Hostinger parked page (2026 sweep) |
| hexa-family | Hexa.* | DNS failure / 404 across fronts (2026 sweep) |
| hexa-su | Hexa.su | Timed SPA; not crackable via plain HTTP (2026 sweep) |
| vidfast-pro | Vidfast.pro | Not a distinct provider; clone of vaplayer flow (2026 sweep) |
| vidfast-vc | Vidfast.vc | Same as vidfast.pro (2026 sweep) |
| filmpire-sc | Filmpire.sc | Shell only (2026 sweep) |
| flixpire-sc | Flixpire.sc | Shell only (2026 sweep) |
| movienova-sc | Movienova.sc | Shell only (2026 sweep) |
| movielysium-net | Movielysium.net | Shell only (2026 sweep) |
| moviepire-sc | Moviepire.sc | Connection reset (2026 sweep) |
| cinemaflix-one | Cinemaflix.one | Redirects /embed to root (2026 sweep) |
| cinegram-tv | Cinegram.tv | Redirects /embed to root (2026 sweep) |
| moviesapi-club | MoviesAPI.club | DNS failure (2026 sweep) |
| moviesapi-to | MoviesAPI.to | 403 Cloudflare (2026 sweep) |
| vidapi-xyz | VidAPI.xyz | 404 on both shapes (2026 sweep) |
| frembed-com | Frembed.com | Connect timeout (2026 sweep) |
| autoembed-cc | AutoEmbed.cc | DNS failure (2026 sweep) |
| multiembed-mov | MultiEmbed.mov | 403 Cloudflare aggregator (2026 sweep) |
| vidjoy-pro | VidJoy.pro | Ad-redirect junk (2026 sweep) |
| 2embed-cc | 2Embed.cc | Aggregator linking to vidsrc.buzz (2026 sweep) |
| vidzy-org | VidZy.org | Unverified clone (2026 sweep) |
| vidplay-cc | VidPlay.cc | HTTP 403 (2026 sweep) |
| vidplay-pro | VidPlay.pro | HTTP 456 (2026 sweep) |
| vidplay-site | VidPlay.site | Parked (2026 sweep) |
| vidplay-lol | VidPlay.lol | Cloudflare verification wall (2026 sweep) |
| vidplay-vip | VidPlay.vip | DNS failure (2026 sweep) |
| vidplay-one | VidPlay.one | DNS failure (2026 sweep) |
| vidplay-io | VidPlay.io | TLS failure (2026 sweep) |
| vidbinge | VidBinge | DNS/TLS failure across fronts (2026 sweep) |
| vidsrc-sh | Vidsrc.sh | Works end-to-end but 1080p ceiling, 7.2 KB wasm decryptor, token gate after ~15-20 resolves, title-mismatch risk (2026 sweep) |

## How to add a provider

1. Read this file first; do not re-attempt a rejected source without new evidence.
2. Live-probe before merging: request the provider's real endpoint(s) from this
   environment and record the result (counts, status codes, sample titles).
3. Verify heights, language labels and quality metadata honestly — never guess
   audio/subtitle languages, never emit below 720p when height is known.
4. Update this file with anything you reject, with the exact evidence you saw.
