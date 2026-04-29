package top.imsyy.splayer.android.player

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import org.json.JSONObject
import top.imsyy.splayer.android.BuildConfig
import top.imsyy.splayer.android.MainActivity
import top.imsyy.splayer.android.R
import top.imsyy.splayer.android.bridge.AndroidWebActionDispatcher
import kotlin.math.max

object AndroidNativeAudioPlayer {
  private const val TAG = "SPlayerNativeAudio"
  private const val ACTION_PREVIOUS = "playPrev"
  private const val ACTION_NEXT = "playNext"
  private const val ACTION_NOTIFICATION_PREVIOUS = "top.imsyy.splayer.romcompat.NOTIFICATION_PREVIOUS"
  private const val ACTION_NOTIFICATION_PLAY = "top.imsyy.splayer.romcompat.NOTIFICATION_PLAY"
  private const val ACTION_NOTIFICATION_PAUSE = "top.imsyy.splayer.romcompat.NOTIFICATION_PAUSE"
  private const val ACTION_NOTIFICATION_NEXT = "top.imsyy.splayer.romcompat.NOTIFICATION_NEXT"
  private const val ACTION_NOTIFICATION_SEEK_BACKWARD = "top.imsyy.splayer.romcompat.NOTIFICATION_SEEK_BACKWARD"
  private const val ACTION_NOTIFICATION_SEEK_FORWARD = "top.imsyy.splayer.romcompat.NOTIFICATION_SEEK_FORWARD"
  private const val ACTION_NOTIFICATION_SEEK_TO_PERCENT = "top.imsyy.splayer.romcompat.NOTIFICATION_SEEK_TO_PERCENT"
  private const val EXTRA_NOTIFICATION_SEEK_PERCENT = "top.imsyy.splayer.romcompat.extra.SEEK_PERCENT"
  private const val NOTIFICATION_SEEK_STEP_MS = 15000L
  private const val NOTIFICATION_ACTION_REFRESH_DELAY_MS = 300L
  private const val PROGRESS_EVENT_INTERVAL_MS = 5000L
  private const val MEDIA_METADATA_LYRIC_UPDATE_INTERVAL_MS = 15000L
  private val notificationSeekPercentStops = intArrayOf(10, 30, 50, 70, 90)

  enum class NotificationAction {
    PREVIOUS,
    PLAY,
    PAUSE,
    NEXT,
    SEEK_BACKWARD,
    SEEK_FORWARD,
  }

  private data class MetadataApplyResult(
    val mediaFieldsChanged: Boolean,
    val lyricLineChanged: Boolean,
  ) {
    val changed: Boolean
      get() = mediaFieldsChanged || lyricLineChanged
  }

  private val previousCommand = SessionCommand("top.imsyy.splayer.romcompat.PREVIOUS", Bundle.EMPTY)
  private val nextCommand = SessionCommand("top.imsyy.splayer.romcompat.NEXT", Bundle.EMPTY)

  private var appContext: Context? = null
  private var player: ExoPlayer? = null
  private var mediaSession: MediaSession? = null
  private val handler = Handler(Looper.getMainLooper())
  private var currentSrc: String = ""
  private var errorCode: Int = 0
  private var emitEvent: ((type: String, detailJson: String) -> Unit)? = null

  private var keepNotificationOnPause: Boolean = true
  private var notificationTapAction: String = NOTIFICATION_TAP_ACTION_PLAYER
  private var notificationShowCover: Boolean = true
  private var notificationSubtitleMode: String = NOTIFICATION_SUBTITLE_ARTIST
  private var enhancedNotificationEnabled: Boolean = false
  private var enhancedNotificationExclusive: Boolean = false
  private var enhancedNotificationShown: Boolean = false

  private var currentTitle: String = ""
  private var currentArtist: String = ""
  private var currentAlbum: String = ""
  private var currentLyricLine: String = ""
  private var currentArtworkUri: String = ""
  private var lastMediaMetadataKey: String = ""
  private var lastMediaMetadataLyricUpdateAt: Long = 0L

  private val progressTask = object : Runnable {
    override fun run() {
      emit("timeupdate", snapshot())
      if (enhancedNotificationEnabled) {
        appContext?.let { updateEnhancedNotification(it) }
      }
      val currentPlayer = player ?: return
      if (currentPlayer.isPlaying) {
        handler.postDelayed(this, PROGRESS_EVENT_INTERVAL_MS)
      }
    }
  }

