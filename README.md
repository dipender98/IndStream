# IndStream

A [Nuvio](https://nuvio.tv) / Stremio addon for movies and series streams,
hosted on Fly.io.

Configure:
```
https://indstream.fly.dev/
```

Install (addon URL):
```
https://indstream.fly.dev/manifest.json
```

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:8080/` to configure and generate your addon URL, or
`http://localhost:8080/manifest.json` for the default config.

## Deploy (Fly.io, free tier)

```bash
fly auth login
fly apps create indstream
fly deploy
```

The app stays live at `https://indstream.fly.dev/`.

## Configure

Open `https://indstream.fly.dev/` (or `http://localhost:8080/`), pick your
sources, languages and settings (minimum quality, result limit, timeout, DASH,
probing, stream style), and copy the addon URL. The stream style controls how
each stream is labelled; LightGDrive is the default and shows
`Source Quality` as the badge with title, quality, size, source and language
flags below. Each user gets their own configured addon URL of the form
`https://<host>/<config>/manifest.json`.

## Install

Paste the addon URL into Nuvio (Settings -> Plugins/Addons -> Add by URL) or
Stremio (Addons -> search bar).

## DMCA Notice

This project operates like a standard web browser by retrieving video files
from the Internet and does not, by itself, contravene the Digital Millennium
Copyright Act (17 U.S.C. sections 1201-1205, 17 U.S.C. section 512) or other
applicable law. Any content accessed through the plugins is provided by
third-party websites or file hosts and is not hosted, controlled, or
maintained by this repository or the Nuvio application, and users are solely
responsible for ensuring their use complies with applicable copyright,
licensing, contract, and other laws. Pursuant to the DMCA, copyright owners
seeking removal of infringing material should follow the notice-and-takedown
procedures set forth in 17 U.S.C. sections 1201-1205, 17 U.S.C. section 512.
If you believe any content accessed via the plugins infringes intellectual
property rights, please direct your complaints to the hosting websites or
file hosts rather than to the repository maintainers or the Nuvio application
developers.

## Disclaimer

This project is provided for educational and informational purposes only;
users are solely responsible for ensuring their use complies with all
applicable laws, regulations, and professional standards. The authors,
contributors, and distributors make no warranties - express or implied - and
disclaim liability for any direct, indirect, incidental, consequential, or
other damages arising from use of the project. Before relying on the project
for operational, legal, or commercial purposes, obtain independent
professional advice and verify compliance with local requirements.

## License

This project is licensed under the GNU General Public License v3.0 - see
[LICENSE](LICENSE) for the full license text.

All trademarks, service marks, and product names referenced here belong to
their respective owners. This project is not affiliated with or endorsed by
Nuvio or any of the stream providers it queries.