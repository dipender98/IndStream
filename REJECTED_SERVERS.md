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
| bingr | `api.bingr.one/api/stream` and `api.bingr.st/api/stream` | HTTP 403 from **all 11** servers (fresh probe 2026-11-19; `bingr.one` itself returns HTTP 200) | Blocked/forbidden from this network (Cloudflare-style). Not a code bug. |
| netmirror | `net79.cc` | 2026-11-19: upstream intermittently serves an ISP court-orders intercept page (HTTP 200, `<iframe src="…/court-orders">`) instead of JSON (observed 7/8 requests); a short retry fixes it. Current status: works here with retries. | Region/ISP-level flakiness, not a code fix; handled by retrying. |
| hubdrive | `hubdrive.blog/file/<id>` | HTTP 200 but page says “File not found !” | File host is dead; `hubdrive` links can never carry playable media. HdHub filters them out. |
| hubcloud | `pixel.hubcloud.mov/?id=…`, `gpdl.hubcloud.mov/?id=…` | HTTP 500 (redirects to `pixel.rohitkiskk.workers.dev`) | 10Gbps “download only” host is dead server-side; filtered out. |

`hdhub` (`hdhub.thevolecitor.qzz.io`) is **no longer rejected**: on 2026-11-19 it returned
usable streams for several titles (Oppenheimer 5, John Wick 3, Stranger Things 10),
while Inception's only upstream links are the dead hubdrive/hubcloud hosts, so Inception
yields nothing usable. The endpoint labels each stream as coming from `HdHub` or
`4KHDHub`; IndStream tags the rendered name with that actual source.

`vegamovies.latino` (the Vegamovies 3 host Vegamovies redirects via
`new1.vegamovies.lease`/`new2.vegamovies.futbol`, all of which redirect to latino now) is
**live and works** (local probes 2026-11-19). `/ts-search.php?q=...` returns a Typesense
JSON doc with `found`/`hits[].document` (post_title, permalink, imdb_id, category). Searching
needs the exact library spelling (e.g. `bahubali` worked, `The Odyssey` worked). Post pages
pull in a `h5` → `download` pairs; gateways are `nexdrive.beer/genxfm…`; resolution chain is
nexdrive → `fastdl.beer/embed?download=…` or `vcloud.my/<id>` → `r2.cloudflarestorage.com`
or `.r2.dev` direct files (e.g. Spider-Man Across the Spider-Verse 2160p 20 GB TMDb 9362722;
The Odyssey 2160p 5.9-8.5 GB TMDb 1368337; The Animal 720p TMDb 10681). 4K direct files are
playable from this machine (HTTP 206 ranges verified). The Vegamovies provider uses those
chains; `new1.vegamovies.lease`/`new2.vegamovies.futbol` keep redirecting to the live host
(the resolver follows redirects automatically and probes seeds for the healthy one each pass).

