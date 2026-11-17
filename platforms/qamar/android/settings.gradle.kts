// Qamar Clinic (Android, Kotlin) on the 24Therapy Android kit 0.2.0 + Agora.
// The kit modules come from the portal download (kits/, git-ignored): run tools/vendor-kits.sh first.
pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositories { google(); mavenCentral() } }
rootProject.name = "qamar-clinic"
val kit = file("../../../kits/x/24therapy-android/kits/android-agora")
include(":core", ":agora", ":app")
project(":core").projectDir = kit.resolve("core")
project(":agora").projectDir = kit.resolve("agora")
