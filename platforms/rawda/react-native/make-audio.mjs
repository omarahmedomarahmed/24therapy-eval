// Embeds the invented bundled WAV as base64 (no native file module needed).
import fs from 'node:fs';
fs.writeFileSync(new URL('./audio.ts', import.meta.url), `export const AUDIO_B64 = ${JSON.stringify(fs.readFileSync(new URL('../../../base/scenario/session-ar.wav', import.meta.url)).toString('base64'))};\n`);
