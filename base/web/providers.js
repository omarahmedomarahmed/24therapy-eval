// One join() per video provider. Each returns { localTrack(), remoteTrack(), leave() } so the
// 24Therapy browser kit's adapters get MediaStreamTracks the same way for every provider.
const Providers = (() => {
  const K = () => window.TwentyFourBrowser;
  const load = (src) => new Promise((ok, no) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('could not load ' + src)); document.head.appendChild(s); });
  const show = (el, track) => { if (el && track) el.srcObject = new MediaStream([track]); };
  const mic = () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: { width: 320, height: 240 } });

  async function local(localEl) { const m = await mic(); localEl.srcObject = m; return { localTrack: () => m.getAudioTracks()[0], remoteTrack: () => null, leave: () => m.getTracks().forEach(t => t.stop()) }; }

  // Plain WebRTC: two peers, signalling through the platform's own server (polling).
  async function webrtc(join, localEl, remoteEl, role) {
    const m = await mic(); localEl.srcObject = m;
    const pc = new RTCPeerConnection({ iceServers: join.iceServers || [] });
    m.getTracks().forEach(t => pc.addTrack(t, m));
    pc.ontrack = (e) => { remoteEl.srcObject = e.streams[0]; };
    const url = '/api/signal/' + join.room; let since = 0, done = false;
    const send = (msg) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: role, ...msg }) });
    pc.onicecandidate = (e) => e.candidate && send({ type: 'ice', candidate: e.candidate });
    const poll = async () => { while (!done) { const r = await (await fetch(url + '?since=' + since)).json(); for (const msg of r.messages) { since = msg.n; if (msg.from === role) continue;
        if (msg.type === 'hello' && role === 'therapist') { const o = await pc.createOffer(); await pc.setLocalDescription(o); send({ type: 'sdp', sdp: o }); }
        else if (msg.type === 'sdp') { await pc.setRemoteDescription(msg.sdp); if (msg.sdp.type === 'offer') { const a = await pc.createAnswer(); await pc.setLocalDescription(a); send({ type: 'sdp', sdp: a }); } }
        else if (msg.type === 'ice') { try { await pc.addIceCandidate(msg.candidate); } catch {} } }
      await new Promise(r => setTimeout(r, 700)); } };
    poll(); if (role === 'patient') send({ type: 'hello' });
    return { pc, localTrack: () => K().webrtcLocalAudio(pc), remoteTrack: () => K().webrtcRemoteAudio(pc), leave: () => { done = true; pc.close(); m.getTracks().forEach(t => t.stop()); } };
  }

  // Daily: room and meeting token made on the server with the Daily REST API.
  async function daily(join, localEl, remoteEl) {
    await load('https://unpkg.com/@daily-co/daily-js@0.95.0/dist/daily.js');
    const call = window.DailyIframe.createCallObject({ audioSource: true, videoSource: true });
    call.on('track-started', (e) => { if (e.participant && !e.participant.local && e.track.kind === 'video') show(remoteEl, e.track); if (e.participant && e.participant.local && e.track.kind === 'video') show(localEl, e.track); });
    await call.join({ url: join.url, token: join.token });
    const other = () => Object.values(call.participants()).find(p => !p.local);
    return { localTrack: () => K().dailyTrack(call.participants().local), remoteTrack: () => K().dailyTrack(other()), leave: () => call.leave() };
  }

  // Vonage Video API (OpenTok.js): session id and token made on the server.
  async function vonage(join, localEl, remoteEl) {
    await load('https://static.opentok.com/v2/js/opentok.min.js');
    const OT = window.OT; const session = OT.initSession(join.applicationId || join.apiKey, join.sessionId);
    let remoteAudio = () => null;
    const publisher = OT.initPublisher(document.createElement('div'), { insertDefaultUI: false });
    publisher.on('videoElementCreated', (e) => { localEl.replaceWith(e.element); });
    session.on('streamCreated', (e) => { const sub = session.subscribe(e.stream, document.createElement('div'), { insertDefaultUI: false });
      remoteAudio = K().vonageSubscriberAudio(sub); sub.on('videoElementCreated', (v) => remoteEl.replaceWith(v.element)); });
    await new Promise((ok, no) => session.connect(join.token, (err) => err ? no(err) : session.publish(publisher, (e2) => e2 ? no(e2) : ok())));
    return { localTrack: () => K().vonagePublisherTrack(publisher), remoteTrack: () => remoteAudio(), leave: () => session.disconnect() };
  }

  // Agora Web SDK 4.x: RTC token built on the server with the app certificate.
  async function agora(join, localEl, remoteEl) {
    await load('https://cdn.jsdelivr.net/npm/agora-rtc-sdk-ng@4.24.10/AgoraRTC_N-production.js');
    const A = window.AgoraRTC; const client = A.createClient({ mode: 'rtc', codec: 'vp8' });
    if (join.cloudProxy) client.startProxyServer(join.cloudProxy); // TCP/TLS 443 when UDP is blocked
    client.on('user-published', async (user, kind) => { await client.subscribe(user, kind); if (kind === 'video') user.videoTrack.play(remoteEl.parentElement); if (kind === 'audio') user.audioTrack.play(); });
    await client.join(join.appId, join.channel, join.token, join.uid);
    const [micT, camT] = await A.createMicrophoneAndCameraTracks();
    show(localEl, camT.getMediaStreamTrack()); await client.publish([micT, camT]);
    return { localTrack: () => K().agoraTrack(micT), remoteTrack: () => K().agoraRemoteAudio(client), leave: () => { micT.close(); camT.close(); client.leave(); } };
  }

  // Zoom Video SDK for web: JWT signed on the server. The web SDK does not expose the remote
  // audio, so each browser records its own microphone (docs: /docs/video/zoom#two-browsers).
  async function zoom(join, localEl) {
    if (join.blocked) throw new Error(join.blocked);
    await load('https://source.zoom.us/videosdk/zoom-video-1.12.0.min.js');
    const client = window.WebVideoSDK.default.createClient(); await client.init('en-US', 'Global', { patchJsMedia: true });
    await client.join(join.topic, join.signature, join.userName); const stream = client.getMediaStream(); await stream.startAudio();
    let mine = null; const t = await K().zoomMicrophoneTrack(stream); mine = t;
    return { localTrack: () => mine, remoteTrack: () => null, leave: () => { mine && mine.stop(); client.leave(); } };
  }
  return { webrtc, daily, vonage, agora, zoom, local };
})();
