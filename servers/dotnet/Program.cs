// Hadith Care / Rawda Space: the shared base (base/CONTRACT.md) on the 24Therapy .NET kit 3.0.0.
// A port of servers/node/server.mjs as an ASP.NET Core 8 minimal API.
using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using TwentyFourTherapy;

// The repo root holds base/ and vendor/ (dotnet run may start us in the project folder or the root).
string ROOT = new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory }
    .SelectMany(d => { var l = new List<string>(); for (var x = new DirectoryInfo(d); x != null; x = x.Parent) l.Add(x.FullName); return l; })
    .First(d => File.Exists(Path.Combine(d, "base/platforms.json")));
var P = JsonNode.Parse(File.ReadAllText(Path.Combine(ROOT, "base/platforms.json")))!.AsArray()
    .First(x => (string?)x!["slug"] == (Environment.GetEnvironmentVariable("PLATFORM") ?? "hadith"))!;
string Env(string k, string d) => string.IsNullOrEmpty(Environment.GetEnvironmentVariable(k)) ? d : Environment.GetEnvironmentVariable(k)!;
var PORT = Env("PORT", P["port"]!.ToString()); var PROVIDER = Env("VIDEO_PROVIDER", (string)P["video"]!);
var kit = new TwentyFourClient(new TwentyFourOptions { WidgetOrigin = Env("TWENTYFOUR_WIDGET_ORIGIN", $"http://localhost:{PORT}") }); // key, base, webhook secret from the environment
var COOKIE_KEY = Env("SESSION_SECRET", Guid.NewGuid().ToString());
var events = new List<JsonObject>(); var signals = new ConcurrentDictionary<string, List<JsonObject>>(); var seen = new ConcurrentDictionary<string, bool>();
var raw = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }); // memory, copilot, transcript: no kit method
var JSON = new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };   // Arabic stays readable

// Demo login: a signed cookie for invented users. In a real platform this is your own login.
string Sign(string v) => $"{v}.{Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(COOKIE_KEY), Encoding.UTF8.GetBytes(v))).ToLowerInvariant()[..32]}";
(string Role, string Ref)? User(HttpContext c)
{
    var m = System.Text.RegularExpressions.Regex.Match(c.Request.Headers.Cookie.ToString(), "demo_user=([^;]+)"); if (!m.Success) return null;
    var rawv = Uri.UnescapeDataString(m.Groups[1].Value); var at = rawv.LastIndexOf('.'); if (at < 0) return null; var v = rawv[..at];
    if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(Sign(v)), Encoding.UTF8.GetBytes(rawv))) return null;
    var i = v.IndexOf(':'); return i < 0 ? null : (v[..i], v[(i + 1)..]);
}

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls($"http://localhost:{PORT}");
builder.Logging.SetMinimumLevel(LogLevel.Warning);
var app = builder.Build();

IResult J(object? body, int status = 200) => Results.Text(JsonSerializer.Serialize(body, JSON), "application/json; charset=utf-8", Encoding.UTF8, status);
JsonNode? Err(Exception e) => e is TwentyFourError t
    ? new JsonObject { ["status"] = t.Status, ["code"] = t.Code, ["type"] = t.Type, ["message"] = t.Message, ["request_id"] = t.RequestId, ["retry_after"] = t.RetryAfter }
    : new JsonObject { ["error"] = e.GetType().Name, ["message"] = e.Message };
async Task<JsonObject> Body(HttpContext c) { var s = await new StreamReader(c.Request.Body).ReadToEndAsync(); return s.Length > 0 ? JsonNode.Parse(s)!.AsObject() : new JsonObject(); }
Task<HttpResponseMessage> Api(string p, HttpMethod? m = null, JsonNode? body = null)
{
    var r = new HttpRequestMessage(m ?? HttpMethod.Get, kit.Options.ApiBase + p);
    r.Headers.Authorization = new("Bearer", kit.Options.ApiKey);
    if (body != null) { r.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString()); r.Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"); }
    return raw.SendAsync(r);
}
async Task<IResult> Pass(HttpResponseMessage r) => Results.Text(await r.Content.ReadAsStringAsync(), "application/json; charset=utf-8", Encoding.UTF8, (int)r.StatusCode);

// Errors become JSON like Node's (a refused call keeps its status), and nothing is cached.
app.Use(async (c, next) =>
{
    c.Response.Headers.CacheControl = "no-store";
    try { await next(); }
    catch (Exception e) when (!c.Response.HasStarted) { await J(Err(e), e is TwentyFourError t && t.Status > 0 ? t.Status : 500).ExecuteAsync(c); }
});
// Everything under /api/ except signalling needs the demo login.
app.Use(async (c, next) =>
{
    var p = c.Request.Path.Value ?? "";
    if (p.StartsWith("/api/") && !p.StartsWith("/api/signal/") && User(c) is null) { await J(new { error = "sign_in" }, 401).ExecuteAsync(c); return; }
    await next();
});

