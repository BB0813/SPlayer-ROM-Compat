<template>
  <div id="app-layout">
    <!-- 闂佺厧鍟块張顒€鈻嶅▎鎾崇倞?-->
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
    <!-- 婵炴垶鎸剧划顖炪€佺€ｎ喖鍑?-->
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
      <!-- 婵炴挻鐨滈崱娆戝骄闂?-->
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
        <!-- 闁诲簼绲绘竟鍫ュ春閸涙潙鍐€?-->
        <Nav id="main-header" />
        <n-layout
          ref="contentRef"
          id="main-content"
          :native-scrollbar="false"
          :style="{
            '--layout-height': contentHeight,
          }"
          :content-style="{
            display: 'grid',
            gridTemplateRows: '1fr',
            minHeight: '100%',
            padding: isMobile ? '0 10px' : '0 24px',
          }"
          position="absolute"
          embedded
        >
          <!-- 闁荤姳璀﹂崹鎶藉极鏉堛劊浜滈柣銏犳啞濡?-->
          <RouterView v-slot="{ Component }">
            <Transition
              :name="shouldReduceMotion ? undefined : `router-${settingStore.routeAnimation}`"
              mode="out-in"
              :css="!shouldReduceMotion"
              :duration="shouldReduceMotion ? 0 : undefined"
            >
              <KeepAlive v-if="keepAliveEnabled" :max="20" :exclude="['layout']">
                <component :is="Component" class="router-view" />
              </KeepAlive>
              <component v-else :is="Component" class="router-view" />
            </Transition>
          </RouterView>
          <!-- 闂佹悶鍎抽崑銈夊Υ?-->
          <n-back-top :right="isMobile ? 16 : 40" :bottom="backTopBottom">
            <SvgIcon :size="22" name="Up" />
          </n-back-top>
        </n-layout>
      </n-layout>
    </n-layout>
    <!-- 闂佸湱铏庨崢浠嬪棘娓氣偓瀹曟艾螖閸曗斁鍋?-->
    <SongPlayList />
    <!-- 闂佺绻堥崝宀勬儑椤掑嫬绠绘い鎾跺枑閺夊綊鏌?-->
    <MainPlayer />
    <MobileTabBar v-if="showMobileTabBar" />
    <!-- 闂佺绻堥崝宀勬儓閸℃稑绠绘い鎾跺枑閺夊綊鏌?-->
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
} = useAndroidRoutePerformance();

const showMobileTabBar = computed(() => isMobile.value);
const backTopBottom = computed(() => {
  if (!isMobile.value) return 120;
  if (musicStore.isHasPlayer && statusStore.showPlayBar) return 148;
  return 84;
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
      // 闂備焦褰冮敃銉╁棘娓氣偓楠炲秹鍩€椤掑嫬瀚?blob URL
      blobURLManager.revokeAllBlobURLs();
      event.returnValue = "";
    });
  }
});
</script>

<style lang="scss" scoped>
#app-layout {
  --safe-area-top: env(safe-area-inset-top, 0px);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --player-bar-height: 80px;
  --mobile-tabbar-height: 0px;
  width: 100%;
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
  width: 100vw;
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
      height: 100%;
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
      bottom: calc(var(--mobile-tabbar-height) + var(--safe-area-bottom));
    }
  }

  &.show-player.show-mobile-tabbar {
    #main-content {
      bottom: calc(
        var(--player-bar-height) + var(--mobile-tabbar-height) + var(--safe-area-bottom)
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
  #app-layout {
    --player-bar-height: 76px;
    --mobile-tabbar-height: 58px;
  }

  #main {
    #main-content {
      top: calc(64px + var(--safe-area-top));
    }
  }
}

@media (max-width: 420px) {
  #app-layout {
    --player-bar-height: 72px;
    --mobile-tabbar-height: 54px;
  }

  #main {
    #main-content {
      top: calc(60px + var(--safe-area-top));
    }
  }
}
</style>
