<template>
  <Provider v-if="!isDesktopLyric">
    <router-view />
  </Provider>
  <router-view v-else />
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue";
import { setAndroidPerformanceDiagnosticsEnabled } from "@/platform/android/performance";
import { useSettingStore } from "@/stores";
import { isAndroidApp } from "@/utils/env";

const isDesktopLyric = location.hash.includes("desktop-lyric");
const settingStore = useSettingStore();

if (isAndroidApp) {
  document.documentElement.classList.add("android-app");

  watch(
    () =>
      [settingStore.androidPerformanceMode, settingStore.androidPerformanceDiagnostics] as const,
    ([performanceMode, diagnosticsEnabled]) => {
      document.documentElement.classList.toggle("android-performance-mode", performanceMode);
      setAndroidPerformanceDiagnosticsEnabled(diagnosticsEnabled);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    setAndroidPerformanceDiagnosticsEnabled(false);
    document.documentElement.classList.remove("android-performance-mode");
  });
}
</script>