// The kit's routes: clinician copy under /24t (widget-token, consent-state, audio, webhooks), patient copy under /24t-patient.
app.MapTwentyFourTherapy("/24t", kit, new TwentyFourHooks
{
    CurrentClinician = req => Task.FromResult(User((HttpContext)req.Native!) is { Role: "therapist" } u ? u.Ref : null),
    OnEvent = (ev, d) => { lock (events) events.Add(new JsonObject { ["id"] = (string?)ev["id"], ["type"] = (string?)ev["type"], ["delivery"] = d, ["data"] = ev["data"]?.DeepClone(), ["received_at"] = DateTime.UtcNow.ToString("o") }); return Task.CompletedTask; },
    Seen = id => Task.FromResult(!seen.TryAdd(id, true)),
});
app.MapTwentyFourTherapyPatient("/24t-patient", kit, new TwentyFourHooks
{
    CurrentPatient = req => Task.FromResult(User((HttpContext)req.Native!) is { Role: "patient" } u && u.Ref.Split('|') is [var subject, var who] ? new TwentyFourPatient(subject, who) : null),
    AuthorizePatientSession = (_, _, _) => Task.FromResult(true),
});

// Pages and the browser kit file.
var STATIC = new Dictionary<string, string> { ["/"] = "base/web/therapist.html", ["/patient"] = "base/web/patient.html", ["/vendor/24therapy-browser-0.6.1.iife.js"] = "vendor/24therapy-browser-0.6.1.iife.js" };
var MIME = new Dictionary<string, string> { [".html"] = "text/html; charset=utf-8", [".js"] = "text/javascript", [".css"] = "text/css" };
IResult File_(string f) => File.Exists(Path.Combine(ROOT, f)) ? Results.Bytes(File.ReadAllBytes(Path.Combine(ROOT, f)), MIME.GetValueOrDefault(Path.GetExtension(f), "text/plain")) : J(new { error = "not_found" }, 404);
foreach (var (route, f) in STATIC) app.MapGet(route, () => File_(f));
app.MapGet("/static/{name}", (string name) => File_($"base/web/{Path.GetFileName(name)}"));
app.MapGet("/config", () => J(new { slug = (string?)P["slug"], name = (string?)P["name"], provider = PROVIDER, colours = new { primary = (string?)P["primary"], ink = (string?)P["ink"], surface = (string?)P["surface"] }, logo = (string?)P["logo"], patientRecorder = PROVIDER == "zoom" }));
app.MapPost("/login", async (HttpContext c) =>
{
    var b = await Body(c);
    c.Response.Headers.SetCookie = $"demo_user={Uri.EscapeDataString(Sign($"{(string?)b["role"]}:{(string?)b["ref"]}"))}; HttpOnly; SameSite=Lax; Path=/";
    return J(new { ok = true });
});

// Plain WebRTC signalling, in memory.
app.MapPost("/api/signal/{room}", async (string room, HttpContext c) =>
{
    var q = signals.GetOrAdd(room, _ => new()); var m = await Body(c);
    lock (q) { m["n"] = q.Count + 1; q.Add(m); }
    return J(new { ok = true });
});
app.MapGet("/api/signal/{room}", (string room, int? since) =>
{
    var q = signals.GetOrAdd(room, _ => new());
    lock (q) return J(new { messages = q.Where(m => (int)m["n"]! > (since ?? 0)).ToList() });
});

app.MapPost("/api/start", async (HttpContext c) =>
{
    var me = User(c)!.Value; var b = await Body(c);
    await kit.PutClinicianAsync(me.Ref, new { label = $"{(string?)P["name"]} therapist", copilot_enabled = true });
    var subject = await kit.CreateSubjectAsync(new { external_ref = (string?)b["patient_ref"], adult_confirmed = true, locale = "ar" });
    var s = await kit.CreateSessionAsync(new { external_ref = $"S-{(string?)P["slug"]}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}", subject = (string?)subject!["id"], clinician = me.Ref, language_hint = "ar", note_format = "soap", dialect = "ar-EG", memory = true });
    return J(new { session = s!["id"], subject = subject["id"], created_at = s["created_at"], status = s["status"], patient_consent_url = s["patient_consent_url"], room = s["id"] }, 201);
});
// Join data for the signed-in role, built by the video token server (no provider secret in the browser).
app.MapGet("/api/room/{room}", async (string room, HttpContext c) =>
    await Pass(await raw.GetAsync($"http://127.0.0.1:{Env("VIDEO_TOKEN_PORT", "4000")}/token?provider={PROVIDER}&room={Uri.EscapeDataString(room)}&role={User(c)!.Value.Role}")));

