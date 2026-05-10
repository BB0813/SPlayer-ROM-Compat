package top.imsyy.splayer.android.player

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Outline
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.text.TextUtils
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewOutlineProvider
import android.view.WindowInsets
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import androidx.core.graphics.ColorUtils
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.roundToInt
import org.json.JSONArray
import org.json.JSONObject
import top.imsyy.splayer.android.bridge.AndroidWebActionDispatcher

class NativePlayerPageView(context: Context) : FrameLayout(context) {
  companion object {
    private const val SEEK_MAX = 1000
  }

  private val mainHandler = Handler(Looper.getMainLooper())
  private val coverExecutor = Executors.newSingleThreadExecutor()
  private val coverRequestToken = AtomicInteger(0)
  private var currentCoverUrl = ""
  private var currentDuration = 0.0
  private var currentThemeColor = Color.rgb(88, 126, 255)
  private var userSeeking = false
  private var currentPlaying = false
  private var currentLoading = false
  private val progressTicker =
    object : Runnable {
      override fun run() {
        if (visibility != VISIBLE || !currentPlaying || currentLoading || currentDuration <= 0.0) return
        if (!userSeeking) {
          val nativeDuration = AndroidNativeAudioPlayer.getDuration().takeIf { it > 0.0 } ?: currentDuration
          val nativeCurrent = AndroidNativeAudioPlayer.getCurrentTime().coerceAtLeast(0.0)
          currentDuration = nativeDuration
          updateProgress(nativeCurrent.coerceAtMost(nativeDuration), nativeDuration)
        }
        mainHandler.postDelayed(this, 500L)
      }
    }

