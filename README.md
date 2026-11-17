# 24Therapy integration evaluation

An external evaluation of the 24Therapy API, its server kits, app kits and video adapters, built only from the
public docs, the OpenAPI contract and the kit files from the partner portal. Sandbox keys only. Every person,
patient, clinician and audio file here is invented.

Results: **[REPORT.md](REPORT.md)** (matrix, kit scorecards, top fixes).

## Layout

| Path | What |
| --- | --- |
| `base/` | The shared tiny teletherapy base: therapist and patient pages (`web/`), provider adapters (`web/providers.js`), the server contract (`CONTRACT.md`), the per-platform config (`platforms.json`), the video-token service (`video/`), the invented scenario (`scenario/`) |
| `servers/<lang>/` | The base contract on each 24Therapy server kit: `node`, `python`, `php`, `dotnet`, `java` |
| `platforms/<slug>/` | Native clients: `qamar/android` (Kotlin + Android kit + Agora), `bahr/flutter`, `rawda/react-native` (no kit), `layla/ios` (Swift, no kit) |
| `evals/<slug>/portal/` | Portal steps per platform (sign-in, Kit Licence and NDA, Keys, Kits, Playground, widget origins and builder) |
| `evals/<slug>/<provider>/` | One matrix cell: `steps.json` (step, title, code, screenshot, result, seconds), WebP screenshots, `recording.webm` |
| `tools/` | Portal automation, the cell runner, the matrix runner, the secret scan |
| `.github/workflows/` | iOS simulator (Layla) and React Native (Rawda) builds |

## Run it

```sh
cp .env.example .env            # fill in sandbox keys and provider credentials (never commit .env)
node tools/portal-run.js 1      # portal steps for platform 1 (downloads kits to kits/, git-ignored)
tools/vendor-kits.sh            # copies the licensed kit files to vendor/ (git-ignored)
(cd base/video && npm ci)
node tools/run-cell.mjs nilecare webrtc   # one cell: a full invented session
tools/run-matrix.sh nilecare sakan        # every provider of those platforms
```

The kit files are under the 24Therapy Kit Licence and NDA: they are downloaded from the partner portal and are
never committed here. `VIDEO_PROVIDER = webrtc | vonage | agora | daily | zoom` picks the provider per platform.
