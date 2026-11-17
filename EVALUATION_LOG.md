# 24Therapy integration evaluation: full log

The complete record of this evaluation, step by step, in the order it happened, with the proof for each step,
what went wrong, and how it was worked around. The summary tables, kit scorecards and top 20 fixes are in
[REPORT.md](REPORT.md); this file is the evidence behind them.

- Date: 2026-11-17, about 16:30 to 18:00 UTC.
- Repository: `omarahmedomarahmed/24therapy-eval` (public). No key, password, certificate or kit source was ever
  committed; `tools/secret-scan.sh` ran before every push and was clean each time.
- Data: sandbox keys only; every patient, clinician, recording and line of text is invented.

## 0. The brief, and the two instructions given during the run

**Brief (start of the run).** Act as an external integration evaluator for 24Therapy: build a shared tiny
teletherapy base for 8 invented platforms (one server kit, client and colour set each), make the video provider
swappable (`VIDEO_PROVIDER = webrtc | vonage | agora | daily | zoom`), run a platform x provider matrix with one
full invented session per cell (one Egyptian Arabic and one Franco risk line), do every partner-portal step per
platform (sign in, sign the Kit Licence and NDA, read Keys / Kits / Widget / Playground, download kits, save
colours and logo in the widget builder, add the test origin), integrate everything the docs describe, build the
mobile apps (Android APK as a GitHub release, run on BrowserStack with Appium 2.19.0; iOS on a GitHub Actions
simulator), capture numbered steps, small WebP screenshots and short recordings under `evals/`, and write
`REPORT.md`. Work only from the public docs, the OpenAPI contract and the portal kit files.

**Instruction 1, mid-run (after the web matrix was running): "use connectors and MCPs".** From that point the
run used the connected services instead of local-only workarounds:

| Connector (MCP) | Used for |
| --- | --- |
| BrowserStack | Upload of the APKs from public links, real-device sessions on a Google Pixel 8 (Android 14, Appium 2.19.0), tapping, typing, screenshots, session status |
| ElevenLabs | An invented Egyptian patient voice ("Tarek", `eleven_v3`) for the two risk lines, so the risk path is also tested through audio |
| GitHub | Actions runs (iOS simulator, React Native APK + release), release lookup, job status |
| Vercel | After instruction 2: a public relay (Vercel Sandbox) so real devices could reach a platform server |

**Instruction 2, after I reported that real devices could not reach any server: "do it"** (approving a public
relay that holds a sandbox key outside `.env`). A Vercel Sandbox was created, used for one real-device session
and stopped right after (section 7).

## 1. Setup (16:30 to 16:40)

| # | Step | Proof | Result |
| --- | --- | --- | --- |
| 1.1 | Empty public repo. Added `.gitignore` (`.env`, `kits/`, `vendor/`, builds) **before** anything else; wrote `.env` with all 8 accounts, keys and provider credentials; generated `.env.example` with empty values | `.gitignore`, `.env.example` | `.env` confirmed ignored (`git check-ignore`) |
| 1.2 | Read the public docs: `/llms.txt`, `/docs`, `/docs/guide`, `/docs/integration`, every server, app and video page, Concepts, Errors, Events, Clinical, FAQ, and the OpenAPI contract | docs list in `llms.txt` | 31 pages and `openapi.json` read |
| 1.3 | `GET /ping` with each of the 8 sandbox keys | first commit | 8 tenants answered: "Nilecare Talk (eval)" ... "Layla Health (eval)", all scopes |
| 1.4 | Probe of the API by hand (subject, session with `dialect: ar-EG` and `memory: true`, sandbox consent, segments with the two risk lines, end, note) | REPORT section 3 | risk alert `elevated` raised from the text lines; Arabic SOAP draft returned |

## 2. Partner portal, all 8 accounts (16:40 to 16:50)

Automated with Playwright (`tools/portal-lib.js`, `tools/portal-run.js`); every screenshot masks keys, tokens,
consent links and the account email before it is saved.

