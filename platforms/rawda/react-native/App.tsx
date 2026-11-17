// Rawda Space therapist screen (React Native, docs' no-kit steps). Plain WebRTC by default.
import React, { useState } from 'react';
import { I18nManager, Linking, Pressable, SafeAreaView, Text, TextInput, View } from 'react-native';
import { cut, pcmOf, sendPiece } from './rawda-core.mjs';
import { AUDIO_B64 } from './audio';
I18nManager.allowRTL(true);
const C = { primary: '#2F9E6E', ink: '#0D3324', surface: '#EFFAF4' };
const bytes = () => Uint8Array.from(atob(AUDIO_B64), (c) => c.charCodeAt(0));
export default function App() {
  const [server, setServer] = useState('http://10.0.2.2:3070'); const [status, setStatus] = useState('—'); const [s, setS] = useState<any>(null); const [cookie, setCookie] = useState(''); const [sent, setSent] = useState(0);
  const call = async (path: string, body?: object) => { const r = await fetch(`${server}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const c = r.headers.get('set-cookie'); if (c) setCookie(c.split(';')[0]); const j = await r.json(); if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j)}`); return j; };
  const start = async () => { try { await call('/login', { role: 'therapist', ref: 'C-RAWDA-1' }); const x = await call('/api/start', { patient_ref: `P-RAWDA-${Date.now()}` }); setS(x); setStatus('awaiting consent'); } catch (e: any) { setStatus('error: ' + e.message); } };
  const feed = async () => { if (!s) return setStatus('start first');
    let c = await call(`/24t/sessions/${s.session}/consent-state`);
    while (!c.record) { if (c.stop) return setStatus('stopped'); setStatus("waiting for the patient's yes"); await new Promise((r) => setTimeout(r, 5000)); c = await call(`/24t/sessions/${s.session}/consent-state`); }
    for (const p of cut(pcmOf(bytes()), c.session_seconds ?? c.recording_from_seconds ?? 0)) { let a = await sendPiece(server, s.session, p, 'clinician', cookie);
      for (let t = 0; t < 4 && (a.status === 429 || a.status >= 500 || a.status === 0); t++) { await new Promise((r) => setTimeout(r, (a.retryAfter || 2 ** t) * 1000)); a = await sendPiece(server, s.session, p, 'clinician', cookie); }
      if (a.status === 403 || a.status === 409) return setStatus(`relay ${a.status}: stop`); setSent((n) => n + 1); setStatus(`piece @${Math.round(p.start)}s → ${a.status}`); } };
  const end = async () => { if (s) setStatus('ended · ' + (await call(`/api/sessions/${s.session}/end`, {})).status); };
  const B = ({ t, f, id }: any) => <Pressable testID={id} accessibilityLabel={id} onPress={f} style={{ backgroundColor: C.primary, padding: 12, borderRadius: 8, marginTop: 8 }}><Text style={{ color: '#fff', textAlign: 'center' }}>{t}</Text></Pressable>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: C.surface }}>
    <View style={{ backgroundColor: C.primary, padding: 16 }}><Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>⚛ Rawda Space · روضة</Text></View>
    <View style={{ padding: 16 }}>
      <TextInput testID="server" value={server} onChangeText={setServer} style={{ borderWidth: 1, borderColor: C.primary, padding: 8, color: C.ink }} />
      <B id="start" t="ابدأ الجلسة · Start session" f={start} />
      <B id="consent" t="صفحة الموافقة · Consent page" f={() => s && Linking.openURL(s.patient_consent_url)} />
      <B id="feed" t="Feed bundled audio (no-kit pieces)" f={feed} />
      <B id="end" t="إنهاء · End" f={end} />
      <Text testID="status" style={{ color: C.ink, marginTop: 12 }}>{status}</Text><Text style={{ color: C.ink }}>pieces sent: {sent}</Text>
    </View></SafeAreaView>;
}
