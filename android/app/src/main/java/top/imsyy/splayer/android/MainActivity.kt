package top.imsyy.splayer.android

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.MimeTypeMap
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONObject
import top.imsyy.splayer.android.bridge.AndroidWebActionDispatcher
import top.imsyy.splayer.android.bridge.SPlayerApiBridge
import top.imsyy.splayer.android.bridge.SPlayerMediaBridge
import top.imsyy.splayer.android.bridge.SPlayerPlayerBridge
import top.imsyy.splayer.android.bridge.SPlayerStoreBridge
import top.imsyy.splayer.android.bridge.SPlayerSystemBridge
import top.imsyy.splayer.android.player.AndroidNativeAudioPlayer

class MainActivity : AppCompatActivity() {
  private lateinit var webView: WebView
  private var pendingControlAction: String? = null

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    pendingControlAction = resolveLaunchAction(intent)
    applyInitialSystemBars()
    webView = WebView(this)
    setContentView(webView)

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
    webView.webChromeClient = WebChromeClient()
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
          flushPendingControlAction()
        }
      }
    webView.addJavascriptInterface(SPlayerStoreBridge(this), "splayerAndroidStore")
    webView.addJavascriptInterface(SPlayerApiBridge(this), "splayerAndroidApi")
    webView.addJavascriptInterface(SPlayerPlayerBridge(this), "splayerAndroidPlayer")
    webView.addJavascriptInterface(SPlayerSystemBridge(this), "splayerAndroidSystem")
    webView.addJavascriptInterface(SPlayerMediaBridge(this), "splayerAndroidMedia")
    webView.loadUrl(resolveWebUrl(BuildConfig.SPLAYER_WEB_URL))

    onBackPressedDispatcher.addCallback(
      this,
      object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
          if (webView.canGoBack()) {
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

  override fun onDestroy() {
    webView.removeJavascriptInterface("splayerAndroidStore")
    webView.removeJavascriptInterface("splayerAndroidApi")
    webView.removeJavascriptInterface("splayerAndroidPlayer")
    webView.removeJavascriptInterface("splayerAndroidSystem")
    webView.removeJavascriptInterface("splayerAndroidMedia")
    AndroidWebActionDispatcher.detach()
    AndroidNativeAudioPlayer.detachEventEmitter()
    webView.destroy()
    super.onDestroy()
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
    pendingControlAction = null
    emitControlAction(action)
  }

  private fun emitControlAction(action: String) {
    val script =
      "window.dispatchEvent(new CustomEvent('splayer:android-control', { detail: { action: ${JSONObject.quote(action)} } }))"

    webView.post {
      webView.evaluateJavascript(script, null)
    }
  }

  private fun emitPlayerEvent(type: String, detailJson: String) {
    val script =
      "window.__SPLAYER_ANDROID__?.emitPlayerEvent(${JSONObject.quote(type)}, ${JSONObject.quote(detailJson)})"

    webView.post {
      webView.evaluateJavascript(script, null)
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
    private const val ASSET_PREFIX = "file:///android_asset/"
    private const val ASSET_LOADER_PREFIX = "https://appassets.androidplatform.net/assets/"
    const val EXTRA_NOTIFICATION_TARGET = "splayer_notification_target"
  }
}

