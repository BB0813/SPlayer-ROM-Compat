package top.imsyy.splayer.android.bridge

import java.util.ArrayDeque

object AndroidWebActionDispatcher {
  private const val MAX_PENDING_ACTIONS = 8

  private val lock = Any()
  private val pendingActions = ArrayDeque<String>()
  private var emitter: ((String) -> Boolean)? = null

  fun attach(callback: (String) -> Boolean) {
    synchronized(lock) {
      emitter = callback
    }
    flushPending()
  }

  fun detach() {
    synchronized(lock) {
      emitter = null
    }
  }

  fun flushPending() {
    val actions = synchronized(lock) {
      val snapshot = pendingActions.toList()
      pendingActions.clear()
      snapshot
    }

    actions.forEach { action -> dispatch(action) }
  }

  fun dispatch(action: String): Boolean {
    if (action.isBlank()) return false
    val currentEmitter = synchronized(lock) { emitter }
    if (currentEmitter == null) {
      enqueue(action)
      return true
    }

    return try {
      if (currentEmitter(action)) {
        true
      } else {
        enqueue(action)
        true
      }
    } catch (_: Exception) {
      enqueue(action)
      true
    }
  }

  private fun enqueue(action: String) {
    if (action.isBlank()) return
    synchronized(lock) {
      while (pendingActions.size >= MAX_PENDING_ACTIONS) {
        pendingActions.removeFirst()
      }
      pendingActions.addLast(action)
    }
  }
}
