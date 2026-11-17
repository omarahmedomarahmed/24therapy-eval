// Nilecare Talk: the shared base (base/CONTRACT.md) on the 24Therapy Node server kit 3.0.0.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { TwentyFour, TwentyFourError, createRoutes, nodeAdapter, noteForRecord } = await import(process.env.TWENTYFOUR_NODE_KIT || path.join(ROOT, 'vendor/twentyfour.js'));
const P = JSON.parse(readFileSync(path.join(ROOT, 'base/platforms.json'))).find((x) => x.slug === (process.env.PLATFORM || 'nilecare'));
const PORT = Number(process.env.PORT || P.port), PROVIDER = process.env.VIDEO_PROVIDER || P.video;
process.env.TWENTYFOUR_WIDGET_ORIGIN ||= `http://localhost:${PORT}`;
const tf = new TwentyFour();                       // key, base, webhook secret, widget origin from the environment
const COOKIE_KEY = process.env.SESSION_SECRET || randomUUID();
const events = [], signals = new Map(), subjects = new Map(), seenDeliveries = new Set();

// Demo login: a signed cookie for invented users. In a real platform this is your own login.
const sign = (v) => `${v}.${createHmac('sha256', COOKIE_KEY).update(v).digest('hex').slice(0, 32)}`;
function user(headers) {
  const c = (typeof headers.get === 'function' ? headers.get('cookie') : headers.cookie) || '';
  const m = c.match(/demo_user=([^;]+)/); if (!m) return null; const raw = decodeURIComponent(m[1]); const v = raw.slice(0, raw.lastIndexOf('.'));
  if (sign(v) !== raw) return null; const [role, ref] = v.split(':'); return { role, ref };
}
const hooks = {
  currentClinician: (req) => { const u = user(req.headers); return u && u.role === 'therapist' ? u.ref : null; },
  onEvent: (ev, d) => { events.push({ id: ev.id, type: ev.type, delivery: d.id, data: ev.data, received_at: new Date().toISOString() }); },
  seen: (id) => { if (seenDeliveries.has(id)) return true; seenDeliveries.add(id); return false; },
};
const clinicianRoutes = nodeAdapter(createRoutes(tf, hooks, { prefix: '/24t' }));
const patientRoutes = nodeAdapter(createRoutes(tf, {
  currentPatient: (req) => { const u = user(req.headers); if (!u || u.role !== 'patient') return null; const [subject, patient_user_ref] = u.ref.split('|'); return { subject, patient_user_ref }; },
  authorizePatientSession: () => true,
}, { role: 'patient', prefix: '/24t-patient' }));

const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
const body = async (req) => { let b = ''; for await (const c of req) b += c; return b ? JSON.parse(b) : {}; };
const err = (e) => e instanceof TwentyFourError ? { status: e.status, code: e.code, type: e.type, message: e.message, request_id: e.requestId, retry_after: e.retryAfter } : { error: e.name, message: e.message };
const api = (base, p) => fetch(`${tf.apiBase}${p}`, { headers: { Authorization: `Bearer ${process.env.TWENTYFOUR_API_KEY}` } }); // memory: no kit method

