// Qamar Clinic: the shared base (base/CONTRACT.md) on the 24Therapy Java kit 3.0.0.
// A port of servers/node/server.mjs on the JDK 21 alone (com.sun.net.httpserver, java.net.http).
// Build: servers/java/build.sh   Run: java -cp servers/java/out Server
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import twentyfour.TwentyFourTherapy.*;

@SuppressWarnings("unchecked")
public class Server {
    static Path ROOT = Path.of("").toAbsolutePath();   // the runner starts us from the repo root
    static Map<String, Object> P;
    static String PORT, PROVIDER, COOKIE_KEY = env("SESSION_SECRET", UUID.randomUUID().toString());
    static Client tf;
    static final List<Map<String, Object>> events = Collections.synchronizedList(new ArrayList<>());
    static final Map<String, List<Map<String, Object>>> signals = new ConcurrentHashMap<>();
    static final Set<String> seenDeliveries = ConcurrentHashMap.newKeySet();
    static final ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor();
    static final HttpClient raw = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build(); // memory, copilot, transcript: no kit method
    static Routes clinicianRoutes, patientRoutes;

    static String env(String k, String d) { String v = System.getenv(k); return v == null || v.isBlank() ? d : v; }

    // Demo login: a signed cookie for invented users. In a real platform this is your own login.
    static String sign(String v) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(COOKIE_KEY.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return v + "." + HexFormat.of().formatHex(mac.doFinal(v.getBytes(StandardCharsets.UTF_8))).substring(0, 32);
    }
    record User(String role, String ref) {}
    static User user(HttpExchange x) {
        try {
            Matcher m = Pattern.compile("demo_user=([^;]+)").matcher(String.join("; ", x.getRequestHeaders().getOrDefault("Cookie", List.of())));
            if (!m.find()) return null; String rawv = URLDecoder.decode(m.group(1), StandardCharsets.UTF_8); int at = rawv.lastIndexOf('.'); if (at < 0) return null;
            String v = rawv.substring(0, at); if (!MessageDigest.isEqual(sign(v).getBytes(StandardCharsets.UTF_8), rawv.getBytes(StandardCharsets.UTF_8))) return null;
            int i = v.indexOf(':'); return i < 0 ? null : new User(v.substring(0, i), v.substring(i + 1));
        } catch (Exception e) { return null; }
    }

    public static void main(String[] args) throws Exception {
        P = ((List<Map<String, Object>>) Json.read(Files.readString(ROOT.resolve("base/platforms.json")))).stream()
            .filter(x -> x.get("slug").equals(env("PLATFORM", "qamar"))).findFirst().orElseThrow();
        PORT = env("PORT", String.valueOf(P.get("port"))); PROVIDER = env("VIDEO_PROVIDER", (String) P.get("video"));
        Options o = new Options(); o.widgetOrigin = env("TWENTYFOUR_WIDGET_ORIGIN", "http://localhost:" + PORT);
        tf = new Client(o);                                // key, base, webhook secret from the environment

        // The kit's routes: clinician copy under /24t (widget-token, consent-state, audio, webhooks), patient copy under /24t-patient.
        Hooks hooks = new Hooks();
        hooks.currentClinician = req -> { User u = user((HttpExchange) req.nativeRequest()); return u != null && u.role().equals("therapist") ? u.ref() : null; };
        hooks.onEvent = (ev, d) -> { Map<String, Object> e = (Map<String, Object>) ev, row = new LinkedHashMap<>();
            row.put("id", e.get("id")); row.put("type", e.get("type")); row.put("delivery", d); row.put("data", e.get("data")); row.put("received_at", Instant.now().toString()); events.add(row); };
        hooks.seen = id -> !seenDeliveries.add(id);
        clinicianRoutes = new Routes(tf, hooks);
        Hooks ph = new Hooks();
        ph.currentPatient = req -> { User u = user((HttpExchange) req.nativeRequest()); if (u == null || !u.role().equals("patient")) return null;
            String[] p = u.ref().split("\\|", 2); return p.length == 2 ? new Patient(p[0], p[1]) : null; };
        ph.authorizePatientSession = (req, session, patient) -> true;
        patientRoutes = Routes.patient(tf, ph);

        HttpServer server = HttpServer.create(new InetSocketAddress(env("BIND_HOST", "localhost"), Integer.parseInt(PORT)), 0);
        server.setExecutor(pool);
        server.createContext("/", Server::handle);
        server.start();
        System.out.println(P.get("name") + " on http://localhost:" + PORT + " (" + PROVIDER + ")");
    }

