<template>
  <div id="app-layout">
    <Transition name="fade">
      <div
        v-if="
          !shouldDisableDynamicBackground &&
          (statusStore.themeBackgroundMode === 'image' ||
            statusStore.themeBackgroundMode === 'video') &&
          statusStore.backgroundImageUrl
        "
        :key="statusStore.backgroundImageUrl"
        class="background-container"
      >
        <div
          v-if="statusStore.themeBackgroundMode === 'image'"
          class="background-image"
          :style="{
            backgroundImage: `url(${statusStore.backgroundImageUrl})`,
            transform: `scale(${statusStore.backgroundConfig.scale})`,
            filter: `blur(${statusStore.backgroundConfig.blur}px)`,
          }"
        />
        <video
          v-else-if="statusStore.themeBackgroundMode === 'video'"
          class="background-image"
          :src="statusStore.backgroundImageUrl"
          autoplay
          loop
          muted
          :style="{
            objectFit: 'cover',
            transform: `scale(${statusStore.backgroundConfig.scale})`,
            filter: `blur(${statusStore.backgroundConfig.blur}px)`,
          }"
        />
        <div
          class="background-mask"
          :style="{
            backgroundColor: `rgba(0, 0, 0, ${statusStore.backgroundConfig.maskOpacity / 100})`,
          }"
        />
      </div>
    </Transition>

    <n-layout
      id="main"
      :class="{
        'show-player': musicStore.isHasPlayer && statusStore.showPlayBar,
        'show-full-player': statusStore.showFullPlayer,
        'show-mobile-tabbar': showMobileTabBar,
        'android-playback-lite': isAndroidPlaybackLite,
        'android-reduce-motion': shouldReduceMotion,
      }"
      has-sider
    >
      <n-layout-sider
        v-if="isDesktop"
        id="main-sider"
        :style="{
          height:
            musicStore.isHasPlayer && statusStore.showPlayBar ? 'calc(100dvh - 80px)' : '100dvh',
        }"
        :content-style="{
          overflow: 'hidden',
          height: '100%',
          padding: '0',
        }"
        :native-scrollbar="false"
        :collapsed="statusStore.menuCollapsed"
        :collapsed-width="64"
        :width="240"
        collapse-mode="width"
        show-trigger="bar"
        bordered
        @collapse="statusStore.menuCollapsed = true"
        @expand="statusStore.menuCollapsed = false"
      >
        <Sider />
      </n-layout-sider>
      <n-layout id="main-layout">
        <!-- 顶部导航 -->
        <Nav id="main-header" />
        <n-layout
          ref="contentRef"
          id="main-content"
          :native-scrollbar="false"
          :style="{
            '--layout-height': contentHeight,
            '--mobile-stable-dock-height': mobileStableDockHeight,
            '--mobile-stable-dock-content-height': mobileStableDockContentHeight,
          }"
          :content-style="{
            display: 'grid',
            gridTemplateRows: '1fr',
            minHeight: '100%',
            padding: isMobile ? mobileContentPadding : '0 24px',
          }"
          position="absolute"
          embedded
        >
          <RouterView v-slot="{ Component }">
            <Transition
              :name="shouldReduceMotion ? undefined : `router-${settingStore.routeAnimation}`"
              mode="out-in"
              :css="!shouldReduceMotion"
              :duration="shouldReduceMotion ? 0 : undefined"
            >
              <KeepAlive v-if="keepAliveEnabled" :max="keepAliveMax" :exclude="['layout']">
                <component :is="Component" class="router-view" />
              </KeepAlive>
              <component v-else :is="Component" class="router-view" />
            </Transition>
          </RouterView>

          <n-back-top :right="isMobile ? 16 : 40" :bottom="backTopBottom">
            <SvgIcon :size="22" name="Up" />
          </n-back-top>
        </n-layout>
      </n-layout>
    </n-layout>

    <SongPlayList />

    <MainPlayer />
    <MobileTabBar v-if="showMobileTabBar" />

    <PlayerProvider>
      <FullPlayer />
    </PlayerProvider>
  </div>
</template>

<script setup lang="ts">
import { useMusicStore, useStatusStore, useSettingStore, useDataStore } from "@/stores";
import { useBlobURLManager } from "@/core/resource/BlobURLManager";
import { isElectron } from "@/utils/env";
import { useMobile } from "@/composables/useMobile";
import { useInit } from "@/composables/useInit";
import { useAndroidRoutePerformance } from "@/composables/useAndroidRoutePerformance";

const musicStore = useMusicStore();
const statusStore = useStatusStore();
const settingStore = useSettingStore();
const dataStore = useDataStore();

const blobURLManager = useBlobURLManager();

const { isDesktop, isMobile } = useMobile();
const {
  isAndroidPlaybackLite,
  shouldReduceMotion,
  shouldDisableDynamicBackground,
  keepAliveEnabled,
  keepAliveMax,
} = useAndroidRoutePerformance();

const showMobileTabBar = computed(() => isMobile.value);
const hasPlayBar = computed(() => musicStore.isHasPlayer && statusStore.showPlayBar);
const mobileStableDockHeight = computed(() => {
  if (!isMobile.value) return "0px";
  if (!hasPlayBar.value) {
    return "calc(var(--mobile-tabbar-outer-height) + var(--mobile-tabbar-bottom-lift) + var(--safe-area-bottom))";
  }
  return "var(--mobile-dock-height)";
});
const mobileStableDockContentHeight = computed(() => {
  if (!isMobile.value) return "0px";
  return `calc(${mobileStableDockHeight.value} + var(--android-dock-clearance, 0px))`;
});
const mobileContentPadding = computed(
  () =>
    "0 var(--android-content-padding-right, 10px) var(--android-content-bottom-extra, 12px) var(--android-content-padding-left, 10px)",
);
const backTopBottom = computed(() => {
  if (!isMobile.value) return 120;
  return hasPlayBar.value ? 176 : 104;
});

