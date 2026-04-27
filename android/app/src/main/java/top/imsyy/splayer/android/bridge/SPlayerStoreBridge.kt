package top.imsyy.splayer.android.bridge

import android.content.Context
import android.webkit.JavascriptInterface

class SPlayerStoreBridge(context: Context) {
  private val preferences = context.getSharedPreferences("splayer_bridge", Context.MODE_PRIVATE)

  @JavascriptInterface
  fun get(key: String): String? {
    return preferences.getString(key, null)
  }

  @JavascriptInterface
  fun set(key: String, value: String): Boolean {
    return preferences.edit().putString(key, value).commit()
  }

  @JavascriptInterface
  fun has(key: String): Boolean {
    return preferences.contains(key)
  }

  @JavascriptInterface
  fun delete(key: String): Boolean {
    return preferences.edit().remove(key).commit()
  }

  @JavascriptInterface
  fun reset(keysJson: String?): Boolean {
    if (keysJson.isNullOrBlank()) {
      return preferences.edit().clear().commit()
    }

    val values = keysJson.removePrefix("[").removeSuffix("]")
      .split(',')
      .map { it.trim().trim('"') }
      .filter { it.isNotBlank() }

    val editor = preferences.edit()
    values.forEach(editor::remove)
    return editor.commit()
  }
}