  @Synchronized
  fun ensureInitialized(context: Context) {
    if (player != null && mediaSession != null) return

    appContext = context.applicationContext
    loadNotificationConfig(context.applicationContext)

    val httpDataSourceFactory =
      DefaultHttpDataSource.Factory()
        .setAllowCrossProtocolRedirects(true)
        .setUserAgent("SPlayer-Android/${BuildConfig.VERSION_NAME}")
        .setDefaultRequestProperties(
          mapOf(
            "Accept" to "*/*",
            "Referer" to "https://music.163.com/",
            "Origin" to "https://music.163.com",
          ),
        )
    val dataSourceFactory =
      DefaultDataSource.Factory(context.applicationContext, httpDataSourceFactory)
    val createdPlayer =
      ExoPlayer.Builder(context.applicationContext)
        .setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))
        .build()

    createdPlayer.setAudioAttributes(
      AudioAttributes.Builder()
        .setUsage(C.USAGE_MEDIA)
        .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
        .build(),
      true,
    )
    createdPlayer.setHandleAudioBecomingNoisy(true)
    createdPlayer.setWakeMode(C.WAKE_MODE_NETWORK)
    createdPlayer.setForegroundMode(true)
    createdPlayer.addListener(
      object : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) {
          Log.d(TAG, "state=$playbackState src=$currentSrc")
          when (playbackState) {
            Player.STATE_BUFFERING -> emit("waiting", snapshot())
            Player.STATE_READY -> emit("canplay", snapshot())
            Player.STATE_ENDED -> {
              stopProgressLoop()
              emit("ended", snapshot())
            }
          }
          appContext?.let { updateEnhancedNotification(it, true) }
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
          Log.d(TAG, "isPlaying=$isPlaying src=$currentSrc position=${player?.currentPosition ?: -1L}")
          emit(if (isPlaying) "play" else "pause", snapshot())
          if (isPlaying) {
            emit("playing", snapshot())
            startProgressLoop()
          } else {
            stopProgressLoop()
          }
          appContext?.let { updateEnhancedNotification(it, true) }
        }

        override fun onPlayerError(error: PlaybackException) {
          Log.e(
            TAG,
            "error code=${error.errorCodeName} message=${error.message ?: ""} cause=${error.cause?.message ?: ""} src=$currentSrc",
            error,
          )
          val detail = buildErrorDetail(error)
          errorCode = detail.optInt("errorCode", 4)
          emit("error", detail)
        }
      },
    )

    val mediaButtons = buildMediaButtons()
    player = createdPlayer
    mediaSession =
      MediaSession.Builder(context.applicationContext, createdPlayer)
        .setSessionActivity(buildSessionActivity(context.applicationContext))
        .setMediaButtonPreferences(mediaButtons)
        .setCustomLayout(mediaButtons)
        .setCallback(
          object : MediaSession.Callback {
            override fun onConnect(
              session: MediaSession,
              controller: MediaSession.ControllerInfo,
            ): MediaSession.ConnectionResult {
              val sessionCommands =
                MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS
                  .buildUpon()
                  .add(previousCommand)
                  .add(nextCommand)
                  .build()
              val playerCommands =
                MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS
                  .buildUpon()
                  .add(Player.COMMAND_PLAY_PAUSE)
                  .build()
              return MediaSession.ConnectionResult.accept(sessionCommands, playerCommands)
            }

            override fun onPostConnect(
              session: MediaSession,
              controller: MediaSession.ControllerInfo,
            ) {
              session.setMediaButtonPreferences(controller, mediaButtons)
              session.setCustomLayout(controller, mediaButtons)
            }

            override fun onCustomCommand(
              session: MediaSession,
              controller: MediaSession.ControllerInfo,
              customCommand: SessionCommand,
              args: Bundle,
            ) =
              when (customCommand.customAction) {
                previousCommand.customAction ->
                  handleTransportCommand(ACTION_PREVIOUS, customCommand.customAction)
                nextCommand.customAction ->
                  handleTransportCommand(ACTION_NEXT, customCommand.customAction)
                else ->
                  Futures.immediateFuture(
                    SessionResult(SessionResult.RESULT_ERROR_NOT_SUPPORTED),
                  )
              }
          },
        )
        .build()
  }

  fun attachEventEmitter(callback: (type: String, detailJson: String) -> Unit) {
    emitEvent = callback
  }

  fun detachEventEmitter() {
    emitEvent = null
  }

  fun getMediaSession(): MediaSession? = mediaSession

  fun getPlayer(): Player? = player

  fun play(url: String, optionsJson: String?): Boolean {
    val normalizedUrl = normalizePlaybackUrl(url)
    Log.d(TAG, "play src=$normalizedUrl raw=$url options=${optionsJson ?: ""}")
    ensureInitialized(requireContext())
    val currentPlayer = player ?: return false
    val options = optionsJson?.takeIf { it.isNotBlank() }?.let(::JSONObject) ?: JSONObject()
    currentSrc = normalizedUrl
    errorCode = 0

    applyMetadataFromJson(options)
    lastMediaMetadataKey = ""
    emit("loadstart", snapshot())

    val mediaItem =
      MediaItem.Builder()
        .setUri(normalizedUrl)
        .setMediaMetadata(buildNotificationMediaMetadata())
        .build()
    currentPlayer.setMediaItem(mediaItem)
    lastMediaMetadataKey = buildMediaMetadataKey()
    lastMediaMetadataLyricUpdateAt = System.currentTimeMillis()
    currentPlayer.prepare()
    setRate(options.optDouble("rate", getRate()))

    val seek = options.optDouble("seek", 0.0)
    if (seek > 0) {
      currentPlayer.seekTo((seek * 1000).toLong())
      emit("seeked", snapshot())
    }

    currentPlayer.playWhenReady = options.optBoolean("autoPlay", true)
    appContext?.let { updateEnhancedNotification(it, true) }
    return true
  }

  fun resume(optionsJson: String?): Boolean {
    Log.d(TAG, "resume options=${optionsJson ?: ""}")
    ensureInitialized(requireContext())
    player?.play()
    appContext?.let { updateEnhancedNotification(it, true) }
    return true
  }

  fun pause(optionsJson: String?): Boolean {
    Log.d(TAG, "pause options=${optionsJson ?: ""}")
    player?.pause()
    appContext?.let { updateEnhancedNotification(it, true) }
    return true
  }

  fun stop(): Boolean {
    Log.d(TAG, "stop src=$currentSrc")
    val currentPlayer = player ?: return false
    currentPlayer.stop()
    currentPlayer.clearMediaItems()
    currentSrc = ""
    currentTitle = ""
    currentArtist = ""
    currentAlbum = ""
    currentLyricLine = ""
    currentArtworkUri = ""
    lastMediaMetadataKey = ""
    lastMediaMetadataLyricUpdateAt = 0L
    stopProgressLoop()
    appContext?.let { cancelEnhancedNotification(it) }
    emit("emptied", snapshot())
    return true
  }

  fun seek(time: Double): Boolean {
    val currentPlayer = player ?: return false
    emit("seeking", snapshot())
    currentPlayer.seekTo((time * 1000).toLong())
    emit("seeked", snapshot())
    appContext?.let { updateEnhancedNotification(it, true) }
    return true
  }

  private fun seekByMs(offsetMs: Long): Boolean {
    val currentPlayer = player ?: return false
    if (currentSrc.isBlank()) return false

    val duration = currentPlayer.duration.takeIf { it > 0L } ?: 0L
    val targetPosition =
      (currentPlayer.currentPosition + offsetMs)
        .coerceAtLeast(0L)
        .let { position -> if (duration > 0L) position.coerceAtMost(duration) else position }

    emit("seeking", snapshot())
    currentPlayer.seekTo(targetPosition)
    emit("seeked", snapshot())
    appContext?.let { refreshEnhancedNotificationSoon(it) }
    return true
  }

  private fun seekToPercent(percent: Int): Boolean {
    val currentPlayer = player ?: return false
    if (currentSrc.isBlank()) return false
    val duration = currentPlayer.duration.takeIf { it > 0L } ?: return false
    val safePercent = percent.coerceIn(0, 100)
    val targetPosition = (duration * (safePercent / 100.0)).toLong().coerceIn(0L, duration)

    emit("seeking", snapshot())
    currentPlayer.seekTo(targetPosition)
    emit("seeked", snapshot())
    appContext?.let { refreshEnhancedNotificationSoon(it) }
    return true
  }

  fun setVolume(value: Double): Boolean {
    val currentPlayer = player ?: return false
    currentPlayer.volume = value.toFloat().coerceIn(0f, 1f)
    emit("volumechange", snapshot())
    return true
  }

  fun getVolume(): Double = player?.volume?.toDouble() ?: 1.0

  fun setRate(value: Double): Boolean {
    val currentPlayer = player ?: return false
    currentPlayer.playbackParameters = PlaybackParameters(value.toFloat().coerceIn(0.5f, 2.0f))
    return true
  }

  fun getRate(): Double = player?.playbackParameters?.speed?.toDouble() ?: 1.0

  fun getDuration(): Double {
    val duration = player?.duration ?: 0L
    return if (duration <= 0) 0.0 else duration / 1000.0
  }

  fun getCurrentTime(): Double = max(player?.currentPosition ?: 0L, 0L) / 1000.0

  fun isPaused(): Boolean = !(player?.isPlaying ?: false)

  fun getSrc(): String = currentSrc

  fun getErrorCode(): Int = errorCode

  fun hasPlaybackSource(): Boolean = currentSrc.isNotBlank()

  fun shouldKeepNotificationOnPause(): Boolean = keepNotificationOnPause

  fun isEnhancedNotificationEnabled(): Boolean = enhancedNotificationEnabled

  fun shouldUseNativeMediaNotification(): Boolean =
    !(enhancedNotificationEnabled && enhancedNotificationExclusive)

  fun shouldStartForegroundService(): Boolean {
    if (!shouldUseNativeMediaNotification()) return false
    val currentPlayer = player ?: return false
    return currentSrc.isNotBlank() && (currentPlayer.playWhenReady || currentPlayer.isPlaying)
  }

  fun updateEnhancedNotification(context: Context, force: Boolean = false) {
    val appContext = context.applicationContext
    if (!enhancedNotificationEnabled || currentSrc.isBlank()) {
      if (enhancedNotificationShown || force) {
        AndroidEnhancedNotificationManager.cancel(appContext)
        enhancedNotificationShown = false
      }
      return
    }

    enhancedNotificationShown = true

    val currentPlayer = player
    val duration = currentPlayer?.duration?.takeIf { it > 0L } ?: 0L
    val position = max(currentPlayer?.currentPosition ?: 0L, 0L)
    val isPlaying = currentPlayer?.isPlaying == true

    AndroidEnhancedNotificationManager.update(
      appContext,
      EnhancedNotificationState(
        title = getNotificationTitle(appContext),
        subtitle = getNotificationSubtitle(appContext),
        artworkUri = currentArtworkUri,
        showCover = notificationShowCover,
        isPlaying = isPlaying,
        currentPositionMs = position,
        durationMs = duration,
        contentIntent = buildSessionActivityPendingIntent(appContext),
        previousIntent = buildNotificationActionPendingIntent(appContext, NotificationAction.PREVIOUS),
        seekBackwardIntent =
          buildNotificationActionPendingIntent(appContext, NotificationAction.SEEK_BACKWARD),
        playIntent = buildNotificationActionPendingIntent(appContext, NotificationAction.PLAY),
        pauseIntent = buildNotificationActionPendingIntent(appContext, NotificationAction.PAUSE),
        seekForwardIntent =
          buildNotificationActionPendingIntent(appContext, NotificationAction.SEEK_FORWARD),
        nextIntent = buildNotificationActionPendingIntent(appContext, NotificationAction.NEXT),
        seekToPercentIntents =
          notificationSeekPercentStops.map { percent ->
            buildNotificationSeekPercentPendingIntent(appContext, percent)
          },
      ),
      force,
    )
  }

  fun cancelEnhancedNotification(context: Context) {
    enhancedNotificationShown = false
    AndroidEnhancedNotificationManager.cancel(context.applicationContext)
  }

  fun getNotificationTitle(context: Context): String {
    return currentTitle.ifBlank { context.getString(R.string.app_name) }
  }

  fun getNotificationSubtitle(context: Context): String {
    val subtitle =
      when (notificationSubtitleMode) {
        NOTIFICATION_SUBTITLE_ALBUM -> currentAlbum.ifBlank { currentArtist }
        NOTIFICATION_SUBTITLE_LYRIC -> currentLyricLine.ifBlank { currentArtist.ifBlank { currentAlbum } }
        else -> currentArtist.ifBlank { currentAlbum }
      }
    return subtitle.ifBlank { context.getString(R.string.playback_notification_channel_name) }
  }

  fun buildSessionActivityPendingIntent(context: Context): PendingIntent = buildSessionActivity(context)

  fun buildNotificationActionPendingIntent(
    context: Context,
    action: NotificationAction,
  ): PendingIntent {
    val intent =
      Intent(context, PlaybackService::class.java).apply {
        this.action =
          when (action) {
            NotificationAction.PREVIOUS -> ACTION_NOTIFICATION_PREVIOUS
            NotificationAction.PLAY -> ACTION_NOTIFICATION_PLAY
            NotificationAction.PAUSE -> ACTION_NOTIFICATION_PAUSE
            NotificationAction.NEXT -> ACTION_NOTIFICATION_NEXT
            NotificationAction.SEEK_BACKWARD -> ACTION_NOTIFICATION_SEEK_BACKWARD
            NotificationAction.SEEK_FORWARD -> ACTION_NOTIFICATION_SEEK_FORWARD
          }
      }
    return PendingIntent.getService(
      context,
      action.ordinal + 3001,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  fun buildNotificationSeekPercentPendingIntent(context: Context, percent: Int): PendingIntent {
    val safePercent = percent.coerceIn(0, 100)
    val intent =
      Intent(context, PlaybackService::class.java).apply {
        action = ACTION_NOTIFICATION_SEEK_TO_PERCENT
        putExtra(EXTRA_NOTIFICATION_SEEK_PERCENT, safePercent)
      }
    return PendingIntent.getService(
      context,
      3100 + safePercent,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  fun handleNotificationAction(intent: Intent?): Boolean {
    return when (val action = intent?.action) {
      ACTION_NOTIFICATION_PREVIOUS -> dispatchTransportAction(ACTION_PREVIOUS, ACTION_NOTIFICATION_PREVIOUS)
      ACTION_NOTIFICATION_PLAY -> handlePlayPauseNotificationAction(true)
      ACTION_NOTIFICATION_PAUSE -> handlePlayPauseNotificationAction(false)
      ACTION_NOTIFICATION_NEXT -> dispatchTransportAction(ACTION_NEXT, ACTION_NOTIFICATION_NEXT)
      ACTION_NOTIFICATION_SEEK_BACKWARD -> seekByMs(-NOTIFICATION_SEEK_STEP_MS)
      ACTION_NOTIFICATION_SEEK_FORWARD -> seekByMs(NOTIFICATION_SEEK_STEP_MS)
      ACTION_NOTIFICATION_SEEK_TO_PERCENT ->
        seekToPercent(intent.getIntExtra(EXTRA_NOTIFICATION_SEEK_PERCENT, 0))
      else -> {
        if (!action.isNullOrBlank()) Log.d(TAG, "notificationAction ignored action=$action")
        false
      }
    }
  }

  private fun handlePlayPauseNotificationAction(shouldPlay: Boolean): Boolean {
    val currentPlayer = player
    val dispatched = AndroidWebActionDispatcher.dispatch(if (shouldPlay) "play" else "pause")
    if (currentPlayer == null || currentSrc.isBlank()) {
      appContext?.let { refreshEnhancedNotificationSoon(it) }
      return dispatched
    }

    if (shouldPlay) {
      currentPlayer.play()
    } else {
      currentPlayer.pause()
    }
    appContext?.let { refreshEnhancedNotificationSoon(it) }
    return true
  }

  fun setNotificationConfig(context: Context, configJson: String?): Boolean {
    return try {
      val config = configJson?.takeIf { it.isNotBlank() }?.let(::JSONObject) ?: JSONObject()
      keepNotificationOnPause = config.optBoolean("keepNotificationOnPause", true)
      notificationTapAction =
        config.optString("notificationTapAction", NOTIFICATION_TAP_ACTION_PLAYER)
          .takeIf { it == NOTIFICATION_TAP_ACTION_APP || it == NOTIFICATION_TAP_ACTION_PLAYER }
          ?: NOTIFICATION_TAP_ACTION_PLAYER
      notificationShowCover = config.optBoolean("notificationShowCover", true)
      enhancedNotificationEnabled = config.optBoolean("enhancedNotificationEnabled", false)
      enhancedNotificationExclusive = config.optBoolean("enhancedNotificationExclusive", false)
      notificationSubtitleMode =
        config.optString("notificationSubtitleMode", NOTIFICATION_SUBTITLE_ARTIST)
          .takeIf {
            it == NOTIFICATION_SUBTITLE_ARTIST ||
              it == NOTIFICATION_SUBTITLE_ALBUM ||
              it == NOTIFICATION_SUBTITLE_LYRIC
          }
          ?: NOTIFICATION_SUBTITLE_ARTIST

      val saved =
        context
          .getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
          .edit()
          .putBoolean(PREF_KEEP_NOTIFICATION_ON_PAUSE, keepNotificationOnPause)
          .putString(PREF_NOTIFICATION_TAP_ACTION, notificationTapAction)
          .putBoolean(PREF_NOTIFICATION_SHOW_COVER, notificationShowCover)
          .putString(PREF_NOTIFICATION_SUBTITLE_MODE, notificationSubtitleMode)
          .putBoolean(PREF_ENHANCED_NOTIFICATION_ENABLED, enhancedNotificationEnabled)
          .putBoolean(PREF_ENHANCED_NOTIFICATION_EXCLUSIVE, enhancedNotificationExclusive)
          .commit()

      mediaSession?.setSessionActivity(buildSessionActivity(context.applicationContext))
      updateCurrentMediaItemMetadata(force = true)
      updateEnhancedNotification(context.applicationContext, true)
      saved
    } catch (_: Exception) {
      false
    }
  }

  fun updateMetadata(metadataJson: String?): Boolean {
    return try {
      val metadata = metadataJson?.takeIf { it.isNotBlank() }?.let(::JSONObject) ?: JSONObject()
      val applyResult = applyMetadataFromJson(metadata)
      if (shouldRefreshNativeMediaMetadata(applyResult)) {
        updateCurrentMediaItemMetadata()
      }
      if (applyResult.changed) {
        appContext?.let { updateEnhancedNotification(it, true) }
      }
      true
    } catch (_: Exception) {
      false
    }
  }

  private fun applyMetadataFromJson(data: JSONObject): MetadataApplyResult {
    var mediaFieldsChanged = false
    var lyricLineChanged = false

    if (data.has("title")) {
      val nextTitle = data.optString("title").trim()
      if (nextTitle != currentTitle) {
        currentTitle = nextTitle
        mediaFieldsChanged = true
      }
    }
    if (data.has("artist")) {
      val nextArtist = data.optString("artist").trim()
      if (nextArtist != currentArtist) {
        currentArtist = nextArtist
        mediaFieldsChanged = true
      }
    }
    if (data.has("album")) {
      val nextAlbum = data.optString("album").trim()
      if (nextAlbum != currentAlbum) {
        currentAlbum = nextAlbum
        mediaFieldsChanged = true
      }
    }
    if (data.has("lyricLine")) {
      val nextLyricLine = data.optString("lyricLine").trim()
      if (nextLyricLine != currentLyricLine) {
        currentLyricLine = nextLyricLine
        lyricLineChanged = true
      }
    }
    if (data.has("artworkUri")) {
      val nextArtworkUri = normalizeArtworkUri(data.optString("artworkUri"))
      if (nextArtworkUri != currentArtworkUri) {
        currentArtworkUri = nextArtworkUri
        mediaFieldsChanged = true
      }
    }

    return MetadataApplyResult(mediaFieldsChanged, lyricLineChanged)
  }

  private fun shouldRefreshNativeMediaMetadata(result: MetadataApplyResult): Boolean {
    if (result.mediaFieldsChanged) return true
    if (!result.lyricLineChanged || notificationSubtitleMode != NOTIFICATION_SUBTITLE_LYRIC) return false
    if (enhancedNotificationEnabled) return false

    val now = System.currentTimeMillis()
    if (now - lastMediaMetadataLyricUpdateAt < MEDIA_METADATA_LYRIC_UPDATE_INTERVAL_MS) {
      return false
    }

    lastMediaMetadataLyricUpdateAt = now
    return true
  }

  private fun buildMediaMetadataKey(): String {
    val subtitle =
      when (notificationSubtitleMode) {
        NOTIFICATION_SUBTITLE_ALBUM -> currentAlbum.ifBlank { currentArtist }
        NOTIFICATION_SUBTITLE_LYRIC -> currentLyricLine.ifBlank { currentArtist.ifBlank { currentAlbum } }
        else -> currentArtist.ifBlank { currentAlbum }
      }
    val artworkKey = if (notificationShowCover) currentArtworkUri else ""
    return listOf(currentTitle, subtitle, currentAlbum, artworkKey).joinToString("\u0001")
  }

  private fun buildNotificationMediaMetadata(): MediaMetadata {
    val builder = MediaMetadata.Builder()
    val subtitle =
      when (notificationSubtitleMode) {
        NOTIFICATION_SUBTITLE_ALBUM -> currentAlbum.ifBlank { currentArtist }
        NOTIFICATION_SUBTITLE_LYRIC -> currentLyricLine.ifBlank { currentArtist.ifBlank { currentAlbum } }
        else -> currentArtist.ifBlank { currentAlbum }
      }

    currentTitle.takeIf { it.isNotBlank() }?.let(builder::setTitle)
    subtitle.takeIf { it.isNotBlank() }?.let(builder::setArtist)
    currentAlbum.takeIf { it.isNotBlank() }?.let(builder::setAlbumTitle)

    if (notificationShowCover) {
      currentArtworkUri.takeIf { it.isNotBlank() }?.let { builder.setArtworkUri(Uri.parse(it)) }
    }

    return builder.build()
  }

  private fun updateCurrentMediaItemMetadata(force: Boolean = false) {
    val currentPlayer = player ?: return
    if (currentSrc.isBlank()) return

    val metadataKey = buildMediaMetadataKey()
    if (!force && metadataKey == lastMediaMetadataKey && currentPlayer.mediaItemCount > 0) return

    val currentIndex = currentPlayer.currentMediaItemIndex
    val safeIndex = if (currentIndex == C.INDEX_UNSET) 0 else currentIndex
    val safePosition = max(currentPlayer.currentPosition, 0L)
    val playWhenReady = currentPlayer.playWhenReady
    val existingItem =
      if (currentIndex != C.INDEX_UNSET && currentIndex < currentPlayer.mediaItemCount) {
        currentPlayer.getMediaItemAt(currentIndex)
      } else {
        null
      }

    val updatedItem =
      (existingItem?.buildUpon() ?: MediaItem.Builder().setUri(currentSrc))
        .setMediaMetadata(buildNotificationMediaMetadata())
        .build()

    if (existingItem == null) {
      currentPlayer.setMediaItem(updatedItem, safePosition)
      currentPlayer.prepare()
    } else {
      currentPlayer.replaceMediaItem(safeIndex, updatedItem)
      if (safePosition > 0L) {
        currentPlayer.seekTo(safeIndex, safePosition)
      }
    }

    currentPlayer.playWhenReady = playWhenReady
    lastMediaMetadataKey = metadataKey
  }

  private fun normalizePlaybackUrl(url: String): String {
    return url.trim().replace(Regex("^http:"), "https:").replace(Regex("^//"), "https://")
  }

  private fun normalizeArtworkUri(url: String): String {
    return url.trim().replace(Regex("^http:"), "https:").replace(Regex("^//"), "https://")
  }

  private fun buildErrorDetail(error: PlaybackException): JSONObject {
    val errorCodeName = error.errorCodeName
    val cause = error.cause
    val mappedErrorCode =
      when {
        errorCodeName.startsWith("ERROR_CODE_IO_") -> 2
        errorCodeName.startsWith("ERROR_CODE_DECODING_") ||
          errorCodeName.startsWith("ERROR_CODE_PARSING_") -> 3
        else -> 4
      }
    return snapshot()
      .put("errorCode", mappedErrorCode)
      .put("errorCodeName", errorCodeName)
      .put("message", error.message ?: "原生播放失败")
      .put("cause", cause?.javaClass?.simpleName ?: JSONObject.NULL)
      .put("causeMessage", cause?.message ?: JSONObject.NULL)
      .put("nativeErrorCode", error.errorCode)
      .put("src", currentSrc)
  }

  @Synchronized
  fun release() {
    stopProgressLoop()
    appContext?.let { cancelEnhancedNotification(it) }
    mediaSession?.release()
    mediaSession = null
    player?.release()
    player = null
    appContext = null
    currentSrc = ""
    currentTitle = ""
    currentArtist = ""
    currentAlbum = ""
    currentLyricLine = ""
    currentArtworkUri = ""
    enhancedNotificationShown = false
    errorCode = 0
  }

  private fun snapshot(): JSONObject {
    return JSONObject()
      .put("currentTime", getCurrentTime())
      .put("duration", getDuration())
      .put("volume", getVolume())
      .put("rate", getRate())
      .put("src", getSrc())
  }

  private fun emit(type: String, detail: JSONObject) {
    emitEvent?.invoke(type, detail.toString())
  }

  private fun startProgressLoop() {
    stopProgressLoop()
    handler.post(progressTask)
  }

  private fun stopProgressLoop() {
    handler.removeCallbacks(progressTask)
  }

  private fun refreshEnhancedNotificationSoon(context: Context) {
    val appContext = context.applicationContext
    updateEnhancedNotification(appContext, true)
    handler.postDelayed(
      { updateEnhancedNotification(appContext, true) },
      NOTIFICATION_ACTION_REFRESH_DELAY_MS,
    )
  }

  private fun requireContext(): Context {
    return requireNotNull(appContext) { "AndroidNativeAudioPlayer is not initialized" }
  }

  private fun handleTransportCommand(action: String, label: String) =
    Futures.immediateFuture(
      SessionResult(
        if (dispatchTransportAction(action, label)) {
          SessionResult.RESULT_SUCCESS
        } else {
          SessionResult.RESULT_ERROR_INVALID_STATE
        },
      ),
    )

  private fun dispatchTransportAction(action: String, label: String): Boolean {
    Log.d(TAG, "notificationAction action=$label dispatch=$action")
    return AndroidWebActionDispatcher.dispatch(action)
  }

  private fun buildMediaButtons(): ImmutableList<CommandButton> {
    return ImmutableList.of(
      CommandButton.Builder(CommandButton.ICON_PREVIOUS)
        .setDisplayName("上一首")
        .setSessionCommand(previousCommand)
        .setSlots(CommandButton.SLOT_BACK)
        .build(),
      CommandButton.Builder(CommandButton.ICON_NEXT)
        .setDisplayName("下一首")
        .setSessionCommand(nextCommand)
        .setSlots(CommandButton.SLOT_FORWARD)
        .build(),
    )
  }

  private fun loadNotificationConfig(context: Context) {
    val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
    keepNotificationOnPause = preferences.getBoolean(PREF_KEEP_NOTIFICATION_ON_PAUSE, true)
    notificationTapAction =
      preferences.getString(PREF_NOTIFICATION_TAP_ACTION, NOTIFICATION_TAP_ACTION_PLAYER)
        ?.takeIf { it == NOTIFICATION_TAP_ACTION_APP || it == NOTIFICATION_TAP_ACTION_PLAYER }
        ?: NOTIFICATION_TAP_ACTION_PLAYER
    notificationShowCover = preferences.getBoolean(PREF_NOTIFICATION_SHOW_COVER, true)
    enhancedNotificationEnabled = preferences.getBoolean(PREF_ENHANCED_NOTIFICATION_ENABLED, false)
    enhancedNotificationExclusive = preferences.getBoolean(PREF_ENHANCED_NOTIFICATION_EXCLUSIVE, false)
    notificationSubtitleMode =
      preferences.getString(PREF_NOTIFICATION_SUBTITLE_MODE, NOTIFICATION_SUBTITLE_ARTIST)
        ?.takeIf {
          it == NOTIFICATION_SUBTITLE_ARTIST ||
            it == NOTIFICATION_SUBTITLE_ALBUM ||
            it == NOTIFICATION_SUBTITLE_LYRIC
        }
        ?: NOTIFICATION_SUBTITLE_ARTIST
  }

  private fun buildSessionActivity(context: Context): PendingIntent {
    val intent =
      Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        if (notificationTapAction == NOTIFICATION_TAP_ACTION_PLAYER) {
          putExtra(MainActivity.EXTRA_NOTIFICATION_TARGET, NOTIFICATION_TAP_ACTION_PLAYER)
        }
      }
    return PendingIntent.getActivity(
      context,
      1001,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private const val PREFERENCES_NAME = "splayer_bridge"
  private const val PREF_KEEP_NOTIFICATION_ON_PAUSE = "android-playback-notification-keep-on-pause"
  private const val PREF_NOTIFICATION_TAP_ACTION = "android-playback-notification-tap-action"
  private const val PREF_NOTIFICATION_SHOW_COVER = "android-playback-notification-show-cover"
  private const val PREF_NOTIFICATION_SUBTITLE_MODE = "android-playback-notification-subtitle-mode"
  private const val PREF_ENHANCED_NOTIFICATION_ENABLED = "android-enhanced-notification-enabled"
  private const val PREF_ENHANCED_NOTIFICATION_EXCLUSIVE = "android-enhanced-notification-exclusive"
  private const val NOTIFICATION_TAP_ACTION_APP = "app"
  private const val NOTIFICATION_TAP_ACTION_PLAYER = "player"
  private const val NOTIFICATION_SUBTITLE_ARTIST = "artist"
  private const val NOTIFICATION_SUBTITLE_ALBUM = "album"
  private const val NOTIFICATION_SUBTITLE_LYRIC = "lyric"
}



