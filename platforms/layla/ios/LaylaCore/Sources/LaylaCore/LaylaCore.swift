import Foundation
import CryptoKit

/// 16 kHz mono 16-bit WAV, as the docs' piece table asks.
public enum Wav {
    public static let rate = 16_000
    public static func encode(_ s: ArraySlice<Int16>) -> Data {
        var d = Data(); let bytes = UInt32(s.count * 2)
        func u32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
        func u16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
        d.append("RIFF".data(using: .ascii)!); u32(36 + bytes); d.append("WAVEfmt ".data(using: .ascii)!)
        u32(16); u16(1); u16(1); u32(UInt32(rate)); u32(UInt32(rate * 2)); u16(2); u16(16)
        d.append("data".data(using: .ascii)!); u32(bytes); for v in s { u16(UInt16(bitPattern: v)) }; return d
    }
    /// Reads the PCM samples of a 16-bit mono WAV (the bundled invented file).
    public static func samples(_ d: Data) -> [Int16] {
        guard d.count > 44 else { return [] }
        return stride(from: 44, to: d.count - 1, by: 2).map { Int16(bitPattern: UInt16(d[$0]) | UInt16(d[$0 + 1]) << 8) }
    }
}

/// Pieces of about 20 s, each starting 1.5 s before the previous one ended (docs: Length, Overlap).
public struct Piece { public let startSeconds: Double; public let wav: Data }
public struct Cutter {
    public var pieceSeconds = 20.0, overlapSeconds = 1.5
    public init() {}
    public func cut(_ pcm: [Int16], from start: Double) -> [Piece] {
        var out: [Piece] = []; var i = 0; let len = Int(pieceSeconds) * Wav.rate, back = Int(overlapSeconds * Double(Wav.rate))
        while i < pcm.count { let end = min(i + len, pcm.count)
            out.append(Piece(startSeconds: start + Double(i) / Double(Wav.rate), wav: Wav.encode(pcm[i..<end])))
            if end == pcm.count { break }; i = end - back }
        return out
    }
}

/// The docs' idempotency key: "aud-" + first 32 hex of SHA-256 over <session>:<start, 3 decimals>:<speaker>:<hex SHA-256 of the bytes>.
public func pieceKey(session: String, start: Double, speaker: String?, wav: Data) -> String {
    let hex = { (d: Data) in SHA256.hash(data: d).map { String(format: "%02x", $0) }.joined() }
    let line = "\(session):\(String(format: "%.3f", start)):\(speaker ?? "mixed"):\(hex(wav))"
    return "aud-" + String(hex(Data(line.utf8)).prefix(32))
}

/// Talks only to the platform's own server (its kit relay under /24t). Never a 24Therapy key.
public final class Relay {
    public let base: URL; public var cookie = ""
    public init(base: URL) { self.base = base }
    func req(_ path: String, _ method: String = "GET", body: Data? = nil, headers: [String: String] = [:]) async throws -> (Int, [String: Any], HTTPURLResponse) {
        var r = URLRequest(url: base.appendingPathComponent(path)); r.httpMethod = method; r.httpBody = body
        if !cookie.isEmpty { r.setValue(cookie, forHTTPHeaderField: "Cookie") }
        for (k, v) in headers { r.setValue(v, forHTTPHeaderField: k) }
        let (d, resp) = try await URLSession.shared.data(for: r); let h = resp as! HTTPURLResponse
        if let c = h.value(forHTTPHeaderField: "Set-Cookie") { cookie = String(c.split(separator: ";")[0]) }
        return (h.statusCode, (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] ?? [:], h)
    }
    public func json(_ path: String, _ obj: [String: Any]?, method: String = "POST") async throws -> [String: Any] {
        let (s, j, _) = try await req(path, obj == nil ? "GET" : method, body: obj.map { try! JSONSerialization.data(withJSONObject: $0) }, headers: ["Content-Type": "application/json"])
        if s >= 400 { throw NSError(domain: "server", code: s, userInfo: [NSLocalizedDescriptionKey: "\(s) \(j)"]) }; return j
    }
    /// Step 3/6: consent state (record, stop) from the kit route on the platform's server.
    public func consent(_ session: String) async throws -> [String: Any] { try await json("24t/sessions/\(session)/consent-state", nil) }
    /// Step 5: one piece, in order, retried with the same key on 429/5xx (Retry-After up to 60 s).
    public func send(_ session: String, _ p: Piece, speaker: String) async throws -> Int {
        let key = pieceKey(session: session, start: p.startSeconds, speaker: speaker, wav: p.wav)
        for attempt in 0..<5 {
            let (s, j, h) = try await req("24t/sessions/\(session)/audio", "POST", body: p.wav, headers: ["Content-Type": "audio/wav", "X-Audio-Start-Seconds": String(format: "%.3f", p.startSeconds), "X-Audio-Speaker": speaker, "Idempotency-Key": key])
            if s == 429 || s >= 500 || (j["error"] as? [String: Any])?["code"] as? String == "idempotency_in_progress" {
                let wait = Double(h.value(forHTTPHeaderField: "Retry-After") ?? "") ?? pow(2, Double(attempt)); if wait > 60 { return s }
                try await Task.sleep(nanoseconds: UInt64(wait * 1e9)); continue }
            return s
        }
        return 503
    }
}