| # | Step | Proof | Result |
| --- | --- | --- | --- |
| 2.1 | Sign in as each partner | `evals/<slug>/portal/01-*.webp` | all 8 signed in |
| 2.2 | Home: tick "I have read the Kit Licence and NDA, version 1, and I sign it for <tenant>", click Sign | `evals/<slug>/portal/02-*.webp`, `03-*.webp` | "Signed. The kits are open to your team." on all 8 |
| 2.3 | Keys, Kits, Playground pages read and captured | `evals/<slug>/portal/05..07-*.webp` | keys list shows only the prefix (`24t_sk_••••`) |
| 2.4 | Download the server kit, the client kit and the CLI per platform | `evals/<slug>/portal/steps.json` step "Download the kits" | 11 kit zips (Node, Python, PHP, .NET, Java, browser, Android, iOS, Flutter, React Native, CLI); kept in git-ignored `kits/` |
| 2.5 | Widget > Origins: add `http://localhost:<port>` (the docs allow http on localhost in the sandbox) | `09-add-the-test-origin.webp` | saved on all 8 |
| 2.6 | Widget > Builder: platform colours (button / text / background), language logo URL, Arabic, origin, "Save these choices" | `10-*.webp`, `11-builder-saved-live-preview-in-platform-colours.webp` | "The builder's choices are saved."; live preview in each platform's colours, RTL |
| 2.7 | Home > Your stack | portal `steps.json` | **problem:** the stack selects sit behind "Change" and could not be set by script within 5 s; left as is (top fix 19) |

## 3. Shared base and the five server kits (16:40 to 17:15)

| # | Step | Proof | Result |
| --- | --- | --- | --- |
| 3.1 | Shared base: therapist page, patient page, provider adapters, server contract | `base/web/`, `base/CONTRACT.md` | one page set used by all 8 platforms; colours, logo and provider from `/config` |
| 3.2 | Shared video-token service: Agora RTC token (app certificate on the server), Daily room and meeting token, Vonage session and token, Zoom JWT | `base/video/server.mjs` | Agora and Daily tokens minted; Vonage and Zoom report `blocked` with the reason |
| 3.3 | Invented scenario: clinician voice (Google TTS, Egyptian Arabic), patient voice from ElevenLabs with both risk lines, the same lines as text | `base/scenario/` | sent as audio alone, the Franco line came back in Arabic script and raised an `elevated` alert |
| 3.4 | Node server on the Node kit (`createRoutes`, `nodeAdapter`, `verifyWebhook` through the routes) | `servers/node/server.mjs` | first full pass, Nilecare x WebRTC, 47 s |
| 3.5 | Python, PHP, .NET and Java ports of the same contract (3 subagents in parallel, each with the Node server as reference) | `servers/python`, `servers/php`, `servers/dotnet`, `servers/java` | all four passed a full session with WebRTC (52 to 63 s) |
| 3.6 | Webhooks without a public URL: `24t listen` from the CLI kit forwards sandbox deliveries to the kit's `/24t/webhooks` route, which verifies each signature | `.listen.log` (local, not committed); step "Webhooks received and verified" in every cell | `consent.given`, `grant.confirmed`, `transcript.ready`, `risk.alert.created`, `session.ended`, `note.draft_ready`, `note.approved`, `summary.draft_ready`, `risk.alert.acknowledged`, `summary.delivered` |

Problems met while building the base, and what was done:

| Problem | Workaround / fix |
| --- | --- |
| Summary approval failed `400 param_missing`: the draft is `{brief, steps, next}` but approval requires `text` | Joined `brief`, `steps`, `next` with newlines (top fix 2) |
| Summary approval then failed `409 open_risk_alert` | Acknowledge the risk alert first, then approve the summary (top fix 1) |
| Memory and copilot have no kit method | Raw HTTPS with the key on the server (top fix 4) |
| One run hit `429 rate_limited` (60 requests/minute) on the raw memory and copilot calls, which do not retry | Re-ran the cell; it passed (top fix 9) |
| PHP built-in server is single process | Shared state in files under the temp dir; no workers needed |
| `dotnet run` read the `PLATFORM` environment variable as the MSBuild `$(Platform)` | `Directory.Build.props` pins `Platform` to `AnyCPU` |
| A stale .NET server left on a port made two Hadith cells report "pass" with the wrong provider | Discarded both results; the runner now kills anything on its ports first and refuses to run if `/config` reports a different provider; Hadith re-run |

## 4. The matrix (17:00 to 17:40)

