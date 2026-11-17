# 24Therapy integration evaluation: report

Full step-by-step log with proof, problems, workarounds and the instructions given mid-run: [EVALUATION_LOG.md](EVALUATION_LOG.md).

Date: 2026-11-17. Sandbox keys only, invented data only. Sources: public docs, `openapi.json`, the kit files from the
partner portal (server kits 3.0.0, browser kit 0.6.1, mobile kits 0.2.0). Every number below comes from a run in
`evals/`. "Time" = seconds from server start to the approved note in that cell.

## 1. Matrix

| # | Platform | Server kit | Client | webrtc | daily | agora | vonage | zoom |
|---|---|---|---|---|---|---|---|---|
| 1 | Nilecare Talk | node | web | [**pass (47s)**](evals/nilecare/webrtc/steps.json) | [partial (68s)](evals/nilecare/daily/steps.json) | [partial (73s)](evals/nilecare/agora/steps.json) | [blocked](evals/nilecare/vonage/steps.json) | [blocked](evals/nilecare/zoom/steps.json) |
| 2 | Sakan Therapy | python | web | [pass (53s)](evals/sakan/webrtc/steps.json) | [**partial (73s)**](evals/sakan/daily/steps.json) | [partial (72s)](evals/sakan/agora/steps.json) | [blocked](evals/sakan/vonage/steps.json) | [blocked](evals/sakan/zoom/steps.json) |
| 3 | Wasla Health | php | web | [pass (63s)](evals/wasla/webrtc/steps.json) | [partial (72s)](evals/wasla/daily/steps.json) | [partial (78s)](evals/wasla/agora/steps.json) | [**blocked**](evals/wasla/vonage/steps.json) | [blocked](evals/wasla/zoom/steps.json) |
| 4 | Hadith Care | dotnet | web | [pass (52s)](evals/hadith/webrtc/steps.json) | [partial (66s)](evals/hadith/daily/steps.json) | [**partial (71s)**](evals/hadith/agora/steps.json) | [blocked](evals/hadith/vonage/steps.json) | [blocked](evals/hadith/zoom/steps.json) |
| 5 | Qamar Clinic | java | android | [pass (52s)](evals/qamar/webrtc/steps.json) | n/a | [**partial (71s)**](evals/qamar/agora/steps.json) | [blocked](evals/qamar/vonage/steps.json) | [blocked](evals/qamar/zoom/steps.json) |
| 6 | Bahr Mind | python | flutter | n/a | n/a | [partial (76s)](evals/bahr/agora/steps.json) | [blocked](evals/bahr/vonage/steps.json) | [**blocked**](evals/bahr/zoom/steps.json) |
| 7 | Rawda Space | dotnet | react-native | [**pass (50s)**](evals/rawda/webrtc/steps.json) | n/a | [partial (72s)](evals/rawda/agora/steps.json) | [blocked](evals/rawda/vonage/steps.json) | [blocked](evals/rawda/zoom/steps.json) |
| 8 | Layla Health | node | ios | [pass (51s)](evals/layla/webrtc/steps.json) | n/a | [partial (72s)](evals/layla/agora/steps.json) | [**blocked**](evals/layla/vonage/steps.json) | [blocked](evals/layla/zoom/steps.json) |

