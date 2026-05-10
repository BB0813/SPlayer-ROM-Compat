package top.imsyy.splayer.android.player

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.text.TextUtils
import android.view.Gravity
import android.view.View
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
import org.json.JSONObject
import top.imsyy.splayer.android.bridge.AndroidWebActionDispatcher

class NativeMiniPlayerBarView(context: Context) : FrameLayout(context) {
  companion object {
    private const val PROGRESS_MAX = 1000
  }

  private val mainHandler = Handler(Looper.getMainLooper())
  private val coverExecutor = Executors.newSingleThreadExecutor()
  private val coverRequestToken = AtomicInteger(0)
  private var currentCoverUrl = ""
  private var currentDuration = 0.0
  private var currentThemeColor = Color.rgb(88, 126, 255)
  private var currentPlaying = false
  private var currentLoading = false
  private var userSeeking = false
  private var lastBottomInset = 0
  private val progressTicker =
    object : Runnable {
      override fun run() {
        if (visibility != VISIBLE || !currentPlaying || currentLoading || currentDuration <= 0.0) return
        val nativeDuration = AndroidNativeAudioPlayer.getDuration().takeIf { it > 0.0 } ?: currentDuration
        val nativeCurrent = AndroidNativeAudioPlayer.getCurrentTime().coerceAtLeast(0.0)
        currentDuration = nativeDuration
        updateProgress(nativeCurrent.coerceAtMost(nativeDuration), nativeDuration)
        mainHandler.postDelayed(this, 700L)
      }
    }

