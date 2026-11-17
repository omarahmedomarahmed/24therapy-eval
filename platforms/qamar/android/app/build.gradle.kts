plugins { id("com.android.application"); kotlin("android") }
android {
    namespace = "app.qamar.clinic"
    compileSdk = 35
    defaultConfig {
        applicationId = "app.qamar.clinic"; minSdk = 28; targetSdk = 35; versionCode = 1; versionName = "0.1.0"
        // The platform's own server (never 24Therapy's API, never a key). Pass -PserverBase=https://...
        buildConfigField("String", "SERVER_BASE", "\"${(findProperty("serverBase") as String?) ?: "http://10.0.2.2:3050"}\"")
        buildConfigField("String", "WIDGET_FRAME_ORIGIN", "\"${(findProperty("widgetOrigin") as String?) ?: "https://qamar.example.com"}\"")
    }
    buildFeatures { buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    buildTypes { release { isMinifyEnabled = false; signingConfig = signingConfigs.getByName("debug") } }
}
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
dependencies {
    implementation(project(":agora"))
    implementation("io.agora.rtc:voice-sdk:4.6.4")
    implementation("androidx.core:core-ktx:1.15.0")
}
