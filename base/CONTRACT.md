# Base teletherapy contract (every platform server implements this)

Shared by all 8 platforms. Pages and scripts live in `base/web/`; each server in
`platforms/<slug>/server` serves them and implements the routes below with its own
24Therapy server kit. The 24Therapy key never leaves the server.

| Route | What |
| --- | --- |
| `GET /` , `GET /patient` | therapist page, patient page (`base/web`) |
| `GET /vendor/24therapy-browser-0.6.1.iife.js` | the browser kit file, copied from the portal (not in git) |
| `GET /config` | platform name, colours, logo, `provider` and public provider fields |
| `POST /login` `{role:"therapist"\|"patient", ref}` | demo login, signed cookie `demo_user` (invented users only) |
| `POST /api/start` `{patient_ref}` | `putClinician`, `createSubject`, `createSession(memory:true, dialect:"ar-EG")`; answers `{session, subject, created_at, patient_consent_url, room}` |
| `GET /api/room/:session` | join data for the signed-in role and `VIDEO_PROVIDER` (token built on the server) |
| `POST /api/signal/:room` , `GET /api/signal/:room?since=n` | plain WebRTC signalling (in memory) |
| `POST /api/sessions/:id/segments` | `sendSegments` (scenario lines) |
| `POST /api/sessions/:id/end` | `endSession` |
| `GET /api/sessions/:id/overview` | session, note, summary, risk alerts, transcript |
| `POST /api/sessions/:id/note/approve` | `approveNote` with the draft's sections, as the clinician |
| `POST /api/sessions/:id/summary/approve` | `approveSummary` with `text` = draft `brief`, `steps`, `next` joined by newlines |
| `POST /api/risk/:id/ack` | `getRiskAlert` then `acknowledgeRiskAlert` |
| `GET /api/subjects/:id/memory` , `POST /api/copilot` | memory and copilot (raw HTTPS: not in the kits) |
| `GET /api/usage` | `getUsage` |
| `GET /api/errors` | error checks: bad id (raises before sending), unknown session (404 `TwentyFourError` with `requestId`) |
| `GET /api/events` | verified webhook events received |
| `/24t/*` | the kit's clinician routes (`widget-token`, `consent-state`, `audio`, `webhooks`) |
| `/24t-patient/*` | the kit's patient routes |

Settings (env): `VIDEO_PROVIDER = webrtc | vonage | agora | daily | zoom`, `PLATFORM` (slug),
`PORT`, `TWENTYFOUR_API_KEY`, `TWENTYFOUR_WEBHOOK_SECRET`, `TWENTYFOUR_WIDGET_ORIGIN`,
provider keys (see `.env.example`).