Legend: **bold** = the platform's default provider. `pass` = every step of the full session passed (portal-registered
origin, patient consent page yes, audio of both speakers relayed through the kit, widget in the call, Egyptian
Arabic + Franco risk lines, verified webhooks, risk alert read + acknowledged, note draft + approval, patient summary
approval and delivery, memory + copilot, usage, error checks). `partial` = the session completed but at least one
step failed (named in the cell's `steps.json`). `blocked` = cannot run with what we have; reason below. `n/a` = the
docs say the stack does not support it (Daily has no Android/iOS tap; Flutter and React Native kits ship no plain
WebRTC adapter).

Why cells are not green:

| Reason | Cells |
| --- | --- |
| **blocked: Zoom Video SDK key and secret needed** | every `zoom` cell. The Zoom path is built (`base/web/providers.js`, `base/video/server.mjs` signs the JWT) |
| **blocked: Vonage Video API needs the application's private key.** The key and secret given are refused by the Video API (`Invalid API key or secret`); the Vonage Video API (application id `d836…`) only signs with a private key | every `vonage` cell |
| **partial (environment): WebRTC media over UDP is blocked in this evaluation container.** Token minting, join and the clinician's own track work; the remote (patient) track never carries audio, so only clinician pieces reach the API. Agora's TLS cloud proxy (`startProxyServer(5)`) did not help | `agora` and `daily` web cells |
| **rate limit**: the sandbox's 60 requests/minute was hit by the raw (non-kit) memory and copilot calls in one run; the kits would have retried, our raw calls did not | noted per cell |

Mobile clients (the web matrix above exercises each platform's server kit through the shared web client; these rows are the native clients):

| Platform | Client | Build | Real device / simulator | Full session |
| --- | --- | --- | --- | --- |
| 5 Qamar Clinic | Android, Kotlin, Android kit 0.2.0 + Agora tap | pass: Gradle, AGP 8.7.3, 42 MB arm64 APK, first try | pass: real Google Pixel 8, Android 14 (BrowserStack, Appium 2.19.0). Screens are black in screenshots of the app itself because the kit sets `FLAG_SECURE` | **partial** ([steps](evals/qamar/android-device/steps.json)): through a public Java-kit relay (Vercel Sandbox, stopped after the run) the device joined Agora, the patient said yes on the real consent page, the kit captured and relayed audio, the transcript came back in Egyptian Arabic and a SOAP note was drafted. The risk lines did not arrive: our app fed the WAV into the same local lane as the Agora mic tap |
| 6 Bahr Mind | Flutter, Flutter kit 0.2.0 + Agora adapter (Zoom default and Vonage are blocked) | pass: 68 MB arm64 APK after trimming from 214 MB; `flutter analyze` and `flutter test` clean | pass: launched on a real Pixel 8 in Bahr colours, RTL ([steps](evals/bahr/android-device/steps.json)). iOS: not possible here (no macOS, and the kit is under NDA so it cannot go to public CI) | blocked: same relay reason; also the kit refuses an `http://` relay unless loopback |
| 7 Rawda Space | React Native 0.76.5, docs' no-kit steps | pass: APK built in GitHub Actions and published as release `rawda-rn-2` | pass: launched on a real Pixel 8 from the release link ([steps](evals/rawda/android-device/steps.json)); iOS simulator job re-queued | blocked: same relay reason |
| 8 Layla Health | iOS, Swift, docs' no-kit steps | pass: `swift test`, simulator build (GitHub Actions `ios-layla`) | **simulator only**: launched, screenshot and recording as CI artifacts ([steps](evals/layla/ios-simulator/steps.json)). A real iPhone needs an Apple Developer account | blocked: no sandbox key in public CI, server not reachable from the runner |

Bahr and Rawda were not re-run against the public relay (same relay route; their builds and launches are proven above).

## 2. Kit scorecard (1 = poor, 5 = excellent)

| Kit | Install | Docs match kit | API design | Errors + retries | Security | Arabic / RTL | Size + deps | Examples as written | Time to first session |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Node server 3.0.0 | 5 | 4 | 5 | 5 | 4 | 4 | 5 | 4 | 5 (47 s run; ~25 min to write the server) |
| Python server 3.0.0 | 4 | 3 | 4 | 4 | 4 | 4 | 5 | 3 | 4 (52 s run; ~3 min to first pass with Node as reference) |
| PHP server 3.0.0 | 5 | 4 | 4 | 4 | 5 | 4 | 5 | 3 | 4 (63 s; ~4 min) |
| .NET server 3.0.0 | 4 | 4 | 4 | 5 | 4 | 3 | 5 | 3 | 4 (52 s; ~8 min) |
| Java server 3.0.0 | 4 | 4 | 3 | 4 | 5 | 4 | 5 | 3 | 4 (52 s; ~4 min) |
| Browser kit 0.6.1 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 5 |
| Android kit 0.2.0 | 4 | 4 | 4 | 4 | 5 | 3 | 3 | 4 | 3 (APK built first try; no device session) |
| Flutter kit 0.2.0 | 3 | 3 | 4 | 5 | 4 | 3 | 2 | 2 | 3 (~1.5 h to first APK: SDK 36, NDK, Agora compileSdk) |
| React Native, no-kit steps | 3 | 4 | 3 | 3 | 4 | 4 | 4 | 2 | 3 |
| iOS Swift, no-kit steps | 3 | 4 | 3 | 3 | 4 | 4 | 5 | 2 | 3 |
| Adapter: plain WebRTC (browser) | 5 | 5 | 5 | n/a | 5 | n/a | 5 | 5 | 5 |
| Adapter: Daily (browser) | 4 | 4 | 5 | n/a | 5 | n/a | 5 | 4 | media blocked here |
| Adapter: Agora (browser) | 4 | 4 | 5 | n/a | 5 | n/a | 5 | 4 | media blocked here |
| Adapter: Vonage (browser) | 3 | 3 | 4 | n/a | 4 | n/a | 5 | 3 | blocked (no private key) |
| Adapter: Zoom (browser) | 3 | 4 | 3 | n/a | 4 | n/a | 5 | 3 | blocked (no keys) |

Evidence for every score is in §3. Arabic: the note, the summary, the transcript and the widget were Arabic and RTL in
every web run; the Franco line was transcribed into Arabic script and raised an `elevated` alert from audio alone
(`base/scenario/README.md`).

## 3. Per kit: missing, kit-not-docs, docs-not-kit, top 3 changes

### All server kits (shared)
- Missing: no method for memory, copilot, transcript, grants, patient links listing, exports, webhook endpoints (SURFACE §2). Each kit has a generic `request()` that would do it with retries, but no doc says so. We used raw HTTPS and hit the 60/min limit without retries.
- Missing: `dialect` in typed bodies (SURFACE §2 admits it).
- Kit-not-docs: `seen(delivery)` marks a delivery handled **before** `onEvent` runs (Python `twentyfour.py:754`, Node `twentyfour.js:740`): if the handler throws, the retry is answered `200 duplicate` and the event is lost.
- Kit-not-docs: the route handlers catch only `TwentyFourError`; a config error (no widget origin) escapes as a bare 500 (Python `:581`, .NET `:637`, Java `:842`).
- Docs-not-kit: the docs call `currentClinician` required and say a missing hook throws; the kits accept null and answer 500 `clinician_hook_missing` at request time.
- Top 3: (1) add `getMemory`, `askCopilot`, `getTranscript` to every kit; (2) call `seen` only after `onEvent` succeeds; (3) ship one runnable example per kit with a demo login and the patient mount (every example today answers 401 `sign_in`).

### Node
- Best of the five: `nodeAdapter` + `createRoutes` mounted in 3 lines; `TwentyFourError` carries `status/code/requestId/retryAfter`; bad ids raise `RangeError` before sending.
- Top 3: memory/copilot methods; `seen` ordering; document that `noteForRecord` exists in the minimum integration.

### Python
- Kit-not-docs: README says `None` is left out of bodies (`README.md:26`); the kit sends `null` (`twentyfour.py:288`), as the docs say.
- Example fails as written: `README.md:135` uses `session_id`, undefined. No stdlib adapter (examples need Flask/FastAPI despite "standard library only").
- Top 3: a `http.server`/WSGI adapter like `nodeAdapter`; fix the README; lock around the 5-minute ownership cache.

### PHP
- Kit-not-docs: the "cached 5 minutes" ownership check is per request in PHP (`TwentyFourTherapy.php:713,873`): one extra `GET /sessions` per poll and audio piece.
- Retries sleep in-process (5 tries, 60 s timeout): on `php -S` one 429 stalls webhooks that must answer in 10 s.
- `examples/plain/index.php` never sets the clinician, so every route is 401; `session_start()` serialises the recorder's parallel calls.
- Top 3: APCu/file cache option for ownership; document workers/storage for `seen` and events; a working plain example.

### .NET
- README sample does not compile (`README.md:126` uses `app.Services` before `app` exists).
- The README's `IHttpClientFactory` client follows redirects, undoing the kit's no-redirect protection of the key (`TwentyFourTherapy.cs:48,163`).
- Route answers escape Arabic as `\uXXXX` (default encoder, `:522,782`). Wrong method gives an empty ASP.NET 405, not the kit's JSON error.
- `PLATFORM` env var collides with MSBuild `$(Platform)` under `dotnet run` (our runner; worth a line in the docs).
- Top 3: fix the README sample; use `JavaScriptEncoder.UnsafeRelaxedJsonEscaping`; warn against redirecting handlers.

### Java
- `getUsage()` needs `getUsage(null)`; `Json.write` turns arrays into `[Ljava.lang.String;@…` (`:1176`); `KitResponse.json` is package-private (`:700`).
- Spring example pom has no Boot plugin: `mvn package` jar does not run.
- Top 3: overloads for optional args; fix array serialisation; make `KitResponse` public.

### Browser kit 0.6.1
- Worked first time with plain WebRTC, Daily and Agora tracks; recorder states, consent gating, idempotency keys and `scan_only` all as documented; `mount()` + `widgetLauncher` themed the widget in each platform's colours.
- Missing: nothing blocking. Docs-not-kit: none found. The adapters for Zoom and Vonage were not exercisable (keys).
- Top 3: a `fetch`-free test page in the kit zip; a note that remote audio silence (UDP blocked, muted peer) is reported as `silent` pieces, not as an error; an `onTrackMissing` callback.

### Android kit 0.2.0
- Built with AGP 8.7.3 on the first try, as a path dependency on `android-agora/{core,agora}`.
- Kit-not-docs: `WidgetView.load` refuses any frame origin that is not `https://` (`WidgetView.kt:44`), while the portal and docs allow `http://localhost` origins in the sandbox: the app and the web origin cannot share one sandbox origin.
- `FLAG_SECURE` (`WidgetView.secure`) makes every device-farm screenshot black: correct for production, but the docs could suggest a debug-only switch for test builds.
- Size: the Agora voice SDK adds ~110 MB for all ABIs; the docs could recommend `abiFilters`.
- Kit-not-docs: `CaptureSession` accepts frames for one lane from two producers (a tap and `onLocalPcm`) without warning; time doubles and pieces are garbled. Top 3: warn or refuse a second producer per lane; publish the Maven artifacts so the zip is not needed; a sample that feeds a WAV through `onLocalPcm` (the "generic input" for device farms).

### Flutter kit 0.2.0
- `CaptureSession` with generic `onLocalPcm` / `onRemotePcm` / `onMixedPcm` and a `held` state is clean (`capture.dart:24,153-176`); retries and piece keys solid (`capture.dart:414-455`, `relay.dart:205-229`); kit tests pass (core 23, Agora 2, Vonage 4, Zoom 1).
- Kit-not-docs: the relay refuses `http://` unless the host is loopback (`relay.dart:242`); the emulator default `10.0.2.2` fails. Docs-not-kit: path `../24therapy/kits/...` (docs) does not match the zip; the Zoom README uses a third layout.
- Example fails as written: the Zoom capture snippet uses `source` before declaring it (`flutter-zoom/README.md:91-93`, also on the docs page).
- Size: core forces `webview_flutter`; Agora defaults give a 214 MB APK; plugins pin AGP 8.7.3 / `kotlin-android`, which Flutter 3.50 warns will break; compileSdk 35 vs the Vonage README's 37.
- Top 3: fix the Zoom snippet and paths; allow `http://10.0.2.2` in sandbox builds; make the widget (`webview_flutter`) optional.

### React Native and iOS (docs' no-kit steps)
- React Native: `I18nManager.allowRTL(true)` alone leaves the layout LTR on an English device; the docs could say to `forceRTL` for Arabic-first clinician apps.
- The protocol table on `/docs/apps/other` was enough to write both clients (cutter, overlap, idempotency key, consent polling, retries) in ~150 lines each.
- Missing: no reference test vectors for the piece key and the cutter outside the NDA zip (the shared vectors are in `kits/mobile/test-vectors.json`), so a no-kit client cannot prove it matches; React Native's `fetch` cannot send a typed array body (we used XHR) — undocumented.
- Top 3: publish the cutter/key vectors on the public page; a reference no-kit client; say how to read `session_seconds`.

### Video adapters
- WebRTC: perfect. Daily: room + meeting token from the REST API, `dailyTrack` worked. Agora: server-built RTC token and join worked; media needs UDP. Vonage: the docs never say the server needs the **application private key** (not the account key/secret) to mint sessions and tokens. Zoom web: the "two browsers" rule (patient page records its own mic) is clear in the docs and wired in `base/web/app.js`.

## 4. Top 20 fixes (most blocking first)

1. **Summary approval silently depends on the risk alert.** `POST /sessions/{id}/summary/approve` answers 409 `open_risk_alert` until every alert of the session is acknowledged. Add this as a numbered step in `/docs/integration` (between note approval and summary) and in each kit README; today it is only in Concepts and Errors.
2. **Summary draft and approve body do not match.** The draft is `{brief, steps[], next}` but `SummaryApprove` requires `text` (10 to 50000 chars). Document the exact join (we used `brief`, `steps`, `next` joined by newlines) or accept the draft object, and add `approveSummaryDraft(id, approved_by)` to every kit.
3. **Vonage docs omit the server credential.** `/docs/video/vonage` must say the server needs the Vonage application id **and private key** (the account API key and secret are refused by the Video API), with a 10-line token example per server language.
4. **Memory, copilot and transcript have no kit method.** Add `getMemory(subject, clinician)`, `askCopilot({subject, clinician, question, session})` and `getTranscript(id)` to all five server kits (each already has a generic `request()`), so they get retries and idempotency.
5. **Webhook dedup loses events.** In every kit, call `seen(delivery)` only after `onEvent` returned (Node `twentyfour.js:740`, Python `twentyfour.py:754`); today a handler error turns the retry into `200 duplicate`.
6. **Android `WidgetView.load` refuses `http://localhost`** (`WidgetView.kt:44`) while the sandbox registers `http://localhost:port` origins: accept `http://localhost`, `127.0.0.1` and `10.0.2.2` for sandbox embed URLs.
7. **No runnable kit example.** Every server example (Python, PHP, .NET, Java) answers 401 `sign_in` as shipped. Ship one example per kit with a demo login, the patient mount (`/24t-patient`), `seen` storage and a static page that mounts the browser kit.
8. **Route handlers leak config errors.** Catch everything in `Routes.handle` (Python `:581`, .NET `:637`, Java `:842`) and answer a JSON 500 with a code (`widget_origin_missing`) instead of a framework 500.
9. **Rate limit vs. polling.** 60 requests/minute is reached by one session (recorder consent polls, audio, overview, memory and copilot). Document a request budget per session in `/docs/concepts#limits` and expose `X-RateLimit-Remaining`.
10. **.NET README does not compile** (`README.md:126` uses `app.Services` before `var app`), and its `IHttpClientFactory` client follows redirects, which defeats the kit's key protection (`TwentyFourTherapy.cs:48,163`). Fix both and set `AllowAutoRedirect = false` in the sample.
11. **Python README contradicts the kit** on `None` (`README.md:26` vs `twentyfour.py:288`), and its note example uses an undefined `session_id` (`README.md:135`).
12. **PHP ownership cache is per request** (`TwentyFourTherapy.php:713,873`): add a PSR-16 cache option, and document that `php -S` with blocking retries can stall webhooks past 10 s.
13. **`dialect` missing from kit bodies.** Add `dialect` to `createSession` and `createWidgetToken` typed bodies (SURFACE section 2 says a follow-up is pending).
14. **.NET escapes Arabic** in route answers (backslash-u escapes, `TwentyFourTherapy.cs:522,782`): use `JavaScriptEncoder.UnsafeRelaxedJsonEscaping`.
15. **Java API gaps**: `getUsage()` without arguments; arrays in `Json.write` (`:1176` writes `[Ljava.lang.String;@...`); make `KitResponse.json` public (`:700`); add the Spring Boot plugin to the example pom.
16. **No-kit clients cannot verify themselves.** Publish the piece-key and cutter vectors (`kits/mobile/test-vectors.json`) on `/docs/apps/other`, and note that React Native `fetch` cannot send a typed-array body (use XHR or a Blob).
17. **Device-farm testing.** Document the generic input for Android, iOS and Flutter (feed a WAV into `onLocalPcm` or the PCM entry point) with a sample, and a debug-only way to disable `FLAG_SECURE` so test screenshots are not black.
18. **Agora and Daily over restricted networks.** Add "media needs UDP or the provider's TURN/TLS proxy" to `/docs/video`, and say that a remote track without media shows up as `silent` pieces in `onPiece`, so partners can alert on it.
19. **Portal "Your stack" control** on Home is hidden behind "Change" and was not settable by scripted onboarding within 5 s; keep the selects labelled and in the DOM so automation and screen readers can set the stack.
20. **Android APK size.** Recommend `ndk.abiFilters` in `/docs/apps/android` (the Agora voice SDK made a 114 MB APK; arm64 only is 42 MB) and publish the kit's Maven artifacts so partners do not vendor the zip.

## 5. UI fixes (patient consent and screens)

1. **After yes, leave the yes / no form.** Today the confirmation appears under still-active نعم / لا buttons, the 18+ box unticks, and a later tap shows "the page was open too long, answer again". Replace the form with a done state and one "Back to the session" button.
2. **Send the patient back to the session.** Honour a `return_url` on the session's consent link (it exists only on `POST /subjects/{id}/patient-links`), post a message to the embedding page, or close the mobile Custom Tab with a deep link back to the app.
3. **Make the consent an orb or dropdown over the call, not a separate page.** The builder and the browser kit already have `orb` / `dropdown` modes and `POST /widget/patient-tokens`; make that the default in the guide and give the mobile kits a bottom sheet instead of a Custom Tab, closing itself after the answer.
4. The full consent page opened by the mobile kits is not in the platform's colours, and Chrome offers to translate it.
5. React Native needs `forceRTL` for Arabic-first screens; Android `FLAG_SECURE` needs a debug switch for test evidence; the widget shows "من 24Therapy" unless white label is ticked; the portal's "Your stack" selects hide behind "Change".
