package top.imsyy.splayer.android.bridge

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.JavascriptInterface
import java.util.concurrent.CountDownLatch
import top.imsyy.splayer.android.player.AndroidNativeAudioPlayer
import top.imsyy.splayer.android.player.NativePlayerPageView
import top.imsyy.splayer.android.player.PlaybackService

class SPlayerPlayerBridge(
  private val context: Context,
  private val nativePlayerPageView: NativePlayerPageView? = null,
) {
  companion object {
    private const val TAG = "SPlayerBridge"
  }

  private val mainHandler = Handler(Looper.getMainLooper())

  @JavascriptInterface
  fun play(url: String, optionsJson: String?): Boolean {
    Log.d(TAG, "play src=$url options=${optionsJson ?: ""}")
    return runOnMainThread {
      AndroidNativeAudioPlayer.ensureInitialized(context.applicationContext)
      val played = AndroidNativeAudioPlayer.play(url, optionsJson)
      if (played) {
        PlaybackService.start(
          context.applicationContext,
          AndroidNativeAudioPlayer.shouldStartForegroundService(),
        )
      }
      played
    }
  }

  @JavascriptInterface
  fun resume(optionsJson: String?): Boolean {
    Log.d(TAG, "resume options=${optionsJson ?: ""}")
    return runOnMainThread {
      AndroidNativeAudioPlayer.ensureInitialized(context.applicationContext)
      val resumed = AndroidNativeAudioPlayer.resume(optionsJson)
      if (resumed) {
        PlaybackService.start(
          context.applicationContext,
          AndroidNativeAudioPlayer.shouldStartForegroundService(),
        )
      }
      resumed
    }
  }

  @JavascriptInterface
  fun pause(optionsJson: String?): Boolean {
    Log.d(TAG, "pause options=${optionsJson ?: ""}")
    return runOnMainThread {
      val paused = AndroidNativeAudioPlayer.pause(optionsJson)
      if (AndroidNativeAudioPlayer.hasPlaybackSource()) {
        PlaybackService.start(context.applicationContext, false)
      }
      paused
    }
  }

  @JavascriptInterface
  fun stop(): Boolean {
    Log.d(TAG, "stop")
    return runOnMainThread {
      val stopped = AndroidNativeAudioPlayer.stop()
      PlaybackService.stop(context.applicationContext)
      stopped
    }
  }

  @JavascriptInterface
  fun seek(time: Double): Boolean {
    return runOnMainThread { AndroidNativeAudioPlayer.seek(time) }
  }

  @JavascriptInterface
  fun setVolume(value: Double): Boolean {
    return runOnMainThread { AndroidNativeAudioPlayer.setVolume(value) }
  }

  @JavascriptInterface
  fun getVolume(): Double {
    return runOnMainThread { AndroidNativeAudioPlayer.getVolume() }
  }

  @JavascriptInterface
  fun setRate(value: Double): Boolean {
    return runOnMainThread { AndroidNativeAudioPlayer.setRate(value) }
  }

  @JavascriptInterface
  fun getRate(): Double {
    return runOnMainThread { AndroidNativeAudioPlayer.getRate() }
  }

  @JavascriptInterface
  fun getDuration(): Double {
    return runOnMainThread { AndroidNativeAudioPlayer.getDuration() }
  }

  @JavascriptInterface
  fun getCurrentTime(): Double {
    return runOnMainThread { AndroidNativeAudioPlayer.getCurrentTime() }
  }

  @JavascriptInterface
  fun isPaused(): Boolean {
    return runOnMainThread { AndroidNativeAudioPlayer.isPaused() }
  }

  @JavascriptInterface
  fun getSrc(): String {
    return runOnMainThread { AndroidNativeAudioPlayer.getSrc() }
  }

  @JavascriptInterface
  fun getErrorCode(): Int {
    return runOnMainThread { AndroidNativeAudioPlayer.getErrorCode() }
  }

  @JavascriptInterface
  fun setNotificationConfig(configJson: String?): Boolean {
    Log.d(TAG, "setNotificationConfig config=${configJson ?: ""}")
    return runOnMainThread {
      val applied = AndroidNativeAudioPlayer.setNotificationConfig(context.applicationContext, configJson)
      if (AndroidNativeAudioPlayer.hasPlaybackSource()) {
        PlaybackService.start(context.applicationContext, false)
      }
      applied
    }
  }

  @JavascriptInterface
  fun updateMetadata(metadataJson: String?): Boolean {
    Log.d(TAG, "updateMetadata metadata=${metadataJson ?: ""}")
    return runOnMainThread {
      val updated = AndroidNativeAudioPlayer.updateMetadata(metadataJson)
      if (AndroidNativeAudioPlayer.hasPlaybackSource()) {
        PlaybackService.start(context.applicationContext, false)
      }
      updated
    }
  }

  @JavascriptInterface
  fun updateNativePlayerState(stateJson: String?): Boolean {
    return runOnMainThread {
      nativePlayerPageView?.updateState(stateJson) ?: false
    }
  }

  @JavascriptInterface
  fun setNativePlayerVisible(visible: Boolean): Boolean {
    return runOnMainThread {
      nativePlayerPageView?.setPlayerVisible(visible) ?: false
    }
  }

  private fun <T> runOnMainThread(block: () -> T): T {
    if (Looper.myLooper() == Looper.getMainLooper()) return block()

    var value: T? = null
    var error: Throwable? = null
    val latch = CountDownLatch(1)
    mainHandler.post {
      try {
        value = block()
      } catch (throwable: Throwable) {
        error = throwable
      } finally {
        latch.countDown()
      }
    }
    latch.await()
    error?.let { throw it }
    @Suppress("UNCHECKED_CAST")
    return value as T
  }
}