Each cell is `node tools/run-cell.mjs <platform> <provider>`: a fresh webhook listen session, the platform's own
server kit, Chromium with a fake camera and the invented audio as microphone, the patient's yes on the real
consent page, the browser kit's recorder, the widget mounted in the call, the two risk lines, then end, note,
alert, summary, memory, copilot, usage and error checks. Each cell writes `evals/<platform>/<provider>/steps.json`
(step, title, code, screenshot, result, seconds), WebP screenshots and `recording.webm`.

| Platform | Server kit | webrtc | daily | agora | vonage | zoom |
| --- | --- | --- | --- | --- | --- | --- |
| 1 Nilecare Talk | Node | **pass 47 s** | partial 68 s | partial 73 s | blocked | blocked |
| 2 Sakan Therapy | Python | pass 53 s | **partial 73 s** | partial 72 s | blocked | blocked |
| 3 Wasla Health | PHP | pass 63 s | partial 72 s | partial 78 s | **blocked** | blocked |
| 4 Hadith Care | .NET | pass 52 s | partial 66 s | **partial 71 s** | blocked | blocked |
| 5 Qamar Clinic | Java | pass 52 s | n/a | **partial 71 s** | blocked | blocked |
| 6 Bahr Mind | Python | n/a | n/a | partial 76 s | blocked | **blocked** |
| 7 Rawda Space | .NET | **pass 50 s** | n/a | partial 72 s | blocked | blocked |
| 8 Layla Health | Node | pass 51 s | n/a | partial 72 s | **blocked** | blocked |

Bold = the platform's default provider. Seconds = server start to the approved note.

| Outcome | Why | Proof |
| --- | --- | --- |
| `blocked` zoom | No Zoom Video SDK key and secret yet. The Zoom path is built (server JWT, patient page records its own microphone, as `/docs/video/zoom#two-browsers` says) | `evals/*/zoom/steps.json` |
| `blocked` vonage | The Vonage Video API refuses the account key and secret (`Invalid API key or secret` from the OpenTok SDK, `Invalid token format` from the REST API). Application `d836…` needs its **private key**, which was not provided | `evals/*/vonage/steps.json` |
| `partial` agora, daily | Server tokens and joining both work, and the clinician's own track is captured and relayed. The patient's media never arrives: this container blocks UDP, so ICE fails (`P2PConnection.onICEConnectionStateChange(failed)` in the Agora log). Agora's TLS 443 cloud proxy (`startProxyServer(5)`) did not help. Daily delivered the remote track but silent | `evals/*/agora/steps.json` step 9, `evals/*/daily/steps.json` step 9 |
| `pass` webrtc | Every step, for all 5 server kits | `evals/*/webrtc/steps.json` |

## 5. Mobile builds (17:00 to 17:40)

