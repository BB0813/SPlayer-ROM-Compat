<template>
  <Provider v-if="!isDesktopLyric">
    <router-view />
  </Provider>
  <router-view v-else />
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, watch } from "vue";
import {
  initializeAndroidPerformanceDiagnostics,
  setAndroidPerformanceDiagnosticsEnabled,
} from "@/platform/android/performance";
import { syncAndroidSystemBars } from "@/platform/bridge/android";
import {
  setAndroidNativePlayerPageVisible,
  syncAndroidNativePlayerPageFromStores,
} from "@/platform/android/nativePlayerPage";
import { useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import { isAndroidApp } from "@/utils/env";

const isDesktopLyric = location.hash.includes("desktop-lyric");
const musicStore = useMusicStore();
const settingStore = useSettingStore();
const statusStore = useStatusStore();

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

const scheduleSystemBarsSync = () => {
  void nextTick(() => {
    window.requestAnimationFrame(syncSystemBarsFromTheme);
  });
};

if (isAndroidApp) {
  document.documentElement.classList.add("android-app");
  initializeAndroidPerformanceDiagnostics();

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
        statusStore.playStatus,
        statusStore.showFullPlayer,
      ] as const,
    ([
      performanceMode,
      diagnosticsEnabled,
      reducePlaybackAnimations,
      freezePlaybackRoutes,
      lowFrequencyLyrics,
      disablePlaybackBackground,
      nativePlayerPageEnabled,
      playStatus,
      showFullPlayer,
    ]) => {
      const playbackPerformanceActive = performanceMode && playStatus;
      const allowRoutePerformanceReduction = playbackPerformanceActive && !showFullPlayer;
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
        musicStore.playSong?.id,
        musicStore.playSong?.cover,
        statusStore.showFullPlayer,
        statusStore.playStatus,
        statusStore.playLoading,
        statusStore.lyricIndex,
        settingStore.androidNativePlayerPageEnabled,
      ] as const,
    () => {
      syncAndroidNativePlayerPageFromStores();
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
  });
}
</script>
