# IndStream

A [Nuvio](https://nuvio.tv) plugin with independent stream scrapers for movies
and series.

## Install

Open Nuvio, add a plugin by URL:

```
https://raw.githubusercontent.com/dipender98/IndStream/main/manifest.json
```

Or in Nuvio: **Settings > Content & Discovery > Plugins**, paste the URL above,
refresh, and enable the scrapers you want.

## Run locally

```bash
npm install
npm start
```

Then open `http://localhost:8080/manifest.json` or install the addon in Nuvio/Stremio with
`http://localhost:8080/manifest.json`.

## Install (hosted)

Once deployed (e.g. Fly.io), add the addon URL in Nuvio/Stremio:

```
https://<your-host>/manifest.json
```

This project operates like a standard web browser by retrieving video files
from the Internet and does not, by itself, contravene the Digital Millennium
Copyright Act (17 U.S.C. §§ 1201-1205, 17 U.S.C. § 512) or other applicable
law. Any content accessed through the plugins is provided by third-party
websites or file hosts and is not hosted, controlled, or maintained by this
repository or the Nuvio application, and users are solely responsible for
ensuring their use complies with applicable copyright, licensing, contract,
and other laws. Pursuant to the DMCA, copyright owners seeking removal of
infringing material should follow the notice-and-takedown procedures set forth
in 17 U.S.C. §§ 1201-1205, 17 U.S.C. § 512. If you believe any content
accessed via the plugins infringes intellectual property rights, please
direct your complaints to the hosting websites or file hosts rather than to
the repository maintainers or the Nuvio application developers.

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