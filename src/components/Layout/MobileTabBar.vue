<template>
  <div
    :class="[
      'mobile-tabbar',
      { 'with-player': hasPlayer, 'android-playback-lite': isAndroidPlaybackLite },
    ]"
  >
    <n-flex :wrap="false" justify="space-between" align="center" class="mobile-tabbar-inner">
      <n-button
        v-for="tab in tabs"
        :key="tab.key"
        quaternary
        class="tab-button"
        :class="{ active: activeKey === tab.key }"
        :focusable="false"
        :title="tab.label"
        :aria-label="tab.label"
        @click="router.push({ name: tab.routeName })"
      >
        <div class="tab-content">
          <SvgIcon :name="tab.icon" :size="22" />
          <span class="tab-label">{{ tab.label }}</span>
        </div>
      </n-button>
    </n-flex>
  </div>
</template>

<script setup lang="ts">
import { useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import { useAndroidRoutePerformance } from "@/composables/useAndroidRoutePerformance";
import { isLogin } from "@/utils/auth";

interface MobileTabItem {
  key: string;
  label: string;
  icon: string;
  routeName: string;
}

const router = useRouter();
const route = useRoute();
const musicStore = useMusicStore();
const statusStore = useStatusStore();
const settingStore = useSettingStore();
const { isAndroidPlaybackLite } = useAndroidRoutePerformance();

const hasPlayer = computed(() => musicStore.isHasPlayer && statusStore.showPlayBar);

const onlineTabs = computed<MobileTabItem[]>(() => {
  const tail =
    isLogin() === 1
      ? { key: "cloud", label: "云盘", icon: "Cloud", routeName: "cloud" }
      : { key: "history", label: "最近", icon: "History", routeName: "history" };

  return [
    { key: "home", label: "推荐", icon: "Home", routeName: "home" },
    { key: "discover", label: "发现", icon: "Discover", routeName: "discover" },
    { key: "like", label: "收藏", icon: "Star", routeName: "like" },
    tail,
  ];
});

const localTabs = computed<MobileTabItem[]>(() => [
  { key: "local", label: "音乐库", icon: "FolderMusic", routeName: "local" },
  { key: "local-albums", label: "专辑", icon: "Album", routeName: "local-albums" },
  { key: "local-artists", label: "歌手", icon: "Person", routeName: "local-artists" },
  { key: "history", label: "最近", icon: "History", routeName: "history" },
]);

const tabs = computed(() => (settingStore.useOnlineService ? onlineTabs.value : localTabs.value));

const activeKey = computed(() => {
  const name = String(route.name || "home");
  if (name.startsWith("discover")) return "discover";
  if (name.startsWith("like")) return "like";
  if (name.startsWith("local-albums")) return "local-albums";
  if (name.startsWith("local-artists")) return "local-artists";
  if (name.startsWith("local")) return "local";
  if (name === "cloud") return "cloud";
  if (name === "history") return "history";
  return "home";
});
</script>

<style lang="scss" scoped>
.mobile-tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(
    --mobile-tabbar-bottom,
    calc(var(--safe-area-bottom, 0px) + var(--mobile-tabbar-bottom-lift, 8px))
  );
  z-index: 12;
  padding: 0 var(--android-content-padding-right, max(8px, calc(10px * var(--android-ui-scale, 1))))
    var(--android-tabbar-padding, 8px)
    var(--android-content-padding-left, max(8px, calc(10px * var(--android-ui-scale, 1))));
  pointer-events: none;

  &.with-player {
    bottom: var(
      --mobile-tabbar-bottom,
      calc(var(--safe-area-bottom, 0px) + var(--mobile-tabbar-bottom-lift, 8px))
    );
  }

  &.android-playback-lite {
    .mobile-tabbar-inner {
      backdrop-filter: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      contain: layout paint style;
    }

    .tab-button,
    .tab-content {
      transition: none !important;
    }
  }

  .mobile-tabbar-inner {
    box-sizing: border-box;
    width: 100%;
    height: var(--mobile-tabbar-height, 58px);
    min-height: var(--mobile-tabbar-height, 58px);
    border-radius: var(--android-radius-dock, 20px);
    padding: var(--android-tabbar-padding, 8px);
    background-color: color-mix(in srgb, var(--surface-container-hex) 92%, rgba(0, 0, 0, 0.08) 8%);
    border: 1px solid rgba(var(--primary), 0.12);
    backdrop-filter: blur(18px);
    box-shadow: var(--android-shadow-dock, 0 6px 18px rgba(0, 0, 0, 0.12));
    overflow: visible;
    pointer-events: auto;
  }

  .tab-button {
    flex: 1;
    min-width: 0;
    height: var(--android-tab-button-height, 44px);
    border-radius: var(--android-radius-control, 16px);
    color: rgba(var(--text-color), 0.68);

    &.active {
      color: var(--primary-hex);
      background-color: rgba(var(--primary), 0.12);
    }
  }

  .tab-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(3px, calc(4px * var(--android-ui-scale, 1)), 5px);
    width: 100%;
    min-width: 0;
  }

  .tab-label {
    font-size: var(--android-font-caption, 12px);
    line-height: 1;
    white-space: nowrap;
  }
}

@media (max-width: 420px) {
  .mobile-tabbar {
    padding: 0 var(--android-content-padding-right, var(--android-tabbar-padding, 8px))
      max(5px, calc(6px * var(--android-ui-scale, 1)))
      var(--android-content-padding-left, var(--android-tabbar-padding, 8px));

    .tab-label {
      font-size: var(--android-font-caption, 11px);
    }
  }
}
</style>
