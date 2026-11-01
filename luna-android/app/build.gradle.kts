plugins {
    id("com.android.application")
}

android {
    namespace = "com.tapazaki.lunatz"
    compileSdk = 34
    ndkVersion = "27.0.12077973"

    defaultConfig {
        applicationId = "com.tapazaki.lunatz"
        minSdk = 24
        targetSdk = 34
        versionCode = 2
        versionName = "1.1.0"
        ndk { abiFilters += listOf("arm64-v8a") }
    }

    buildTypes {
        debug { isMinifyEnabled = false }
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { buildConfig = true }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    applicationVariants.all {
        outputs.all {
            val output = this
            if (output is com.android.build.gradle.internal.api.BaseVariantOutputImpl) {
                output.outputFileName = "LunaTz-${output.name}.apk"
            }
        }
    }
}

dependencies {
    implementation("androidx.core:core:1.13.1")
    implementation("org.java-websocket:Java-WebSocket:1.5.6")
    implementation("org.slf4j:slf4j-android:1.7.36")
}
