import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("kotlin-android")
    // Flutter Gradle plugin must be applied AFTER Android + Kotlin.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing — read from `android/key.properties` (gitignored).
// When the file is absent (typical dev setup), the release build still
// works against the debug signing config; the keystore is required only
// to publish to Play.
val keyProperties = Properties()
val keyPropertiesFile = rootProject.file("key.properties")
if (keyPropertiesFile.exists()) {
    FileInputStream(keyPropertiesFile).use { keyProperties.load(it) }
}

android {
    namespace = "sy.gov.patient360.mobile"
    // Firebase Messaging 15.x pulls androidx.core 1.18 which requires
    // compileSdk 36 at compile time. minSdk + targetSdk stay separate so
    // runtime behavior is unchanged from the brief's targets.
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // Required by flutter_local_notifications (uses java.time APIs
        // that aren't natively available below API 26). Desugaring
        // back-ports them via the Android Gradle Plugin's library
        // desugaring tooling.
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "sy.gov.patient360.mobile"
        // Firebase Messaging requires Android 6.0+ (API 23). Stay conservative
        // — most Syrian Android devices are 6.0 or newer per Play Console
        // distribution numbers.
        minSdk = flutter.minSdkVersion
        targetSdk = 34
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (keyPropertiesFile.exists()) {
                keyAlias = keyProperties["keyAlias"] as String?
                keyPassword = keyProperties["keyPassword"] as String?
                storeFile = (keyProperties["storeFile"] as String?)
                    ?.let { rootProject.file(it) }
                storePassword = keyProperties["storePassword"] as String?
            }
        }
    }

    buildTypes {
        release {
            // Use the release signing config when keystore details are
            // present; otherwise fall back to the debug keys so
            // `flutter run --release` keeps working in development.
            signingConfig = if (keyPropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

// Apply the Google Services plugin only when google-services.json is in
// place. This lets `flutter run --debug` and CI work for contributors
// who haven't completed the Firebase setup yet — push notifications
// degrade to a no-op (FcmHandler logs a warning), the rest of the app
// still launches. See lib/features/notifications/FIREBASE_SETUP.md.
val googleServicesJson = file("google-services.json")
if (googleServicesJson.exists()) {
    apply(plugin = "com.google.gms.google-services")
} else {
    logger.warn(
        "[Patient 360] android/app/google-services.json missing — " +
        "skipping com.google.gms.google-services plugin. Push notifications disabled."
    )
}