app.MapPost("/api/sessions/{id}/segments", async (string id, HttpContext c) => J(await kit.SendSegmentsAsync(id, (await Body(c))["segments"]!)));
app.MapPost("/api/sessions/{id}/end", async (string id) => J(await kit.EndSessionAsync(id)));
app.MapGet("/api/sessions/{id}/overview", async (string id) =>
{
    async Task<JsonNode?> Safe(Func<Task<JsonNode?>> f) { try { return await f(); } catch (Exception e) { return Err(e); } }
    var session = kit.GetSessionAsync(id); var note = Safe(() => kit.GetNoteAsync(id)); var summary = Safe(() => kit.GetSummaryAsync(id));
    var alerts = kit.ListRiskAlertsAsync(new Dictionary<string, string?> { ["session"] = id });
    var transcript = Api($"/sessions/{id}/transcript").ContinueWith(async t => JsonNode.Parse(await t.Result.Content.ReadAsStringAsync())).Unwrap();
    await Task.WhenAll(session, note, summary, alerts, transcript);
    return J(new { session = session.Result, note = note.Result, summary = summary.Result, alerts = alerts.Result, transcript = transcript.Result, record = TwentyFourNoteForRecord.Map(note.Result, summary.Result) });
});
app.MapPost("/api/sessions/{id}/note/approve", async (string id, HttpContext c) =>
{
    var n = await kit.GetNoteAsync(id); var sections = new JsonObject();   // the draft as the clinician saw it, empty sections as "—"
    foreach (var (k, v) in n!["draft"]!["sections"]!.AsObject()) sections[k] = v is JsonValue x && x.TryGetValue<string>(out var s) && s.Length > 0 ? s : "—";
    return J(await kit.ApproveNoteAsync(id, new JsonObject { ["approved_by"] = User(c)!.Value.Ref, ["sections"] = sections }));
});
app.MapPost("/api/sessions/{id}/summary/approve", async (string id, HttpContext c) =>
{
    var d = (await kit.GetSummaryAsync(id))!["draft"]!;
    var lines = new[] { (string?)d["brief"] }.Concat(d["steps"]?.AsArray().Select(x => (string?)x) ?? []).Append((string?)d["next"]).Where(x => !string.IsNullOrEmpty(x));
    return J(await kit.ApproveSummaryAsync(id, new { approved_by = User(c)!.Value.Ref, text = string.Join("\n", lines) }));
});
// Risk: read the alert's quotes first (409 quotes_not_read otherwise), then acknowledge with an outcome.
app.MapPost("/api/risk/{id}/ack", async (string id, HttpContext c) =>
{
    await kit.GetRiskAlertAsync(id);
    return J(await kit.AcknowledgeRiskAlertAsync(id, new { by = User(c)!.Value.Ref, note = "Reviewed with the patient in session; safety plan agreed (invented test).", outcome = "patient_contacted_plan_made" }));
});
// Memory and copilot: raw HTTPS with the key (no kit method).
app.MapGet("/api/subjects/{id}/memory", async (string id, HttpContext c) =>
    J(JsonNode.Parse(await (await Api($"/subjects/{Uri.EscapeDataString(id)}/memory?clinician={Uri.EscapeDataString(User(c)!.Value.Ref)}")).Content.ReadAsStringAsync())));
app.MapPost("/api/copilot", async (HttpContext c) =>
{
    var b = await Body(c);
    return await Pass(await Api("/copilot/questions", HttpMethod.Post, new JsonObject { ["subject"] = b["subject"]?.DeepClone(), ["clinician"] = User(c)!.Value.Ref, ["question"] = b["question"]?.DeepClone(), ["session"] = b["session"]?.DeepClone() }));
});
app.MapGet("/api/usage", async () => J(await kit.GetUsageAsync()));
app.MapGet("/api/events", () => { lock (events) return J(new { events = events.ToList() }); });
// Error checks: an id that is not ours (ArgumentException before sending), an unknown session (404), a well-formed unknown key (401).
app.MapGet("/api/errors", async () =>
{
    var o = new JsonObject();
    try { await kit.GetSessionAsync("not-an-id"); } catch (ArgumentException e) { o["bad_id"] = new JsonObject { ["error"] = e.GetType().Name, ["message"] = e.Message }; }
    try { await kit.GetSessionAsync("ses_" + new string('0', 32)); } catch (TwentyFourError e) { o["unknown"] = Err(e); }
    try { await new TwentyFourClient(new TwentyFourOptions { ApiKey = "24t_sk_test_" + new string('x', 43) }).PingAsync(); } catch (TwentyFourError e) { o["bad_key"] = Err(e); }
    return J(o);
});
app.MapFallback(() => J(new { error = "not_found" }, 404));

Console.WriteLine($"{P["name"]} on http://localhost:{PORT} ({PROVIDER})");
app.Run();
