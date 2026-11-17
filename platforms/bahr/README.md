# Bahr Mind (bahr): Flutter app on the Python base server

Platform 6 in `base/platforms.json`: Python base server (`servers/python/server.py`) on port
3060, video provider Zoom (blocked until the Video SDK keys arrive), then Vonage (blocked: no
application private key), then Agora. Colours: primary `#02569B`, ink `#04223D`, surface
`#EEF6FD`. The app is `flutter/`: one RTL screen, Arabic and English labels.

## First: get the kit (it is not in git)

The app depends on the licensed 24Therapy Flutter kit **by path into `kits/`**, which is
git-ignored (Kit Licence and NDA: never committed to this public repository). Before
`flutter pub get`, download the kit zips from the partner portal into `kits/` and run:

```bash
tools/vendor-kits.sh   # unzips kits/*.zip into kits/x/ (and copies the server kits to vendor/)
```

The app then reads `kits/x/24therapy-flutter/kits/{flutter,flutter-zoom,flutter-vonage,flutter-agora}`.

## Build

```bash
cd platforms/bahr/flutter
flutter pub get
flutter analyze && flutter test
flutter build apk --release --target-platform android-arm64 --dart-define=VIDEO_PROVIDER=agora
```

`VIDEO_PROVIDER` is `zoom` (default, as the platform), `vonage` or `agora`. Toolchain used:
Flutter 3.50.0 stable (AGP 9.3.1, Gradle 9.5, Kotlin 2.4), Android SDK 36 + NDK 28.2, Java 21.
Release builds are signed with the debug key. iOS is not built here (no macOS).

Android changes the template needed:

- `minSdk = 28` (the kit's plugins declare 28).
- `android/build.gradle.kts`: every plugin library compiles against SDK 36 (`finalizeDsl`),
  because `agora_rtc_engine` 6.6.4 compiles against 31, below its androidx dependencies (34+).
- `android/app/proguard-rules.pro`: `-dontwarn` for the Zoom and Vonage SDKs, which the kit's
  bridges compile against (`compileOnly`) and this build does not bundle.
- Packaging: only the `--target-platform` ABIs (Agora ships all four; the Flutter Gradle plugin
  resets `abiFilters`), and Agora's video and vision extensions left out (audio-only call).
  arm64 release APK: 214 MB as generated, 68 MB with both.

## Run against the server

```bash
PLATFORM=bahr VIDEO_PROVIDER=agora python3 servers/python/server.py   # + base/video/server.mjs for tokens
adb reverse tcp:3060 tcp:3060   # then use http://127.0.0.1:3060 in the app
```

The kit takes an `http://` relay **only on a loopback host** (`127.0.0.1`, `localhost`, `::1`)
and otherwise https. The app's default base URL, `http://10.0.2.2:3060` (the emulator's host),
works for login, start, room and end, but the capture refuses it; the app says so. Use
`adb reverse` and `http://127.0.0.1:3060`, or an https server.

## What the screen does

1. Therapist login: `POST /login {"role":"therapist","ref":"C-BAHR-1"}`, keeping the `demo_user` cookie.
2. Start: `POST /api/start {patient_ref}`, then `GET /api/room/<session>`; a `{blocked: "..."}` answer is shown.
3. The kit's `CaptureSession` with relay `<server>/24t` and the cookie as the `Cookie` header.
   If the room is not blocked, the provider joins first (Agora: `AgoraAudioTap.attach` before
   `joinChannel`). Blocked or not, `capture.start()` polls consent.
4. Open consent page: the kit's `openConsentPage` (url_launcher, in-app browser view), with the
   staging host allowed explicitly.
5. Feed bundled audio: `assets/session-ar.wav` (a copy of `base/scenario/session-ar.wav`,
   16 kHz mono) in real time, 100 ms at a time, into the kit's generic input `onMixedPcm`
   (the file holds both voices, so it goes in unlabelled). Before consent the kit only counts frames.
6. End: `capture.hangUp()`, Agora leave, then `POST /api/sessions/<id>/end`.

Zoom and Vonage joins are not wired in this build: Zoom needs `flutter_zoom_videosdk`
(`ZoomAudioSource.start()` right after `joinSession`), Vonage needs the app's own native SDK and
channel (`VonageAudioTap.install()` before the session). Both are blocked on the server anyway.
The Agora join needs the microphone permission at runtime (not requested by this demo).
The manifest allows cleartext HTTP for the local demo server only.
