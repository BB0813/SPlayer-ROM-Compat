package top.imsyy.splayer.android.bridge

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.Debug
import android.os.Process
import org.json.JSONArray
import org.json.JSONObject
import top.imsyy.splayer.android.BuildConfig
import java.io.BufferedReader
import java.io.InputStreamReader
import java.nio.charset.StandardCharsets
import java.text.SimpleDateFormat
import java.util.ArrayDeque
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit
import kotlin.system.exitProcess

object AndroidDiagnosticsStore {
  private const val PREF_NAME = "splayer_android_diagnostics"
  private const val KEY_LAST_FATAL = "last_fatal"
  private const val KEY_LAST_RENDER_PROCESS_GONE = "last_render_process_gone"
  private const val MAX_EVENTS = 240
  private const val LOGCAT_CAPTURE_LINES = 500
  private const val LOGCAT_TIMEOUT_MS = 1800L

  private val lock = Any()
  private val events = ArrayDeque<JSONObject>()
  private var installed = false
  private var previousHandler: Thread.UncaughtExceptionHandler? = null

  fun install(context: Context) {
    synchronized(lock) {
      if (installed) return
      installed = true
      previousHandler = Thread.getDefaultUncaughtExceptionHandler()
      val appContext = context.applicationContext
      Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
        recordFatal(appContext, thread, throwable)
        previousHandler?.uncaughtException(thread, throwable) ?: exitProcess(2)
      }
    }
  }

  fun record(context: Context, source: String, message: String, detail: JSONObject? = null) {
    val event =
      JSONObject()
        .put("time", now())
        .put("source", source)
        .put("message", message)
        .put("detail", detail ?: JSONObject())

    synchronized(lock) {
      while (events.size >= MAX_EVENTS) {
        events.removeFirst()
      }
      events.addLast(event)
    }
  }

  fun recordFatal(context: Context, thread: Thread, throwable: Throwable) {
    val detail =
      JSONObject()
        .put("thread", thread.name)
        .put("type", throwable.javaClass.name)
        .put("message", throwable.message ?: "")
        .put("stack", throwable.stackTraceToString())
        .put("time", now())

    context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_LAST_FATAL, detail.toString())
      .apply()

    record(context, "native:fatal", "捕获到原生未处理异常", detail)
  }

  fun recordRenderProcessGone(context: Context, didCrash: Boolean, rendererPriorityAtExit: Int) {
    val detail =
      JSONObject()
        .put("didCrash", didCrash)
        .put("rendererPriorityAtExit", rendererPriorityAtExit)
        .put("time", now())

    context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_LAST_RENDER_PROCESS_GONE, detail.toString())
      .apply()

    record(context, "webview:render", "WebView 渲染进程异常退出", detail)
  }

  fun clear(context: Context): Boolean {
    synchronized(lock) {
      events.clear()
    }
    context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .edit()
      .remove(KEY_LAST_FATAL)
      .remove(KEY_LAST_RENDER_PROCESS_GONE)
      .apply()
    record(context, "native:diagnostics", "原生诊断缓存已清空")
    return true
  }

  fun buildReport(context: Context): String {
    val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    val snapshot = synchronized(lock) { events.toList() }

    val report =
      JSONObject()
        .put("generatedAt", now())
        .put("app", buildAppInfo(context))
        .put("device", buildDeviceInfo())
        .put("memory", buildMemoryInfo(context))
        .put("lastFatal", parseStoredJson(prefs.getString(KEY_LAST_FATAL, null)))
        .put("lastRenderProcessGone", parseStoredJson(prefs.getString(KEY_LAST_RENDER_PROCESS_GONE, null)))
        .put("events", JSONArray(snapshot))
        .put("logcat", collectLogcatSnapshot(context))

    return report.toString(2)
  }

  private fun buildAppInfo(context: Context): JSONObject {
    return JSONObject()
      .put("packageName", context.packageName)
      .put("versionName", BuildConfig.VERSION_NAME)
      .put("versionCode", BuildConfig.VERSION_CODE)
      .put("debug", BuildConfig.DEBUG)
  }

  private fun buildDeviceInfo(): JSONObject {
    return JSONObject()
      .put("sdkInt", Build.VERSION.SDK_INT)
      .put("release", Build.VERSION.RELEASE ?: "unknown")
      .put("brand", Build.BRAND ?: "unknown")
      .put("manufacturer", Build.MANUFACTURER ?: "unknown")
      .put("model", Build.MODEL ?: "unknown")
      .put("display", Build.DISPLAY ?: "unknown")
      .put("supportedAbis", JSONArray(Build.SUPPORTED_ABIS.toList()))
  }

  private fun buildMemoryInfo(context: Context): JSONObject {
    val runtime = Runtime.getRuntime()
    val activityManager = context.getSystemService(ActivityManager::class.java)
    val processMemory = activityManager?.getProcessMemoryInfo(intArrayOf(Process.myPid()))?.firstOrNull()

    return JSONObject()
      .put("runtimeMax", runtime.maxMemory())
      .put("runtimeTotal", runtime.totalMemory())
      .put("runtimeFree", runtime.freeMemory())
      .put("nativeHeapAllocated", Debug.getNativeHeapAllocatedSize())
      .put("nativeHeapSize", Debug.getNativeHeapSize())
      .put("totalPssKb", processMemory?.totalPss ?: 0)
      .put("totalPrivateDirtyKb", processMemory?.totalPrivateDirty ?: 0)
  }


  private fun collectLogcatSnapshot(context: Context): JSONObject {
    val packageName = context.packageName
    val keywords = listOf(
      packageName,
      "AndroidRuntime",
      "FATAL EXCEPTION",
      "Fatal signal",
      "SIGSEGV",
      "SIGABRT",
      "OutOfMemoryError",
      "lowmemorykiller",
      "RenderProcessGone",
      "SPlayerNativeAudio",
      "SPlayerPlaybackSvc",
      "SPlayerLocalApi",
      "chromium",
      "cr_ChildProcessConn",
      "ExoPlayerImplInternal",
      "crash",
    )

    return try {
      val process = ProcessBuilder(
        "logcat",
        "-d",
        "-t",
        LOGCAT_CAPTURE_LINES.toString(),
        "-v",
        "threadtime",
      )
        .redirectErrorStream(true)
        .start()

      val finished = process.waitFor(LOGCAT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
      if (!finished) {
        process.destroyForcibly()
      }

      val rawLines = BufferedReader(
        InputStreamReader(process.inputStream, StandardCharsets.UTF_8),
      ).use { reader -> reader.readLines() }

      val lowerKeywords = keywords.map { it.lowercase(Locale.ROOT) }
      val matchedLines = rawLines
        .filter { line ->
          val lowerLine = line.lowercase(Locale.ROOT)
          lowerKeywords.any { keyword -> lowerLine.contains(keyword) }
        }
        .takeLast(160)

      JSONObject()
        .put("available", true)
        .put("finished", finished)
        .put("command", "logcat -d -t $LOGCAT_CAPTURE_LINES -v threadtime")
        .put("rawLineCount", rawLines.size)
        .put("matchedLineCount", matchedLines.size)
        .put("lines", JSONArray(matchedLines))
    } catch (error: Exception) {
      JSONObject()
        .put("available", false)
        .put("error", error.message ?: error.javaClass.simpleName)
    }
  }

  private fun parseStoredJson(raw: String?): Any {
    if (raw.isNullOrBlank()) return JSONObject.NULL
    return try {
      JSONObject(raw)
    } catch (_: Exception) {
      raw
    }
  }

  private fun now(): String {
    return SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date())
  }
}
