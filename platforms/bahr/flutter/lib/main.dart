// Bahr Mind (slug bahr): the therapist's one screen on the base server (base/CONTRACT.md),
// recorded with the 24Therapy Flutter kit. Invented users and invented audio only.
//
// Video provider: --dart-define=VIDEO_PROVIDER=zoom|vonage|agora (default zoom, as the
// platform). When the server's room answer is {blocked: ...}, the provider join is skipped,
// and consent polling plus the bundled audio still run through the kit's generic PCM input.

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:agora_rtc_engine/agora_rtc_engine.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:material_ui/material_ui.dart';
import 'package:twentyfour_agora_kit/twentyfour_agora_kit.dart';

const String videoProvider = String.fromEnvironment('VIDEO_PROVIDER', defaultValue: 'zoom');

const Color bahrPrimary = Color(0xFF02569B);
const Color bahrInk = Color(0xFF04223D);
const Color bahrSurface = Color(0xFFEEF6FD);

void main() => runApp(const BahrApp());

class BahrApp extends StatelessWidget {
  const BahrApp({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = ColorScheme.fromSeed(seedColor: bahrPrimary).copyWith(primary: bahrPrimary, onSurface: bahrInk, surface: bahrSurface);
    return MaterialApp(
      title: 'Bahr Mind',
      debugShowCheckedModeBanner: false,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      theme: ThemeData(colorScheme: scheme, scaffoldBackgroundColor: bahrSurface),
      home: const CallScreen(),
    );
  }
}

/// A small JSON client for the base server, holding the demo_user cookie.
class BaseServer {
  BaseServer(this.base);
  final String base;
  String? cookie; // "demo_user=..." only; never logged
  final HttpClient _http = HttpClient()..connectionTimeout = const Duration(seconds: 10);

  Future<(int, Object?)> call(String method, String path, [Object? body]) async {
    final req = await _http.openUrl(method, Uri.parse('$base$path')).timeout(const Duration(seconds: 15));
    req.followRedirects = false;
    req.headers.set('Accept', 'application/json');
    if (cookie != null) req.headers.set('Cookie', cookie!);
    if (body != null) {
      final bytes = utf8.encode(jsonEncode(body));
      req.headers.contentType = ContentType.json;
      req.contentLength = bytes.length;
      req.add(bytes);
    }
    final res = await req.close().timeout(const Duration(seconds: 60));
    for (final c in res.headers[HttpHeaders.setCookieHeader] ?? const <String>[]) {
      final pair = c.split(';').first.trim();
      if (pair.startsWith('demo_user=')) cookie = pair;
    }
    final text = await utf8.decodeStream(res);
    Object? json;
    try {
      json = text.isEmpty ? null : jsonDecode(text);
    } on FormatException {
      json = text;
    }
    return (res.statusCode, json);
  }
}

class CallScreen extends StatefulWidget {
  const CallScreen({super.key});

