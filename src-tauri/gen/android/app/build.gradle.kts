import com.android.build.gradle.internal.api.BaseVariantOutputImpl
import java.io.File
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

// ---- Android release 签名(密钥与密码均不入库) ----
// 只从本机固定目录读取: ~/.only-talk/android/keystore.properties
// (Windows: %USERPROFILE%\.only-talk\android\keystore.properties), 不读取任何环境变量。
// 密钥与密码均在仓库外, 不会被提交。properties 示例:
//   storeFile=upload-keystore.jks   # 相对该目录, 也可写绝对路径
//   storePassword=xxxx
//   keyAlias=upload
//   keyPassword=xxxx
// 详见 src-tauri/docs/android-signing.md。
val androidKeystoreDir = File(System.getProperty("user.home"), ".only-talk/android")
val androidKeystoreProps = Properties().apply {
    val f = File(androidKeystoreDir, "keystore.properties")
    if (f.isFile) f.inputStream().use { load(it) }
}
val androidKeystoreFile: File = androidKeystoreProps.getProperty("storeFile")?.let {
    val f = File(it)
    if (f.isAbsolute) f else File(androidKeystoreDir, it)
} ?: File(androidKeystoreDir, "upload-keystore.jks")
val androidKeystoreAlias = androidKeystoreProps.getProperty("keyAlias", "upload")
val androidStorePassword = androidKeystoreProps.getProperty("storePassword")
val androidKeyPassword = androidKeystoreProps.getProperty("keyPassword")
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

/// 打包产物命名用的版本号(AGP 不提供公开的产物改名 API, 见文件末尾 android{} 内的说明)
val androidVersionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")

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
                    "[signing] 未检测到 Android 签名配置, release 将产出未签名 APK。" +
                        " 预期密钥: $androidKeystoreFile;" +
                        " 请在本机 ~/.only-talk/android/keystore.properties 配置 storeFile/storePassword/keyAlias/keyPassword" +
                        " (见 src-tauri/docs/android-signing.md)。"
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

    // ---- 打包产物命名: Only.Talk_<version>_<arch>[_<buildType>].apk ----
    // 默认产物名(app-arm64-release.apk)既看不出版本也看不出架构, 客户端自动更新也无法按 ABI 精确挑选。
    // 统一为: Only.Talk_1.0.4_arm64-v8a.apk / Only.Talk_1.0.4_armeabi-v7a.apk / Only.Talk_1.0.4_universal.apk
    // 注意: 自动更新(src-tauri/src/service/update_service.rs)按"当前进程 ABI"匹配文件名中的架构, 改名后需保持
    // 架构标识(arm64-v8a/armeabi-v7a/x86/x86_64/universal)不变; 该文件被 `tauri android init` 重新生成后需重新应用本段。
    // AGP 8.5 没有公开的产物改名 API(VariantOutput 无 outputFileName), 故用内部 BaseVariantOutputImpl,
    // 待 AGP 提供公开 API 后应换成 androidComponents.onVariants。
    applicationVariants.all {
        val flavor = flavorName.ifBlank { "universal" }
        val archLabel = when (flavor) {
            "arm64" -> "arm64-v8a"
            "arm" -> "armeabi-v7a"
            else -> flavor
        }
        val buildTypeSuffix = if (buildType.name == "release") "" else "_${buildType.name}"
        outputs.all {
            val output = this as BaseVariantOutputImpl
            val abi = output.getFilter("ABI") ?: archLabel
            output.outputFileName = "Only.Talk_${androidVersionName}_${abi}${buildTypeSuffix}.apk"
        }
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