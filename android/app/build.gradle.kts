import java.io.File
import java.util.Properties
import org.gradle.api.GradleException

plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

fun loadDotEnvFile(file: File): Map<String, String> {
  if (!file.exists()) return emptyMap()

  return file.readLines()
    .mapNotNull { line ->
      val trimmed = line.trim()
      if (trimmed.isBlank() || trimmed.startsWith("#") || !trimmed.contains("=")) {
        return@mapNotNull null
      }

      val separatorIndex = trimmed.indexOf('=')
      val key = trimmed.substring(0, separatorIndex).trim()
      val value = trimmed.substring(separatorIndex + 1).trim().trim('"', '\'')
      if (key.isBlank()) return@mapNotNull null
      key to value
    }
    .toMap()
}

fun normalizeRemoteApiRoot(value: String?): String? {
  if (value.isNullOrBlank()) return null

  val normalized = value.trim().removeSuffix("/")
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    return null
  }

  return when {
    normalized.endsWith("/api/netease") -> normalized.removeSuffix("/api/netease")
    normalized.endsWith("/api") -> normalized.removeSuffix("/api")
    else -> normalized
  }
}

val dotEnvProperties = buildMap {
  putAll(loadDotEnvFile(rootProject.file("../.env")))
  putAll(loadDotEnvFile(rootProject.file("../.env.local")))
}
val webUrl = providers.gradleProperty("SPLAYER_WEB_URL").orElse("https://appassets.androidplatform.net/assets/www/index.html")
val targetAbi = providers.gradleProperty("targetAbi").orNull
val signingProperties = Properties().apply {
  val file = rootProject.file("keystore.properties")
  if (file.exists()) {
    file.inputStream().use(::load)
  }
}

fun readAndroidConfig(key: String): String? {
  val gradleValue = providers.gradleProperty(key).orNull
  if (!gradleValue.isNullOrBlank()) return gradleValue

  val envValue = providers.environmentVariable(key).orNull
  if (!envValue.isNullOrBlank()) return envValue

  val dotEnvValue = dotEnvProperties[key]
  if (!dotEnvValue.isNullOrBlank()) return dotEnvValue

  return signingProperties.getProperty(key)?.takeUnless { it.isBlank() }
}

val signingStorePath = readAndroidConfig("SPLAYER_SIGNING_STORE_FILE")
val signingStorePassword = readAndroidConfig("SPLAYER_SIGNING_STORE_PASSWORD")
val signingKeyAlias = readAndroidConfig("SPLAYER_SIGNING_KEY_ALIAS")
val signingKeyPassword = readAndroidConfig("SPLAYER_SIGNING_KEY_PASSWORD")
val remoteApiRoot =
  readAndroidConfig("SPLAYER_REMOTE_API_ROOT")
    ?.trim()
    ?.removeSuffix("/")
    ?: normalizeRemoteApiRoot(readAndroidConfig("VITE_API_URL"))
    ?: ""
val releaseSigningEnabled = listOf(
  signingStorePath,
  signingStorePassword,
  signingKeyAlias,
  signingKeyPassword,
).all { !it.isNullOrBlank() }
val releaseSigningFile = signingStorePath?.let {
  val targetFile = File(it)
  if (targetFile.isAbsolute) targetFile else rootProject.file(it)
}

if (releaseSigningEnabled && (releaseSigningFile == null || !releaseSigningFile.exists())) {
  throw GradleException("Android 发布签名文件不存在：${releaseSigningFile?.path ?: signingStorePath}")
}

val syncWebAssets by tasks.registering(Sync::class) {
  from(rootProject.file("../android-web-dist"))
  into(layout.projectDirectory.dir("src/main/assets/www"))
}

tasks.matching { it.name == "preBuild" }.configureEach {
  dependsOn(syncWebAssets)
}

android {
  namespace = "top.imsyy.splayer.android"
  compileSdk = 36

  defaultConfig {
    applicationId = "top.imsyy.splayer.romcompat"
    minSdk = 24
    targetSdk = 36
    versionCode = 30308
    versionName = "3.0.0-rc.3-Beta8"
    buildConfigField("String", "SPLAYER_WEB_URL", "\"${webUrl.get()}\"")
    buildConfigField("String", "SPLAYER_REMOTE_API_ROOT", "\"$remoteApiRoot\"")
  }

  signingConfigs {
    if (releaseSigningEnabled && releaseSigningFile != null) {
      create("release") {
        storeFile = releaseSigningFile
        storePassword = signingStorePassword
        keyAlias = signingKeyAlias
        keyPassword = signingKeyPassword
        enableV1Signing = true
        enableV2Signing = true
      }
    }
  }

  buildTypes {
    debug {
      applicationIdSuffix = ".debug"
      versionNameSuffix = "-debug"
    }
    release {
      isMinifyEnabled = false
      proguardFiles(
        getDefaultProguardFile("proguard-android-optimize.txt"),
        "proguard-rules.pro",
      )
      signingConfig = if (releaseSigningEnabled) {
        signingConfigs.getByName("release")
      } else {
        signingConfigs.getByName("debug")
      }
    }
  }

  buildFeatures {
    buildConfig = true
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  kotlinOptions {
    jvmTarget = "17"
  }

  packaging {
    resources {
      excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
  }

  splits {
    abi {
      isEnable = true
      reset()
      if (targetAbi != null) {
        include(targetAbi)
      } else {
        include("armeabi-v7a", "arm64-v8a", "x86_64")
      }
      isUniversalApk = false
    }
  }
}

logger.lifecycle(
  if (releaseSigningEnabled) {
    "[android] 已加载发布签名配置"
  } else {
    "[android] 未配置发布签名，Release 测试产物将使用 debug 签名"
  },
)

dependencies {
  implementation("androidx.core:core-ktx:1.16.0")
  implementation("androidx.appcompat:appcompat:1.7.1")
  implementation("com.google.android.material:material:1.12.0")
  implementation("androidx.webkit:webkit:1.14.0")
  implementation("androidx.activity:activity-ktx:1.10.1")
  implementation("androidx.media3:media3-exoplayer:1.8.0")
  implementation("androidx.media3:media3-session:1.8.0")
}
