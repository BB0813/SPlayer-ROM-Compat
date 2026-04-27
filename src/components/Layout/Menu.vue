<template>
  <n-menu
    ref="menuRef"
    v-model:value="menuActiveKey"
    v-model:expanded-keys="settingStore.menuExpandedKeys"
    :class="{ cover: settingStore.menuShowCover }"
    :indent="0"
    :root-indent="26"
    :collapsed="statusStore.menuCollapsed && isDesktop"
    :collapsed-width="64"
    :collapsed-icon-size="22"
    :options="menuOptions"
    @update:value="menuUpdate"
  />
</template>

<script setup lang="ts">
import { useMobile } from "@/composables/useMobile";
import { useDataStore, useLocalStore, useSettingStore, useStatusStore } from "@/stores";
import { isLogin } from "@/utils/auth";
import { isAndroidApp, isElectron } from "@/utils/env";
import { renderIcon } from "@/utils/helper";
import type { MenuGroupOption, MenuInst, MenuOption } from "naive-ui";
import { useRouter } from "vue-router";

const emit = defineEmits<{ (e: "menu-click", key: string): void }>();

const router = useRouter();
const dataStore = useDataStore();
const localStore = useLocalStore();
const statusStore = useStatusStore();
const settingStore = useSettingStore();
const { isDesktop } = useMobile();

const menuRef = ref<MenuInst | null>(null);
const menuActiveKey = ref<string | number>((router.currentRoute.value.name as string) || "home");
const isDesktopApp = isElectron || isAndroidApp;

const toMenuOptions = (options: Array<MenuOption & { show?: boolean }>): MenuOption[] => {
  return options.filter((item) => item.show !== false).map(({ show, ...rest }) => rest);
};

const playlistOptions = computed<MenuOption[]>(() => {
  return (dataStore.userLikeData.playlists || []).map((playlist) => ({
    key: `playlist-${playlist.id}`,
    label: playlist.name,
    icon: renderIcon("MusicList"),
  }));
});

const localPlaylistOptions = computed<MenuOption[]>(() => {
  return (localStore.localPlaylists || []).map((playlist) => ({
    key: `local-playlist-${playlist.id}`,
    label: playlist.name,
    icon: renderIcon("PlaylistAdd"),
  }));
});

const onlineMenuOptions = computed<MenuOption[]>(() => {
  return toMenuOptions([
    { key: "home", label: "为我推荐", icon: renderIcon("Home") },
    {
      key: "discover",
      label: "发现音乐",
      show: !settingStore.sidebarHide.hideDiscover,
      icon: renderIcon("Discover"),
    },
    {
      key: "radio-hot",
      label: "播客电台",
      show: !settingStore.sidebarHide.hideRadioHot,
      icon: renderIcon("Record"),
    },
    { key: "divider-1", type: "divider" },
    {
      key: "like",
      label: "我的收藏",
      show: !settingStore.sidebarHide.hideLike,
      icon: renderIcon("Star"),
    },
    {
      key: "cloud",
      label: "我的云盘",
      show: isLogin() === 1 && !settingStore.sidebarHide.hideCloud,
      icon: renderIcon("Cloud"),
    },
    {
      key: "streaming",
      label: "流媒体",
      show: settingStore.streamingEnabled,
      icon: renderIcon("Stream"),
    },
    {
      key: "local",
      label: "本地歌曲",
      show: isDesktopApp && !settingStore.sidebarHide.hideLocal,
      icon: renderIcon("FolderMusic"),
    },
    {
      key: "history",
      label: "最近播放",
      show: !settingStore.sidebarHide.hideHistory,
      icon: renderIcon("History"),
    },
    {
      key: "user-playlists",
      label: "创建的歌单",
      show: playlistOptions.value.length > 0 && !settingStore.sidebarHide.hideUserPlaylists,
      icon: renderIcon("PlaylistAdd"),
      children: playlistOptions.value,
    },
    {
      key: "local-playlists",
      label: "本地歌单",
      show: localPlaylistOptions.value.length > 0,
      icon: renderIcon("PlaylistAdd"),
      children: localPlaylistOptions.value,
    },
  ]);
});

const localModeMenuOptions = computed<MenuOption[]>(() => {
  return toMenuOptions([
    {
      key: "local",
      label: "音乐库",
      show: isDesktopApp,
      icon: renderIcon("FolderMusic"),
    },
    {
      key: "local-albums",
      label: "专辑",
      show: isDesktopApp && localStore.localSongs.length > 0,
      icon: renderIcon("Album"),
    },
    {
      key: "local-artists",
      label: "艺术家",
      show: isDesktopApp && localStore.localSongs.length > 0,
      icon: renderIcon("Person"),
    },
    {
      key: "local-playlists",
      label: "本地歌单",
      show: localPlaylistOptions.value.length > 0,
      icon: renderIcon("PlaylistAdd"),
      children: localPlaylistOptions.value,
    },
  ]);
});

const menuOptions = computed<MenuOption[] | MenuGroupOption[]>(() => {
  return settingStore.useOnlineService ? onlineMenuOptions.value : localModeMenuOptions.value;
});

const menuUpdate = (key: string) => {
  emit("menu-click", key);

  if (key.startsWith("playlist-")) {
    router.push({ name: "playlist", query: { id: key.replace("playlist-", "") } });
    return;
  }

  if (key.startsWith("local-playlist-")) {
    router.push({ name: "playlist", query: { id: key.replace("local-playlist-", "") } });
    return;
  }

  router.push({ name: key });
};

const syncMenuActiveKey = () => {
  const routeName = String(router.currentRoute.value.name || "home");

  if (routeName === "playlist") {
    const playlistId = String(router.currentRoute.value.query.id || "");
    if (localStore.isLocalPlaylist(playlistId)) {
      menuActiveKey.value = `local-playlist-${playlistId}`;
      return;
    }
    menuActiveKey.value = `playlist-${playlistId}`;
    return;
  }

  if (routeName === "local-songs") {
    menuActiveKey.value = "local";
    return;
  }

  menuActiveKey.value = routeName;
};

onMounted(() => {
  syncMenuActiveKey();
});

watch(
  () => [
    router.currentRoute.value.fullPath,
    dataStore.userLikeData.playlists,
    localStore.localPlaylists,
  ],
  () => syncMenuActiveKey(),
  { deep: true },
);
</script>

<style lang="scss" scoped>
.n-menu {
  padding-bottom: 14px;

  :deep(.n-menu-item) {
    .n-menu-item-content {
      &::before {
        border-left: 4px solid transparent;
        transition:
          border 0.3s var(--n-bezier),
          background-color 0.3s var(--n-bezier);
      }

      &.n-menu-item-content--selected {
        .n-text {
          color: var(--primary-hex);
        }

        &::before {
          border-left-color: var(--n-item-text-color-active);
        }
      }
    }
  }

  &.cover {
    :deep(.n-submenu-children) {
      --n-item-height: 50px;
    }
  }
}
</style>
