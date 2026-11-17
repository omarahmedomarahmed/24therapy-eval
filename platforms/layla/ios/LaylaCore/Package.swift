// swift-tools-version:5.9
// Layla Health: the docs' "An app with no kit" steps (/docs/apps/other), in plain Swift. No 24Therapy kit code.
import PackageDescription
let package = Package(name: "LaylaCore", platforms: [.iOS(.v16), .macOS(.v13)],
  products: [.library(name: "LaylaCore", targets: ["LaylaCore"])],
  targets: [.target(name: "LaylaCore"), .testTarget(name: "LaylaCoreTests", dependencies: ["LaylaCore"])])
