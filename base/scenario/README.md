# Scenario (invented)

- `session-ar.wav`: 16 kHz mono, about 54 s. A synthetic clinician voice (Google TTS, Egyptian Arabic text) and an
  invented patient voiced with ElevenLabs ("Tarek", eleven_v3), with one risk line in Egyptian Arabic and one in Franco.
- `risk-patient.wav`: the patient part alone (12 s). Sent alone to `POST /sessions/{id}/audio`, the sandbox transcribed the
  Franco line into Arabic script and raised an `elevated` risk alert.
- `risk-lines.json`: the same lines as text segments, sent by every matrix cell.
No real person, no real recording.
