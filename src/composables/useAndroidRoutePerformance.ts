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
    () => isAndroidPlaybackLite.value && settingStore.androidReducePlaybackAnimations,
  );

  const shouldFreezeRoutes = computed(
    () => isAndroidPlaybackLite.value && settingStore.androidFreezePlaybackRoutes,
  );

  const shouldStabilizeDynamicContent = computed(() => shouldFreezeRoutes.value);

  const shouldUseLowFrequencyLyrics = computed(
    () => isAndroidPlaybackLite.value && settingStore.androidLowFrequencyLyrics,
  );

  const shouldDisableDynamicBackground = computed(
    () => isAndroidPlaybackLite.value && settingStore.androidDisablePlaybackBackground,
  );

  const keepAliveEnabled = computed(() => settingStore.useKeepAlive);

  return {
    isAndroidPerformanceEnabled,
    isAndroidPlaybackLite,
    shouldReduceMotion,
    shouldFreezeRoutes,
    shouldStabilizeDynamicContent,
    shouldUseLowFrequencyLyrics,
    shouldDisableDynamicBackground,
    keepAliveEnabled,
  };
};