  private val card =
    LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      clipToPadding = false
      isClickable = true
      isFocusable = true
      minimumHeight = dp(76)
      setPadding(dp(12), dp(10), dp(10), dp(10))
    }
  private val seekBar =
    SeekBar(context).apply {
      max = PROGRESS_MAX
      progress = 0
      importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
      contentDescription = "播放进度"
      setOnSeekBarChangeListener(
        object : SeekBar.OnSeekBarChangeListener {
          override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
            if (fromUser) userSeeking = true
          }

          override fun onStartTrackingTouch(seekBar: SeekBar?) {
            userSeeking = true
          }

          override fun onStopTrackingTouch(seekBar: SeekBar?) {
            val targetTime = currentDuration * ((seekBar?.progress ?: 0).toDouble() / PROGRESS_MAX)
            AndroidNativeAudioPlayer.seek(targetTime)
            userSeeking = false
            syncProgressTicker()
          }
        },
      )
    }
  private val coverHolder =
    FrameLayout(context).apply {
      background = roundedBackground(Color.rgb(226, 228, 238), dp(15))
      clipToOutline = true
    }
  private val coverInitial =
    TextView(context).apply {
      text = "S"
      textSize = 24f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      includeFontPadding = false
    }
  private val coverImage =
    ImageView(context).apply {
      scaleType = ImageView.ScaleType.CENTER_CROP
      alpha = 0.98f
    }
  private val songTitle =
    TextView(context).apply {
      text = "SPlayer-ROM-Compat"
      textSize = 15f
      typeface = Typeface.DEFAULT_BOLD
      setTextColor(Color.rgb(25, 25, 28))
      maxLines = 1
      ellipsize = TextUtils.TruncateAt.END
      includeFontPadding = false
    }
  private val songSubtitle =
    TextView(context).apply {
      text = "准备播放"
      textSize = 12f
      setTextColor(Color.argb(170, 25, 25, 28))
      maxLines = 1
      ellipsize = TextUtils.TruncateAt.END
      includeFontPadding = false
    }
  private val previousButton = buildTextButton("上首", 12f)
  private val playPauseButton = buildTextButton("播放", 13f)
  private val nextButton = buildTextButton("下首", 12f)
  private val queueButton = buildTextButton("队列", 12f)

  init {
    visibility = GONE
    isClickable = false
    isFocusable = false
    setBackgroundColor(Color.TRANSPARENT)
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    minimumHeight = dp(76)

    card.addView(
      coverHolder,
      LinearLayout.LayoutParams(dp(52), dp(52)).apply {
        rightMargin = dp(10)
      },
    )
    coverHolder.addView(coverInitial, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    coverHolder.addView(coverImage, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))

    val textGroup =
      LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER_VERTICAL
      }
    textGroup.addView(songTitle, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    textGroup.addView(
      songSubtitle,
      LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
        topMargin = dp(5)
      },
    )
    card.addView(textGroup, LinearLayout.LayoutParams(0, LayoutParams.MATCH_PARENT, 1f))

    val controls =
      LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
      }
    controls.addView(previousButton, LinearLayout.LayoutParams(dp(44), dp(48)))
    controls.addView(
      playPauseButton,
      LinearLayout.LayoutParams(dp(52), dp(48)).apply {
        leftMargin = dp(4)
        rightMargin = dp(4)
      },
    )
    controls.addView(nextButton, LinearLayout.LayoutParams(dp(44), dp(48)))
    controls.addView(
      queueButton,
      LinearLayout.LayoutParams(dp(44), dp(48)).apply {
        leftMargin = dp(4)
      },
    )
    card.addView(controls, LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.MATCH_PARENT))

    addView(
      card,
      LayoutParams(LayoutParams.MATCH_PARENT, dp(76), Gravity.BOTTOM).apply {
        leftMargin = dp(12)
        rightMargin = dp(12)
      },
    )
    addView(
      seekBar,
      LayoutParams(LayoutParams.MATCH_PARENT, dp(22), Gravity.TOP).apply {
        leftMargin = dp(22)
        rightMargin = dp(22)
        topMargin = dp(-2)
      },
    )

    bindControls()
    applyResponsiveLayout()
    applyTheme(currentThemeColor)
    setSafeAreaMargin()
  }

  fun updateState(stateJson: String?): Boolean {
    if (stateJson.isNullOrBlank()) return false

    return runCatching {
      val state = JSONObject(stateJson)
      val song = state.optJSONObject("song") ?: JSONObject()
      val duration = state.optDouble("duration", 0.0).coerceAtLeast(0.0)
      val current = state.optDouble("currentTime", 0.0).coerceAtLeast(0.0)
      val themeColor = parseThemeColor(state.optString("themeColor", ""))
      val title = song.optCleanString("name", "SPlayer-ROM-Compat")
      val artist = song.optCleanString("artist", "未知歌手")
      val album = song.optCleanString("album", "")
      val cover = song.optCleanString("cover", "")
      val queue = state.optJSONObject("queue") ?: JSONObject()
      val queueTotal = queue.optInt("total", 0).coerceAtLeast(0)
      val queueCurrent = queue.optInt("current", 0).coerceIn(0, queueTotal.coerceAtLeast(1))
      val playing = state.optBoolean("playing", false)
      val loading = state.optBoolean("loading", false)

      currentDuration = duration
      currentThemeColor = themeColor
      currentPlaying = playing
      currentLoading = loading

      songTitle.text = title
      songSubtitle.text = if (album.isBlank()) artist else "$artist · $album"
      coverInitial.text = title.firstOrNull()?.toString()?.uppercase(Locale.ROOT) ?: "S"
      playPauseButton.text =
        when {
          loading -> "缓冲"
          playing -> "暂停"
          else -> "播放"
        }
      updateQueueSummary(queueCurrent, queueTotal)

      updateProgress(current, duration)
      applyTheme(themeColor)
      loadCover(cover)
      setPlayerVisible(state.optBoolean("visible", visibility == VISIBLE))
      syncProgressTicker()
      true
    }.getOrDefault(false)
  }

  fun setPlayerVisible(visible: Boolean): Boolean {
    visibility = if (visible) VISIBLE else GONE
    if (visible) {
      bringToFront()
      syncProgressTicker()
      updateOuterMargin(lastBottomInset)
    } else {
      stopProgressTicker()
    }
    return true
  }

  override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
    super.onSizeChanged(width, height, oldWidth, oldHeight)
    applyResponsiveLayout()
    updateOuterMargin(lastBottomInset)
  }

  override fun onDetachedFromWindow() {
    stopProgressTicker()
    coverExecutor.shutdownNow()
    super.onDetachedFromWindow()
  }

  private fun bindControls() {
    card.setOnClickListener { AndroidWebActionDispatcher.dispatch("openPlayer") }
    previousButton.setOnClickListener { AndroidWebActionDispatcher.dispatch("playPrev") }
    playPauseButton.setOnClickListener { AndroidWebActionDispatcher.dispatch("playOrPause") }
    nextButton.setOnClickListener { AndroidWebActionDispatcher.dispatch("playNext") }
    queueButton.setOnClickListener { AndroidWebActionDispatcher.dispatch("openPlayList") }
  }

  @Suppress("DEPRECATION")
  private fun setSafeAreaMargin() {
    setOnApplyWindowInsetsListener { _, insets ->
      lastBottomInset = insets.systemWindowInsetBottom
      updateOuterMargin(lastBottomInset)
      insets
    }
    requestApplyInsets()
  }

  private fun updateOuterMargin(systemBottom: Int) {
    val params = layoutParams as? FrameLayout.LayoutParams ?: return
    val targetHeight = cardHeight()
    val targetBottom = systemBottom + dp(if (isWideLayout()) 84 else 78)
    val screenWidth = resources.displayMetrics.widthPixels
    val targetWidth =
      if (isWideLayout()) {
        (screenWidth - dp(64)).coerceAtMost(dp(760)).coerceAtLeast(dp(420))
      } else {
        LayoutParams.MATCH_PARENT
      }
    if (
      params.bottomMargin == targetBottom &&
        params.height == targetHeight &&
        params.width == targetWidth &&
        params.gravity == (Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL)
    ) {
      return
    }
    params.width = targetWidth
    params.height = targetHeight
    params.gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
    params.bottomMargin = targetBottom
    layoutParams = params
  }

  private fun applyResponsiveLayout() {
    val wide = isWideLayout()
    val height = cardHeight()
    val coverSize = dp(if (wide) 58 else 52)
    val buttonHeight = dp(if (wide) 52 else 48)
    val sideMargin = dp(if (wide) 18 else 12)

    minimumHeight = height
    card.minimumHeight = height
    card.setPadding(dp(if (wide) 16 else 12), dp(if (wide) 12 else 10), dp(if (wide) 14 else 10), dp(if (wide) 12 else 10))
    songTitle.textSize = if (wide) 16.5f else 15f
    songSubtitle.textSize = if (wide) 12.5f else 12f

    (coverHolder.layoutParams as? LinearLayout.LayoutParams)?.let { params ->
      params.width = coverSize
      params.height = coverSize
      params.rightMargin = dp(if (wide) 12 else 10)
      coverHolder.layoutParams = params
    }
    setButtonSize(previousButton, dp(if (wide) 48 else 44), buttonHeight)
    setButtonSize(playPauseButton, dp(if (wide) 58 else 52), buttonHeight)
    setButtonSize(nextButton, dp(if (wide) 48 else 44), buttonHeight)
    setButtonSize(queueButton, dp(if (wide) 48 else 44), buttonHeight)

    (card.layoutParams as? LayoutParams)?.let { params ->
      params.height = height
      params.leftMargin = sideMargin
      params.rightMargin = sideMargin
      card.layoutParams = params
    }
    (seekBar.layoutParams as? LayoutParams)?.let { params ->
      params.height = dp(if (wide) 24 else 22)
      params.leftMargin = dp(if (wide) 30 else 22)
      params.rightMargin = dp(if (wide) 30 else 22)
      params.topMargin = dp(if (wide) 0 else -2)
      seekBar.layoutParams = params
    }
  }

  private fun setButtonSize(button: TextView, width: Int, height: Int) {
    (button.layoutParams as? LinearLayout.LayoutParams)?.let { params ->
      params.width = width
      params.height = height
      button.layoutParams = params
    }
  }

  private fun cardHeight(): Int {
    return dp(if (isWideLayout()) 84 else 76)
  }

  private fun isWideLayout(): Boolean {
    val widthDp = resources.configuration.screenWidthDp
    val measuredWidthDp = width / resources.displayMetrics.density
    return widthDp >= 700 || measuredWidthDp >= 700f
  }

  private fun syncProgressTicker() {
    stopProgressTicker()
    if (visibility == VISIBLE && currentPlaying && !currentLoading && currentDuration > 0.0) {
      mainHandler.postDelayed(progressTicker, 700L)
    }
  }

  private fun stopProgressTicker() {
    mainHandler.removeCallbacks(progressTicker)
  }

  private fun updateQueueSummary(current: Int, total: Int) {
    if (total <= 0 || current <= 0) {
      queueButton.text = "队列"
      queueButton.contentDescription = "打开播放队列"
      return
    }
    queueButton.text = "$current/$total"
    queueButton.contentDescription = "打开播放队列，当前第 $current 首，共 $total 首"
  }

  private fun updateProgress(current: Double, duration: Double) {
    if (!userSeeking) {
      seekBar.progress =
        if (duration > 0) ((current / duration) * PROGRESS_MAX).roundToInt().coerceIn(0, PROGRESS_MAX) else 0
    }
  }

  private fun applyTheme(themeColor: Int) {
    val surface = ColorUtils.blendARGB(Color.WHITE, themeColor, 0.08f)
    val stroke = ColorUtils.setAlphaComponent(themeColor, 45)
    val accent = ColorUtils.blendARGB(themeColor, Color.WHITE, 0.12f)
    val accentText = if (isLightColor(accent)) Color.rgb(24, 24, 28) else Color.WHITE

    card.background =
      GradientDrawable().apply {
        setColor(surface)
        cornerRadius = dp(22).toFloat()
        setStroke(dp(1), stroke)
      }
    seekBar.progressTintList = ColorStateList.valueOf(accent)
    seekBar.progressBackgroundTintList = ColorStateList.valueOf(ColorUtils.setAlphaComponent(themeColor, 32))
    seekBar.thumbTintList = ColorStateList.valueOf(accent)
    coverHolder.background = roundedBackground(ColorUtils.setAlphaComponent(themeColor, 190), dp(15))
    playPauseButton.background = roundedBackground(ColorUtils.setAlphaComponent(accent, 235), dp(18))
    playPauseButton.setTextColor(accentText)
    previousButton.background = roundedBackground(ColorUtils.setAlphaComponent(themeColor, 24), dp(16))
    nextButton.background = roundedBackground(ColorUtils.setAlphaComponent(themeColor, 24), dp(16))
    queueButton.background = roundedBackground(ColorUtils.setAlphaComponent(themeColor, 24), dp(16))
  }

  private fun loadCover(coverUrl: String) {
    if (coverUrl == currentCoverUrl) return
    currentCoverUrl = coverUrl
    coverImage.setImageDrawable(null)
    if (coverUrl.isBlank() || !coverUrl.startsWith("http")) return

    val token = coverRequestToken.incrementAndGet()
    coverExecutor.execute {
      runCatching {
        val connection = URL(coverUrl).openConnection() as HttpURLConnection
        connection.connectTimeout = 4000
        connection.readTimeout = 5000
        connection.instanceFollowRedirects = true
        connection.inputStream.use { input -> BitmapFactory.decodeStream(input) }
      }.onSuccess { bitmap ->
        if (bitmap != null && token == coverRequestToken.get()) {
          mainHandler.post { coverImage.setImageBitmap(bitmap) }
        }
      }
    }
  }

  private fun buildTextButton(textValue: String, size: Float): TextView {
    return TextView(context).apply {
      text = textValue
      textSize = size
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setTextColor(Color.rgb(38, 38, 42))
      minHeight = dp(44)
      minWidth = dp(44)
      isClickable = true
      isFocusable = true
      includeFontPadding = false
      setPadding(dp(6), 0, dp(6), 0)
    }
  }

  private fun roundedBackground(color: Int, radius: Int): GradientDrawable {
    return GradientDrawable().apply {
      setColor(color)
      cornerRadius = radius.toFloat()
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

  private fun isLightColor(color: Int): Boolean {
    return ColorUtils.calculateLuminance(color) >= 0.62
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
