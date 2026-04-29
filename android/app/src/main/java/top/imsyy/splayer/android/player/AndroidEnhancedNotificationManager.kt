package top.imsyy.splayer.android.player

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import top.imsyy.splayer.android.R

data class EnhancedNotificationState(
  val title: String,
  val subtitle: String,
  val artworkUri: String,
  val showCover: Boolean,
  val isPlaying: Boolean,
  val currentPositionMs: Long,
  val durationMs: Long,
  val contentIntent: PendingIntent,
  val previousIntent: PendingIntent,
  val seekBackwardIntent: PendingIntent,
  val playIntent: PendingIntent,
  val pauseIntent: PendingIntent,
  val seekForwardIntent: PendingIntent,
  val nextIntent: PendingIntent,
  val seekToPercentIntents: List<PendingIntent>,
  val useMediaCategory: Boolean,
)

object AndroidEnhancedNotificationManager {
  private const val NOTIFICATION_ID = 2002
  private const val CHANNEL_ID = "splayer_enhanced_playback"
  private const val CHANNEL_NAME = "SPlayer-ROM-Compat 增强播放控制"
  private const val MAX_PROGRESS = 1000
  private const val MAX_ARTWORK_SIZE = 256
  private val progressZoneIds =
    intArrayOf(
      R.id.enhanced_notification_progress_zone_10,
      R.id.enhanced_notification_progress_zone_30,
      R.id.enhanced_notification_progress_zone_50,
      R.id.enhanced_notification_progress_zone_70,
      R.id.enhanced_notification_progress_zone_90,
    )

  private val artworkExecutor = Executors.newSingleThreadExecutor()
  private val artworkLoading = AtomicBoolean(false)
  private var cachedArtworkUri = ""
  private var cachedArtworkBitmap: Bitmap? = null
  private var pendingState: EnhancedNotificationState? = null
  private var lastProgressUpdateAt = 0L

  @SuppressLint("MissingPermission")
  fun update(context: Context, state: EnhancedNotificationState, force: Boolean = false) {
    val appContext = context.applicationContext
    if (!hasNotificationPermission(appContext)) return

    ensureChannel(appContext)
    pendingState = state
    maybeLoadArtwork(appContext, state)

    val now = System.currentTimeMillis()
    if (!force && now - lastProgressUpdateAt < 1000L) return
    lastProgressUpdateAt = now

    NotificationManagerCompat.from(appContext).notify(
      NOTIFICATION_ID,
      buildNotification(appContext, state),
    )
  }

