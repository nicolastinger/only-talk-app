import java.io.File
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

// ---- Android release 签名(密钥与密码均不入库) ----
// 密钥默认位于 ~/.only-talk/android/upload-keystore.jks, 可用 ANDROID_KEYSTORE_PATH 覆盖;
// 别名/密码一律从环境变量读取: ANDROID_KEY_ALIAS / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_PASSWORD。
// 详见 src-tauri/docs/self-update.md §7.2。
val androidKeystorePath = System.getenv("ANDROID_KEYSTORE_PATH")
val androidKeystoreFile = File(
    androidKeystorePath ?: "${System.getProperty("user.home")}/.only-talk/android/upload-keystore.jks"
)
val androidKeystoreAlias = System.getenv("ANDROID_KEY_ALIAS") ?: "upload"
val androidStorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
val androidKeyPassword = System.getenv("ANDROID_KEY_PASSWORD")
val hasAndroidReleaseSigning = androidKeystoreFile.isFile &&
    !androidKeystoreAlias.isNullOrBlank() &&
    !androidStorePassword.isNullOrBlank() &&
    !androidKeyPassword.isNullOrBlank()

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 34
    namespace = "com.only.talk.app"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.only.talk.app"
        minSdk = 24
        targetSdk = 34
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
        // ABI 分包策略见 docs/安卓APK按ABI分包打包策略.md。
        // 分包由 Tauri CLI 的 `--split-per-abi --target aarch64 --target armv7` 控制：
        // RustPlugin.kt 按 productFlavor(arm64/arm/x86/x86_64) 生成独立 task。
        // 注意：defaultConfig 不能写死 ndk.abiFilters，否则会与 product flavor 的
        // abiFilters 合并(取并集)，导致 arm 包混入 arm64 的 .so。
        // x86(i686) / x86_64 为占位架构，暂不启用，需要时追加 `--target i686` 等即可。
    }
    signingConfigs {
        create("release") {
            val alias = androidKeystoreAlias
            val storePass = androidStorePassword
            val keyPass = androidKeyPassword
            if (androidKeystoreFile.isFile && alias != null && storePass != null && keyPass != null) {
                storeFile = androidKeystoreFile
                keyAlias = alias
                storePassword = storePass
                keyPassword = keyPass
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            if (hasAndroidReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            } else {
                logger.warn(
                    "[signing] 未检测到 Android 签名密钥/环境变量, release 将产出未签名 APK。" +
                        " 预期密钥: $androidKeystoreFile;" +
                        " 需设置 ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_PASSWORD (可选 ANDROID_KEY_ALIAS、ANDROID_KEYSTORE_PATH)。"
                )
            }
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.6.1")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.8.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")