`movies4u` (`new8.movies4u.garden`, lookup API + h4/`downloads-btns-div` HTML structure,
same family the Indflix plugin uses) is **live and works** (local probes 2026-11-19):
the gateway chain resolves to real direct files, e.g. The Odyssey yields playable
4K MKV (21.7 GB class, HTTP 206) and 1080p/720p files via pixeldrain.
**Removed at the owner's request on 2026-11-19 (full removal — provider, registry,
Recommended set, tests) shortly after its v1.2.8 ship.** Reason: 4KHDHub already covers
the same multi-audio 4K catalogue, and the Movies4u release links are non-seekable
(measured non-seekable by the addon's stream probe). Do not re-add without a fresh
owner decision.
Notes recorded while adding it as the `movies4u` provider:
- hubcloud token pages show a **decoy** `<a id="pxl-1" href="...decoy...">` button (a
  shared 404 dead link, identical on every page); the real file URL is assigned from
  a `var pxl = "..."` in the same page. IndStream's `hubFileButtons` now prefers the
  `var pxl` value — the decoy is never emitted.
- `gpdl.hubcloud.mov` resolve points (HTTP 500) and the shared `pixel.hubcloud.mov`
  button are still dead; `hubFileButtons` drops gpdl/hubcloud links.
- `dl.netflix-india.workers.dev` returned HTTP 403 from this machine (2026-11-19 probe).

`moviebox` (`h5-api.aoneroom.com`, provider API) is **alive and emitting streams**
(Inception 1080p 2.25 GB, John Wick S3 720p/1080p/4K 9.07 GB, Stranger Things S1E1
Hindi+Original, The Odyssey 720p — live probes 2026-11-19 ~15:20). BUT the same CDN
that hosts every moviebox link it hands out (`*.hakunaymatata.com`, nginx) returned
**HTTP 429 for every file URL tried from this machine** (bcdnw, bcdnxw; `resource/`,
`tran-audio/`, `vegamovies/` paths; 429 with no Retry-After and no rate-limit headers,
content-length 587, ~15:45 IST-class check 2026-11-19). This means the multi-language,
multi-quality catalogue is real, but users on this network (this machine and the
user's browser) get unplaysable, rate-limited links right now. Whether this is a
per-IP throttle shared across this ISP's egress or a daily quota, neither can be
worked around by the addon: the stored stream URLs are pre-signed by moviebox itself,
and the addon has no alternative mirrors to swap in. moviebox is kept in the source
list but deliberately NOT Recommended (the recommended set is probe-verified end to
end and moviebox streams do not play from here).

| multimovies | `multimovies.wtf/` | 2026-11-19 evidence (second pass): it is an ad/landing page whose links go to the "main" site `m1.multimovies.courses`. That domain initially failed DNS (ISP-level block, like netmirror's court-order intercept), but with working resolution it is **live**: homepage/search/`/movie/<slug>`/`/download/<slug>` all return 200 from this machine, and the HubCloud mirror chain resolves to real direct files (e.g. The Odyssey: 1080p "making-of" doc at pixeldrain `api/file/`, HTTP 206). TV pages render "No download mirrors found" for most episodes | Added as `multimovies` (opt-in, not Recommended — ISP-DNS-sensitive, spotty mirror coverage, Indian/anime catalogue). Watch player servers are browser-iframe embeds and are not emitted. |
| multinime | `multinime.site/` | HTTP 200, anime-only site ("Watch Anime Online Free") | Alive but not probed as a provider; would need its own probe cycle before any use. |

`vidout` (TMDB-keyed HLS catalogue backed by a GitHub repo, surfaced through a
pages.dev frontend) is **live** with `Referer: https://vidout.pages.dev/` (local
probes 2026-11-19, ~15 lookups + playlist fetches): fresh entries (latest 2026-11-19
scrape) and several older ones return HTTP 200 `application/vnd.apple.mpegurl`;
media playlists and segments (206 `video/MP2T`) also verified (e.g. The Odyssey
TMDB 1368337, 480/720/1080, Hindi default + English). Without that Referer every
CDN returns 403/404, and `cf-master.*.txt` links are dead from this machine (TLS
reset). `#`-fragment links are embed pages, never direct streams; the provider
only emits a line whose fetched body starts with `#EXTM3U`. No 2160p variant was
observed in any probed playlist (max 1080p; heights come from the manifest, never
guessed). It is added as `vidout` — opt-in, **not Recommended** (multi-audio
Hindi-default catalogue; Indian/anime-title heavy).

## Source candidates tested but not added (2026-11-19, this machine)

| Candidate | Endpoint | Result | Why not added |
|---|---|---|---|
| Arctic (PenguPlay) | `pengu.uk` (PenguPlay) | `/api/status` reports Arctic "up" (34–74 streams claimed for recent probes) | The streaming endpoint is server-side and requires a PenguPlay account token; the only public token found is revoked, and no direct Arctic domain or API has been identified. Not addable without an account token. |
| VegaMovies | `vegamovies.fail` | HTTP 200, but its search page returns a generic page with zero matching links for every probe term (tested via both GET and POST) | Catalogue effectively unreachable without crawling; not usable as a provider. |
| UHDMovies | `uhdmovies.co.in` | HTTP 200 and site search works | Catalogue is sparse; for example Inception is only available at 720p/480p, never 4K. Not enough content to justify a provider. |
| MoviesDrive | `moviesdrive.*` | Every probed TLD fails to resolve or is a parked domain (`.buzz` is a parked page) | No usable site/domain found. |

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
