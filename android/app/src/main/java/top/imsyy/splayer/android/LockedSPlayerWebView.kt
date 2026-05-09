package top.imsyy.splayer.android

import android.content.Context
import android.util.AttributeSet
import android.webkit.WebView

class LockedSPlayerWebView @JvmOverloads constructor(
  context: Context,
  attrs: AttributeSet? = null,
) : WebView(context, attrs) {
  override fun scrollTo(x: Int, y: Int) {
    if (scrollX != 0 || scrollY != 0) {
      super.scrollTo(0, 0)
    }
  }

  override fun scrollBy(x: Int, y: Int) {
    if (scrollX != 0 || scrollY != 0) {
      super.scrollTo(0, 0)
    }
  }

  override fun overScrollBy(
    deltaX: Int,
    deltaY: Int,
    scrollX: Int,
    scrollY: Int,
    scrollRangeX: Int,
    scrollRangeY: Int,
    maxOverScrollX: Int,
    maxOverScrollY: Int,
    isTouchEvent: Boolean,
  ): Boolean {
    super.scrollTo(0, 0)
    return false
  }

  override fun computeScroll() {
    super.computeScroll()
    if (scrollX != 0 || scrollY != 0) {
      super.scrollTo(0, 0)
    }
  }
}