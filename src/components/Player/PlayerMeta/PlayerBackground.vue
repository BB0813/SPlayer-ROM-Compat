<template>
  <div :class="['background', effectiveBackgroundType, { 'mobile-lite': isAndroidApp }]">
    <Transition name="fade" mode="out-in">
      <!-- 背景色 -->
      <div v-if="effectiveBackgroundType === 'color'" :key="musicStore.songCover" class="color" />
      <!-- 背景模糊 -->
      <s-image
        v-else-if="effectiveBackgroundType === 'blur'"
        :src="musicStore.songCover"
        :observe-visibility="false"
        class="bg-img"
        alt="cover"
      />
      <!-- 流体效果 -->
      <BackgroundRender
        v-else-if="effectiveBackgroundType === 'animation'"
        :album="musicStore.songCover"
        :fps="effectiveBackgroundFps"
        :flowSpeed="flowSpeed"
        :hasLyric="musicStore.isHasLrc"
        :lowFreqVolume="lowFreqVolume"
        :renderScale="effectiveRenderScale"
      />
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import { usePlayerController } from "@/core/player/PlayerController";
import { isAndroidApp } from "@/utils/env";

const musicStore = useMusicStore();
const settingStore = useSettingStore();
const statusStore = useStatusStore();
const player = usePlayerController();

const effectiveBackgroundType = computed(() => {
  if (isAndroidApp && settingStore.playerBackgroundType !== "none") return "color";
  return settingStore.playerBackgroundType;
});
const effectiveBackgroundFps = computed(() => {
  const fps = settingStore.playerBackgroundFps ?? 30;
  return isAndroidApp ? Math.min(fps, 12) : fps;
});
const effectiveRenderScale = computed(() => {
  const renderScale = settingStore.playerBackgroundRenderScale ?? 0.5;
  return isAndroidApp ? Math.min(renderScale, 0.25) : renderScale;
});

// 低频音量
const lowFreqVolume = ref(1.0);

const flowSpeed = computed(() => {
  if (!statusStore.playStatus && settingStore.playerBackgroundPause) return 0;
  else return settingStore.playerBackgroundFlowSpeed ?? 4;
});

// 更新低频音量
const { pause: pauseRaf, resume: resumeRaf } = useRafFn(
  () => {
    if (
      settingStore.playerBackgroundLowFreqVolume &&
      effectiveBackgroundType.value === "animation" &&
      statusStore.playStatus
    ) {
      lowFreqVolume.value = player.getLowFrequencyVolume();
    }
  },
  { immediate: false },
);

// 启动或暂停 RAF
watch(
  () => [
    settingStore.playerBackgroundLowFreqVolume,
    effectiveBackgroundType.value,
    statusStore.playStatus,
  ],
  ([enabled, bgType, playing]) => {
    if (enabled && bgType === "animation") {
      playing ? resumeRaf() : pauseRaf();
    } else {
      pauseRaf();
      lowFreqVolume.value = 1.0;
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  pauseRaf();
});
</script>

<style lang="scss" scoped>
.background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: -1;
  &::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(20px);
  }
  &.mobile-lite {
    &::after {
      background-color: rgba(0, 0, 0, 0.35);
      backdrop-filter: none;
    }
  }
  &.blur {
    display: flex;
    align-items: center;
    justify-content: center;
    .bg-img {
      width: 100%;
      height: auto;
      transform: scale(1.5);
      filter: blur(80px) contrast(1.2);
    }
  }
  &.color {
    background-color: rgb(var(--main-cover-color));
    .color {
      width: 100%;
      height: 100%;
      background-color: rgb(var(--main-cover-color));
    }
  }
  &.animation {
    &::after {
      display: none;
    }
  }
}
</style>
