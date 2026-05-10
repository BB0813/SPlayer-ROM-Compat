<template>
  <Provider v-if="!isDesktopLyric">
    <router-view />
  </Provider>
  <router-view v-else />
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  initializeAndroidPerformanceDiagnostics,
  recordAndroidLayoutProbe,
  setAndroidPerformanceDiagnosticsEnabled,
} from "@/platform/android/performance";
import { cleanupAndroidScrollLock, setupAndroidScrollLock } from "@/platform/android/scrollLock";
import { getAndroidDisplayMetrics, syncAndroidSystemBars } from "@/platform/bridge/android";
import {
  setAndroidNativePlayerPageVisible,
  syncAndroidNativePlayerPageFromStores,
  syncAndroidNativePlayerPageLyricFromStores,
} from "@/platform/android/nativePlayerPage";
import {
  setAndroidNativeMiniPlayerBarVisible,
  syncAndroidNativeMiniPlayerBarFromStores,
} from "@/platform/android/nativeMiniPlayerBar";
import { useDataStore, useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import { isAndroidApp } from "@/utils/env";

const isDesktopLyric = location.hash.includes("desktop-lyric");
const dataStore = useDataStore();
const musicStore = useMusicStore();
const settingStore = useSettingStore();
const statusStore = useStatusStore();
const route = useRoute();
let lastAndroidNativePlayerLyricSyncAt = 0;
let androidLayoutProbeTimer: number | null = null;

const parseRgbValue = (value: string): [number, number, number] | null => {
  const parts = value
    .match(/\d+(?:\.\d+)?/g)
    ?.slice(0, 3)
    .map(Number);
  if (!parts || parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
  return [parts[0], parts[1], parts[2]];
};

const toHexPair = (value: number) => {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");
};

const rgbToHex = ([r, g, b]: [number, number, number]) => {
  return `#${toHexPair(r)}${toHexPair(g)}${toHexPair(b)}`;
};

const isLightRgb = ([r, g, b]: [number, number, number]) => {
  return (r * 299 + g * 587 + b * 114) / 1000 >= 160;
};

const getCssRgbVar = (name: string, fallback: [number, number, number]) => {
  const styles = getComputedStyle(document.body);
  return parseRgbValue(styles.getPropertyValue(name)) ?? fallback;
};

const syncSystemBarsFromTheme = () => {
  const fallback: [number, number, number] = statusStore.showFullPlayer
    ? [16, 16, 20]
    : [246, 246, 246];
  const rgb = statusStore.showFullPlayer
    ? getCssRgbVar("--main-cover-color", fallback)
    : getCssRgbVar("--background", fallback);
  const color = rgbToHex(rgb);
  const lightBars = isLightRgb(rgb);

  syncAndroidSystemBars({
    statusBarColor: color,
    navigationBarColor: color,
    lightStatusBar: lightBars,
    lightNavigationBar: lightBars,
  });
};

interface AndroidViewportMetrics {
  viewportWidth: number;
  viewportHeight: number;
  screenWidth: number;
  screenHeight: number;
  physicalWidth: number;
  physicalHeight: number;
  density: number;
  densityDpi: number;
  fontScale: number;
  smallestWidthDp: number;
  shortEdge: number;
  longEdge: number;
}

const readAndroidViewportMetrics = (): AndroidViewportMetrics => {
  const visualViewport = window.visualViewport;
  const viewportWidth = Math.round(
    visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 0,
  );
  const viewportHeight = Math.round(
    visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0,
  );
  const displayMetrics = getAndroidDisplayMetrics();
  const density = displayMetrics?.density || window.devicePixelRatio || 1;
  const densityDpi = displayMetrics?.densityDpi || Math.round(density * 160);
  const fontScale = displayMetrics?.fontScale || 1;
  const screenWidth = Math.round(window.screen?.width || viewportWidth);
  const screenHeight = Math.round(window.screen?.height || viewportHeight);
  const physicalWidth = displayMetrics?.widthPixels || Math.round(screenWidth * density);
  const physicalHeight = displayMetrics?.heightPixels || Math.round(screenHeight * density);
  const shortEdge = Math.min(viewportWidth || screenWidth, viewportHeight || screenHeight);
  const longEdge = Math.max(viewportWidth || screenWidth, viewportHeight || screenHeight);
  const physicalShortEdge = Math.min(physicalWidth, physicalHeight);
  const smallestWidthDp = Math.round(physicalShortEdge / Math.max(density, 1));

  return {
    viewportWidth,
    viewportHeight,
    screenWidth,
    screenHeight,
    physicalWidth,
    physicalHeight,
    density,
    densityDpi,
    fontScale,
    smallestWidthDp,
    shortEdge,
    longEdge,
  };
};

const androidViewportMetrics = ref<AndroidViewportMetrics>(readAndroidViewportMetrics());

const resolveAndroidAutoUiScale = (metrics: AndroidViewportMetrics): number => {
  const shortEdge = metrics.shortEdge || Math.min(metrics.screenWidth, metrics.screenHeight);
  const longEdge = metrics.longEdge || Math.max(metrics.screenWidth, metrics.screenHeight);
  const smallestWidthDp = metrics.smallestWidthDp || shortEdge;
  const highDensityPhone = metrics.densityDpi >= 420 || metrics.density >= 2.625;

  if (smallestWidthDp >= 840) return 112;
  if (smallestWidthDp >= 700) return 110;
  if (smallestWidthDp >= 600) return 106;
  if (shortEdge <= 360) return highDensityPhone ? 96 : 94;
  if (shortEdge <= 390) return highDensityPhone ? 98 : 96;
  if (shortEdge <= 430) return highDensityPhone ? 100 : 98;
  if (shortEdge <= 480) return 102;
  if (shortEdge <= 600) return 104;
  if (longEdge >= 1100) return 106;
  return 102;
};

const applyAndroidViewportMetrics = (metrics: AndroidViewportMetrics) => {
  const root = document.documentElement;
  root.style.setProperty("--android-viewport-width", `${metrics.viewportWidth}px`);
  root.style.setProperty("--android-viewport-height", `${metrics.viewportHeight}px`);
  root.style.setProperty("--android-screen-width", `${metrics.screenWidth}px`);
  root.style.setProperty("--android-screen-height", `${metrics.screenHeight}px`);
  root.style.setProperty("--android-physical-width", `${metrics.physicalWidth}px`);
  root.style.setProperty("--android-physical-height", `${metrics.physicalHeight}px`);
  root.style.setProperty("--android-density", metrics.density.toFixed(2));
  root.style.setProperty("--android-density-dpi", `${metrics.densityDpi}`);
  root.style.setProperty("--android-font-scale", metrics.fontScale.toFixed(2));
  root.style.setProperty("--android-smallest-width-dp", `${metrics.smallestWidthDp}`);
  const isTabletLayout = metrics.shortEdge >= 600 || metrics.smallestWidthDp >= 600;
  const isLandscape = metrics.viewportWidth > metrics.viewportHeight;
  const isHighDensity = metrics.densityDpi >= 420 || metrics.density >= 2.625;

  root.classList.toggle("android-small-width", metrics.shortEdge > 0 && metrics.shortEdge <= 380);
  root.classList.toggle(
    "android-narrow-width",
    metrics.viewportWidth > 0 && metrics.viewportWidth <= 430,
  );
  root.classList.toggle(
    "android-tiny-width",
    metrics.viewportWidth > 0 && metrics.viewportWidth <= 360,
  );
  root.classList.toggle(
    "android-low-resolution",
    metrics.viewportWidth > 0 &&
      metrics.viewportWidth <= 390 &&
      metrics.viewportHeight > 0 &&
      metrics.viewportHeight <= 760,
  );
  root.classList.toggle("android-compact-height", metrics.longEdge > 0 && metrics.longEdge <= 760);
  root.classList.toggle("android-phone-compact", metrics.shortEdge > 0 && metrics.shortEdge <= 390);
  root.classList.toggle(
    "android-phone-normal",
    metrics.shortEdge > 390 && metrics.shortEdge <= 480,
  );
  root.classList.toggle("android-tablet-layout", isTabletLayout);
  root.classList.toggle("android-tablet-landscape", isTabletLayout && isLandscape);
  root.classList.toggle("android-tablet-portrait", isTabletLayout && !isLandscape);
  root.classList.toggle("android-wide-layout", metrics.viewportWidth >= 900);
  root.classList.toggle("android-high-density", isHighDensity);
  root.classList.toggle("android-hidpi-tablet", isTabletLayout && isHighDensity);
  root.classList.toggle("android-large-font", metrics.fontScale >= 1.15);
  root.classList.toggle("android-landscape", isLandscape);
};

const syncAndroidViewportMetrics = () => {
  const metrics = readAndroidViewportMetrics();
  androidViewportMetrics.value = metrics;
  applyAndroidViewportMetrics(metrics);
};

const cleanupAndroidViewportMetrics = () => {
  const root = document.documentElement;
  root.classList.remove(
    "android-small-width",
    "android-narrow-width",
    "android-tiny-width",
    "android-low-resolution",
    "android-compact-height",
    "android-phone-compact",
    "android-phone-normal",
    "android-tablet-layout",
    "android-tablet-landscape",
    "android-tablet-portrait",
    "android-wide-layout",
    "android-high-density",
    "android-hidpi-tablet",
    "android-large-font",
    "android-landscape",
  );
  root.style.removeProperty("--android-viewport-width");
  root.style.removeProperty("--android-viewport-height");
  root.style.removeProperty("--android-screen-width");
  root.style.removeProperty("--android-screen-height");
  root.style.removeProperty("--android-physical-width");
  root.style.removeProperty("--android-physical-height");
  root.style.removeProperty("--android-density");
  root.style.removeProperty("--android-density-dpi");
  root.style.removeProperty("--android-font-scale");
  root.style.removeProperty("--android-smallest-width-dp");
};
const scheduleSystemBarsSync = () => {
  void nextTick(() => {
    window.requestAnimationFrame(syncSystemBarsFromTheme);
  });
};

const scheduleAndroidLayoutProbe = (reason: string, delay = 280) => {
  if (!isAndroidApp) return;
  if (androidLayoutProbeTimer !== null) {
    window.clearTimeout(androidLayoutProbeTimer);
  }
  androidLayoutProbeTimer = window.setTimeout(() => {
    androidLayoutProbeTimer = null;
    void nextTick(() => {
      window.requestAnimationFrame(() => recordAndroidLayoutProbe(reason));
    });
  }, delay);
};

if (isAndroidApp) {
  document.documentElement.classList.add("android-app");
  initializeAndroidPerformanceDiagnostics();
  const handleAndroidViewportChange = () => syncAndroidViewportMetrics();

  onMounted(() => {
    syncAndroidViewportMetrics();
    setupAndroidScrollLock();
    window.addEventListener("resize", handleAndroidViewportChange);
    window.addEventListener("orientationchange", handleAndroidViewportChange);
    window.visualViewport?.addEventListener("resize", handleAndroidViewportChange);
    scheduleAndroidLayoutProbe("mounted", 500);
  });

  watch(
    () =>
      [
        route.fullPath,
        statusStore.playStatus,
        statusStore.showPlayBar,
        statusStore.showFullPlayer,
        musicStore.playSong?.id,
      ] as const,
    ([fullPath, playStatus, showPlayBar, showFullPlayer, songId]) => {
      scheduleAndroidLayoutProbe(
        `route=${fullPath};play=${Number(playStatus)};bar=${Number(showPlayBar)};full=${Number(showFullPlayer)};song=${songId ?? "none"}`,
      );
    },
    { immediate: true },
  );

  watch(
    () =>
      [
        settingStore.androidPerformanceMode,
        settingStore.androidPerformanceDiagnostics,
        settingStore.androidReducePlaybackAnimations,
        settingStore.androidFreezePlaybackRoutes,
        settingStore.androidLowFrequencyLyrics,
        settingStore.androidDisablePlaybackBackground,
        settingStore.androidNativePlayerPageEnabled,
        settingStore.androidNativeMiniPlayerBarEnabled,
        settingStore.androidUiScale,
        settingStore.androidAutoUiScale,
        settingStore.androidCompactUi,
        androidViewportMetrics.value.viewportWidth,
        androidViewportMetrics.value.viewportHeight,
        androidViewportMetrics.value.physicalWidth,
        androidViewportMetrics.value.physicalHeight,
        statusStore.playStatus,
        statusStore.showPlayBar,
        statusStore.showFullPlayer,
        musicStore.isHasPlayer,
      ] as const,
    ([
      performanceMode,
      diagnosticsEnabled,
      reducePlaybackAnimations,
      freezePlaybackRoutes,
      lowFrequencyLyrics,
      disablePlaybackBackground,
      nativePlayerPageEnabled,
      nativeMiniPlayerBarEnabled,
      androidUiScale,
      androidAutoUiScale,
      androidCompactUi,
      viewportWidth,
      viewportHeight,
      physicalWidth,
      physicalHeight,
      playStatus,
      showPlayBar,
      showFullPlayer,
      hasPlayer,
    ]) => {
      const playbackPerformanceActive = performanceMode && playStatus;
      const allowRoutePerformanceReduction = playbackPerformanceActive && !showFullPlayer;
      const uiScaleValue = Number(androidUiScale);
      const manualUiScale = Number.isFinite(uiScaleValue)
        ? Math.min(110, Math.max(60, uiScaleValue))
        : 80;
      const autoUiScale = resolveAndroidAutoUiScale(androidViewportMetrics.value);
      const effectiveUiScale = androidAutoUiScale ? autoUiScale : manualUiScale;
      const uiScale = effectiveUiScale / 100;
      document.documentElement.style.setProperty("--android-ui-scale", uiScale.toFixed(2));
      document.documentElement.style.setProperty(
        "--android-effective-ui-scale",
        `${effectiveUiScale}`,
      );
      document.documentElement.classList.toggle("android-auto-ui-scale", androidAutoUiScale);
      document.documentElement.classList.toggle("android-manual-ui-scale", !androidAutoUiScale);
      document.documentElement.classList.toggle(
        "android-compact-ui",
        androidCompactUi && androidViewportMetrics.value.smallestWidthDp < 600,
      );
      document.documentElement.dataset.androidViewport = `${viewportWidth}x${viewportHeight}`;
      document.documentElement.dataset.androidPhysical = `${physicalWidth}x${physicalHeight}`;
      document.documentElement.classList.toggle("android-performance-mode", performanceMode);
      document.documentElement.classList.toggle(
        "android-playback-active",
        playbackPerformanceActive,
      );
      document.documentElement.classList.toggle(
        "android-reduce-motion",
        allowRoutePerformanceReduction && reducePlaybackAnimations,
      );
      if (freezePlaybackRoutes) {
        settingStore.androidFreezePlaybackRoutes = false;
      }
      document.documentElement.classList.toggle("android-freeze-routes", false);
      document.documentElement.classList.toggle(
        "android-low-frequency-lyrics",
        playbackPerformanceActive && lowFrequencyLyrics,
      );
      document.documentElement.classList.toggle(
        "android-static-background",
        allowRoutePerformanceReduction && disablePlaybackBackground,
      );
      document.documentElement.classList.toggle(
        "android-native-player-page",
        nativePlayerPageEnabled,
      );
      document.documentElement.classList.toggle(
        "android-native-player-bar",
        nativeMiniPlayerBarEnabled &&
          performanceMode &&
          hasPlayer &&
          showPlayBar &&
          !showFullPlayer,
      );
      setAndroidPerformanceDiagnosticsEnabled(diagnosticsEnabled);
    },
    { immediate: true },
  );

  watch(
    () => [settingStore.themeMode, statusStore.showFullPlayer, statusStore.songCoverTheme] as const,
    scheduleSystemBarsSync,
    { deep: true, immediate: true },
  );

  watch(
    () => [statusStore.showFullPlayer, settingStore.androidNativePlayerPageEnabled] as const,
    ([visible, nativePlayerPageEnabled]) => {
      setAndroidNativePlayerPageVisible(visible && nativePlayerPageEnabled);
    },
    { immediate: true },
  );

  watch(
    () =>
      [
        musicStore.isHasPlayer,
        statusStore.showPlayBar,
        statusStore.showFullPlayer,
        settingStore.androidPerformanceMode,
        settingStore.androidNativeMiniPlayerBarEnabled,
      ] as const,
    ([hasPlayer, showPlayBar, showFullPlayer, performanceMode, nativeMiniPlayerBarEnabled]) => {
      setAndroidNativeMiniPlayerBarVisible(
        hasPlayer &&
          showPlayBar &&
          !showFullPlayer &&
          performanceMode &&
          nativeMiniPlayerBarEnabled,
      );
    },
    { immediate: true },
  );

  watch(
    () =>
      ({
        songId: musicStore.playSong?.id,
        cover: musicStore.playSong?.cover,
        showFullPlayer: statusStore.showFullPlayer,
        playStatus: statusStore.playStatus,
        playLoading: statusStore.playLoading,
        lyricIndex: statusStore.lyricIndex,
        currentTime: statusStore.currentTime,
        duration: statusStore.duration,
        nativeEnabled: settingStore.androidNativePlayerPageEnabled,
      }) as const,
    (current, previous) => {
      if (!current.nativeEnabled || !current.showFullPlayer) return;
      if (!previous) {
        syncAndroidNativePlayerPageFromStores();
        return;
      }

      const sameStableState =
        current.songId === previous.songId &&
        current.cover === previous.cover &&
        current.showFullPlayer === previous.showFullPlayer &&
        current.playStatus === previous.playStatus &&
        current.playLoading === previous.playLoading &&
        current.nativeEnabled === previous.nativeEnabled;
      const lyricOnly =
        sameStableState &&
        current.lyricIndex !== previous.lyricIndex &&
        current.currentTime === previous.currentTime &&
        current.duration === previous.duration;
      const progressOnly =
        sameStableState &&
        current.lyricIndex === previous.lyricIndex &&
        (current.currentTime !== previous.currentTime || current.duration !== previous.duration);

      if (lyricOnly) {
        if (settingStore.androidPerformanceMode) {
          const now = Date.now();
          if (now - lastAndroidNativePlayerLyricSyncAt < 900) return;
          lastAndroidNativePlayerLyricSyncAt = now;
        }
        syncAndroidNativePlayerPageLyricFromStores();
        return;
      }
      if (progressOnly && settingStore.androidPerformanceMode) return;

      syncAndroidNativePlayerPageFromStores();
    },
    { immediate: true },
  );

  watch(
    () =>
      ({
        hasPlayer: musicStore.isHasPlayer,
        songId: musicStore.playSong?.id,
        cover: musicStore.playSong?.cover,
        showPlayBar: statusStore.showPlayBar,
        showFullPlayer: statusStore.showFullPlayer,
        playStatus: statusStore.playStatus,
        playLoading: statusStore.playLoading,
        playIndex: statusStore.playIndex,
        playListLength: dataStore.playList.length,
        currentTime: statusStore.currentTime,
        duration: statusStore.duration,
        nativeMiniEnabled: settingStore.androidNativeMiniPlayerBarEnabled,
        performanceMode: settingStore.androidPerformanceMode,
      }) as const,
    (current, previous) => {
      if (!current.nativeMiniEnabled || !current.performanceMode || !current.hasPlayer) {
        setAndroidNativeMiniPlayerBarVisible(false);
        return;
      }
      if (!previous) {
        syncAndroidNativeMiniPlayerBarFromStores();
        return;
      }

      const sameStableState =
        current.hasPlayer === previous.hasPlayer &&
        current.songId === previous.songId &&
        current.cover === previous.cover &&
        current.showPlayBar === previous.showPlayBar &&
        current.showFullPlayer === previous.showFullPlayer &&
        current.playStatus === previous.playStatus &&
        current.playLoading === previous.playLoading &&
        current.playIndex === previous.playIndex &&
        current.playListLength === previous.playListLength &&
        current.nativeMiniEnabled === previous.nativeMiniEnabled &&
        current.performanceMode === previous.performanceMode;
      const progressOnly =
        sameStableState &&
        (current.currentTime !== previous.currentTime || current.duration !== previous.duration);

      if (progressOnly) return;

      syncAndroidNativeMiniPlayerBarFromStores();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    setAndroidPerformanceDiagnosticsEnabled(false);
    document.documentElement.classList.remove("android-performance-mode");
    document.documentElement.classList.remove("android-playback-active");
    document.documentElement.classList.remove("android-reduce-motion");
    document.documentElement.classList.remove("android-freeze-routes");
    document.documentElement.classList.remove("android-low-frequency-lyrics");
    document.documentElement.classList.remove("android-static-background");
    document.documentElement.classList.remove("android-native-player-page");
    document.documentElement.classList.remove("android-native-player-bar");
    setAndroidNativeMiniPlayerBarVisible(false);
    document.documentElement.classList.remove("android-compact-ui");
    document.documentElement.classList.remove("android-auto-ui-scale");
    document.documentElement.classList.remove("android-manual-ui-scale");
    window.removeEventListener("resize", handleAndroidViewportChange);
    window.removeEventListener("orientationchange", handleAndroidViewportChange);
    window.visualViewport?.removeEventListener("resize", handleAndroidViewportChange);
    if (androidLayoutProbeTimer !== null) {
      window.clearTimeout(androidLayoutProbeTimer);
      androidLayoutProbeTimer = null;
    }
    cleanupAndroidScrollLock();
    cleanupAndroidViewportMetrics();
    document.documentElement.style.removeProperty("--android-ui-scale");
    document.documentElement.style.removeProperty("--android-effective-ui-scale");
  });
}
</script>
