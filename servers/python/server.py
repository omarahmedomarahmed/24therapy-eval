# Sakan Therapy (or any PLATFORM): the shared base (base/CONTRACT.md) on the 24Therapy Python server kit 3.0.0.
# A port of servers/node/server.mjs: standard library only (http.server, urllib, hmac).
import hashlib, hmac, json, os, re, sys, threading, time, uuid
import urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
sys.path.insert(0, os.path.join(ROOT, "vendor"))  # vendor/twentyfour.py: the kit, copied from the portal (git-ignored)
import twentyfour as tf  # noqa: E402

with open(os.path.join(ROOT, "base/platforms.json"), encoding="utf-8") as f:
    P = next(x for x in json.load(f) if x["slug"] == (os.environ.get("PLATFORM") or "sakan"))
PORT, PROVIDER = int(os.environ.get("PORT") or P["port"]), os.environ.get("VIDEO_PROVIDER") or P["video"]
os.environ.setdefault("TWENTYFOUR_WIDGET_ORIGIN", f"http://localhost:{PORT}")
client = tf.Client()                               # key, base, webhook secret, widget origin from the environment
COOKIE_KEY = (os.environ.get("SESSION_SECRET") or str(uuid.uuid4())).encode()
events, signals, subjects, seen_deliveries = [], {}, {}, set()
lock = threading.Lock()


# Demo login: a signed cookie for invented users. In a real platform this is your own login.
def sign(v):
    return f"{v}.{hmac.new(COOKIE_KEY, v.encode(), hashlib.sha256).hexdigest()[:32]}"


def user(headers):
    m = re.search(r"demo_user=([^;]+)", headers.get("cookie") or headers.get("Cookie") or "")
    if not m:
        return None
    raw = urllib.parse.unquote(m.group(1))
    v = raw[: raw.rfind(".")]
    if not hmac.compare_digest(sign(v), raw):
        return None
    role, _, ref = v.partition(":")
    return {"role": role, "ref": ref}


def current_clinician(req):
    u = user(req.headers)
    return u["ref"] if u and u["role"] == "therapist" else None


def current_patient(req):
    u = user(req.headers)
    if not u or u["role"] != "patient":
        return None
    subject, _, patient_user_ref = u["ref"].partition("|")
    return {"subject": subject, "patient_user_ref": patient_user_ref}


def on_event(ev, delivery):
    with lock:
        events.append({"id": ev.get("id"), "type": ev.get("type"), "delivery": delivery, "data": ev.get("data"),
                       "received_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")})


def seen(delivery):
    with lock:
        if delivery in seen_deliveries:
            return True
        seen_deliveries.add(delivery)
        return False


clinician_routes = tf.Routes(client, current_clinician=current_clinician, on_event=on_event, seen=seen)
patient_routes = tf.Routes(client, role="patient", current_patient=current_patient,
                           authorize_patient_session=lambda req, session, patient: True)


def err(e):
    if isinstance(e, tf.TwentyFourError):
        return {"status": e.status, "code": e.code, "type": e.type, "message": e.message, "request_id": e.request_id, "retry_after": e.retry_after}
    return {"error": type(e).__name__, "message": str(e)}


def catch(fn, *a):  # the Node .catch(err): the error as the value
    try:
        return fn(*a)
    except Exception as e:  # noqa: BLE001
        return err(e)


def api(method, p, body=None):  # memory and copilot: no kit method, raw HTTPS with the key
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(client.api_base + p, data=data, method=method)
    req.add_header("Authorization", f"Bearer {client.api_key}")
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
        req.add_header("Idempotency-Key", str(uuid.uuid4()))
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        text = e.read()
        try:
            return e.code, json.loads(text or b"null")
        except ValueError:
            return e.code, {"error": f"http_{e.code}"}


STATIC = {"/": "base/web/therapist.html", "/patient": "base/web/patient.html",
          "/vendor/24therapy-browser-0.6.1.iife.js": "vendor/24therapy-browser-0.6.1.iife.js"}
MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css"}
SES = re.compile(r"^/api/sessions/(ses_[0-9a-f]{32})/(segments|end|overview|note/approve|summary/approve)$")
pool = ThreadPoolExecutor(8)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # quiet: the runner keeps stdout as the server log
        pass

    def send(self, code, body, ctype="application/json", headers=None):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        for k, v in {"Content-Type": ctype, "Cache-Control": "no-store", **(headers or {})}.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def raw(self):  # read once, always: an unread body would break the next request on a kept-alive connection
        if not hasattr(self, "_raw"):
            n = int(self.headers.get("Content-Length") or 0)
            self._raw = self.rfile.read(n) if n else b""
        return self._raw

    def body(self):
        b = self.raw()
        return json.loads(b) if b else {}

    def kit(self, routes, prefix, path):
        headers = {k: v for k, v in self.headers.items()}
        answer = routes.handle(tf.KitRequest(self.command, path[len(prefix):], headers, self.raw(), native=self))
        if answer is None:
            return self.send(404, {"error": "not_found"})
        self.send(answer.status, answer.body, answer.headers.get("Content-Type", "application/json"),
                  {k: v for k, v in answer.headers.items() if k != "Content-Type"})

    def do_GET(self):
        self.route()

    def do_POST(self):
        self.route()

    def route(self):
        url = urllib.parse.urlsplit(self.path)
        p, q, me = url.path, urllib.parse.parse_qs(url.query), user(self.headers)
        self.__dict__.pop("_raw", None)
        self.raw()
        try:
            if p.startswith("/24t-patient/"):
                return self.kit(patient_routes, "/24t-patient", p)
            if p.startswith("/24t/"):
                return self.kit(clinician_routes, "/24t", p)
            file = STATIC.get(p) or (p.startswith("/static/") and f"base/web/{os.path.basename(p)}")
            if file and os.path.exists(os.path.join(ROOT, file)):
                with open(os.path.join(ROOT, file), "rb") as fh:
                    return self.send(200, fh.read(), MIME.get(os.path.splitext(file)[1], "text/plain"))
            if p == "/config":
                return self.send(200, {"slug": P["slug"], "name": P["name"], "provider": PROVIDER, "logo": P["logo"], "patientRecorder": PROVIDER == "zoom",
                                       "colours": {"primary": P["primary"], "ink": P["ink"], "surface": P["surface"]}})
            if p == "/login" and self.command == "POST":
                b = self.body()
                v = f"{b.get('role')}:{b.get('ref')}"
                cookie = f"demo_user={urllib.parse.quote(sign(v), safe='')}; HttpOnly; SameSite=Lax; Path=/"
                return self.send(200, {"ok": True}, headers={"Set-Cookie": cookie})
            if p.startswith("/api/signal/"):
                room = p.split("/")[3]
                with lock:
                    sq = signals.setdefault(room, [])
                    if self.command == "POST":
                        sq.append({**self.body(), "n": len(sq) + 1})
                        return self.send(200, {"ok": True})
                    since = int((q.get("since") or ["0"])[0] or 0)
                    return self.send(200, {"messages": [m for m in sq if m["n"] > since]})
            if not me:
                return self.send(401, {"error": "sign_in"})
            if p == "/api/start" and self.command == "POST":
                b = self.body()
                client.put_clinician(me["ref"], {"label": f"{P['name']} therapist", "copilot_enabled": True})
                subject = client.create_subject({"external_ref": b.get("patient_ref"), "adult_confirmed": True, "locale": "ar"})
                s = client.create_session({"external_ref": f"S-{P['slug']}-{int(time.time() * 1000)}", "subject": subject["id"], "clinician": me["ref"],
                                           "language_hint": "ar", "note_format": "soap", "dialect": "ar-EG", "memory": True})
                subjects[s["id"]] = subject["id"]
                return self.send(201, {"session": s["id"], "subject": subject["id"], "created_at": s.get("created_at"), "status": s.get("status"),
                                       "patient_consent_url": s.get("patient_consent_url"), "room": s["id"]})
            if p.startswith("/api/room/"):  # join data: the token is built on the server (base/video)
                room = urllib.parse.quote(p.split("/")[3], safe="")
                vt = f"http://127.0.0.1:{os.environ.get('VIDEO_TOKEN_PORT') or 4000}/token?provider={PROVIDER}&room={room}&role={me['role']}"
                with urllib.request.urlopen(vt, timeout=30) as r:
                    return self.send(200, json.loads(r.read()))
            m = SES.match(p)
            if m:
                sid, what = m.groups()
                if what == "segments":
                    return self.send(200, client.send_segments(sid, self.body().get("segments")))
                if what == "end":
                    return self.send(200, client.end_session(sid))
                if what == "overview":  # five reads at once, as Promise.all
                    fs = [pool.submit(client.get_session, sid), pool.submit(catch, client.get_note, sid), pool.submit(catch, client.get_summary, sid),
                          pool.submit(lambda: client.list_risk_alerts(session=sid)), pool.submit(lambda: api("GET", f"/sessions/{sid}/transcript")[1])]
                    session, note, summary, alerts, transcript = [x.result() for x in fs]
                    record = tf.note_for_record(note, summary if summary and summary.get("status") == "delivered" else None) if note and note.get("status") == "approved" else None
                    return self.send(200, {"session": session, "note": note, "summary": summary, "alerts": alerts, "transcript": transcript, "record": record})
                if what == "note/approve":  # the draft's sections as the clinician saw them; an empty one as "—"
                    n = client.get_note(sid)
                    sections = {k: (v or "—") for k, v in n["draft"]["sections"].items()}
                    return self.send(200, client.approve_note(sid, {"approved_by": me["ref"], "sections": sections}))
                if what == "summary/approve":
                    d = client.get_summary(sid)["draft"]
                    text = "\n".join(x for x in [d.get("brief"), *(d.get("steps") or []), d.get("next")] if x)
                    return self.send(200, client.approve_summary(sid, {"approved_by": me["ref"], "text": text}))
            m = re.match(r"^/api/risk/(alr_[0-9a-f]{32})/ack$", p)
            if m:  # read the quotes first, then acknowledge
                client.get_risk_alert(m.group(1))
                return self.send(200, client.acknowledge_risk_alert(m.group(1), {"by": me["ref"], "outcome": "patient_contacted_plan_made",
                                                                                 "note": "Reviewed with the patient in session; safety plan agreed (invented test)."}))
            m = re.match(r"^/api/subjects/(sub_[0-9a-f]{32})/memory$", p)
            if m:
                return self.send(200, api("GET", f"/subjects/{m.group(1)}/memory?clinician={urllib.parse.quote(me['ref'], safe='')}")[1])
            if p == "/api/copilot":
                b = self.body()
                status, answer = api("POST", "/copilot/questions", {"subject": b.get("subject"), "clinician": me["ref"], "question": b.get("question"), "session": b.get("session")})
                return self.send(status, answer)
            if p == "/api/usage":
                return self.send(200, client.get_usage())
            if p == "/api/events":
                with lock:
                    return self.send(200, {"events": list(events)})
            if p == "/api/errors":
                out = {}
                try:
                    client.get_session("not-an-id")
                except ValueError as e:  # raised before anything is sent
                    out["bad_id"] = {"error": type(e).__name__, "message": str(e)}
                try:
                    client.get_session("ses_" + "0" * 32)
                except tf.TwentyFourError as e:
                    out["unknown"] = err(e)
                try:
                    tf.Client(api_key="24t_sk_test_" + "x" * 43, tries=1).ping()
                except tf.TwentyFourError as e:
                    out["bad_key"] = err(e)
                return self.send(200, out)
            self.send(404, {"error": "not_found"})
        except Exception as e:  # noqa: BLE001
            self.send(getattr(e, "status", 0) or 500, err(e))


if __name__ == "__main__":
    print(f"{P['name']} on http://localhost:{PORT} ({PROVIDER})", flush=True)
    try:
        ThreadingHTTPServer(("", PORT), Handler).serve_forever()
    except KeyboardInterrupt:  # the runner stops us with SIGINT
        pass
