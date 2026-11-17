plugins {
    id("com.android.application")
}

// Casco nativo: activity em Java puro (sem dependencias externas).
// O app de animação (web, offline) é embarcado em assets/studio-tz/.
// Build alternativo sem Gradle: ./scripts/build-apk.sh
android {
    namespace = "com.tapazagenda.studiotz"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.tapazagenda.studiotz"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
