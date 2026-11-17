import XCTest
@testable import LaylaCore
final class LaylaCoreTests: XCTestCase {
    func testCutterOverlapAndSize() {
        let pcm = [Int16](repeating: 100, count: 45 * Wav.rate)
        let p = Cutter().cut(pcm, from: 3)
        XCTAssertEqual(p.count, 3); XCTAssertEqual(p[0].startSeconds, 3); XCTAssertEqual(p[1].startSeconds, 21.5, accuracy: 0.001)
        XCTAssertTrue(p.allSatisfy { $0.wav.count <= 4_194_304 })
        XCTAssertEqual(Wav.samples(p[0].wav).count, 20 * Wav.rate)
    }
    func testKeyShape() {
        let k = pieceKey(session: "ses_" + String(repeating: "a", count: 32), start: 600, speaker: "patient", wav: Data([1, 2]))
        XCTAssertTrue(k.hasPrefix("aud-")); XCTAssertEqual(k.count, 36)
        XCTAssertEqual(k, pieceKey(session: "ses_" + String(repeating: "a", count: 32), start: 600.0004, speaker: "patient", wav: Data([1, 2])))
    }
    func testBundledAudioIsInvented16kMono() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../../../../base/scenario/session-ar.wav").standardized
        let d = try Data(contentsOf: url); XCTAssertEqual(d[22], 1); XCTAssertEqual(Int(d[24]) | Int(d[25]) << 8, 16000)
    }
}
