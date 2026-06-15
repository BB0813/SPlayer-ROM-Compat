/**
 * 触觉反馈工具
 *
 * 封装了 Haptic Feedback API 和 vibration fallback，
 * 提供轻、中、重三档以及播放控制专用的触觉反馈。
 */
const HAPTIC_PATTERNS = {
  /** 轻触 - 用于开关、切换 */
  light: [10],
  /** 中等 - 用于收藏、点赞 */
  medium: [20],
  /** 重 - 用于重要操作确认 */
  heavy: [40],
  /** 播放/暂停 - 短促双击 */
  playPause: [15, 30, 15],
  /** 切歌 - 轻柔滑动 */
  swipe: [8],
  /** 歌词跳转 - 极轻 */
  lyricTap: [5],
} as const;

type HapticPattern = keyof typeof HAPTIC_PATTERNS;

/**
 * 检查是否支持 Haptic Feedback
 */
function isHapticSupported(): boolean {
  // Android WebView / Capacitor
  if ("Android" in window && typeof (window as any).Android?.vibrate === "function") return true;
  // Web Vibration API
  if ("vibrate" in navigator) return true;
  return false;
}

/**
 * 触发触觉反馈
 */
function triggerHaptic(pattern: HapticPattern): void {
  if (!isHapticSupported()) return;
  const ms = HAPTIC_PATTERNS[pattern];
  try {
    if ("vibrate" in navigator) {
      navigator.vibrate(ms);
    }
  } catch {
    // 静默失败，触觉反馈不影响功能
  }
}

/**
 * 触觉反馈 composable
 *
 * @example
 * ```ts
 * const { light, medium, playPause, swipe } = useHaptic();
 * // 点击播放按钮
 * playPause();
 * // 收藏歌曲
 * medium();
 * ```
 */
export function useHaptic() {
  return {
    /** 轻触反馈 - 开关、切换 */
    light: () => triggerHaptic("light"),
    /** 中等反馈 - 收藏、点赞 */
    medium: () => triggerHaptic("medium"),
    /** 重反馈 - 重要操作 */
    heavy: () => triggerHaptic("heavy"),
    /** 播放/暂停反馈 */
    playPause: () => triggerHaptic("playPause"),
    /** 滑动反馈 */
    swipe: () => triggerHaptic("swipe"),
    /** 歌词点击反馈 */
    lyricTap: () => triggerHaptic("lyricTap"),
  };
}