    static void send(HttpExchange x, int code, Object body) throws java.io.IOException { send(x, code, Json.write(body).getBytes(StandardCharsets.UTF_8), "application/json; charset=utf-8"); }
    static void send(HttpExchange x, int code, byte[] body, String type) throws java.io.IOException {
        x.getResponseHeaders().set("Content-Type", type); x.getResponseHeaders().set("Cache-Control", "no-store");
        x.sendResponseHeaders(code, body.length == 0 ? -1 : body.length); try (var os = x.getResponseBody()) { os.write(body); }
    }
    static Map<String, Object> body(HttpExchange x) throws java.io.IOException {
        String s = new String(x.getRequestBody().readAllBytes(), StandardCharsets.UTF_8); return s.isBlank() ? new LinkedHashMap<>() : (Map<String, Object>) Json.read(s);
    }
    static Map<String, Object> err(Throwable e) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (e instanceof TwentyFourError t) { m.put("status", t.status); m.put("code", t.code); m.put("type", t.type); m.put("message", t.getMessage()); m.put("request_id", t.requestId); m.put("retry_after", t.retryAfter); }
        else { m.put("error", e.getClass().getSimpleName()); m.put("message", e.getMessage()); }
        return m;
    }
    static Map<String, Object> obj(Object... kv) { Map<String, Object> m = new LinkedHashMap<>(); for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]); return m; }
    static HttpResponse<String> api(String p, Map<String, Object> post) throws Exception {   // raw HTTPS with the key
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(tf.apiBase() + p)).header("Authorization", "Bearer " + System.getenv("TWENTYFOUR_API_KEY"));
        if (post != null) b.header("Content-Type", "application/json").header("Idempotency-Key", UUID.randomUUID().toString()).POST(HttpRequest.BodyPublishers.ofString(Json.write(post)));
        return raw.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }
    static <T> Future<T> async(Callable<T> c) { return pool.submit(c); }

    // A kit mount: the raw body (at most one byte past the audio cap) and the path below the prefix.
    static void kit(HttpExchange x, Routes routes, String prefix) throws java.io.IOException {
        byte[] b = x.getRequestBody().readNBytes(Routes.MAX_AUDIO_BYTES + 1);
        Map<String, String> h = new LinkedHashMap<>(); x.getRequestHeaders().forEach((k, v) -> h.put(k, String.join(",", v)));
        KitResponse a = routes.handle(new KitRequest(x.getRequestMethod(), x.getRequestURI().getRawPath().substring(prefix.length()), h, b, x));
        if (a == null) { send(x, 404, Map.of("error", "not_found")); return; }
        a.headers().forEach((k, v) -> x.getResponseHeaders().set(k, v)); x.sendResponseHeaders(a.status(), a.body().length == 0 ? -1 : a.body().length);
        try (var os = x.getResponseBody()) { os.write(a.body()); }
    }

    static final Map<String, String> STATIC = Map.of("/", "base/web/therapist.html", "/patient", "base/web/patient.html", "/vendor/24therapy-browser-0.6.1.iife.js", "vendor/24therapy-browser-0.6.1.iife.js");
    static final Map<String, String> MIME = Map.of(".html", "text/html; charset=utf-8", ".js", "text/javascript", ".css", "text/css");
    static final Pattern SESSION = Pattern.compile("^/api/sessions/(ses_[0-9a-f]{32})/(segments|end|overview|note/approve|summary/approve)$");

    static void handle(HttpExchange x) {
        try (x) {
            String p = x.getRequestURI().getPath(), q = Optional.ofNullable(x.getRequestURI().getQuery()).orElse(""), method = x.getRequestMethod();
            try {
                if (p.startsWith("/24t-patient/")) { kit(x, patientRoutes, "/24t-patient"); return; }
                if (p.startsWith("/24t/")) { kit(x, clinicianRoutes, "/24t"); return; }
                String file = STATIC.getOrDefault(p, p.startsWith("/static/") ? "base/web/" + Path.of(p).getFileName() : null);
                if (file != null && Files.exists(ROOT.resolve(file))) { send(x, 200, Files.readAllBytes(ROOT.resolve(file)), MIME.getOrDefault(file.substring(file.lastIndexOf('.')), "text/plain")); return; }
                if (p.equals("/config")) { send(x, 200, obj("slug", P.get("slug"), "name", P.get("name"), "provider", PROVIDER, "colours", obj("primary", P.get("primary"), "ink", P.get("ink"), "surface", P.get("surface")), "logo", P.get("logo"), "patientRecorder", PROVIDER.equals("zoom"))); return; }
                if (p.equals("/login") && method.equals("POST")) { Map<String, Object> b = body(x);
                    x.getResponseHeaders().add("Set-Cookie", "demo_user=" + URLEncoder.encode(sign(b.get("role") + ":" + b.get("ref")), StandardCharsets.UTF_8) + "; HttpOnly; SameSite=Lax; Path=/");
                    send(x, 200, Map.of("ok", true)); return; }
                // Plain WebRTC signalling, in memory.
                if (p.startsWith("/api/signal/")) { List<Map<String, Object>> sq = signals.computeIfAbsent(p.split("/")[3], k -> new ArrayList<>());
                    if (method.equals("POST")) { Map<String, Object> m = body(x); synchronized (sq) { m.put("n", sq.size() + 1); sq.add(m); } send(x, 200, Map.of("ok", true)); return; }
                    Matcher s = Pattern.compile("(?:^|&)since=(\\d+)").matcher(q); long since = s.find() ? Long.parseLong(s.group(1)) : 0;
                    synchronized (sq) { send(x, 200, Map.of("messages", sq.stream().filter(m -> ((Number) m.get("n")).longValue() > since).toList())); } return; }
                User me = user(x);
                if (me == null) { send(x, 401, Map.of("error", "sign_in")); return; }
                if (p.equals("/api/start") && method.equals("POST")) { Map<String, Object> b = body(x);
                    tf.putClinician(me.ref(), obj("label", P.get("name") + " therapist", "copilot_enabled", true));
                    Map<String, Object> subject = tf.createSubject(obj("external_ref", b.get("patient_ref"), "adult_confirmed", true, "locale", "ar"));
                    Map<String, Object> s = tf.createSession(obj("external_ref", "S-" + P.get("slug") + "-" + System.currentTimeMillis(), "subject", subject.get("id"), "clinician", me.ref(),
                        "language_hint", "ar", "note_format", "soap", "dialect", "ar-EG", "memory", true));
                    send(x, 201, obj("session", s.get("id"), "subject", subject.get("id"), "created_at", s.get("created_at"), "status", s.get("status"), "patient_consent_url", s.get("patient_consent_url"), "room", s.get("id"))); return; }
                // Join data for the signed-in role, built by the video token server (no provider secret in the browser).
                if (p.startsWith("/api/room/")) { String room = URLEncoder.encode(p.split("/")[3], StandardCharsets.UTF_8);
                    HttpResponse<byte[]> t = raw.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + env("VIDEO_TOKEN_PORT", "4000") + "/token?provider=" + PROVIDER + "&room=" + room + "&role=" + me.role())).build(), HttpResponse.BodyHandlers.ofByteArray());
                    send(x, 200, t.body(), "application/json"); return; }
                Matcher m;
                if ((m = SESSION.matcher(p)).matches()) { String id = m.group(1), what = m.group(2);
                    switch (what) {
                        case "segments" -> send(x, 200, tf.sendSegments(id, (List<?>) body(x).get("segments")));
                        case "end" -> send(x, 200, tf.endSession(id));
                        case "overview" -> {
                            Callable<Object> note = () -> { try { return tf.getNote(id); } catch (Exception e) { return err(e); } }, summary = () -> { try { return tf.getSummary(id); } catch (Exception e) { return err(e); } };
                            var fs = async(() -> tf.getSession(id)); var fn = async(note); var fsum = async(summary); var fa = async(() -> tf.listRiskAlerts(Map.of("session", id)));
                            var ft = async(() -> Json.read(api("/sessions/" + id + "/transcript", null).body()));
                            Map<String, Object> n = (Map<String, Object>) fn.get(), sm = (Map<String, Object>) fsum.get();
                            send(x, 200, obj("session", fs.get(), "note", n, "summary", sm, "alerts", fa.get(), "transcript", ft.get(), "record", NoteForRecord.map(n, sm)));
                        }
                        case "note/approve" -> { Map<String, Object> sections = new LinkedHashMap<>();   // the draft as the clinician saw it, empty sections as "—"
                            ((Map<String, Object>) ((Map<String, Object>) tf.getNote(id).get("draft")).get("sections")).forEach((k, v) -> sections.put(k, v instanceof String s && !s.isEmpty() ? s : "—"));
                            send(x, 200, tf.approveNote(id, obj("approved_by", me.ref(), "sections", sections))); }
                        default -> { Map<String, Object> d = (Map<String, Object>) tf.getSummary(id).get("draft"); List<String> lines = new ArrayList<>();
                            lines.add((String) d.get("brief")); if (d.get("steps") instanceof List<?> st) st.forEach(v -> lines.add((String) v)); lines.add((String) d.get("next"));
                            send(x, 200, tf.approveSummary(id, obj("approved_by", me.ref(), "text", String.join("\n", lines.stream().filter(v -> v != null && !v.isEmpty()).toList())))); }
                    }
                    return; }
                // Risk: read the alert's quotes first (409 quotes_not_read otherwise), then acknowledge with an outcome.
                if ((m = Pattern.compile("^/api/risk/(alr_[0-9a-f]{32})/ack$").matcher(p)).matches()) { tf.getRiskAlert(m.group(1));
                    send(x, 200, tf.acknowledgeRiskAlert(m.group(1), obj("by", me.ref(), "note", "Reviewed with the patient in session; safety plan agreed (invented test).", "outcome", "patient_contacted_plan_made"))); return; }
                // Memory and copilot: raw HTTPS with the key (no kit method).
                if ((m = Pattern.compile("^/api/subjects/(sub_[0-9a-f]{32})/memory$").matcher(p)).matches()) {
                    send(x, 200, api("/subjects/" + m.group(1) + "/memory?clinician=" + URLEncoder.encode(me.ref(), StandardCharsets.UTF_8), null).body().getBytes(StandardCharsets.UTF_8), "application/json; charset=utf-8"); return; }
                if (p.equals("/api/copilot")) { Map<String, Object> b = body(x);
                    HttpResponse<String> r = api("/copilot/questions", obj("subject", b.get("subject"), "clinician", me.ref(), "question", b.get("question"), "session", b.get("session")));
                    send(x, r.statusCode(), r.body().getBytes(StandardCharsets.UTF_8), "application/json; charset=utf-8"); return; }
                if (p.equals("/api/usage")) { send(x, 200, tf.getUsage(null)); return; }
                if (p.equals("/api/events")) { synchronized (events) { send(x, 200, Map.of("events", new ArrayList<>(events))); } return; }
                // Error checks: an id that is not ours (before sending), an unknown session (404), a well-formed unknown key (401).
                if (p.equals("/api/errors")) { Map<String, Object> out = new LinkedHashMap<>();
                    try { tf.getSession("not-an-id"); } catch (IllegalArgumentException e) { out.put("bad_id", obj("error", e.getClass().getSimpleName(), "message", e.getMessage())); }
                    try { tf.getSession("ses_" + "0".repeat(32)); } catch (TwentyFourError e) { out.put("unknown", err(e)); }
                    Options bad = new Options(); bad.apiKey = "24t_sk_test_" + "x".repeat(43);
                    try { new Client(bad).ping(); } catch (TwentyFourError e) { out.put("bad_key", err(e)); }
                    send(x, 200, out); return; }
                send(x, 404, Map.of("error", "not_found"));
            } catch (Throwable e) {
                Throwable c = e instanceof ExecutionException ? e.getCause() : e;
                send(x, c instanceof TwentyFourError t && t.status > 0 ? t.status : 500, err(c));
            }
        } catch (Exception ignored) { /* the client went away */ }
    }
}
