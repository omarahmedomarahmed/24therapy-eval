// Rawda Space: the docs' "An app with no kit" steps (/docs/apps/other) in plain JavaScript for
// React Native. No 24Therapy kit code; the app talks only to the platform's own server.
export const RATE = 16000;
const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
/** SHA-256 of bytes, hex (no crypto module in React Native). */
export function sha256hex(bytes) {
  const l = bytes.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n); m.set(bytes); m[l] = 0x80;
  const dv = new DataView(m.buffer); dv.setUint32(n - 4, l * 8 >>> 0); dv.setUint32(n - 8, Math.floor(l / 0x20000000));
  let h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]; const w = new Uint32Array(64); const r = (x, c) => (x >>> c) | (x << (32 - c));
  for (let o = 0; o < n; o += 64) { for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const s0 = r(w[i-15],7)^r(w[i-15],18)^(w[i-15]>>>3), s1 = r(w[i-2],17)^r(w[i-2],19)^(w[i-2]>>>10); w[i] = (w[i-16]+s0+w[i-7]+s1)|0; }
    let [a,b,c,d,e,f,g,hh] = h;
    for (let i = 0; i < 64; i++) { const t1 = (hh + (r(e,6)^r(e,11)^r(e,25)) + ((e&f)^(~e&g)) + K[i] + w[i])|0, t2 = ((r(a,2)^r(a,13)^r(a,22)) + ((a&b)^(a&c)^(b&c)))|0; hh=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0; }
    h = h.map((v, i) => (v + [a,b,c,d,e,f,g,hh][i])|0); }
  return h.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
}
export const utf8 = (s) => Uint8Array.from(unescape(encodeURIComponent(s)), (c) => c.charCodeAt(0));
/** The docs' key: aud- + first 32 hex of SHA-256 over <session>:<start 3 decimals>:<speaker or mixed>:<hex SHA-256 of bytes>. */
export const pieceKey = (session, start, speaker, wav) => 'aud-' + sha256hex(utf8(`${session}:${start.toFixed(3)}:${speaker || 'mixed'}:${sha256hex(wav)}`)).slice(0, 32);
export function wavEncode(pcm) { // Int16Array -> 16 kHz mono 16-bit WAV
  const b = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(b), s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0,'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); s(8,'WAVEfmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,RATE,true); v.setUint32(28,RATE*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); s(36,'data'); v.setUint32(40, pcm.length*2, true);
  pcm.forEach((x, i) => v.setInt16(44 + i * 2, x, true)); return new Uint8Array(b);
}
/** About 20 s pieces, each starting 1.5 s before the previous one ended. */
export function cut(pcm, from, pieceSeconds = 20, overlap = 1.5) {
  const out = [], len = pieceSeconds * RATE, back = overlap * RATE; let i = 0;
  while (i < pcm.length) { const end = Math.min(i + len, pcm.length); out.push({ start: from + i / RATE, wav: wavEncode(pcm.subarray(i, end)) }); if (end === pcm.length) break; i = end - back; }
  return out;
}
export const pcmOf = (wavBytes) => new Int16Array(wavBytes.buffer.slice(wavBytes.byteOffset + 44, wavBytes.byteOffset + wavBytes.byteLength - (wavBytes.byteLength % 2)));
/** POST one piece to the platform relay (XHR: React Native's fetch does not send typed arrays). */
export function sendPiece(base, session, piece, speaker, cookie) {
  return new Promise((ok) => { const x = new XMLHttpRequest(); x.open('POST', `${base}/24t/sessions/${session}/audio`);
    x.setRequestHeader('Content-Type', 'audio/wav'); x.setRequestHeader('X-Audio-Start-Seconds', piece.start.toFixed(3)); x.setRequestHeader('X-Audio-Speaker', speaker);
    x.setRequestHeader('Idempotency-Key', pieceKey(session, piece.start, speaker, piece.wav)); if (cookie) x.setRequestHeader('Cookie', cookie);
    x.onload = () => ok({ status: x.status, retryAfter: Number(x.getResponseHeader('Retry-After')) || null }); x.onerror = () => ok({ status: 0 }); x.send(piece.wav.buffer); });
}
