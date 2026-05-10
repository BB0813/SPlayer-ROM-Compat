import { computed } from "vue";
import { useSettingStore, useStatusStore } from "@/stores";
import { isAndroidApp } from "@/utils/env";

export const useAndroidRoutePerformance = () => {
  const settingStore = useSettingStore();
  const statusStore = useStatusStore();

  const isAndroidPerformanceEnabled = computed(
    () => isAndroidApp && settingStore.androidPerformanceMode,
  );

  const isAndroidPlaybackLite = computed(
    () => isAndroidPerformanceEnabled.value && statusStore.playStatus,
  );

  const shouldReduceMotion = computed(
    () =>
      isAndroidPlaybackLite.value &&
      settingStore.androidReducePlaybackAnimations &&
      !statusStore.showFullPlayer,
  );

  const shouldFreezeRoutes = computed(() => {
    void isAndroidPlaybackLite.value;
    void statusStore.showFullPlayer;
    return false;
  });

  const shouldStabilizeDynamicContent = computed(
    () => isAndroidPlaybackLite.value && !statusStore.showFullPlayer,
  );

  const shouldPauseDecorativeAnimations = computed(
    () => isAndroidPlaybackLite.value && !statusStore.showFullPlayer,
  );

  const shouldUseLowFrequencyLyrics = computed(
    () => isAndroidPlaybackLite.value && settingStore.androidLowFrequencyLyrics,
  );

  const shouldDisableDynamicBackground = computed(
    () => isAndroidPlaybackLite.value && settingStore.androidDisablePlaybackBackground,
  );

  const keepAliveEnabled = computed(
    () => settingStore.useKeepAlive || isAndroidPerformanceEnabled.value,
  );
  const keepAliveMax = computed(() => (isAndroidPerformanceEnabled.value ? 8 : 20));

  return {
    isAndroidPerformanceEnabled,
    isAndroidPlaybackLite,
    shouldReduceMotion,
    shouldFreezeRoutes,
    shouldStabilizeDynamicContent,
    shouldPauseDecorativeAnimations,
    shouldUseLowFrequencyLyrics,
    shouldDisableDynamicBackground,
    keepAliveEnabled,
    keepAliveMax,
  };
};
