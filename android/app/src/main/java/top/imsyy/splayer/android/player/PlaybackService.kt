package top.imsyy.splayer.android.player

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import top.imsyy.splayer.android.R

class PlaybackService : MediaSessionService() {
  private var nativeSessionAdded = false
  private var notificationProvider: DefaultMediaNotificationProvider? = null

  override fun onCreate() {
    super.onCreate()
    AndroidNativeAudioPlayer.ensureInitialized(applicationContext)
    applyNotificationBehavior()
    ensureNotificationChannel()
    AndroidEnhancedNotificationManager.ensureChannel(applicationContext)
    applyNativeMediaNotificationBehavior()
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
    return if (AndroidNativeAudioPlayer.shouldUseNativeMediaNotification()) {
      AndroidNativeAudioPlayer.getMediaSession()
    } else {
      null
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    applyNotificationBehavior()
    applyNativeMediaNotificationBehavior()
    if (AndroidNativeAudioPlayer.handleNotificationAction(intent)) {
      AndroidNativeAudioPlayer.updateEnhancedNotification(applicationContext, true)
      return START_STICKY
    }
    return super.onStartCommand(intent, flags, startId)
  }

  override fun onUpdateNotification(session: MediaSession, startInForegroundRequired: Boolean) {
    if (!AndroidNativeAudioPlayer.shouldUseNativeMediaNotification()) {
      cancelNativeNotification()
      return
    }

    Log.d(
      TAG,
      "onUpdateNotification foreground=$startInForegroundRequired state=${session.player.playbackState} playing=${session.player.isPlaying}",
    )
    super.onUpdateNotification(session, startInForegroundRequired)
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    if (!AndroidNativeAudioPlayer.hasPlaybackSource() && !isPlaybackOngoing()) {
      stopSelf()
    }
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    removeNativeSessionIfNeeded()
    AndroidNativeAudioPlayer.cancelEnhancedNotification(applicationContext)
    stopForeground(STOP_FOREGROUND_REMOVE)
    AndroidNativeAudioPlayer.release()
    super.onDestroy()
  }

  private fun applyNotificationBehavior() {
    val showBehavior =
      if (!AndroidNativeAudioPlayer.shouldUseNativeMediaNotification()) {
        SHOW_NOTIFICATION_FOR_IDLE_PLAYER_NEVER
      } else if (AndroidNativeAudioPlayer.shouldKeepNotificationOnPause()) {
        SHOW_NOTIFICATION_FOR_IDLE_PLAYER_ALWAYS
      } else {
        SHOW_NOTIFICATION_FOR_IDLE_PLAYER_AFTER_STOP_OR_ERROR
      }
    setShowNotificationForIdlePlayer(showBehavior)
  }

  private fun applyNativeMediaNotificationBehavior() {
    if (AndroidNativeAudioPlayer.shouldUseNativeMediaNotification()) {
      ensureNativeNotificationProvider()
      addNativeSessionIfNeeded()
    } else {
      removeNativeSessionIfNeeded()
      cancelNativeNotification()
    }
  }

  private fun ensureNativeNotificationProvider() {
    if (notificationProvider != null) return
    val provider =
      DefaultMediaNotificationProvider(
        this,
        DefaultMediaNotificationProvider.NotificationIdProvider { NOTIFICATION_ID },
        NOTIFICATION_CHANNEL_ID,
        R.string.playback_notification_channel_name,
      )
    provider.setSmallIcon(R.mipmap.ic_launcher)
    notificationProvider = provider
    setMediaNotificationProvider(provider)
  }

  private fun addNativeSessionIfNeeded() {
    if (nativeSessionAdded) return
    AndroidNativeAudioPlayer.getMediaSession()?.let {
      addSession(it)
      nativeSessionAdded = true
      Log.d(TAG, "addSession id=${it.token}")
    }
  }

  private fun removeNativeSessionIfNeeded() {
    if (!nativeSessionAdded) return
    AndroidNativeAudioPlayer.getMediaSession()?.let { session ->
      runCatching { removeSession(session) }
        .onFailure { Log.w(TAG, "removeSession failed message=${it.message ?: ""}") }
    }
    nativeSessionAdded = false
  }

  private fun cancelNativeNotification() {
    stopForeground(STOP_FOREGROUND_REMOVE)
    NotificationManagerCompat.from(this).cancel(NOTIFICATION_ID)
  }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val manager = getSystemService(NotificationManager::class.java)

    manager.createNotificationChannel(
      NotificationChannel(
        NOTIFICATION_CHANNEL_ID,
        getString(R.string.playback_notification_channel_name),
        NotificationManager.IMPORTANCE_LOW,
      ),
    )
  }

  companion object {
    private const val TAG = "SPlayerPlaybackSvc"
    private const val NOTIFICATION_ID = 2001
    private const val NOTIFICATION_CHANNEL_ID = "splayer_playback"

    fun start(context: Context, foregroundRequired: Boolean = false) {
      val appContext = context.applicationContext
      val intent = Intent(appContext, PlaybackService::class.java)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && foregroundRequired) {
          ContextCompat.startForegroundService(appContext, intent)
        } else {
          appContext.startService(intent)
        }
      } catch (error: IllegalStateException) {
        Log.w(TAG, "start service ignored foreground=$foregroundRequired message=${error.message ?: ""}")
      } catch (error: Exception) {
        Log.w(TAG, "start service failed foreground=$foregroundRequired message=${error.message ?: ""}")
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, PlaybackService::class.java))
    }
  }
}
