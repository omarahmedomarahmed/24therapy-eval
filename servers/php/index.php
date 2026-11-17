<?php
// Wasla Health: the shared base (base/CONTRACT.md) on the 24Therapy PHP server kit 3.0.0.
// A router for PHP's built-in server: php -S localhost:$PORT servers/php/index.php (from the repo root).
// Each request is a fresh PHP run, so whatever must outlive a request (webhook events, the
// WebRTC signalling queue, seen deliveries, the demo cookie key) lives in files under
// sys_get_temp_dir()/24t-<slug>/. Set PHP_CLI_SERVER_WORKERS=4 to answer polls, the webhook
// relay and kit calls side by side (the built-in server is one process by default).
declare(strict_types=1);

const ROOT = __DIR__ . '/../..';
require ROOT . '/vendor/TwentyFourTherapy.php';
use TwentyFourTherapy\{Client, KitRequest, Routes, TwentyFourError};

$P = array_values(array_filter(json_decode(file_get_contents(ROOT . '/base/platforms.json'), true), fn ($x) => $x['slug'] === (getenv('PLATFORM') ?: 'wasla')))[0];
$PORT = (int) (getenv('PORT') ?: $P['port']);
$PROVIDER = getenv('VIDEO_PROVIDER') ?: $P['video'];
if (!getenv('TWENTYFOUR_WIDGET_ORIGIN')) putenv("TWENTYFOUR_WIDGET_ORIGIN=http://localhost:$PORT");
$DIR = sys_get_temp_dir() . '/24t-' . $P['slug'];
// Events, signals and seen deliveries per webhook secret (a fresh `24t listen` is a fresh run), so
// a restart never shows the last run's events; the cookie key stays in $DIR.
$RUN = "$DIR/run-" . substr(hash('sha256', (string) getenv('TWENTYFOUR_WEBHOOK_SECRET')), 0, 12);
@mkdir($RUN, 0700, true);

// Demo login: a signed cookie for invented users. In a real platform this is your own login.
// The key is made once ('x' mode: only the first request to get here writes it) and reused.
function cookieKey(string $dir): string {
    $f = "$dir/cookie.key";
    if ($h = @fopen($f, 'x')) { fwrite($h, bin2hex(random_bytes(32))); fclose($h); chmod($f, 0600); }
    for ($i = 0; $i < 50 && ($k = (string) @file_get_contents($f)) === ''; $i++) usleep(10_000); // a racing writer
    return $k;
}
$KEY = getenv('SESSION_SECRET') ?: cookieKey($DIR);
$sign = fn (string $v) => $v . '.' . substr(hash_hmac('sha256', $v, $KEY), 0, 32);
function user(callable $sign): ?array {
    $raw = $_COOKIE['demo_user'] ?? null; // PHP has already URL-decoded it
    if (!is_string($raw) || ($at = strrpos($raw, '.')) === false || !hash_equals($sign(substr($raw, 0, $at)), $raw)) return null;
    [$role, $ref] = explode(':', substr($raw, 0, $at), 2) + [1 => ''];
    return ['role' => $role, 'ref' => $ref];
}
$me = user($sign);

