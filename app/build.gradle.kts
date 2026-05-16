import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
}

val secrets = Properties()
val secretsFile = rootProject.file("secrets.properties")
if (secretsFile.exists()) {
    secretsFile.inputStream().use { secrets.load(it) }
}

fun secretString(name: String, fallback: String = ""): String {
    return secrets.getProperty(name, fallback)
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
}

android {
    namespace = "com.svjkr.sonytvlauncher"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "com.svjkr.sonytvlauncher"
        minSdk = 31
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "PLEX_SERVER_URL_TV", "\"${secretString("PLEX_SERVER_URL_TV")}\"")
        buildConfigField("String", "PLEX_SERVER_URL_EMULATOR", "\"${secretString("PLEX_SERVER_URL_EMULATOR", "http://10.0.2.2:32400")}\"")
        buildConfigField("String", "PLEX_TOKEN", "\"${secretString("PLEX_TOKEN")}\"")
        buildConfigField("String", "SPOTIFY_CLIENT_ID", "\"${secretString("SPOTIFY_CLIENT_ID")}\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.core.ktx)
    implementation(libs.material)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
}
