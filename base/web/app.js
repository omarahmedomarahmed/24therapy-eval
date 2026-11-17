// Shared teletherapy base: one room, two roles, any provider. The 24Therapy key never reaches the page.
const App = (() => {
  const $ = (id) => document.getElementById(id);
  const j = async (url, body, method) => { const r = await fetch(url, { method: method || (body ? 'POST' : 'GET'), headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' }); const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = { raw: t }; } if (!r.ok) throw Object.assign(new Error(typeof (d.error || d.message) === 'string' ? (d.error || d.message) : JSON.stringify(d).slice(0, 300) || r.status), { status: r.status, body: d }); return d; };
  const status = (s) => { $('status').textContent = s; console.log('[status]', s); };
  let cfg;
  async function theme() {
    cfg = await j('/config');
    const r = document.documentElement.style; r.setProperty('--primary', cfg.colours.primary); r.setProperty('--ink', cfg.colours.ink); r.setProperty('--surface', cfg.colours.surface);
    $('logo').src = cfg.logo; $('pname').textContent = cfg.name; $('prov').textContent = cfg.provider; document.title = cfg.name;
  }
  async function therapist() {
    await theme(); await j('/login', { role: 'therapist', ref: 'C-' + cfg.slug.toUpperCase() + '-1' });
    const K = window.TwentyFourBrowser; let s, call, recorder;
    $('start').onclick = async () => {
      $('start').disabled = true;
      s = await j('/api/start', { patient_ref: new URLSearchParams(location.search).get('patient') || ('P-' + cfg.slug.toUpperCase() + '-' + Date.now()) });
      window.__session = s; status('session ' + s.session + ' · awaiting consent');
      $('patientlink').dataset.url = s.patient_consent_url; $('patientlink').textContent = 'Consent page sent to the patient (link hidden).';
      const join = await j('/api/room/' + s.session);
      try { if (join.blocked) throw new Error(join.blocked); call = await Providers[cfg.provider](join, $('local'), $('remote'), 'therapist'); status('in call · ' + cfg.provider); }
      catch (e) { status('video failed: ' + e.message); window.__videoError = String(e.message || e); call = await Providers.local($('local')); }
      recorder = K.createRecorder({ relay: '/24t', session: s.session, openedAt: s.created_at, pieceSeconds: 10,
        tracks: { clinician: () => call.localTrack(), patient: () => call.remoteTrack() },
        onState: (st, d) => { $('rec').textContent = 'recorder: ' + st + ' (' + d.reason + ')'; window.__rec = st; },
        onPiece: (p) => { (window.__pieces = window.__pieces || []).push(p); $('rec').textContent += ' · piece ' + p.speaker + ' ' + p.outcome; },
        onNotesPaused: ({ code }) => status('notes paused: ' + code), onError: (e) => console.warn('rec', e) });
      await recorder.start(); window.__recorder = recorder;
      window.__widget = K.mount($('twentyfour-widget'), { launch: K.widgetLauncher('/24t', { view: 'session', session: s.session, locale: 'ar' }), locale: 'ar', part: 'session', height: '560px',
        onReady: () => { window.__widgetReady = true; }, onClosed: (r) => { window.__widgetClosed = r; }, onEvent: (ev) => { (window.__widgetEvents = window.__widgetEvents || []).push(ev); } });
      $('end').disabled = false;
    };
    $('end').onclick = async () => { $('end').disabled = true; await recorder.stop(); const e = await j('/api/sessions/' + s.session + '/end', {}); status('ended · ' + e.status); call && call.leave && call.leave(); window.__ended = e; };
  }
  async function patient() {
    await theme(); const q = new URLSearchParams(location.search); const session = q.get('session');
    await j('/login', { role: 'patient', ref: q.get('subject') + '|U-' + cfg.slug + '-patient' });
    const join = await j('/api/room/' + session);
    try { if (join.blocked) throw new Error(join.blocked); const call = await Providers[cfg.provider](join, $('local'), $('remote'), 'patient'); window.__call = call; status('in call · ' + cfg.provider);
      if (cfg.patientRecorder) { // Zoom web: the patient's own page records the patient's microphone (docs: /docs/video/zoom#two-browsers)
        const K = window.TwentyFourBrowser; window.__recorder = K.createRecorder({ relay: '/24t-patient', session, tracks: { patient: () => call.localTrack() } }); await window.__recorder.start(); }
    } catch (e) { status('video failed: ' + e.message); window.__videoError = String(e.message || e); }
  }
  return { therapist, patient, j };
})();
