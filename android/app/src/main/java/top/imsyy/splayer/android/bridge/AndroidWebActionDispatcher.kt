package top.imsyy.splayer.android.bridge

object AndroidWebActionDispatcher {
  private var emitter: ((String) -> Unit)? = null

  fun attach(callback: (String) -> Unit) {
    emitter = callback
  }

  fun detach() {
    emitter = null
  }

  fun dispatch(action: String): Boolean {
    val currentEmitter = emitter ?: return false
    currentEmitter(action)
    return true
  }
}