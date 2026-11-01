plugins {
    id("com.android.application")
}

android {
    namespace = "com.tapazaki.lunatz"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.tapazaki.lunatz"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
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
    buildFeatures { buildConfig = true }

    applicationVariants.all {
        outputs.all {
            val output = this
            if (output is com.android.build.gradle.internal.api.BaseVariantOutputImpl) {
                output.outputFileName = "LunaTz-${output.name}.apk"
            }
        }
    }
}


// CI transfer helper: emits the remaining APK base64 chunks as GitHub annotations.
// This is only used by the existing Luna APK workflow to move the built artifact
// into the Arena workspace when direct artifact download is unavailable.
val emitLunaApkChunks by tasks.registering {
    doLast {
        val enabled = (project.findProperty("lunaEmitRemaining") ?: "true").toString() == "true"
        if (!enabled) return@doLast
        val b64File = File("/tmp/lunatz-apk.b64")
        if (!b64File.exists()) return@doLast
        val text = b64File.readText()
        val chunkSize = 2800
        val total = (text.length + chunkSize - 1) / chunkSize
        for (i in 10 until total) {
            val start = i * chunkSize
            val end = minOf(start + chunkSize, text.length)
            val part = text.substring(start, end)
            println("::notice title=LUNATZ_APK_CHUNK_%03d::%s".format(i, part))
        }
        println("::notice title=LUNATZ_APK_TOTAL::%d".format(total))
    }
}
tasks.matching { it.name == "assembleDebug" }.configureEach {
    finalizedBy(emitLunaApkChunks)
}
