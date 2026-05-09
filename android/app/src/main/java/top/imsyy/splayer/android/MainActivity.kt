package top.imsyy.splayer.android

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.view.View
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import android.webkit.MimeTypeMap
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONObject
import top.imsyy.splayer.android.bridge.AndroidDiagnosticsStore
import top.imsyy.splayer.android.bridge.AndroidWebActionDispatcher
import top.imsyy.splayer.android.bridge.SPlayerApiBridge
import top.imsyy.splayer.android.bridge.SPlayerMediaBridge
import top.imsyy.splayer.android.bridge.SPlayerPlayerBridge
import top.imsyy.splayer.android.bridge.SPlayerStoreBridge
import top.imsyy.splayer.android.bridge.SPlayerSystemBridge
import top.imsyy.splayer.android.player.AndroidNativeAudioPlayer
import top.imsyy.splayer.android.player.NativePlayerPageView

class MainActivity : AppCompatActivity() {
  private lateinit var rootView: FrameLayout
  private lateinit var webView: WebView
  private lateinit var nativePlayerPageView: NativePlayerPageView
  private var pendingControlAction: String? = null
  private var webViewDestroyedByRenderProcess = false
  private var webPageReady = false

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    AndroidDiagnosticsStore.install(applicationContext)
    AndroidDiagnosticsStore.record(applicationContext, "activity:lifecycle", "MainActivity 创建")
    pendingControlAction = resolveLaunchAction(intent)
    applyInitialSystemBars()
    rootView = FrameLayout(this)
    webView = LockedSPlayerWebView(this).apply {
      overScrollMode = View.OVER_SCROLL_NEVER
      isHorizontalScrollBarEnabled = false
      isVerticalScrollBarEnabled = false
    }
    nativePlayerPageView = NativePlayerPageView(this)
    rootView.addView(
      webView,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      ),
    )
    rootView.addView(
      nativePlayerPageView,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      ),
    )
    setContentView(rootView)

    AndroidNativeAudioPlayer.ensureInitialized(applicationContext)
    AndroidNativeAudioPlayer.attachEventEmitter(::emitPlayerEvent)
    AndroidWebActionDispatcher.attach(::emitControlAction)

    val assetLoader =
      WebViewAssetLoader.Builder()
        .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
        .addPathHandler("/icons/", PublicWebAssetPathHandler(this, "www/icons"))
        .addPathHandler("/images/", PublicWebAssetPathHandler(this, "www/images"))
        .addPathHandler("/fonts/", PublicWebAssetPathHandler(this, "www/fonts"))
        .addPathHandler("/wasm/", PublicWebAssetPathHandler(this, "www/wasm"))
        .build()

    with(webView.settings) {
      javaScriptEnabled = true
      domStorageEnabled = true
      allowFileAccess = true
      allowContentAccess = true
      mediaPlaybackRequiresUserGesture = false
      loadWithOverviewMode = false
      useWideViewPort = false
      textZoom = 100
      mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
      defaultTextEncodingName = "utf-8"
    }

    CookieManager.getInstance().apply {
      setAcceptCookie(true)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
        setAcceptThirdPartyCookies(webView, true)
      }
    }

    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
    webView.webChromeClient =
      object : WebChromeClient() {
        override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
          if (consoleMessage != null && shouldRecordConsoleMessage(consoleMessage)) {
            AndroidDiagnosticsStore.record(
              applicationContext,
              "webview:console",
              consoleMessage.message().take(240),
              JSONObject()
                .put("level", consoleMessage.messageLevel().name)
                .put("source", consoleMessage.sourceId())
                .put("line", consoleMessage.lineNumber()),
            )
          }
          return super.onConsoleMessage(consoleMessage)
        }
      }
    webView.webViewClient =
      object : WebViewClient() {
        override fun shouldInterceptRequest(
          view: WebView,
          request: WebResourceRequest,
        ): WebResourceResponse? {
          return assetLoader.shouldInterceptRequest(request.url)
        }

        override fun onPageFinished(view: WebView, url: String?) {
          super.onPageFinished(view, url)
          AndroidDiagnosticsStore.record(
            applicationContext,
            "webview:lifecycle",
            "页面加载完成",
            JSONObject().put("url", url ?: ""),
          )
          webPageReady = true
          AndroidWebActionDispatcher.flushPending()
          flushPendingControlAction()
        }

        override fun onRenderProcessGone(
          view: WebView,
          detail: RenderProcessGoneDetail,
        ): Boolean {
          AndroidDiagnosticsStore.recordRenderProcessGone(
            applicationContext,
            detail.didCrash(),
            detail.rendererPriorityAtExit(),
          )
          showWebViewRecovery(detail.didCrash(), detail.rendererPriorityAtExit())
          return true
        }
      }
    webView.addJavascriptInterface(SPlayerStoreBridge(this), "splayerAndroidStore")
    webView.addJavascriptInterface(SPlayerApiBridge(this), "splayerAndroidApi")
    webView.addJavascriptInterface(SPlayerPlayerBridge(this, nativePlayerPageView), "splayerAndroidPlayer")
    webView.addJavascriptInterface(SPlayerSystemBridge(this), "splayerAndroidSystem")
    webView.addJavascriptInterface(SPlayerMediaBridge(this), "splayerAndroidMedia")
    webView.loadUrl(resolveWebUrl(BuildConfig.SPLAYER_WEB_URL))

    onBackPressedDispatcher.addCallback(
      this,
      object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
          if (webViewDestroyedByRenderProcess) {
            finish()
          } else if (nativePlayerPageView.isPlayerVisible()) {
            nativePlayerPageView.setPlayerVisible(false)
            emitControlAction("closePlayer")
          } else if (webView.canGoBack()) {
            webView.goBack()
          } else {
            finish()
          }
        }
      },
    )
  }

  @Suppress("DEPRECATION")
  private fun applyInitialSystemBars() {
    val color = Color.rgb(246, 246, 246)
    window.statusBarColor = color
    window.navigationBarColor = color
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isNavigationBarContrastEnforced = false
      window.isStatusBarContrastEnforced = false
    }
    WindowInsetsControllerCompat(window, window.decorView).apply {
      isAppearanceLightStatusBars = true
      isAppearanceLightNavigationBars = true
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    pendingControlAction = resolveLaunchAction(intent) ?: pendingControlAction
    flushPendingControlAction()
  }

  override fun onTrimMemory(level: Int) {
    super.onTrimMemory(level)
    if (level >= LOW_MEMORY_TRIM_LEVEL) {
      AndroidDiagnosticsStore.record(
        applicationContext,
        "activity:memory",
        "系统通知应用内存紧张",
        JSONObject().put("level", level),
      )
      emitControlAction("enableAndroidConservativeMode")
    }
  }

  override fun onLowMemory() {
    AndroidDiagnosticsStore.record(applicationContext, "activity:memory", "系统触发低内存回调")
    emitControlAction("enableAndroidConservativeMode")
    super.onLowMemory()
  }

  override fun onDestroy() {
    AndroidDiagnosticsStore.record(applicationContext, "activity:lifecycle", "MainActivity 销毁")
    if (!webViewDestroyedByRenderProcess) {
      webView.removeJavascriptInterface("splayerAndroidStore")
      webView.removeJavascriptInterface("splayerAndroidApi")
      webView.removeJavascriptInterface("splayerAndroidPlayer")
      webView.removeJavascriptInterface("splayerAndroidSystem")
      webView.removeJavascriptInterface("splayerAndroidMedia")
      webView.destroy()
    }
    AndroidWebActionDispatcher.detach()
    AndroidNativeAudioPlayer.detachEventEmitter()
    super.onDestroy()
  }



  private fun showWebViewRecovery(didCrash: Boolean, rendererPriority: Int) {
    webViewDestroyedByRenderProcess = true
    webPageReady = false
    if (::nativePlayerPageView.isInitialized) {
      nativePlayerPageView.setPlayerVisible(false)
    }
    runCatching {
      webView.stopLoading()
      webView.destroy()
    }

    val root =
      LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setPadding(56, 56, 56, 56)
        setBackgroundColor(Color.rgb(18, 18, 18))
      }

    val title =
      TextView(this).apply {
        text = "播放页面已恢复"
        textSize = 22f
        setTextColor(Color.WHITE)
        gravity = Gravity.CENTER
      }

    val message =
      TextView(this).apply {
        text =
          if (didCrash) {
            "WebView 渲染进程已崩溃，可能与 ROM WebView 或内存压力有关。"
          } else {
            "系统回收了 WebView 渲染进程，已停止向旧页面发送播放器事件。"
          }
        textSize = 15f
        setTextColor(Color.rgb(220, 220, 220))
        gravity = Gravity.CENTER
        setPadding(0, 24, 0, 24)
      }

    val detail =
      TextView(this).apply {
        text = "渲染优先级：$rendererPriority"
        textSize = 13f
        setTextColor(Color.rgb(160, 160, 160))
        gravity = Gravity.CENTER
        setPadding(0, 0, 0, 32)
      }

    val restartButton =
      Button(this).apply {
        text = "重新打开"
        setOnClickListener { recreate() }
      }

    val exportButton =
      Button(this).apply {
        text = "导出诊断报告"
        setOnClickListener {
          val fileName = "SPlayer-ROM-Compat-Android-Recovery-${System.currentTimeMillis()}.txt"
          val report = AndroidDiagnosticsStore.buildReport(applicationContext)
          val savedUri = SPlayerSystemBridge(this@MainActivity).saveTextFile(fileName, report)
          Toast.makeText(
            this@MainActivity,
            if (savedUri.isNotBlank()) "诊断报告已导出到下载目录" else "诊断报告导出失败",
            Toast.LENGTH_LONG,
          ).show()
        }
      }

    val closeButton =
      Button(this).apply {
        text = "关闭应用"
        setOnClickListener { finish() }
      }

    root.addView(title)
    root.addView(message)
    root.addView(detail)
    root.addView(restartButton)
    root.addView(exportButton)
    root.addView(closeButton)

    setContentView(root)
  }

  private fun shouldRecordConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
    val level = consoleMessage.messageLevel()
    if (level == ConsoleMessage.MessageLevel.ERROR || level == ConsoleMessage.MessageLevel.WARNING) {
      return true
    }
    return consoleMessage.message().contains("SPlayer Android", ignoreCase = true)
  }

  private fun resolveWebUrl(rawUrl: String): String {
    return if (rawUrl.startsWith(ASSET_PREFIX)) {
      rawUrl.replace(ASSET_PREFIX, ASSET_LOADER_PREFIX)
    } else {
      rawUrl
    }
  }

  private fun resolveLaunchAction(intent: Intent?): String? {
    return when (intent?.getStringExtra(EXTRA_NOTIFICATION_TARGET)) {
      "player" -> "openPlayer"
      else -> null
    }
  }

  private fun flushPendingControlAction() {
    val action = pendingControlAction ?: return
    if (emitControlAction(action)) {
      pendingControlAction = null
    }
  }

  private fun emitControlAction(action: String): Boolean {
    if (!::webView.isInitialized || webViewDestroyedByRenderProcess || !webPageReady) {
      AndroidDiagnosticsStore.record(
        applicationContext,
        "android:control",
        "控制动作等待 WebView 就绪",
        JSONObject()
          .put("action", action)
          .put("webViewReady", ::webView.isInitialized)
          .put("pageReady", webPageReady)
          .put("rendererGone", webViewDestroyedByRenderProcess),
      )
      return false
    }
    AndroidDiagnosticsStore.record(
      applicationContext,
      "android:control",
      "发送控制动作到 WebView",
      JSONObject().put("action", action),
    )
    val script =
      "window.dispatchEvent(new CustomEvent('splayer:android-control', { detail: { action: ${JSONObject.quote(action)} } }))"

    return runCatching {
      webView.post {
        if (!webViewDestroyedByRenderProcess) {
          runCatching { webView.evaluateJavascript(script, null) }
        }
      }
    }.isSuccess
  }

  private fun emitPlayerEvent(type: String, detailJson: String) {
    if (type != "progress") {
      runCatching {
        AndroidDiagnosticsStore.record(
          applicationContext,
          "android:player",
          "发送原生播放器事件",
          JSONObject()
            .put("type", type)
            .put("detail", detailJson.take(600)),
        )
      }
    }
    if (!::webView.isInitialized || webViewDestroyedByRenderProcess) return
    val script =
      "window.__SPLAYER_ANDROID__?.emitPlayerEvent(${JSONObject.quote(type)}, ${JSONObject.quote(detailJson)})"

    runCatching {
      webView.post {
        if (!webViewDestroyedByRenderProcess) {
          runCatching { webView.evaluateJavascript(script, null) }
        }
      }
    }
  }

  private class PublicWebAssetPathHandler(
    context: Context,
    private val assetBasePath: String,
  ) : WebViewAssetLoader.PathHandler {
    private val assetManager = context.applicationContext.assets

    override fun handle(path: String): WebResourceResponse? {
      val cleanPath = path.trimStart('/')
      val cleanBasePath = assetBasePath.trim('/')
      val assetPath = if (cleanBasePath.isBlank()) cleanPath else "$cleanBasePath/$cleanPath"

      return try {
        WebResourceResponse(
          resolveMimeType(assetPath),
          resolveEncoding(assetPath),
          assetManager.open(assetPath),
        )
      } catch (_: Exception) {
        null
      }
    }

    private fun resolveEncoding(assetPath: String): String? {
      val extension = assetPath.substringAfterLast('.', "").lowercase()
      return when (extension) {
        "css", "html", "js", "json", "svg", "txt", "xml" -> "utf-8"
        else -> null
      }
    }

    private fun resolveMimeType(assetPath: String): String {
      val extension = assetPath.substringAfterLast('.', "").lowercase()
      val mappedMimeType = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension)
      if (!mappedMimeType.isNullOrBlank()) return mappedMimeType

      return when (extension) {
        "ico" -> "image/x-icon"
        "js" -> "application/javascript"
        "svg" -> "image/svg+xml"
        "wasm" -> "application/wasm"
        "woff" -> "font/woff"
        "woff2" -> "font/woff2"
        else -> "application/octet-stream"
      }
    }
  }

  companion object {
    private const val LOW_MEMORY_TRIM_LEVEL = 10
    private const val ASSET_PREFIX = "file:///android_asset/"
    private const val ASSET_LOADER_PREFIX = "https://appassets.androidplatform.net/assets/"
    const val EXTRA_NOTIFICATION_TARGET = "splayer_notification_target"
  }
}




