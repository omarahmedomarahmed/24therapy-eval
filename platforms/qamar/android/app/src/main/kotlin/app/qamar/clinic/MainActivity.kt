package app.qamar.clinic

import android.Manifest
import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.webkit.WebView
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import app.twentyfour.kit.agora.AgoraAudioTap
import app.twentyfour.kit.agora.AgoraBaseline
import app.twentyfour.kit.core.CaptureConfig
import app.twentyfour.kit.core.CaptureListener
import app.twentyfour.kit.core.CaptureSession
import app.twentyfour.kit.core.CaptureState
import app.twentyfour.kit.core.Speaker
import app.twentyfour.kit.screens.ConsentLink
import app.twentyfour.kit.screens.WidgetView
import io.agora.rtc2.ChannelMediaOptions
import io.agora.rtc2.Constants
import io.agora.rtc2.IRtcEngineEventHandler
import io.agora.rtc2.RtcEngine
import io.agora.rtc2.RtcEngineConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.concurrent.thread

/** Qamar Clinic therapist screen. The app holds no 24Therapy key: it talks only to its own server. */
class MainActivity : Activity() {
    private val primary = Color.parseColor("#D9822B"); private val ink = Color.parseColor("#3A2208"); private val surface = Color.parseColor("#FFF8EE")
    private lateinit var status: TextView; private lateinit var server: EditText; private lateinit var widget: WebView
    private var cookie = ""; private var session: JSONObject? = null; private var capture: CaptureSession? = null; private var engine: RtcEngine? = null

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        WidgetView.secure(this, true) // FLAG_SECURE on the clinical screen
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(surface); setPadding(32, 32, 32, 32) }
        col.addView(TextView(this).apply { text = "☕ Qamar Clinic · قمر"; textSize = 22f; setTextColor(Color.WHITE); setBackgroundColor(primary); setPadding(24, 24, 24, 24); gravity = Gravity.START })
        server = EditText(this).apply { setText(BuildConfig.SERVER_BASE); setTextColor(ink); contentDescription = "server" }
        status = TextView(this).apply { setTextColor(ink); text = "idle"; contentDescription = "status" }
        col.addView(server); col.addView(status)
        fun btn(label: String, id: String, f: () -> Unit) = col.addView(Button(this).apply { text = label; contentDescription = id; setBackgroundColor(primary); setTextColor(Color.WHITE); setOnClickListener { thread { runCatching(f).onFailure { say("error: ${it.message}") } } } })
        btn("ابدأ الجلسة · Start session", "start") { start() }
        btn("صفحة الموافقة · Consent page (patient)", "consent") { session?.optString("patient_consent_url")?.let { u -> runOnUiThread { ConsentLink.open(this, u) } } }
        btn("Feed bundled audio (generic input)", "feed") { feed() }
        btn("Open widget", "widget") { openWidget() }
        btn("إنهاء · End", "end") { end() }
        widget = WebView(this); col.addView(widget, LinearLayout.LayoutParams(-1, 1400))
        setContentView(ScrollView(this).apply { addView(col) })
        requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
    }

    private fun say(s: String) = runOnUiThread { status.text = s }
    private fun http(method: String, path: String, body: String? = null): JSONObject {
        val c = URL(server.text.toString().trimEnd('/') + path).openConnection() as HttpURLConnection
        c.requestMethod = method; if (cookie.isNotEmpty()) c.setRequestProperty("Cookie", cookie)
        if (body != null) { c.doOutput = true; c.setRequestProperty("Content-Type", "application/json"); c.outputStream.use { it.write(body.toByteArray()) } }
        c.headerFields["Set-Cookie"]?.firstOrNull()?.let { cookie = it.substringBefore(';') }
        val text = (if (c.responseCode < 400) c.inputStream else c.errorStream).bufferedReader().readText()
        if (c.responseCode >= 400) error("${c.responseCode} $text".take(200)); return JSONObject(text)
    }

    private fun start() {
        http("POST", "/login", """{"role":"therapist","ref":"C-QAMAR-1"}""")
        val s = http("POST", "/api/start", """{"patient_ref":"P-QAMAR-${System.currentTimeMillis()}"}"""); session = s
        val room = http("GET", "/api/room/${s.getString("session")}")
        val cap = CaptureSession(CaptureConfig(relayBase = server.text.toString().trimEnd('/') + "/24t", sessionId = s.getString("session"), localSpeaker = Speaker.CLINICIAN, authHeaders = { mapOf("Cookie" to cookie) }),
            listener = object : CaptureListener {
                override fun onState(state: CaptureState, reason: String?) = say("capture: $state ${reason ?: ""}")
                override fun onPieceSent(speaker: Speaker?, startSeconds: Double, bytes: Int) = say("piece sent: $speaker @ ${"%.1f".format(startSeconds)}s")
            })
        capture = cap
        if (room.has("blocked")) { say(room.getString("blocked")); cap.start(); return }
        val rtc = RtcEngine.create(RtcEngineConfig().apply { mContext = applicationContext; mAppId = room.getString("appId"); mChannelProfile = Constants.CHANNEL_PROFILE_COMMUNICATION
            mEventHandler = object : IRtcEngineEventHandler() { override fun onJoinChannelSuccess(ch: String?, uid: Int, e: Int) = say("in call (Agora) · waiting for consent") } })
        engine = rtc; rtc.enableAudio(); AgoraBaseline.apply(rtc); AgoraAudioTap(cap).attach(rtc); cap.start()
        rtc.joinChannel(room.getString("token"), room.getString("channel"), room.getInt("uid"), ChannelMediaOptions().apply { clientRoleType = Constants.CLIENT_ROLE_BROADCASTER; publishMicrophoneTrack = true; autoSubscribeAudio = true })
        say("session ${s.getString("session")} · awaiting consent")
    }

    /** Microphone injection is not available on device farms: the bundled invented WAV goes into the kit's generic PCM input, in real time. */
    private fun feed() {
        val cap = capture ?: return say("start first")
        val bytes = resources.openRawResource(R.raw.session_ar).use { it.readBytes() }
        val pcm = ByteBuffer.wrap(bytes, 44, bytes.size - 44).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
        val all = ShortArray(pcm.remaining()).also { pcm.get(it) }; val frame = 320 // 20 ms at 16 kHz
        var i = 0; while (i < all.size) { val n = minOf(frame, all.size - i); cap.onLocalPcm(all, i, n, 16000, 1); i += n; Thread.sleep(20) }
        say("bundled audio fed (${all.size / 16000}s)")
    }

    private fun openWidget() {
        val s = session ?: return say("start first")
        val w = http("POST", "/24t/widget-token", """{"view":"session","session":"${s.getString("session")}","locale":"ar"}""")
        runOnUiThread { WidgetView.load(widget, w.getString("embed_url"), BuildConfig.WIDGET_FRAME_ORIGIN) }
    }

    private fun end() {
        val s = session ?: return; capture?.hangUp(); engine?.leaveChannel()
        val e = http("POST", "/api/sessions/${s.getString("session")}/end", "{}"); say("ended · ${e.optString("status")}")
    }
}
