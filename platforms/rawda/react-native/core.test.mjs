// node --test: the no-kit pieces and key formula (checked against node:crypto).
import test from 'node:test'; import assert from 'node:assert'; import crypto from 'node:crypto'; import fs from 'node:fs';
import { sha256hex, pieceKey, cut, pcmOf, RATE } from './rawda-core.mjs';
test('sha256 matches node:crypto', () => { const b = crypto.randomBytes(1000); assert.equal(sha256hex(b), crypto.createHash('sha256').update(b).digest('hex')); });
test('key formula', () => { const w = Uint8Array.from([1, 2, 3]); const h = (x) => crypto.createHash('sha256').update(x).digest('hex');
  assert.equal(pieceKey('ses_x', 600, 'patient', w), 'aud-' + h(`ses_x:600.000:patient:${h(w)}`).slice(0, 32)); });
test('bundled audio cuts into overlapping pieces under 4 MiB', () => { const pcm = pcmOf(new Uint8Array(fs.readFileSync(new URL('../../../base/scenario/session-ar.wav', import.meta.url))));
  const p = cut(pcm, 0); assert.ok(p.length >= 2); assert.equal(p[1].start, 18.5); assert.ok(p.every((x) => x.wav.length <= 4194304)); assert.ok(pcm.length / RATE > 40); });
