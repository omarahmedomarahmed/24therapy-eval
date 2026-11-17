import SwiftUI
import SafariServices
import LaylaCore

/// Layla Health therapist screen: the docs' no-kit protocol, steps 1 to 7, against the platform's own server.
@main struct LaylaApp: App { var body: some Scene { WindowGroup { ContentView().environment(\.layoutDirection, .rightToLeft) } } }

struct ContentView: View {
    static let primary = Color(red: 0xD6/255, green: 0x33/255, blue: 0x6C/255), ink = Color(red: 0x3D/255, green: 0x0A/255, blue: 0x1E/255), surface = Color(red: 1, green: 0xF3/255, blue: 0xF7/255)
    @State var server = ProcessInfo.processInfo.environment["SERVER_BASE"] ?? "http://localhost:3080"
    @State var status = "—"; @State var session: [String: Any] = [:]; @State var consentURL: URL?; @State var showConsent = false
    @State var sent = 0
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack { Image(systemName: "swift").foregroundColor(.white); Text("Layla Health · ليلى").bold().foregroundColor(.white); Spacer(); Text("vonage").font(.caption).foregroundColor(.white) }
                .padding().background(Self.primary)
            TextField("server", text: $server).textFieldStyle(.roundedBorder).environment(\.layoutDirection, .leftToRight).accessibilityIdentifier("server")
            Button("ابدأ الجلسة · Start session") { Task { await start() } }.buttonStyle(.borderedProminent).tint(Self.primary).accessibilityIdentifier("start")
            Button("صفحة الموافقة · Consent page") { showConsent = consentURL != nil }.accessibilityIdentifier("consent")
            Button("Feed bundled audio (no-kit pieces)") { Task { await feed() } }.accessibilityIdentifier("feed")
            Button("إنهاء · End") { Task { await end() } }.accessibilityIdentifier("end")
            Text(status).foregroundColor(Self.ink).accessibilityIdentifier("status")
            Text("pieces sent: \(sent)").font(.caption).foregroundColor(Self.ink)
            Spacer()
        }.padding().background(Self.surface).sheet(isPresented: $showConsent) { if let u = consentURL { Safari(url: u) } }
    }
    var relay: Relay { Self.shared(server) }
    static var relays: [String: Relay] = [:]
    static func shared(_ s: String) -> Relay { if let r = relays[s] { return r }; let r = Relay(base: URL(string: s)!); relays[s] = r; return r }
    func start() async {
        do { _ = try await relay.json("login", ["role": "therapist", "ref": "C-LAYLA-1"])
            session = try await relay.json("api/start", ["patient_ref": "P-LAYLA-\(Int(Date().timeIntervalSince1970))"])
            consentURL = URL(string: session["patient_consent_url"] as? String ?? ""); status = "awaiting consent"
            let room = try await relay.json("api/room/\(session["session"] as! String)", nil)
            if let b = room["blocked"] as? String { status = "awaiting consent · video \(b)" }
        } catch { status = "error: \(error.localizedDescription)" }
    }
    /// Steps 3-6 with the bundled invented WAV as the generic input (no microphone in the simulator).
    func feed() async {
        guard let id = session["session"] as? String, let url = Bundle.main.url(forResource: "session-ar", withExtension: "wav"), let d = try? Data(contentsOf: url) else { status = "start first"; return }
        do { var c = try await relay.consent(id)
            while c["record"] as? Bool != true { if c["stop"] as? Bool == true { status = "stopped"; return }; status = "waiting for the patient's yes"; try await Task.sleep(nanoseconds: 5_000_000_000); c = try await relay.consent(id) }
            let from = (c["session_seconds"] as? Double) ?? (c["recording_from_seconds"] as? Double) ?? 0
            for p in Cutter().cut(Wav.samples(d), from: from) {
                let s = try await relay.send(id, p, speaker: "clinician"); if s == 403 || s == 409 { status = "relay answered \(s): stop"; return }; sent += 1; status = "piece @\(Int(p.startSeconds))s → \(s)" }
        } catch { status = "error: \(error.localizedDescription)" }
    }
    func end() async { guard let id = session["session"] as? String else { return }
        do { let e = try await relay.json("api/sessions/\(id)/end", [:]); status = "ended · \(e["status"] ?? "")" } catch { status = "error: \(error.localizedDescription)" } }
}
struct Safari: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ c: SFSafariViewController, context: Context) {}
}
