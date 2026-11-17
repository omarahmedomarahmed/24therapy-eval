// One matrix cell: platform x provider, a full invented session through the platform's own
// server kit, recorded as numbered steps (steps.json), WebP screenshots and a short video.
// usage: node tools/run-cell.mjs <slug> <provider>
import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [slug, provider] = process.argv.slice(2);
const P = JSON.parse(fs.readFileSync(`${ROOT}/base/platforms.json`)).find((x) => x.slug === slug);
const KEY = process.env[`P${P.n}_API_KEY`], PORT = P.port, ORIGIN = `http://localhost:${PORT}`, VT = 4000 + P.n;
const OUT = `${ROOT}/evals/${slug}/${provider}`; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
try { execFileSync('bash', ['-c', `fuser -k ${PORT}/tcp ${4000 + P.n}/tcp 2>/dev/null; true`]); } catch {}
const SERVER = { node: ['node', ['servers/node/server.mjs']], python: ['python3', ['servers/python/server.py']], php: ['php', ['-S', `localhost:${PORT}`, 'servers/php/index.php']],
  dotnet: ['dotnet', ['run', '--no-build', '--project', 'servers/dotnet']], java: ['java', ['-cp', 'servers/java/out', 'Server']] }[P.server];
const AUDIO = `${ROOT}/base/scenario/session-ar.wav`;
const SECRET_RE = /(24t_sk_(test|live)_[A-Za-z0-9_-]+|whsec_[A-Za-z0-9_-]+|wgt_[A-Za-z0-9_-]+|plk_[A-Za-z0-9_-]+|#token=[^"'\s]+|\/p\/[A-Za-z0-9_-]{20,})/g;
const scrub = (v) => JSON.parse(JSON.stringify(v ?? null).replace(SECRET_RE, (m) => m.slice(0, Math.min(m.length, m.startsWith('/p/') ? 3 : m.indexOf('_', 4) + 1 || 3)) + '••'));
const procs = [], steps = []; let t0 = Date.now(), n = 0, first = null;
const log = (...a) => console.log(`[${slug}/${provider}]`, ...a);
function run(cmd, args, env, tag) { const c = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true }); procs.push(c);
  let buf = ''; const on = (d) => { buf += d; fs.appendFileSync(`${OUT}/.${tag}.log`, String(d).replace(SECRET_RE, '••')); }; c.stdout.on('data', on); c.stderr.on('data', on); return { c, out: () => buf }; }