const contentRef = ref<HTMLElement | null>(null);

const { height: contentHeight } = useElementSize(contentRef);

const loadBackgroundImage = async () => {
  if (statusStore.backgroundImageUrl) return;
  if (statusStore.themeBackgroundMode === "image" || statusStore.themeBackgroundMode === "video") {
    const blob = await dataStore.getBackgroundImage();
    if (blob) {
      const arrayBuffer = await blob.arrayBuffer();
      statusStore.backgroundImageUrl = blobURLManager.createBlobURL(
        arrayBuffer,
        blob.type,
        "background-image",
      );
    }
  }
};

watchEffect(() => {
  statusStore.mainContentHeight = contentHeight.value;
});

useInit();

onMounted(() => {
  loadBackgroundImage();
  if (!isElectron) {
    window.addEventListener("beforeunload", (event) => {
      event.preventDefault();

      blobURLManager.revokeAllBlobURLs();
      event.returnValue = "";
    });
  }
});
</script>

<style lang="scss" scoped>
#app-layout {
  box-sizing: border-box;
  --safe-area-top: env(safe-area-inset-top, 0px);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-left: env(safe-area-inset-left, 0px);
  --safe-area-right: env(safe-area-inset-right, 0px);
  --player-bar-height: 80px;
  --mobile-tabbar-height: 0px;
  --mobile-tabbar-outer-height: 0px;
  --mobile-dock-gap: 16px;
  --mobile-tabbar-bottom-lift: 14px;
  --mobile-tabbar-bottom: calc(var(--safe-area-bottom) + var(--mobile-tabbar-bottom-lift));
  --mobile-player-bottom: calc(
    var(--mobile-tabbar-outer-height) + var(--mobile-dock-gap) + var(--mobile-tabbar-bottom)
  );
  --mobile-dock-height: calc(var(--player-bar-height) + var(--mobile-player-bottom));
  --mobile-dock-content-height: calc(
    var(--mobile-dock-height) + var(--android-dock-clearance, 0px)
  );
  --android-edge-padding: 0px;
  --android-content-padding-left: var(--safe-area-left);
  --android-content-padding-right: var(--safe-area-right);
  --android-content-padding: 10px;
  --android-content-bottom-extra: 10px;
  width: 100%;
  max-width: 100%;
  height: 100%;
  min-height: 100dvh;
  flex-direction: column;
  display: flex;
  position: relative;
}

.background-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100dvh;
  z-index: -1;
  pointer-events: none;
  overflow: hidden;
  .background-image {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    transform-origin: center center;
  }
  .background-mask {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }
}

#main {
  flex: 1;
  height: 100%;
  min-height: 100dvh;
  transition:
    transform 0.3s var(--n-bezier),
    opacity 0.3s var(--n-bezier);
  #main-layout {
    min-height: 100%;
    // background-color: rgba(var(--background), 0.58);
    background-color: rgba(var(--background));
  }
  #main-content {
    top: calc(70px + var(--safe-area-top));
    background-color: transparent;
    transition: bottom 0.3s;
    .router-view {
      position: relative;
      min-height: 100%;
      &.n-result {
        display: flex;
        flex-direction: column;
        justify-content: center;
      }
    }
  }
  &.show-player {
    #main-content {
      bottom: calc(var(--player-bar-height) + var(--safe-area-bottom));
    }
  }

  &.show-mobile-tabbar {
    #main-content {
      bottom: calc(var(--mobile-tabbar-outer-height) + var(--safe-area-bottom));
    }
  }

  &.show-player.show-mobile-tabbar {
    #main-content {
      bottom: calc(
        var(--player-bar-height) + var(--mobile-tabbar-outer-height) + var(--safe-area-bottom)
      );
    }
  }
  &.show-full-player {
    opacity: 0;
    transform: scale(0.9);
    #main-header {
      -webkit-app-region: no-drag;
    }
  }
}

@media (max-width: 768px) {
  #main {
    #main-content {
      bottom: var(
        --mobile-stable-dock-content-height,
        calc(var(--mobile-stable-dock-height, 0px) + var(--android-dock-clearance, 0px))
      ) !important;
      height: auto;
      min-height: 0;
      transition: none;

      :deep(.n-layout-scroll-container) {
        overscroll-behavior: contain;
        overflow-x: hidden !important;
      }
    }

    &.show-player,
    &.show-mobile-tabbar,
    &.show-player.show-mobile-tabbar {
      #main-content {
        bottom: var(
          --mobile-stable-dock-content-height,
          calc(var(--mobile-stable-dock-height, 0px) + var(--android-dock-clearance, 0px))
        ) !important;
      }
    }
  }
}

@media (max-width: 420px) {
  #app-layout {
    --player-bar-height: var(--android-player-bar-compact-height, 86px);
    --mobile-tabbar-height: var(--android-tabbar-compact-height, 62px);
    --mobile-tabbar-outer-height: calc(
      var(--mobile-tabbar-height) + var(--android-tabbar-padding, 8px)
    );
    --android-edge-padding: var(--android-edge-padding-compact, 12px);
    --android-content-padding-left: max(var(--safe-area-left), var(--android-edge-padding));
    --android-content-padding-right: max(var(--safe-area-right), var(--android-edge-padding));
    --android-content-padding: var(--android-edge-padding);
  }

  #main {
    #main-content {
      top: calc(clamp(52px, calc(60px * var(--android-ui-scale, 1)), 60px) + var(--safe-area-top));
    }
  }
}
</style>