  private val content =
    LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      clipToPadding = false
    }
  private val closeButton = buildTextButton("收起", 14f)
  private val headerTitle =
    TextView(context).apply {
      text = "原生播放页"
      textSize = 15f
      setTextColor(Color.argb(210, 255, 255, 255))
      gravity = Gravity.CENTER
      typeface = Typeface.DEFAULT_BOLD
    }
  private val coverHolder =
    FrameLayout(context).apply {
      clipToOutline = true
      outlineProvider =
        object : ViewOutlineProvider() {
          override fun getOutline(view: View, outline: Outline) {
            outline.setRoundRect(0, 0, view.width, view.height, dp(28).toFloat())
          }
        }
    }
  private val coverInitial =
    TextView(context).apply {
      text = "S"
      textSize = 72f
      typeface = Typeface.DEFAULT_BOLD
      setTextColor(Color.argb(235, 255, 255, 255))
      gravity = Gravity.CENTER
    }
  private val coverImage =
    ImageView(context).apply {
      scaleType = ImageView.ScaleType.CENTER_CROP
      alpha = 0.98f
    }
  private val songTitle =
    TextView(context).apply {
      textSize = 24f
      typeface = Typeface.DEFAULT_BOLD
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      maxLines = 2
      ellipsize = TextUtils.TruncateAt.END
    }
  private val songSubtitle =
    TextView(context).apply {
      textSize = 14f
      setTextColor(Color.argb(190, 255, 255, 255))
      gravity = Gravity.CENTER
      maxLines = 2
      ellipsize = TextUtils.TruncateAt.END
    }
  private val previousLyric = buildLyricText(13f, 130)
  private val currentLyric =
    buildLyricText(18f, 245).apply {
      typeface = Typeface.DEFAULT_BOLD
      maxLines = 3
    }
  private val nextLyric = buildLyricText(13f, 130)
  private val currentTime = buildTimeText()
  private val durationTime = buildTimeText()
  private val seekBar =
    SeekBar(context).apply {
      max = SEEK_MAX
      progress = 0
      setOnSeekBarChangeListener(
        object : SeekBar.OnSeekBarChangeListener {
          override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
            if (fromUser) {
              currentTime.text = formatTime(currentDuration * progress / SEEK_MAX)
            }
          }

          override fun onStartTrackingTouch(seekBar: SeekBar?) {
            userSeeking = true
          }

          override fun onStopTrackingTouch(seekBar: SeekBar?) {
            val targetTime = currentDuration * ((seekBar?.progress ?: 0).toDouble() / SEEK_MAX)
            AndroidNativeAudioPlayer.seek(targetTime)
            currentTime.text = formatTime(targetTime)
            userSeeking = false
          }
        },
      )
    }
  private val previousButton = buildTextButton("上一首", 15f)
  private val playPauseButton = buildTextButton("播放", 18f)
  private val nextButton = buildTextButton("下一首", 15f)

  init {
    visibility = GONE
    isClickable = true
    isFocusable = true
    setBackgroundColor(Color.rgb(16, 17, 22))
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES

    addView(
      content,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
    )
    buildLayout()
    bindControls()
    applyTheme(currentThemeColor)
    setSafeAreaPadding()
  }

  fun updateState(stateJson: String?): Boolean {
    if (stateJson.isNullOrBlank()) return false

    return runCatching {
      val state = JSONObject(stateJson)
      val song = state.optJSONObject("song") ?: JSONObject()
      val lyric = state.optJSONObject("lyric") ?: JSONObject()
      val duration = state.optDouble("duration", 0.0).coerceAtLeast(0.0)
      val current = state.optDouble("currentTime", 0.0).coerceAtLeast(0.0)
      val themeColor = parseThemeColor(state.optString("themeColor", ""))
      currentDuration = duration
      currentThemeColor = themeColor

      val title = song.optCleanString("name", "SPlayer-ROM-Compat")
      val artist = song.optCleanString("artist", "未知歌手")
      val album = song.optCleanString("album", "未知专辑")
      val cover = song.optCleanString("cover", "")
      val playing = state.optBoolean("playing", false)
      val loading = state.optBoolean("loading", false)
      currentPlaying = playing
      currentLoading = loading

      songTitle.text = title
      songSubtitle.text = "$artist · $album"
      coverInitial.text = title.firstOrNull()?.toString()?.uppercase(Locale.ROOT) ?: "S"
      playPauseButton.text =
        when {
          loading -> "缓冲中"
          playing -> "暂停"
          else -> "播放"
        }

      updateProgress(current, duration)
      updateLyrics(lyric)
      applyTheme(themeColor)
      loadCover(cover)
      setPlayerVisible(state.optBoolean("visible", visibility == VISIBLE))
      syncProgressTicker()
      true
    }.getOrDefault(false)
  }

  fun updateLyricState(lyricJson: String?): Boolean {
    if (lyricJson.isNullOrBlank()) return false

    return runCatching {
      updateLyrics(JSONObject(lyricJson))
      true
    }.getOrDefault(false)
  }

  fun setPlayerVisible(visible: Boolean): Boolean {
    visibility = if (visible) VISIBLE else GONE
    if (visible) {
      bringToFront()
      requestFocus()
      post { updateAdaptiveSizes() }
      syncProgressTicker()
    } else {
      stopProgressTicker()
    }
    return true
  }

  fun isPlayerVisible(): Boolean = visibility == VISIBLE

  override fun onTouchEvent(event: MotionEvent?): Boolean {
    return true
  }

  override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
    super.onSizeChanged(width, height, oldWidth, oldHeight)
    updateAdaptiveSizes()
  }

  override fun onDetachedFromWindow() {
    stopProgressTicker()
    coverExecutor.shutdownNow()
    super.onDetachedFromWindow()
  }

  private fun syncProgressTicker() {
    stopProgressTicker()
    if (visibility == VISIBLE && currentPlaying && !currentLoading && currentDuration > 0.0) {
      mainHandler.postDelayed(progressTicker, 500L)
    }
  }

  private fun stopProgressTicker() {
    mainHandler.removeCallbacks(progressTicker)
  }

  private fun buildLayout() {
    val header =
      FrameLayout(context).apply {
        addView(
          headerTitle,
          LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, Gravity.CENTER),
        )
        addView(
          closeButton,
          LayoutParams(LayoutParams.WRAP_CONTENT, dp(40), Gravity.END or Gravity.CENTER_VERTICAL),
        )
      }
    content.addView(header, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, dp(44)))

    coverHolder.addView(
      coverInitial,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
    )
    coverHolder.addView(
      coverImage,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
    )
    content.addView(
      coverHolder,
      LinearLayout.LayoutParams(dp(300), dp(300)).apply {
        topMargin = dp(14)
        bottomMargin = dp(18)
        gravity = Gravity.CENTER_HORIZONTAL
      },
    )

    content.addView(songTitle, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    content.addView(
      songSubtitle,
      LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
        topMargin = dp(8)
        bottomMargin = dp(18)
      },
    )

    content.addView(previousLyric, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, dp(24)))
    content.addView(currentLyric, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, dp(72)))
    content.addView(nextLyric, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, dp(24)))

    val seekRow =
      LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
      }
    seekRow.addView(currentTime, LinearLayout.LayoutParams(dp(48), LayoutParams.WRAP_CONTENT))
    seekRow.addView(
      seekBar,
      LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f).apply {
        leftMargin = dp(8)
        rightMargin = dp(8)
      },
    )
    seekRow.addView(durationTime, LinearLayout.LayoutParams(dp(48), LayoutParams.WRAP_CONTENT))
    content.addView(
      seekRow,
      LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
        topMargin = dp(18)
      },
    )

    val controls =
      LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER
      }
    controls.addView(previousButton, LinearLayout.LayoutParams(dp(88), dp(48)))
    controls.addView(
      playPauseButton,
      LinearLayout.LayoutParams(dp(112), dp(56)).apply {
        leftMargin = dp(16)
        rightMargin = dp(16)
      },
    )
    controls.addView(nextButton, LinearLayout.LayoutParams(dp(88), dp(48)))
    content.addView(
      controls,
      LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
        topMargin = dp(16)
      },
    )
  }

  private fun bindControls() {
    closeButton.setOnClickListener {
      setPlayerVisible(false)
      AndroidWebActionDispatcher.dispatch("closePlayer")
    }
    previousButton.setOnClickListener { AndroidWebActionDispatcher.dispatch("playPrev") }
    playPauseButton.setOnClickListener { AndroidWebActionDispatcher.dispatch("playOrPause") }
    nextButton.setOnClickListener { AndroidWebActionDispatcher.dispatch("playNext") }
  }

  @Suppress("DEPRECATION")
  private fun setSafeAreaPadding() {
    setOnApplyWindowInsetsListener { _, insets ->
      val top = insets.systemWindowInsetTop
      val bottom = insets.systemWindowInsetBottom
      content.setPadding(dp(24), top + dp(18), dp(24), bottom + dp(20))
      insets
    }
    requestApplyInsets()
  }

  private fun updateProgress(current: Double, duration: Double) {
    currentTime.text = formatTime(current)
    durationTime.text = formatTime(duration)
    if (!userSeeking) {
      seekBar.progress =
        if (duration > 0) ((current / duration) * SEEK_MAX).roundToInt().coerceIn(0, SEEK_MAX) else 0
    }
  }

  private fun updateLyrics(lyric: JSONObject) {
    val lines = lyric.optJSONArray("lines") ?: JSONArray()
    val index = lyric.optInt("index", -1)
    previousLyric.text = lyricTextAt(lines, index - 1).ifBlank { " " }
    currentLyric.text = lyricTextAt(lines, index).ifBlank { "暂无歌词" }
    nextLyric.text = lyricTextAt(lines, index + 1).ifBlank { " " }
  }

  private fun loadCover(coverUrl: String) {
    if (coverUrl == currentCoverUrl) return
    currentCoverUrl = coverUrl
    coverImage.setImageDrawable(null)
    if (coverUrl.isBlank() || !coverUrl.startsWith("http", ignoreCase = true)) return

    val token = coverRequestToken.incrementAndGet()
    coverExecutor.execute {
      val bitmap =
        runCatching {
            val connection = URL(coverUrl).openConnection() as HttpURLConnection
            connection.connectTimeout = 5000
            connection.readTimeout = 5000
            connection.instanceFollowRedirects = true
            connection.inputStream.use { BitmapFactory.decodeStream(it) }
          }
          .getOrNull()
      mainHandler.post {
        if (token == coverRequestToken.get() && coverUrl == currentCoverUrl && bitmap != null) {
          coverImage.setImageBitmap(bitmap)
        }
      }
    }
  }

  private fun applyTheme(themeColor: Int) {
    val topColor = ColorUtils.blendARGB(themeColor, Color.BLACK, 0.46f)
    val bottomColor = Color.rgb(13, 14, 19)
    background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(topColor, bottomColor))
    coverHolder.background =
      GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(themeColor, topColor)).apply {
        cornerRadius = dp(28).toFloat()
      }

    val accent = ColorUtils.blendARGB(themeColor, Color.WHITE, 0.18f)
    val muted = ColorUtils.setAlphaComponent(Color.WHITE, 70)
    seekBar.progressTintList = ColorStateList.valueOf(accent)
    seekBar.thumbTintList = ColorStateList.valueOf(accent)
    seekBar.progressBackgroundTintList = ColorStateList.valueOf(muted)

    previousButton.background = roundedBackground(ColorUtils.setAlphaComponent(Color.WHITE, 28), dp(24))
    nextButton.background = roundedBackground(ColorUtils.setAlphaComponent(Color.WHITE, 28), dp(24))
    playPauseButton.background = roundedBackground(ColorUtils.setAlphaComponent(accent, 235), dp(28))
    playPauseButton.setTextColor(if (isLightColor(accent)) Color.rgb(24, 24, 28) else Color.WHITE)
  }

  private fun updateAdaptiveSizes() {
    if (width <= 0 || height <= 0) return
    val horizontalPadding = content.paddingLeft + content.paddingRight
    val maxWidth = (width - horizontalPadding).coerceAtLeast(dp(220))
    val heightRatio = if (height < dp(680)) 0.32f else 0.38f
    val coverSize = minOf(maxWidth, (height * heightRatio).roundToInt(), dp(360)).coerceAtLeast(dp(190))
    val params = coverHolder.layoutParams as? LinearLayout.LayoutParams ?: return
    if (params.width == coverSize && params.height == coverSize) return
    params.width = coverSize
    params.height = coverSize
    params.topMargin = if (height < dp(680)) dp(8) else dp(14)
    params.bottomMargin = if (height < dp(680)) dp(12) else dp(18)
    coverHolder.layoutParams = params
  }

  private fun buildTextButton(textValue: String, size: Float): TextView {
    return TextView(context).apply {
      text = textValue
      textSize = size
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      minHeight = dp(40)
      isClickable = true
      isFocusable = true
      includeFontPadding = false
      setPadding(dp(14), 0, dp(14), 0)
    }
  }

  private fun buildLyricText(size: Float, alpha: Int): TextView {
    return TextView(context).apply {
      textSize = size
      setTextColor(Color.argb(alpha, 255, 255, 255))
      gravity = Gravity.CENTER
      maxLines = 1
      ellipsize = TextUtils.TruncateAt.END
      includeFontPadding = false
    }
  }

  private fun buildTimeText(): TextView {
    return TextView(context).apply {
      text = "0:00"
      textSize = 12f
      setTextColor(Color.argb(175, 255, 255, 255))
      gravity = Gravity.CENTER
      includeFontPadding = false
    }
  }

  private fun lyricTextAt(lines: JSONArray, index: Int): String {
    if (index < 0 || index >= lines.length()) return ""
    val line = lines.optJSONObject(index) ?: return ""
    val text = line.optCleanString("text", "")
    val translatedText = line.optCleanString("translatedText", "")
    return if (translatedText.isNotBlank() && text.isNotBlank()) {
      "$text / $translatedText"
    } else {
      text.ifBlank { translatedText }
    }
  }

  private fun parseThemeColor(raw: String): Int {
    val parts =
      Regex("\\d+(?:\\.\\d+)?")
        .findAll(raw)
        .take(3)
        .map { it.value.toDoubleOrNull()?.roundToInt() ?: 0 }
        .toList()
    if (parts.size < 3) return currentThemeColor
    return Color.rgb(parts[0].coerceIn(0, 255), parts[1].coerceIn(0, 255), parts[2].coerceIn(0, 255))
  }

  private fun roundedBackground(color: Int, radius: Int): GradientDrawable {
    return GradientDrawable().apply {
      setColor(color)
      cornerRadius = radius.toFloat()
    }
  }

  private fun isLightColor(color: Int): Boolean {
    return ColorUtils.calculateLuminance(color) >= 0.62
  }

  private fun formatTime(seconds: Double): String {
    val totalSeconds = seconds.roundToInt().coerceAtLeast(0)
    return String.format(Locale.US, "%d:%02d", totalSeconds / 60, totalSeconds % 60)
  }

  private fun dp(value: Int): Int {
    return (value * resources.displayMetrics.density).roundToInt()
  }

  private fun JSONObject.optCleanString(key: String, fallback: String): String {
    val value = optString(key, "").trim()
    if (value.isBlank() || value == "null" || value == "undefined") return fallback
    return value
  }
}