// Files as shared state: append a JSON line under an exclusive lock; $fn sees the lines before it.
function append(string $file, callable $fn): void {
    $h = fopen($file, 'c+'); flock($h, LOCK_EX);
    $lines = array_filter(explode("\n", stream_get_contents($h)));
    fseek($h, 0, SEEK_END); fwrite($h, json_encode($fn(count($lines)), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
    flock($h, LOCK_UN); fclose($h);
}
function lines(string $file): array {
    if (!is_file($file)) return [];
    $h = fopen($file, 'r'); flock($h, LOCK_SH); $t = stream_get_contents($h); flock($h, LOCK_UN); fclose($h);
    return array_map(fn ($l) => json_decode($l, true), array_values(array_filter(explode("\n", $t))));
}

$tf = new Client(); // key, base, webhook secret, widget origin from the environment
$clinicianRoutes = new Routes($tf,
    currentClinician: fn (KitRequest $r) => $me && $me['role'] === 'therapist' ? $me['ref'] : null,
    onEvent: function (array $ev, ?string $d) use ($RUN): void {
        append("$RUN/events.jsonl", fn () => ['id' => $ev['id'] ?? null, 'type' => $ev['type'] ?? null, 'delivery' => $d, 'data' => $ev['data'] ?? null, 'received_at' => gmdate('c')]);
    },
    seen: fn (string $id) => !($h = @fopen("$RUN/seen-" . hash('sha256', $id), 'x')) || !fclose($h), // first one to create the file handles it
);
$patientRoutes = Routes::patient($tf, function (KitRequest $r) use ($me): ?array {
    if (!$me || $me['role'] !== 'patient') return null;
    [$subject, $ref] = explode('|', $me['ref'], 2) + [1 => ''];
    return ['subject' => $subject, 'patient_user_ref' => $ref];
}, fn () => true);

function send(int $code, mixed $body, string $type = 'application/json'): void {
    http_response_code($code); header("Content-Type: $type"); header('Cache-Control: no-store');
    echo $type === 'application/json' ? json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : $body;
}
function body(): array { return json_decode((string) file_get_contents('php://input'), true) ?: []; }
function err(Throwable $e): array {
    return $e instanceof TwentyFourError
        ? ['status' => $e->status, 'code' => $e->errorCode, 'type' => $e->type, 'message' => $e->getMessage(), 'request_id' => $e->requestId, 'retry_after' => $e->retryAfter]
        : ['error' => (new ReflectionClass($e))->getShortName(), 'message' => $e->getMessage()];
}
// Memory and copilot: no kit method, so plain curl with the key (it stays on this server).
function raw(Client $tf, string $method, string $path, ?array $json = null): array {
    $h = curl_init($tf->apiBase . $path);
    $hdr = ['Authorization: Bearer ' . getenv('TWENTYFOUR_API_KEY'), 'Accept: application/json'];
    if ($json !== null) array_push($hdr, 'Content-Type: application/json', 'Idempotency-Key: ' . bin2hex(random_bytes(16)));
    curl_setopt_array($h, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $hdr, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60]
        + ($json !== null ? [CURLOPT_POSTFIELDS => json_encode($json, JSON_UNESCAPED_UNICODE)] : []));
    $t = curl_exec($h); $status = (int) curl_getinfo($h, CURLINFO_RESPONSE_CODE); curl_close($h);
    return [$t === false ? 502 : $status, $t === false ? ['error' => 'upstream_unreachable'] : json_decode($t, true)];
}

$STATIC = ['/' => 'base/web/therapist.html', '/patient' => 'base/web/patient.html', '/vendor/24therapy-browser-0.6.1.iife.js' => 'vendor/24therapy-browser-0.6.1.iife.js'];
$MIME = ['html' => 'text/html; charset=utf-8', 'js' => 'text/javascript', 'css' => 'text/css'];
$p = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$method = $_SERVER['REQUEST_METHOD'];

try {
    // The kit's routes get the raw body (the webhook signature covers the exact bytes).
    foreach (['/24t-patient/' => $patientRoutes, '/24t/' => $clinicianRoutes] as $prefix => $routes) {
        if (!str_starts_with($p, $prefix)) continue;
        $raw = (string) file_get_contents('php://input', false, null, 0, Routes::MAX_AUDIO_BYTES + 1);
        $answer = $routes->handle(new KitRequest($method, substr($p, strlen($prefix) - 1), getallheaders() ?: [], $raw));
        return $answer ? $answer->emit() : send(404, ['error' => 'not_found']);
    }
    $file = $STATIC[$p] ?? (str_starts_with($p, '/static/') ? 'base/web/' . basename($p) : null);
    if ($file && is_file(ROOT . "/$file")) return send(200, file_get_contents(ROOT . "/$file"), $MIME[pathinfo($file, PATHINFO_EXTENSION)] ?? 'text/plain');
    if ($p === '/config') return send(200, ['slug' => $P['slug'], 'name' => $P['name'], 'provider' => $PROVIDER, 'colours' => ['primary' => $P['primary'], 'ink' => $P['ink'], 'surface' => $P['surface']], 'logo' => $P['logo'], 'patientRecorder' => $PROVIDER === 'zoom']);
    if ($p === '/login' && $method === 'POST') { $b = body();
        header('Set-Cookie: demo_user=' . rawurlencode($sign("{$b['role']}:{$b['ref']}")) . '; HttpOnly; SameSite=Lax; Path=/'); return send(200, ['ok' => true]); }
    if (preg_match('#^/api/signal/([A-Za-z0-9_-]{1,80})$#D', $p, $m)) { $q = "$RUN/signal-{$m[1]}.jsonl";
        if ($method === 'POST') { $b = body(); append($q, fn ($n) => $b + ['n' => $n + 1]); return send(200, ['ok' => true]); }
        return send(200, ['messages' => array_values(array_filter(lines($q), fn ($x) => $x['n'] > (int) ($_GET['since'] ?? 0)))]); }
    if (!$me) return send(401, ['error' => 'sign_in']);
    if ($p === '/api/start' && $method === 'POST') {
        $b = body();
        $tf->put_clinician($me['ref'], ['label' => "{$P['name']} therapist", 'copilot_enabled' => true]);
        $subject = $tf->create_subject(['external_ref' => $b['patient_ref'], 'adult_confirmed' => true, 'locale' => 'ar']);
        $s = $tf->create_session(['external_ref' => "S-{$P['slug']}-" . (int) (microtime(true) * 1000), 'subject' => $subject['id'], 'clinician' => $me['ref'], 'language_hint' => 'ar', 'note_format' => 'soap', 'dialect' => 'ar-EG', 'memory' => true]);
        return send(201, ['session' => $s['id'], 'subject' => $subject['id'], 'created_at' => $s['created_at'], 'status' => $s['status'], 'patient_consent_url' => $s['patient_consent_url'], 'room' => $s['id']]);
    }
    if (preg_match('#^/api/room/([A-Za-z0-9_-]{1,80})$#D', $p, $m)) { // the video token service on localhost builds the join data
        $t = file_get_contents('http://127.0.0.1:' . (getenv('VIDEO_TOKEN_PORT') ?: 4000) . '/token?' . http_build_query(['provider' => $PROVIDER, 'room' => $m[1], 'role' => $me['role']]));
        return send(200, json_decode((string) $t, true)); }
    if (preg_match('#^/api/sessions/(ses_[0-9a-f]{32})/(segments|end|overview|note/approve|summary/approve)$#D', $p, $m)) {
        [, $id, $what] = $m;
        if ($what === 'segments') return send(200, $tf->send_segments($id, body()['segments'] ?? []));
        if ($what === 'end') return send(200, $tf->end_session($id));
        if ($what === 'overview') {
            $try = function (callable $f) { try { return $f(); } catch (TwentyFourError $e) { return err($e); } };
            $note = $try(fn () => $tf->get_note($id)); $summary = $try(fn () => $tf->get_summary($id));
            $out = ['session' => $tf->get_session($id), 'note' => $note, 'summary' => $summary, 'alerts' => $tf->list_risk_alerts(['session' => $id]), 'transcript' => raw($tf, 'GET', "/sessions/$id/transcript")[1]];
            $out['record'] = ($note['status'] ?? null) === 'approved' ? TwentyFourTherapy\note_for_record($note, ($summary['status'] ?? null) === 'delivered' ? $summary : null) : null;
            return send(200, $out);
        }
        if ($what === 'note/approve') { $n = $tf->get_note($id); // the draft's sections, an empty one as "—"
            $sections = array_map(fn ($v) => $v ?: '—', $n['draft']['sections']);
            return send(200, $tf->approve_note($id, ['approved_by' => $me['ref'], 'sections' => $sections])); }
        if ($what === 'summary/approve') { $d = $tf->get_summary($id)['draft'];
            $text = implode("\n", array_filter([$d['brief'] ?? null, ...($d['steps'] ?? []), $d['next'] ?? null]));
            return send(200, $tf->approve_summary($id, ['approved_by' => $me['ref'], 'text' => $text])); }
    }
    if (preg_match('#^/api/risk/(alr_[0-9a-f]{32})/ack$#D', $p, $m)) { $tf->get_risk_alert($m[1]); // read the quotes first, or 409 quotes_not_read
        return send(200, $tf->acknowledge_risk_alert($m[1], ['by' => $me['ref'], 'note' => 'Reviewed with the patient in session; safety plan agreed (invented test).', 'outcome' => 'patient_contacted_plan_made'])); }
    if (preg_match('#^/api/subjects/(sub_[0-9a-f]{32})/memory$#D', $p, $m)) { [$c, $j] = raw($tf, 'GET', "/subjects/{$m[1]}/memory?clinician=" . rawurlencode($me['ref'])); return send($c, $j); }
    if ($p === '/api/copilot') { $b = body();
        [$c, $j] = raw($tf, 'POST', '/copilot/questions', ['subject' => $b['subject'] ?? null, 'clinician' => $me['ref'], 'question' => $b['question'] ?? null, 'session' => $b['session'] ?? null]);
        return send($c, $j); }
    if ($p === '/api/usage') return send(200, $tf->get_usage());
    if ($p === '/api/events') return send(200, ['events' => lines("$RUN/events.jsonl")]);
    if ($p === '/api/errors') { $out = [];
        try { $tf->get_session('not-an-id'); } catch (InvalidArgumentException $e) { $out['bad_id'] = err($e); } // raised before anything is sent
        try { $tf->get_session('ses_' . str_repeat('0', 32)); } catch (TwentyFourError $e) { $out['unknown'] = err($e); }
        try { (new Client(['api_key' => '24t_sk_test_' . str_repeat('x', 43)]))->ping(); } catch (TwentyFourError $e) { $out['bad_key'] = err($e); }
        return send(200, $out); }
    send(404, ['error' => 'not_found']);
} catch (Throwable $e) {
    send($e instanceof TwentyFourError ? ($e->status ?: 502) : 500, err($e));
}
