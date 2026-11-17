plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "app.bahr.bahr_mind"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "app.bahr.bahr_mind"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = 28 // the 24Therapy kit's plugins need 28
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // Agora ships native libraries for every ABI, and the Flutter Gradle plugin resets
    // abiFilters: with --target-platform, package only the ABIs Flutter built for.
    val abis = mapOf("android-arm64" to "arm64-v8a", "android-arm" to "armeabi-v7a", "android-x64" to "x86_64", "android-x86" to "x86")
    val targets = (project.findProperty("target-platform") as String?)?.split(",")?.mapNotNull { abis[it] }
    if (!targets.isNullOrEmpty()) {
        packaging { jniLibs { excludes += (abis.values - targets.toSet()).map { "lib/$it/**" } } }
    }

    // An audio-only call: leave out Agora's video and vision extensions (loaded on demand).
    packaging {
        jniLibs {
            excludes += listOf(
                "lip_sync", "clear_vision", "face_capture", "face_detection", "segmentation", "content_inspect",
                "video_quality_analyzer", "video_av1_encoder", "video_encoder", "screen_capture", "spatial_audio",
            ).map { "lib/*/libagora_${it}_extension.so" } + "lib/*/libvideo_dec.so"
        }
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
