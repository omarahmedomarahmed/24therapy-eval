// Shared video-token service, run beside each platform server (localhost only). It holds the
// provider secrets so the platform servers in five languages reuse one token builder.
// GET /token?provider=&room=&role=  ->  join data for the browser (never a secret).
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const { RtcTokenBuilder, RtcRole } = require('agora-token');
const E = process.env, rooms = new Map();
const b64u = (b) => Buffer.from(b).toString('base64url');
function jwtHS256(payload, secret) { const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), p = b64u(JSON.stringify(payload)); return `${h}.${p}.${crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`; }
async function daily(room) {
  if (!E.DAILY_API_KEY) return { blocked: 'blocked: DAILY_API_KEY needed' };
  const H = { Authorization: `Bearer ${E.DAILY_API_KEY}`, 'Content-Type': 'application/json' };
  const name = ('t24-' + room).slice(0, 40).replace(/[^A-Za-z0-9-]/g, '-');
  if (!rooms.has(name)) { const r = await fetch('https://api.daily.co/v1/rooms', { method: 'POST', headers: H, body: JSON.stringify({ name, privacy: 'private', properties: { exp: Math.floor(Date.now() / 1000) + 7200 } }) }); const d = await r.json(); if (!r.ok && !/already exists/.test(JSON.stringify(d))) throw new Error('daily room: ' + JSON.stringify(d)); rooms.set(name, d.url || `https://${(await (await fetch('https://api.daily.co/v1/', { headers: H })).json()).domain_name}.daily.co/${name}`); }
  const t = await fetch('https://api.daily.co/v1/meeting-tokens', { method: 'POST', headers: H, body: JSON.stringify({ properties: { room_name: name, exp: Math.floor(Date.now() / 1000) + 7200 } }) });
  return { url: rooms.get(name), token: (await t.json()).token };
}
function agora(room, role) {
  if (!E.AGORA_APP_ID || !E.AGORA_APP_CERTIFICATE) return { blocked: 'blocked: Agora app id and certificate needed' };
  const uid = role === 'therapist' ? 1001 : 2002, channel = room.slice(0, 64);
  return { appId: E.AGORA_APP_ID, channel, uid, token: RtcTokenBuilder.buildTokenWithUid(E.AGORA_APP_ID, E.AGORA_APP_CERTIFICATE, channel, uid, RtcRole.PUBLISHER, 3600, 3600) };
}
async function vonage(room, role) {
  if (!E.VONAGE_PRIVATE_KEY_PATH) return { blocked: 'blocked: Vonage Video API needs the application private key (key and secret are refused: "Invalid API key or secret")' };
  const { Video } = await import('@vonage/video'); const { Auth } = await import('@vonage/auth');
  const v = new Video(new Auth({ applicationId: E.VONAGE_APPLICATION_ID, privateKey: readFileSync(E.VONAGE_PRIVATE_KEY_PATH) }));
  if (!rooms.has('v' + room)) rooms.set('v' + room, (await v.createSession({ mediaMode: 'routed' })).sessionId);
  const sessionId = rooms.get('v' + room); return { applicationId: E.VONAGE_APPLICATION_ID, sessionId, token: v.generateClientToken(sessionId, { role: 'publisher', data: role }) };
}
function zoom(room, role) {
  if (!E.ZOOM_SDK_KEY || !E.ZOOM_SDK_SECRET) return { blocked: 'blocked: Zoom Video SDK key and secret needed' };
  const iat = Math.floor(Date.now() / 1000) - 30;
  return { topic: room.slice(0, 200), userName: role, signature: jwtHS256({ app_key: E.ZOOM_SDK_KEY, tpc: room.slice(0, 200), role_type: role === 'therapist' ? 1 : 0, version: 1, iat, exp: iat + 7200 }, E.ZOOM_SDK_SECRET) };
}
createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const p = u.searchParams.get('provider'), room = u.searchParams.get('room') || 'room', role = u.searchParams.get('role') || 'patient';
  try { const d = p === 'daily' ? await daily(room) : p === 'agora' ? agora(room, role) : p === 'vonage' ? await vonage(room, role) : p === 'zoom' ? zoom(room, role) : { room, iceServers: [] };
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ provider: p, room, ...d }));
  } catch (e) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: String(e.message).slice(0, 300) })); }
}).listen(Number(E.VIDEO_TOKEN_PORT || 4000), '127.0.0.1');