  fun cancel(context: Context) {
    pendingState = null
    lastProgressUpdateAt = 0L
    NotificationManagerCompat.from(context.applicationContext).cancel(NOTIFICATION_ID)
  }

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW).apply {
        setShowBadge(false)
        description = "显示第三方 ROM 增强音频控制卡片"
      },
    )
  }

  private fun buildNotification(context: Context, state: EnhancedNotificationState) =
    NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_splayer)
      .setContentTitle(state.title)
      .setContentText(state.subtitle)
      .setContentIntent(state.contentIntent)
      .setCustomContentView(buildRemoteViews(context, state, false))
      .setCustomBigContentView(buildRemoteViews(context, state, true))
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setCategory(
        if (state.useMediaCategory) {
          NotificationCompat.CATEGORY_TRANSPORT
        } else {
          NotificationCompat.CATEGORY_STATUS
        },
      )
      .setLocalOnly(!state.useMediaCategory)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setOngoing(state.isPlaying && state.useMediaCategory)
      .setShowWhen(false)
      .build()

  private fun buildRemoteViews(
    context: Context,
    state: EnhancedNotificationState,
    expanded: Boolean,
  ): RemoteViews {
    val layout =
      if (expanded) {
        R.layout.notification_enhanced_expanded
      } else {
        R.layout.notification_enhanced_compact
      }
    val views = RemoteViews(context.packageName, layout)
    val duration = max(state.durationMs, 0L)
    val position = state.currentPositionMs.coerceAtLeast(0L)
    val progress =
      if (duration > 0L) {
        ((position.coerceAtMost(duration).toDouble() / duration.toDouble()) * MAX_PROGRESS).toInt()
      } else {
        0
      }

    views.setTextViewText(R.id.enhanced_notification_title, state.title)
    views.setTextViewText(R.id.enhanced_notification_subtitle, state.subtitle)
    views.setTextViewText(
      R.id.enhanced_notification_time,
      "${formatTime(position)} / ${formatTime(duration)}",
    )
    views.setProgressBar(R.id.enhanced_notification_progress, MAX_PROGRESS, progress, false)
    if (expanded) {
      progressZoneIds.forEachIndexed { index, viewId ->
        state.seekToPercentIntents.getOrNull(index)?.let { pendingIntent ->
          views.setOnClickPendingIntent(viewId, pendingIntent)
        }
      }
    }
    views.setImageViewResource(
      R.id.enhanced_notification_play_pause,
      if (state.isPlaying) R.drawable.ic_notify_pause else R.drawable.ic_notify_play,
    )
    views.setOnClickPendingIntent(R.id.enhanced_notification_previous, state.previousIntent)
    views.setOnClickPendingIntent(R.id.enhanced_notification_seek_backward, state.seekBackwardIntent)
    views.setOnClickPendingIntent(
      R.id.enhanced_notification_play_pause,
      if (state.isPlaying) state.pauseIntent else state.playIntent,
    )
    views.setOnClickPendingIntent(R.id.enhanced_notification_seek_forward, state.seekForwardIntent)
    views.setOnClickPendingIntent(R.id.enhanced_notification_next, state.nextIntent)
    views.setOnClickPendingIntent(R.id.enhanced_notification_root, state.contentIntent)

    val artwork = if (state.showCover) cachedArtworkBitmap else null
    if (artwork != null && state.artworkUri == cachedArtworkUri) {
      views.setImageViewBitmap(R.id.enhanced_notification_cover, artwork)
    } else {
      views.setImageViewResource(R.id.enhanced_notification_cover, R.mipmap.ic_launcher)
    }

    return views
  }

  private fun maybeLoadArtwork(context: Context, state: EnhancedNotificationState) {
    if (!state.showCover || state.artworkUri.isBlank()) {
      cachedArtworkUri = ""
      cachedArtworkBitmap = null
      return
    }
    if (state.artworkUri == cachedArtworkUri && cachedArtworkBitmap != null) return
    if (!artworkLoading.compareAndSet(false, true)) return

    val artworkUri = state.artworkUri
    artworkExecutor.execute {
      val bitmap = loadArtworkBitmap(context, artworkUri)
      cachedArtworkUri = artworkUri
      cachedArtworkBitmap = bitmap
      artworkLoading.set(false)
      pendingState?.takeIf { it.artworkUri == artworkUri }?.let {
        update(context, it, true)
      }
    }
  }

  private fun loadArtworkBitmap(context: Context, artworkUri: String): Bitmap? {
    return try {
      val uri = Uri.parse(artworkUri)
      val source =
        when (uri.scheme?.lowercase()) {
          "http", "https" -> URL(artworkUri).openStream()
          "content", "file", "android.resource" -> context.contentResolver.openInputStream(uri)
          else -> null
        } ?: return null
      source.use { stream ->
        val bitmap = BitmapFactory.decodeStream(stream) ?: return null
        Bitmap.createScaledBitmap(bitmap, MAX_ARTWORK_SIZE, MAX_ARTWORK_SIZE, true)
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun hasNotificationPermission(context: Context): Boolean {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED
  }

  private fun formatTime(valueMs: Long): String {
    if (valueMs <= 0L) return "00:00"
    val totalSeconds = valueMs / 1000L
    val seconds = totalSeconds % 60L
    val minutes = (totalSeconds / 60L) % 60L
    val hours = totalSeconds / 3600L
    return if (hours > 0L) {
      "%d:%02d:%02d".format(hours, minutes, seconds)
    } else {
      "%02d:%02d".format(minutes, seconds)
    }
  }
}