| # | Platform | Step | Proof | Result |
| --- | --- | --- | --- | --- |
| 5.1 | Qamar (Android, Kotlin, Android kit + Agora tap) | Installed the Android SDK, built with Gradle / AGP 8.7.3 | `platforms/qamar/android/` | first build 114 MB (all ABIs); with `abiFilters arm64-v8a` 42 MB |
| 5.2 | Bahr (Flutter kit + Agora adapter) | Installed Flutter 3.50, built the APK (subagent) | `platforms/bahr/` | 214 MB, trimmed to 68 MB; `flutter analyze` and `flutter test` clean; problems: Agora needs compileSdk 36, the kit refuses an http relay unless loopback, the kit's Zoom README snippet does not compile |
| 5.3 | Rawda (React Native, docs' no-kit steps) | Plain JS client (cutter, key, consent polling); core tests; Android APK built in GitHub Actions and **published as a GitHub release** | [release rawda-rn-2](https://github.com/omarahmedomarahmed/24therapy-eval/releases/tag/rawda-rn-2), `.github/workflows/rn-rawda.yml` | 17.5 MB APK; the iOS simulator job was cancelled while queued for a macOS runner (re-queued) |
| 5.4 | Layla (iOS, Swift, docs' no-kit steps) | Swift package with tests + app; GitHub Actions macOS: `swift test`, simulator build, boot, install, launch, screenshot, recording | [run 44135546223](https://github.com/omarahmedomarahmed/24therapy-eval/actions/runs/44135546223) (success) | **simulator only** (a real iPhone needs an Apple Developer account) |

Problems: the first macOS jobs were cancelled at once (`macos-14` image), so I moved them to `macos-latest`. The
kits are under the Kit Licence and NDA, so Qamar and Bahr cannot be built in public CI; they were built here and
only their APKs were published (on the `apk-builds` branch).

## 6. Real devices on BrowserStack (17:13 to 17:40, after "use connectors and MCPs")

| # | Step | Proof | Result |
| --- | --- | --- | --- |
| 6.1 | The BrowserStack upload helper cannot read local files (it runs remotely), and no BrowserStack access key was in the session | tool error "File not found" | Workaround: published the APKs at public GitHub links (`apk-builds` branch, and the RN release) and used BrowserStack's "upload from a public link" |
| 6.2 | Qamar APK uploaded (`custom_id qamar-clinic`), session on a Pixel 8, Android 14, Appium 2.19.0 | BrowserStack build `qamar-android-agora` | installed, launched, permissions granted. Screens of the app itself are **black** in screenshots because the kit sets `FLAG_SECURE`, as its docs require |
| 6.3 | Tapped Start: the app could not reach a server (none was public) | status stayed `idle` | **blocked** until section 7 |
| 6.4 | Bahr APK (`custom_id bahr-mind`), Pixel 8 | `evals/bahr/android-device/01-launch-pixel8.webp` | launched in Bahr colours, RTL Arabic + English |
| 6.5 | Rawda APK from the GitHub release (`custom_id rawda-rn`), Pixel 8 | `evals/rawda/android-device/01-launch-pixel8.webp` | launched in Rawda colours; **the layout stays LTR** (React Native `allowRTL` alone does not flip it) |
| 6.6 | Tried a Cloudflare quick tunnel from this container for a public server | cloudflared log | failed: no direct DNS / egress from the container |

## 7. Public relay on Vercel and a full real-device session (17:42 to 17:56, after "do it")

| # | Step | Proof | Result |
| --- | --- | --- | --- |
| 7.1 | Created Vercel project `t24-eval-relay` and a Sandbox (fra1, 4 vCPU, 1 h timeout, 3 public HTTPS ports), cloned from this public repo | sandbox `t24-eval-relay` | running |
| 7.2 | Problem: no `dnf` and no ICU in the image | command logs | Workaround: portable Temurin JDK 21, .NET 8 with `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1` |
| 7.3 | Problem: the licensed kit files cannot go through git, and are too large to pass inline | — | Workaround: `tools/portal-download.sh` signs in to the portal with plain HTTP (the sign-in server action accepts a normal form post when `Origin` is set) and downloads the kits inside the sandbox; `tools/vendor-kits.sh` installs them |
| 7.4 | Problem: the Java and .NET servers listened on localhost only | — | Added `BIND_HOST` (default `localhost`; `0.0.0.0` in the relay) |
| 7.5 | `tools/relay-start.sh`: Qamar on the **Java kit** (3050), Bahr on the **Python kit** (3060), Rawda on the **.NET kit** (3070), each with its own `24t listen` and video-token service; keys passed only as process environment | `GET /config` 200 on all three public URLs | live |
| 7.6 | Qamar on a Pixel 8: typed the relay URL, tapped Start | status text read with Appium | "in call (Agora) · waiting for consent": session created through the Java kit, real Agora join on the device |
| 7.7 | Tapped "Consent page": `ConsentLink.open` opened the patient page in a Chrome Custom Tab | `evals/qamar/android-device/02-consent-page.webp` | Arabic page: question, 18+ box, نعم / لا |
| 7.8 | Ticked 18+, tapped نعم as the invented patient | `03-patient-said-yes.webp` | "لقد وافقت. بدأ التسجيل بعد 53 ثانية" (I agreed. Recording started 53 s into the session); API `recording_from_seconds: 53` |
| 7.9 | Back in the app, "Feed bundled audio" (the kit's generic input `onLocalPcm`, real time) | `GET /sessions/{id}`: `status recording`, `captured_seconds 89.3` | pieces relayed by the Java kit; Egyptian Arabic transcript segments came back |
| 7.10 | End (`hangUp`, then `POST /end`) | `GET /sessions/{id}` `note_ready`; `GET /note` | Arabic SOAP draft about sleep after the shift change and an hour without the phone before bed |
| 7.11 | Risk lines | `GET /risk-alerts?session=` empty | **not reached.** My app fed the WAV into the local lane while the Agora tap also fed the (silent) device microphone into the same lane: two producers interleaved (89 s captured for 54 s of audio) and the patient's part was lost. App design fault; the kit gives no warning for it (REPORT, Android kit) |
| 7.12 | Marked the BrowserStack session with the outcome, ended it, **stopped the Vercel Sandbox** (the keys lived only there) | sandbox status `stopped` | relay gone; no key left in a public place |

Bahr and Rawda were not re-run against the relay (same route; their builds and launches are proven in section 6).

## 8. UI and UX findings (patient and clinician screens)

### Patient consent page
1. **After the patient says yes, the page stays a yes / no form.** On the device the confirmation line appears
   *under* the still-active نعم and لا buttons, and the 18+ box unticks. A second tap showed "ظلت هذه الصفحة
   مفتوحة مدة طويلة، فأعدنا تحميلها. نرجو إعطاء إجابتك مرة أخرى" (this page stayed open a long time, so we
   reloaded it; please answer again), which invites a second, conflicting answer. **Fix:** after a yes, replace
   the form with a done state ("You agreed. You can go back to your session.") and a single "Back to the session"
   button; hide or disable yes / no; offer "change my answer" only as a separate, explicit link.
2. **The patient does not get back to the call.** Opened from the app (`ConsentLink.open`, a Custom Tab) or from a
   link, the page has no way back: the patient must find the browser's close button. In the browser the page is a
   separate tab. **Fix:** after a yes, send the patient back automatically: honour a `return_url` (already a field
   of `POST /subjects/{id}/patient-links`, but not of the `patient_consent_url` from `POST /sessions`), post a
   message to the embedding page, or close the Custom Tab with a deep link back to the app.
3. **Show the consent as an orb or a dropdown over the session, not as a separate page.** The widget builder and
   the browser kit already support `orb`, `dropdown`, `popup` and `sidebar` modes, and the patient page can be
   embedded with `POST /widget/patient-tokens`, but the session flow in the docs and in every mobile kit sends the
   patient to a full page. **Fix:** make the embedded patient consent the default in the guide: a small orb or
   dropdown on the patient's call screen that opens the question, closes itself after the answer and leaves the
   video running underneath; the same pattern in the Android, iOS, Flutter and React Native kits (a bottom sheet
   instead of a Custom Tab).
4. The full page opened from the mobile kits is not in the platform's colours (the builder's white label applies
   to the embedded patient page only) and Chrome offers "Translate page? Arabic to English" over it.

### Clinician screens
5. The widget in the call showed the platform colours, the language logo and RTL Arabic correctly in every web cell
   (`evals/*/webrtc/13.webp`), but still shows "من 24Therapy" (by 24Therapy) unless white label is ticked; worth a
   one-line note in the builder.
6. The kit's `FLAG_SECURE` on Android makes every device-farm screenshot black: right for production; a debug-only
   switch would make test evidence possible.
7. React Native: `I18nManager.allowRTL(true)` alone leaves an Arabic-first clinician screen LTR on an English
   device; the docs could say to use `forceRTL`.
8. Portal Home: the "Your stack" selects hide behind "Change"; give them labels and keep them reachable.

## 9. Where the results are

| What | Where |
| --- | --- |
| Summary, scorecards, per-kit findings, top 20 fixes | [REPORT.md](REPORT.md) |
| Every cell, step by step | `evals/<platform>/<provider>/steps.json`, screenshots, `recording.webm` |
| Portal steps | `evals/<platform>/portal/` |
| Real-device runs | `evals/qamar/android-device/`, `evals/bahr/android-device/`, `evals/rawda/android-device/` |
| iOS simulator | `evals/layla/ios-simulator/` and the Actions run linked above |
| APKs | `apk-builds` branch; React Native: GitHub release `rawda-rn-2` |
| How to run it again | [README.md](README.md); the relay: `tools/portal-download.sh`, `tools/vendor-kits.sh`, `tools/relay-start.sh` |

## 10. Still open

- Zoom: waiting for the Video SDK key and secret.
- Vonage: needs the Vonage application's private key.
- Agora and Daily patient media: needs a network that allows UDP (or the providers' TURN over TLS working through a proxy).
- Real-device risk lines: re-run Qamar with the Agora microphone tap detached while the bundled WAV is fed, and run Bahr and Rawda through the relay.
- Rawda iOS simulator job: re-queued; Layla on a real iPhone needs an Apple Developer account.
