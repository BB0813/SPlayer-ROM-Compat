import { computed } from "vue";
import { useSettingStore, useStatusStore } from "@/stores";
import { isAndroidApp } from "@/utils/env";

export const useAndroidRoutePerformance = () => {
  const settingStore = useSettingStore();
  const statusStore = useStatusStore();

  const isAndroidPlaybackLite = computed(
    () => isAndroidApp && settingStore.androidPerformanceMode && statusStore.playStatus,
  );

  const keepAliveEnabled = computed(
    () => settingStore.useKeepAlive && !isAndroidPlaybackLite.value,
  );

  return {
    isAndroidPlaybackLite,
    keepAliveEnabled,
  };
};