const STATIC = { '/': 'base/web/therapist.html', '/patient': 'base/web/patient.html', '/vendor/24therapy-browser-0.6.1.iife.js': 'vendor/24therapy-browser-0.6.1.iife.js' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), p = url.pathname, me = user(req.headers);
  try {
    if (p.startsWith('/24t-patient/')) return patientRoutes(req, res);
    if (p.startsWith('/24t/')) return clinicianRoutes(req, res);
    const file = STATIC[p] || (p.startsWith('/static/') && `base/web/${path.basename(p)}`);
    if (file && existsSync(path.join(ROOT, file))) return send(res, 200, readFileSync(path.join(ROOT, file)), MIME[path.extname(file)] || 'text/plain');
    if (p === '/config') return send(res, 200, { slug: P.slug, name: P.name, provider: PROVIDER, colours: { primary: P.primary, ink: P.ink, surface: P.surface }, logo: P.logo, patientRecorder: PROVIDER === 'zoom' });
    if (p === '/login' && req.method === 'POST') { const b = await body(req); res.setHeader('Set-Cookie', `demo_user=${encodeURIComponent(sign(`${b.role}:${b.ref}`))}; HttpOnly; SameSite=Lax; Path=/`); return send(res, 200, { ok: true }); }
    if (p.startsWith('/api/signal/')) { const room = p.split('/')[3], q = signals.get(room) || []; signals.set(room, q);
      if (req.method === 'POST') { q.push({ ...(await body(req)), n: q.length + 1 }); return send(res, 200, { ok: true }); }
      return send(res, 200, { messages: q.filter((m) => m.n > Number(url.searchParams.get('since') || 0)) }); }
    if (!me) return send(res, 401, { error: 'sign_in' });
    if (p === '/api/start' && req.method === 'POST') {
      const b = await body(req);
      await tf.putClinician(me.ref, { label: `${P.name} therapist`, copilot_enabled: true });
      const subject = await tf.createSubject({ external_ref: b.patient_ref, adult_confirmed: true, locale: 'ar' });
      const s = await tf.createSession({ external_ref: `S-${P.slug}-${Date.now()}`, subject: subject.id, clinician: me.ref, language_hint: 'ar', note_format: 'soap', dialect: 'ar-EG', memory: true });
      subjects.set(s.id, subject.id);
      return send(res, 201, { session: s.id, subject: subject.id, created_at: s.created_at, status: s.status, patient_consent_url: s.patient_consent_url, room: s.id });
    }
    if (p.startsWith('/api/room/')) { const room = p.split('/')[3];
      const t = await (await fetch(`http://127.0.0.1:${process.env.VIDEO_TOKEN_PORT || 4000}/token?provider=${PROVIDER}&room=${room}&role=${me.role}`)).json(); return send(res, 200, t); }
    let m;
    if ((m = p.match(/^\/api\/sessions\/(ses_[0-9a-f]{32})\/(segments|end|overview|note\/approve|summary\/approve)$/))) {
      const [, id, what] = m;
      if (what === 'segments') return send(res, 200, await tf.sendSegments(id, (await body(req)).segments));
      if (what === 'end') return send(res, 200, await tf.endSession(id));
      if (what === 'overview') {
        const [session, note, summary, alerts, transcript] = await Promise.all([tf.getSession(id), tf.getNote(id).catch(err), tf.getSummary(id).catch(err), tf.listRiskAlerts({ session: id }), api(0, `/sessions/${id}/transcript`).then((r) => r.json())]);
        return send(res, 200, { session, note, summary, alerts, transcript, record: note && note.status === 'approved' ? noteForRecord(note, summary && summary.status === 'delivered' ? summary : null) : null });
      }
      if (what === 'note/approve') { const n = await tf.getNote(id); const sections = Object.fromEntries(Object.entries(n.draft.sections).map(([k, v]) => [k, v || '—']));
        return send(res, 200, await tf.approveNote(id, { approved_by: me.ref, sections })); }
      if (what === 'summary/approve') { const s = await tf.getSummary(id); return send(res, 200, await tf.approveSummary(id, { approved_by: me.ref, text: [s.draft.brief, ...(s.draft.steps || []), s.draft.next].filter(Boolean).join('\n') })); }
    }
    if ((m = p.match(/^\/api\/risk\/(alr_[0-9a-f]{32})\/ack$/))) { await tf.getRiskAlert(m[1]);
      return send(res, 200, await tf.acknowledgeRiskAlert(m[1], { by: me.ref, note: 'Reviewed with the patient in session; safety plan agreed (invented test).', outcome: 'patient_contacted_plan_made' })); }
    if ((m = p.match(/^\/api\/subjects\/(sub_[0-9a-f]{32})\/memory$/))) return send(res, 200, await (await api(0, `/subjects/${m[1]}/memory?clinician=${encodeURIComponent(me.ref)}`)).json());
    if (p === '/api/copilot') { const b = await body(req);
      const r = await fetch(`${tf.apiBase}/copilot/questions`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.TWENTYFOUR_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ subject: b.subject, clinician: me.ref, question: b.question, session: b.session }) });
      return send(res, r.status, await r.json()); }
    if (p === '/api/usage') return send(res, 200, await tf.getUsage());
    if (p === '/api/events') return send(res, 200, { events });
    if (p === '/api/errors') { const out = {};
      try { await tf.getSession('not-an-id'); } catch (e) { out.bad_id = { error: e.name, message: e.message }; }
      try { await tf.getSession('ses_' + '0'.repeat(32)); } catch (e) { out.unknown = err(e); }
      try { await new TwentyFour({ apiKey: '24t_sk_test_' + 'x'.repeat(43) }).ping(); } catch (e) { out.bad_key = err(e); }
      return send(res, 200, out); }
    send(res, 404, { error: 'not_found' });
  } catch (e) { send(res, e.status || 500, err(e)); }
}).listen(PORT, () => console.log(`${P.name} on http://localhost:${PORT} (${PROVIDER})`));
