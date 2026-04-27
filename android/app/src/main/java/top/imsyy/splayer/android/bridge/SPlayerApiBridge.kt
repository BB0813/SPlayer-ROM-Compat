package top.imsyy.splayer.android.bridge

import android.content.Context
import android.webkit.JavascriptInterface
import top.imsyy.splayer.android.api.AndroidLocalApiService

class SPlayerApiBridge(context: Context) {
  private val localApiService = AndroidLocalApiService()

  @JavascriptInterface
  fun request(configJson: String): String {
    return localApiService.handle(configJson)
  }
}