  @override
  State<CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends State<CallScreen> {
  final _base = TextEditingController(text: 'http://10.0.2.2:3060');
  final List<String> _log = [];
  BaseServer? _server;
  String? _session;
  String? _consentUrl;
  String? _blocked;
  CaptureSession? _capture;
  String _captureState = '-';
  bool _busy = false;

  // Provider side (only Agora joins in this build; see README).
  RtcEngine? _agora;
  AgoraAudioTap? _agoraTap;

  // The bundled audio, fed in real time into the kit's generic PCM input.
  Timer? _feed;
  int _fedSamples = 0;

  void _say(String line) => setState(() => _log.insert(0, line));

  Future<void> _guard(Future<void> Function() fn) async {
    setState(() => _busy = true);
    try {
      await fn();
    } on Object catch (e) {
      _say('خطأ · Error: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _login() => _guard(() async {
    final s = BaseServer(_base.text.trim().replaceAll(RegExp(r'/+$'), ''));
    final (code, _) = await s.call('POST', '/login', {'role': 'therapist', 'ref': 'C-BAHR-1'});
    _server = s;
    _say('دخول · Login: $code${s.cookie == null ? ' (no demo_user cookie)' : ''}');
  });

  Future<void> _start() => _guard(() async {
    final s = _server;
    if (s == null || s.cookie == null) throw StateError('login first');
    final (code, body) = await s.call('POST', '/api/start', {'patient_ref': 'P-BAHR-1'});
    if (code != 201 && code != 200 || body is! Map) throw StateError('/api/start answered $code');
    final session = body['session'] as String;
    setState(() {
      _session = session;
      _consentUrl = body['patient_consent_url'] as String?;
    });
    _say('جلسة · Session: $session');

    final (rc, room) = await s.call('GET', '/api/room/${Uri.encodeComponent(body['room'] as String? ?? session)}');
    final blocked = room is Map ? room['blocked'] as String? : 'room answered $rc';
    setState(() => _blocked = blocked);
    _say(blocked != null ? 'غرفة · Room ($videoProvider): $blocked' : 'غرفة · Room ($videoProvider): ready');

    // The kit's capture: relay on our own server, our cookie as the sign-in.
    final cookie = s.cookie!;
    final CaptureSession capture;
    try {
      capture = CaptureSession(
        CaptureConfig(
          relayBase: '${s.base}/24t',
          sessionId: session,
          localSpeaker: Speaker.clinician,
          authHeaders: () => {'Cookie': cookie},
        ),
        onState: (state, reason) {
          if (mounted) setState(() => _captureState = reason == null ? state.name : '${state.name} ($reason)');
        },
        onNotesPaused: (code) => _say('الملاحظات متوقفة · Notes paused: $code'),
        onHeld: (code, wait) => _say('انتظار · Held: $code, ${wait.round()} s'),
      );
    } on ArgumentError catch (e) {
      // The kit takes an http relay only on a loopback host: on the emulator, run
      // `adb reverse tcp:3060 tcp:3060` and use http://127.0.0.1:3060 (README).
      throw StateError('${e.message}: use https, or adb reverse + http://127.0.0.1:3060');
    }
    _capture = capture;

    if (blocked == null && room is Map) await _joinProvider(capture, room);
    capture.start(); // consent polling starts here, joined or not
  });

  Future<void> _joinProvider(CaptureSession capture, Map<dynamic, dynamic> room) async {
    switch (videoProvider) {
      case 'agora':
        final engine = createAgoraRtcEngine();
        await engine.initialize(RtcEngineContext(appId: room['appId'] as String));
        await engine.enableAudio();
        final tap = AgoraAudioTap(capture);
        await tap.attach(engine); // before joinChannel
        await engine.joinChannel(
          token: room['token'] as String,
          channelId: room['channel'] as String,
          uid: (room['uid'] as num).toInt(),
          options: const ChannelMediaOptions(
            clientRoleType: ClientRoleType.clientRoleBroadcaster,
            publishMicrophoneTrack: true,
            autoSubscribeAudio: true,
          ),
        );
        _agora = engine;
        _agoraTap = tap;
        _say('Agora: joined ${room['channel']}');
      case 'zoom':
        // ZoomAudioSource(capture).start() goes right after flutter_zoom_videosdk's joinSession;
        // that SDK is not in this build while the Zoom keys are pending.
        _say('Zoom: join needs flutter_zoom_videosdk (not bundled yet)');
      case 'vonage':
        // VonageAudioTap().install() before the app's own Vonage session; the native Vonage SDK
        // and its platform channel are not in this build while the private key is pending.
        _say('Vonage: join needs the native Vonage SDK (not bundled yet)');
    }
  }

  Future<void> _openConsent() => _guard(() async {
    final url = _consentUrl;
    if (url == null) throw StateError('no patient_consent_url yet');
    // The kit's openConsentPage (url_launcher, in-app browser view, never a WebView) takes
    // only https www.24therapy.app/p/... links; staging only by explicit config, as here.
    final opened = await openConsentPage(url, hosts: {...patientPageHosts, stagingPatientPageHost});
    _say(opened ? 'موافقة · Consent page opened' : 'موافقة · Not a 24Therapy patient page: not opened');
  });

  Future<void> _feedAudio() => _guard(() async {
    final capture = _capture;
    if (capture == null) throw StateError('start a session first');
    _feed?.cancel();
    final wav = (await rootBundle.load('assets/session-ar.wav')).buffer.asUint8List();
    final (pcm, rate, channels) = parseWav(wav);
    final step = rate ~/ 10 * channels; // 100 ms
    var at = 0;
    _fedSamples = 0;
    _feed = Timer.periodic(const Duration(milliseconds: 100), (t) {
      if (at >= pcm.length) {
        t.cancel();
        _say('صوت · Audio fed: ${(_fedSamples / rate / channels).toStringAsFixed(1)} s, sent ${capture.stats.piecesSent}');
        return;
      }
      final end = at + step > pcm.length ? pcm.length : at + step;
      // The generic input: the file holds both voices, so it goes in as the unlabelled mix.
      capture.onMixedPcm(Int16List.fromList(pcm.sublist(at, end)), rate, channels);
      _fedSamples += end - at;
      at = end;
      if (mounted) setState(() {});
    });
    _say(
      'صوت · Feeding ${(pcm.length / rate / channels).toStringAsFixed(1)} s (${capture.isRecording ? 'recording' : 'waiting for consent: frames are counted, not sent'})',
    );
  });

  Future<void> _end() => _guard(() async {
    _feed?.cancel();
    final capture = _capture;
    if (capture != null) {
      final delivered = await capture.hangUp();
      _say('إنهاء التسجيل · Hang up: delivered=$delivered, sent ${capture.stats.piecesSent}');
    }
    final engine = _agora;
    if (engine != null) {
      _agoraTap?.detach(engine);
      await engine.leaveChannel();
      await engine.release();
      _agora = null;
      _agoraTap = null;
    }
    final s = _server;
    final id = _session;
    if (s != null && id != null) {
      final (code, _) = await s.call('POST', '/api/sessions/${Uri.encodeComponent(id)}/end');
      _say('إنهاء · End: $code');
    }
  });

  @override
  void dispose() {
    _feed?.cancel();
    _capture?.stop();
    _base.dispose();
    super.dispose();
  }

  Widget _button(String label, VoidCallback? onPressed) => Padding(
    padding: const EdgeInsets.only(top: 8),
    child: FilledButton(onPressed: _busy ? null : onPressed, child: Text(label)),
  );

  @override
  Widget build(BuildContext context) {
    final capture = _capture;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: bahrPrimary,
        foregroundColor: Colors.white,
        title: const Row(children: [FlutterLogo(size: 28), SizedBox(width: 12), Text('بحر مايند · Bahr Mind')]),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _base,
            textDirection: TextDirection.ltr,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(labelText: 'عنوان الخادم · Server base URL'),
          ),
          _button('دخول المعالج · Therapist login', _login),
          _button('ابدأ الجلسة · Start session', _start),
          _button('افتح صفحة الموافقة · Open consent page', _consentUrl == null ? null : _openConsent),
          _button('شغّل الصوت المرفق · Feed bundled audio', capture == null ? null : _feedAudio),
          _button('إنهاء · End', _session == null ? null : _end),
          const SizedBox(height: 16),
          Text('المزوّد · Provider: $videoProvider', style: const TextStyle(color: bahrInk)),
          if (_blocked != null) Text('محظور · Blocked: $_blocked', style: const TextStyle(color: Colors.red)),
          Text('التسجيل · Capture: $_captureState', style: const TextStyle(color: bahrInk)),
          if (capture != null)
            Text(
              'قطع مرسلة · Pieces sent ${capture.stats.piecesSent}, before consent ${capture.stats.framesBeforeConsent} frames',
              style: const TextStyle(color: bahrInk),
            ),
          const Divider(),
          for (final l in _log) Text(l, style: const TextStyle(fontSize: 12, color: bahrInk)),
        ],
      ),
    );
  }
}

/// 16 bit PCM samples, rate and channels from a WAV file (the `fmt ` and `data` chunks).
(Int16List, int, int) parseWav(Uint8List bytes) {
  final v = ByteData.sublistView(bytes);
  if (bytes.length < 12 || String.fromCharCodes(bytes, 0, 4) != 'RIFF' || String.fromCharCodes(bytes, 8, 12) != 'WAVE') {
    throw const FormatException('not a WAV file');
  }
  var rate = 0, channels = 0, bits = 0, at = 12;
  while (at + 8 <= bytes.length) {
    final id = String.fromCharCodes(bytes, at, at + 4);
    final size = v.getUint32(at + 4, Endian.little);
    final body = at + 8;
    if (id == 'fmt ') {
      channels = v.getUint16(body + 2, Endian.little);
      rate = v.getUint32(body + 4, Endian.little);
      bits = v.getUint16(body + 14, Endian.little);
    } else if (id == 'data') {
      if (bits != 16) throw const FormatException('only 16 bit PCM');
      final end = body + size > bytes.length ? bytes.length : body + size;
      return (pcm16(Uint8List.sublistView(bytes, body, end)), rate, channels);
    }
    at = body + size + (size & 1);
  }
  throw const FormatException('no data chunk');
}