const wait = async (fn, ms = 60000, every = 1000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = e; } await new Promise((r) => setTimeout(r, every)); } throw new Error('timeout' + (last instanceof Error ? ': ' + last.message : '')); };
async function webp(png) { const w = png.replace(/\.png$/, '.webp'); execFileSync('python3', ['-I', '-c', `from PIL import Image;im=Image.open('${png}');im.thumbnail((1280,1280));q=70\nwhile True:\n im.save('${w}','WEBP',quality=q)\n import os\n if os.path.getsize('${w}')<300000 or q<30: break\n q-=10`]); fs.unlinkSync(png); return path.basename(w); }
async function step(title, code, result, page, ok = true) {
  n++; let shot = null;
  if (page) { await page.evaluate(() => { const re = /(24t_sk_[A-Za-z0-9_-]+|whsec_[A-Za-z0-9_-]+|plk_[A-Za-z0-9_-]+)/g; const w = document.createTreeWalker(document.body, 4); let x; while ((x = w.nextNode())) x.nodeValue = x.nodeValue.replace(re, '••'); }).catch(() => {});
    const f = `${OUT}/${String(n).padStart(2, '0')}.png`; await page.screenshot({ path: f }); shot = await webp(f); }
  const s = { step: n, title, code: typeof code === 'string' ? code : scrub(code), screenshot: shot, result: scrub(result), ok, seconds: +((Date.now() - t0) / 1000).toFixed(1) };
  steps.push(s); t0 = Date.now(); log(n, title, ok ? 'ok' : 'FAIL', JSON.stringify(s.result).slice(0, 160)); fs.writeFileSync(`${OUT}/steps.json`, JSON.stringify({ platform: slug, provider, server: P.server, steps }, null, 2)); return s;
}
const started = Date.now(); let verdict = 'fail', reason = '';
try {
  // 1. Webhooks with no tunnel: 24t listen forwards to our kit's /24t/webhooks route.
  const listen = run('node', ['vendor/24t.mjs', 'listen', '--forward-to', `${ORIGIN}/24t/webhooks`], { TWENTYFOUR_KEY: KEY }, 'listen');
  const secret = await wait(() => (listen.out().match(/whsec_[A-Za-z0-9_-]+/) || [])[0], 30000, 300);
  await step('Open a webhook listen session (24t listen)', `node 24t.mjs listen --forward-to ${ORIGIN}/24t/webhooks`, 'signing secret printed (kept in the server env only)');
  run('node', ['base/video/server.mjs'], { VIDEO_TOKEN_PORT: String(VT) }, 'video');
  const srv = run(SERVER[0], SERVER[1], { PLATFORM: slug, PORT: String(PORT), VIDEO_PROVIDER: provider, VIDEO_TOKEN_PORT: String(VT), TWENTYFOUR_API_KEY: KEY, TWENTYFOUR_WEBHOOK_SECRET: secret, TWENTYFOUR_WIDGET_ORIGIN: ORIGIN }, 'server');
  await wait(async () => (await fetch(`${ORIGIN}/config`)).ok, 240000, 1000);
  const cfgNow = await (await fetch(`${ORIGIN}/config`)).json(); if (cfgNow.provider !== provider) throw new Error(`server reports provider ${cfgNow.provider}, expected ${provider} (stale server on the port?)`);
  await step(`Start the ${P.server} server with VIDEO_PROVIDER=${provider}`, `${SERVER[0]} ${SERVER[1].join(' ')}`, await (await fetch(`${ORIGIN}/config`)).json());
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${AUDIO}`, '--autoplay-policy=no-user-gesture-required'] });
  const tc = await b.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: OUT, size: { width: 1280, height: 800 } } }); await tc.grantPermissions(['microphone', 'camera']);
  const pc = await b.newContext({ viewport: { width: 900, height: 700 } }); await pc.grantPermissions(['microphone', 'camera']);
  const th = await tc.newPage(), pa = await pc.newPage();
  th.on('console', (m) => fs.appendFileSync(`${OUT}/.browser.log`, m.text().replace(SECRET_RE, '••') + '\n'));
  await th.goto(ORIGIN + '/'); await th.waitForFunction(() => document.title && document.title !== 'Therapist room');
  await step('Therapist opens the room in the platform colours', `GET ${ORIGIN}/`, { title: await th.title() }, th);
  await th.click('#start'); const s = await wait(() => th.evaluate(() => window.__session), 30000, 300);
  await step('Start the session (subject + session through the server kit)', 'POST /api/start -> putClinician, createSubject, createSession', { session: s.session, status: s.status }, th);
  // Patient: consent page, then the room.
  await pa.goto(s.patient_consent_url, { waitUntil: 'networkidle' });
  await step('Patient opens the consent page', 'patient_consent_url (link hidden)', (await pa.innerText('body')).split('\n').filter(Boolean).slice(1, 3), pa);
  await pa.check('input[name=adult]').catch(() => {}); await pa.click('button[name=answer][value=yes], button[name=answer]:has-text("نعم")');
  await pa.waitForLoadState('networkidle');
  await step('Patient says yes', 'click نعم (yes)', (await pa.innerText('body')).split('\n').filter(Boolean).slice(0, 3), pa);
  await pa.goto(`${ORIGIN}/patient?session=${s.session}&subject=${s.subject}`); await pa.waitForTimeout(1500);
  const rec = await wait(() => th.evaluate(() => window.__rec === 'recording' && window.__rec), 60000, 500).catch(() => null);
  const videoErr = await th.evaluate(() => window.__videoError || null); const patVideoErr = await pa.evaluate(() => window.__videoError || null);
  const joined = await wait(() => th.evaluate(() => !!document.getElementById('remote')?.srcObject || !!document.querySelector('.videos video:not(#local)')?.srcObject), 20000, 500).catch(() => false);
  await step('Both join the call; the recorder sees consent and records', `Providers.${provider}.join + createRecorder`, { recorder: rec, remote_video: joined, video_error: videoErr || patVideoErr }, th, !!rec && !videoErr);
  if (videoErr && /blocked/.test(videoErr)) { verdict = 'blocked'; reason = videoErr; throw new Error(videoErr); }
  const widgetReady = await wait(() => th.evaluate(() => window.__widgetReady), 30000, 500).catch(() => false);
  await step('Therapist widget in the call (live transcript)', "K.mount(el, { launch: K.widgetLauncher('/24t', { view: 'session', session }) })", { ready: !!widgetReady }, th, !!widgetReady);
  await th.waitForTimeout(25000);
  const pieces = await th.evaluate(() => window.__pieces || []);
  await step('Audio pieces of both speakers relayed through POST /24t/sessions/{id}/audio', 'recorder -> kit relay -> POST /sessions/{id}/audio', pieces.map((p) => ({ speaker: p.speaker, outcome: p.outcome, status: p.status, code: p.code })), th, pieces.some((p) => p.outcome === 'sent' && p.speaker === 'clinician') && (provider === 'zoom' || pieces.some((p) => p.outcome === 'sent' && p.speaker === 'patient')));
  const lines = JSON.parse(fs.readFileSync(`${ROOT}/base/scenario/risk-lines.json`));
  const seg = await th.evaluate(async ([id, l]) => App.j(`/api/sessions/${id}/segments`, { segments: l }), [s.session, lines.segments.map((x, i) => ({ ...x, start_seconds: 60 + i * 8, end_seconds: 66 + i * 8 }))]);
  await step('Send the two invented risk lines (Egyptian Arabic and Franco) as segments', lines.segments, seg, null);
  const ov1 = await wait(async () => { const o = await th.evaluate((id) => App.j(`/api/sessions/${id}/overview`), s.session); return o.alerts.data.length && o; }, 60000, 2000);
  const alert = ov1.alerts.data[0];
  const ev1 = await wait(async () => { const e = await th.evaluate(() => App.j('/api/events')); return e.events.some((x) => x.type.startsWith('risk.alert')) && e; }, 45000, 1500).catch(() => th.evaluate(() => App.j('/api/events')));
  await step('Risk alert raised; risk.alert.created webhook verified by the kit', 'GET /risk-alerts?session=  +  POST /24t/webhooks', { alert: { level: alert.level, status: alert.status }, webhooks: ev1.events.map((e) => e.type) }, th, ev1.events.some((e) => e.type.startsWith('risk.alert')));
  await th.click('#end'); const ended = await wait(() => th.evaluate(() => window.__ended), 60000, 500);
  await step('End the session', 'recorder.stop(); POST /api/sessions/{id}/end -> endSession (Idempotency-Key end-<id>)', ended, th);
  const draft = await wait(async () => { const o = await th.evaluate((id) => App.j(`/api/sessions/${id}/overview`), s.session); return o.note && o.note.status === 'draft' && o; }, 120000, 3000);
  const ev2 = await th.evaluate(() => App.j('/api/events'));
  await step('Note draft ready (note.draft_ready)', 'GET /sessions/{id}/note', { status: draft.note.status, format: draft.note.format, sections: Object.keys(draft.note.draft.sections), transcript_segments: (draft.transcript.segments || draft.transcript.data || []).length, webhooks: ev2.events.map((e) => e.type) }, th);
  const approved = await th.evaluate((id) => App.j(`/api/sessions/${id}/note/approve`, {}), s.session);
  first = first || (Date.now() - started) / 1000;
  await step('Clinician approves the note', 'approveNote(id, { approved_by, sections })', { status: approved.status, approved_by: approved.approved_by }, th, approved.status === 'approved');
  const ack = await th.evaluate((id) => App.j(`/api/risk/${id}/ack`, {}), alert.id).catch((e) => ({ error: e.message, body: e.body }));
  await step('Acknowledge the risk alert (read first, then acknowledge)', "getRiskAlert(id); acknowledgeRiskAlert(id, { by, note, outcome: 'patient_contacted_plan_made' })", { status: ack.status, error: ack.error, body: ack.body }, th, !ack.error);
  const sum = await wait(async () => { const o = await th.evaluate((id) => App.j(`/api/sessions/${id}/overview`), s.session); return o.summary && !o.summary.code && /draft|ready/.test(o.summary.status) && o.summary; }, 90000, 3000).catch((e) => ({ error: e.message }));
  let sumOk = false, sa = sum;
  if (!sum.error) { sa = await th.evaluate((id) => App.j(`/api/sessions/${id}/summary/approve`, {}), s.session).catch((e) => ({ error: e.message, body: e.body })); sumOk = !sa.error; }
  await step('Patient summary: draft, approve, deliver (after the alert is acknowledged)', 'getSummary + approveSummary(id, { approved_by, text })', { draft_status: sum.status || sum.error, approved: sa.status || sa.error, body: sa.body }, th, sumOk);
  const mem = await wait(async () => { const m = await th.evaluate((id) => App.j(`/api/subjects/${id}/memory`), s.subject); return m && !m.code && m; }, 60000, 4000).catch((e) => ({ error: e.message }));
  const cop = await th.evaluate(([sub, ses]) => App.j('/api/copilot', { subject: sub, session: ses, question: 'ما الذي اتفقنا عليه بخصوص النوم؟' }), [s.subject, s.session]).catch((e) => ({ error: e.message, body: e.body }));
  await step('Memory and copilot (raw HTTPS: the kit has no method)', 'GET /subjects/{id}/memory?clinician=  +  POST /copilot/questions', { memory: mem.error || mem.object || Object.keys(mem).slice(0, 5), copilot: cop.error ? { error: cop.error, body: cop.body } : { answer: String(cop.answer || cop.text || '').slice(0, 160), citations: (cop.citations || []).length } }, th, !mem.error && !cop.error && !!(cop.answer || cop.refused));
  const usage = await th.evaluate(() => App.j('/api/usage')); const errs = await th.evaluate(() => App.j('/api/errors'));
  await step('Usage and error handling', 'getUsage(); getSession(bad id); getSession(unknown); ping(bad key)', { usage, errors: errs }, null, !!errs.unknown && errs.unknown.status === 404);
  const evs = (await th.evaluate(() => App.j('/api/events'))).events.map((e) => e.type);
  await step('Webhooks received and verified during the session', 'verifyWebhook in the kit route', [...new Set(evs)], th);
  verdict = steps.every((x) => x.ok) ? 'pass' : 'partial'; reason = steps.filter((x) => !x.ok).map((x) => x.title).join('; ');
  await tc.close(); await pc.close(); await b.close();
} catch (e) { if (verdict !== 'blocked') { verdict = 'fail'; reason = String(e.message).replace(SECRET_RE, '••').slice(0, 300); } log('stopped:', reason); }
finally {
  for (const c of procs) try { process.kill(-c.pid, 'SIGINT'); } catch { try { c.kill('SIGINT'); } catch {} }
  const vids = fs.readdirSync(OUT).filter((f) => f.endsWith('.webm') && !f.startsWith('recording'));
  if (vids.length) { try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${OUT}/${vids[0]}`, '-vf', 'scale=640:-2', '-c:v', 'libvpx-vp9', '-b:v', '250k', '-an', `${OUT}/recording.webm`]); } catch {} vids.forEach((v) => fs.unlinkSync(`${OUT}/${v}`)); }
  const result = { platform: slug, provider, server: P.server, verdict, reason, first_session_seconds: first, total_seconds: (Date.now() - started) / 1000, steps };
  fs.writeFileSync(`${OUT}/steps.json`, JSON.stringify(result, null, 2)); log('VERDICT', verdict, reason); setTimeout(() => process.exit(0), 1500);
}
