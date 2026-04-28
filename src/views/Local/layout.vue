<template>
  <div class="local">
    <Transition name="fade" mode="out-in">
      <div :key="pageTitle" class="title">
        <n-text class="keyword">{{ pageTitle }}</n-text>
        <n-flex class="status">
          <n-text class="item">
            <SvgIcon name="Music" :depth="3" />
            <n-number-animation :from="0" :to="listData?.length || 0" /> 首歌曲
          </n-text>
          <n-text class="item">
            <SvgIcon name="Storage" :depth="3" />
            <n-number-animation :from="0" :to="allMusicSize" :precision="2" /> GB
          </n-text>
        </n-flex>
      </div>
    </Transition>

    <n-flex class="menu" justify="space-between">
      <n-flex class="left" align="flex-end">
        <n-button
          :focusable="false"
          :disabled="loading && !localStore.localSongs?.length"
          :loading="loading"
          type="primary"
          strong
          secondary
          round
          v-debounce="handlePlay"
        >
          <template #icon>
            <SvgIcon name="Play" />
          </template>
          播放
        </n-button>
        <n-button
          v-if="localType === 'local-playlists'"
          :focusable="false"
          class="more"
          strong
          secondary
          circle
          @click="openCreatePlaylist(true)"
        >
          <template #icon>
            <SvgIcon name="Add" />
          </template>
        </n-button>
        <n-button
          v-else
          :disabled="loading"
          :loading="loading"
          :focusable="false"
          class="more"
          strong
          secondary
          circle
          @click="getAllLocalMusic(true)"
        >
          <template #icon>
            <SvgIcon name="Refresh" />
          </template>
        </n-button>
        <n-dropdown :options="moreOptions" trigger="click" placement="bottom-start">
          <n-button :focusable="false" class="more" circle strong secondary>
            <template #icon>
              <SvgIcon name="List" />
            </template>
          </n-button>
        </n-dropdown>
        <Transition name="fade" mode="out-in">
          <n-select
            v-if="!isLocalFoldersRoute && settingStore.localFolderDisplayMode === 'dropdown'"
            v-model:value="selectedFolder"
            :options="folderOptions"
            class="folder-select"
            size="medium"
            style="width: 200px"
          />
        </Transition>
      </n-flex>
      <n-flex class="right" justify="end">
        <n-input
          v-if="localStore.localSongs?.length"
          v-model:value="searchValue"
          :input-props="{ autocomplete: 'off' }"
          class="search"
          placeholder="模糊搜索"
          clearable
          round
          @input="listSearch"
        >
          <template #prefix>
            <SvgIcon name="Search" />
          </template>
        </n-input>
        <template v-if="settingStore.useOnlineService">
          <n-dropdown
            v-if="!isLargeDesktop"
            :options="tabDropdownOptions"
            :value="localType"
            trigger="click"
            placement="bottom-end"
            @select="handleTabUpdate"
          >
            <n-button :disabled="tabsDisabled" :focusable="false" strong secondary round>
              {{ currentTabLabel }}
              <template #icon>
                <SvgIcon name="Down" />
              </template>
            </n-button>
          </n-dropdown>
          <n-tabs
            v-else
            v-model:value="localType"
            class="tabs"
            type="segment"
            @update:value="handleTabUpdate"
          >
            <n-tab :disabled="tabsDisabled" name="local-songs"> 单曲 </n-tab>
            <n-tab :disabled="tabsDisabled" name="local-artists"> 歌手 </n-tab>
            <n-tab :disabled="tabsDisabled" name="local-albums"> 专辑 </n-tab>
            <n-tab :disabled="tabsDisabled" name="local-playlists"> 歌单 </n-tab>
            <n-tab :disabled="tabsDisabled" name="local-folders"> 文件夹 </n-tab>
          </n-tabs>
        </template>
      </n-flex>
    </n-flex>

    <RouterView v-if="!showEmptyState" v-slot="{ Component }">
      <Transition :name="`router-${settingStore.routeAnimation}`" mode="out-in">
        <KeepAlive v-if="keepAliveEnabled">
          <component
            :is="Component"
            :data="listData"
            :loading="loading"
            :list-version="listVersion"
            class="router-view"
          />
        </KeepAlive>
        <component v-else :is="Component" :data="listData" :loading="loading" class="router-view" />
      </Transition>
    </RouterView>

    <n-flex v-else class="empty-wrap" align="center" justify="center">
      <n-empty :description="emptyDescription">
        <template #extra>
          <n-button type="primary" strong secondary @click="openLocalMusicDirectoryModal">
            <template #icon>
              <SvgIcon name="FolderCog" />
            </template>
            {{ isAndroidApp ? "管理系统媒体库" : "本地目录管理" }}
          </n-button>
        </template>
      </n-empty>
    </n-flex>
  </div>
</template>

<script setup lang="ts">
import SvgIcon from "@/components/Global/SvgIcon.vue";
import { useMobile } from "@/composables/useMobile";
import { usePlayerController } from "@/core/player/PlayerController";
import {
  readCachedAndroidMediaTracks,
  syncAndroidMediaLibraryToLocalStore,
} from "@/platform/android/local-media";
import { useLocalStore, useSettingStore } from "@/stores";
import type { SongType } from "@/types/main";
import { isAndroidApp, isElectron } from "@/utils/env";
import { formatSongsList } from "@/utils/format";
import { fuzzySearch, renderIcon } from "@/utils/helper";
import { openBatchList, openCreatePlaylist, openLocalMusicDirectoryModal } from "@/utils/modal";
import { debounce } from "lodash-es";
import type { DropdownOption, MessageReactive } from "naive-ui";
import { useAndroidRoutePerformance } from "@/composables/useAndroidRoutePerformance";

const router = useRouter();
const { keepAliveEnabled } = useAndroidRoutePerformance();
const localStore = useLocalStore();
const settingStore = useSettingStore();
const player = usePlayerController();
const { isLargeDesktop } = useMobile();

const loading = ref(false);
const loadingMsg = ref<MessageReactive | null>(null);
const syncProgress = ref({ current: 0, total: 0 });
const localEventBus = useEventBus("local");
const localPlayEventBus = useEventBus("local-play");
const localType = ref<string>((router.currentRoute.value?.name as string) || "local-songs");
const selectedFolder = ref("all");
const listVersion = ref(0);
const searchValue = ref("");
const filteredSearchResult = ref<SongType[]>([]);

const folderOptions = computed(() => {
  const options: { label: string; value: string }[] = [{ label: "全部文件夹", value: "all" }];

  if (isAndroidApp) {
    const androidRoots = Array.from(
      new Set(
        localStore.localSongs
          .map((song) => song.path?.split("/")[0])
          .filter((item): item is string => Boolean(item)),
      ),
    );

    androidRoots.forEach((folderPath) => {
      options.push({ label: folderPath, value: folderPath });
    });

    return options;
  }

  settingStore.localFilesPath.forEach((folderPath) => {
    if (!folderPath) return;
    const isWindowsPath = folderPath.includes("\\");
    const separator = isWindowsPath ? "\\" : "/";
    const folderName = folderPath.split(separator).pop() || folderPath;
    options.push({ label: folderName, value: folderPath });
  });

  return options;
});

const getFilteredData = (): SongType[] => {
  let data = localStore.localSongs;
  if (selectedFolder.value !== "all" && settingStore.localFolderDisplayMode === "dropdown") {
    if (isAndroidApp) {
      data = data.filter(
        (song) =>
          song.path?.startsWith(`${selectedFolder.value}/`) || song.path === selectedFolder.value,
      );
    } else {
      const folderPath = selectedFolder.value.replace(/\//g, "\\");
      data = data.filter((song) => {
        if (!song.path) return false;
        const songPath = song.path.replace(/\//g, "\\");
        return songPath === folderPath || songPath.startsWith(folderPath + "\\");
      });
    }
  }
  return data;
};

const listData = computed<SongType[]>(() => {
  if (searchValue.value && filteredSearchResult.value.length) {
    return filteredSearchResult.value;
  }
  return getFilteredData();
});

const handlePlay = () => {
  const routeName = router.currentRoute.value?.name as string;
  if (routeName === "local-songs" || routeName === "local-folders" || routeName === "local") {
    player.updatePlayList(listData.value);
  } else {
    localPlayEventBus.emit();
  }
};

const hasConfig = computed(() => isAndroidApp || settingStore.localFilesPath.length > 0);
const hasSong = computed(() => localStore.localSongs.length > 0);
const tabsDisabled = computed(() => !hasConfig.value || !hasSong.value);
const isLocalSongsRoute = computed(
  () => (router.currentRoute.value?.name as string) === "local-songs",
);
const isLocalFoldersRoute = computed(
  () => (router.currentRoute.value?.name as string) === "local-folders",
);

const pageTitle = computed(() => {
  if (settingStore.useOnlineService) return "本地歌曲";

  switch (router.currentRoute.value?.name as string) {
    case "local-songs":
    case "local":
      return "音乐库";
    case "local-playlists":
      return "歌单";
    case "local-albums":
      return "专辑";
    case "local-artists":
      return "艺术家";
    case "local-folders":
      return "文件夹";
    default:
      return "音乐库";
  }
});

const showEmptyState = computed(() => isLocalSongsRoute.value && !hasSong.value);
const emptyDescription = computed(() =>
  isAndroidApp ? "暂未同步系统媒体库，请先扫描系统音频。" : "暂未发现本地歌曲，请先添加本地目录。",
);

const getMusicFolder = async (): Promise<string[]> => {
  return [...settingStore.localFilesPath].filter((item) => item && item.trim() !== "");
};

const allMusicSize = computed(() => {
  const totalBytes = listData.value.reduce((total, song) => total + (song?.size || 0), 0);
  return Number((totalBytes / (1024 * 1024 * 1024)).toFixed(2));
});

const moreOptions = computed<DropdownOption[]>(() => {
  const options: DropdownOption[] = [
    {
      label: "本地目录管理",
      key: "folder",
      props: {
        onClick: () => openLocalMusicDirectoryModal(),
      },
      icon: renderIcon("FolderCog"),
    },
  ];

  if (isElectron) {
    options.push({
      label: "批量操作",
      key: "batch",
      props: {
        onClick: () => openBatchList(listData.value, true),
      },
      icon: renderIcon("Batch"),
    });
  }

  return options;
});

const tabLabels: Record<string, string> = {
  "local-songs": "单曲",
  "local-artists": "歌手",
  "local-albums": "专辑",
  "local-playlists": "歌单",
  "local-folders": "文件夹",
};

const tabDropdownOptions = computed<DropdownOption[]>(() => [
  { label: "单曲", key: "local-songs", icon: renderIcon("Music") },
  { label: "歌手", key: "local-artists", icon: renderIcon("Artist") },
  { label: "专辑", key: "local-albums", icon: renderIcon("Album") },
  { label: "歌单", key: "local-playlists", icon: renderIcon("MusicList") },
  { label: "文件夹", key: "local-folders", icon: renderIcon("Folder") },
]);

const currentTabLabel = computed(() => tabLabels[localType.value] || "单曲");

interface SyncCompleteData {
  success: boolean;
  message?: string;
  tracks?: Record<string, unknown>[];
}

const getAllLocalMusic = debounce(
  async (showTip: boolean = false) => {
    if (isAndroidApp) {
      const cachedTracks = await readCachedAndroidMediaTracks();
      const songs = await syncAndroidMediaLibraryToLocalStore(cachedTracks);
      filteredSearchResult.value = searchValue.value ? fuzzySearch(searchValue.value, songs) : [];
      loading.value = false;

      if (showTip) {
        if (songs.length > 0) {
          window.$message.success(`已同步 ${songs.length} 首本地音频`);
        } else {
          window.$message.info("当前还没有扫描系统媒体库");
        }
      }
      return;
    }

    const allPath = await getMusicFolder();
    if (!allPath.length) {
      await localStore.updateLocalSong([]);
      filteredSearchResult.value = [];
      loading.value = false;
      if (showTip) {
        window.$message.info("当前未配置本地目录");
      }
      return;
    }

    if (showTip) {
      loadingMsg.value = window.$message.loading("正在获取本地歌曲", { duration: 0 });
      syncProgress.value = { current: 0, total: 0 };
    }
    loading.value = true;
    const initialSongCount = localStore.localSongs.length;
    const receivedTracks: Record<string, unknown>[] = [];
    let isCompleted = false;

    const tracksBatchHandler = (_event: unknown, tracks: Record<string, unknown>[]) => {
      if (!loading.value || isCompleted) return;
      receivedTracks.push(...tracks);
    };

    const completeHandler = async (_event: unknown, data: SyncCompleteData) => {
      if (isCompleted) return;
      isCompleted = true;

      if (!data.success) {
        const errorMsg = data.message || "本地音乐同步失败";
        console.error("获取本地音乐失败:", errorMsg);
        window.$message.error(errorMsg);
        loading.value = false;
        loadingMsg.value?.destroy();
        loadingMsg.value = null;
        window.electron.ipcRenderer.removeAllListeners("music-sync-tracks-batch");
        window.electron.ipcRenderer.removeAllListeners("music-sync-complete");
        return;
      }

      const sourceTracks = data.tracks && data.tracks.length > 0 ? data.tracks : receivedTracks;
      const finalSongs = formatSongsList(sourceTracks);
      await localStore.updateLocalSong(finalSongs);
      if (searchValue.value) {
        filteredSearchResult.value = fuzzySearch(searchValue.value, finalSongs);
      }

      const addedCount = finalSongs.length - initialSongCount;
      if (showTip) {
        if (addedCount > 0) {
          window.$message.success(`新增 ${addedCount} 首歌曲`);
        } else if (finalSongs.length > 0) {
          window.$message.success(`已发现 ${finalSongs.length} 首歌曲`);
        }
      } else if (addedCount > 0) {
        window.$message.success(`新增 ${addedCount} 首歌曲`);
      }

      loading.value = false;
      loadingMsg.value?.destroy();
      loadingMsg.value = null;
      window.electron.ipcRenderer.removeAllListeners("music-sync-tracks-batch");
      window.electron.ipcRenderer.removeAllListeners("music-sync-complete");
    };

    window.electron.ipcRenderer.on("music-sync-tracks-batch", tracksBatchHandler);
    window.electron.ipcRenderer.on("music-sync-complete", completeHandler);

    try {
      const res = await window.electron.ipcRenderer.invoke("local-music-sync", allPath);
      if (res && !res.success) {
        isCompleted = true;
        loading.value = false;
        loadingMsg.value?.destroy();
        loadingMsg.value = null;
        if (res.message && res.message.includes("扫描正在进行中")) {
          window.$message.info(res.message);
        } else {
          window.$message.error(res.message || "本地音乐同步失败");
        }
        window.electron.ipcRenderer.removeAllListeners("music-sync-tracks-batch");
        window.electron.ipcRenderer.removeAllListeners("music-sync-complete");
      }
    } catch (error) {
      isCompleted = true;
      console.error("获取本地音乐失败:", error);
      window.$message.error("获取本地音乐失败，请重试");
      loading.value = false;
      loadingMsg.value?.destroy();
      loadingMsg.value = null;
      window.electron.ipcRenderer.removeAllListeners("music-sync-tracks-batch");
      window.electron.ipcRenderer.removeAllListeners("music-sync-complete");
    }
  },
  300,
  { leading: false, trailing: true },
);

const listSearch = debounce((val: string) => {
  const keyword = val.trim();
  if (!keyword) {
    filteredSearchResult.value = [];
    return;
  }
  filteredSearchResult.value = fuzzySearch(keyword, getFilteredData());
}, 300);

localEventBus.on(() => getAllLocalMusic());

if (isElectron) {
  watch(
    () => settingStore.localFilesPath,
    async () => await getAllLocalMusic(),
    { deep: true },
  );
}

watch(selectedFolder, () => {
  listVersion.value++;
});

const handleTabUpdate = (name: string) => {
  if (tabsDisabled.value) return;
  router.push({ name });
};

watch(
  () => router.currentRoute.value.name,
  (name) => {
    if (name && typeof name === "string" && name.startsWith("local")) {
      localType.value = name;
    }
  },
  { immediate: true },
);

onMounted(() => {
  if (isElectron) {
    const progressHandler = (_event: unknown, payload: { current: number; total: number }) => {
      if (!loading.value) return;
      const { current, total } = payload || { current: 0, total: 0 };
      if (!total || total <= 0) return;
      syncProgress.value = { current, total };
      if (loadingMsg.value) {
        loadingMsg.value.content = `正在获取本地歌曲（${current}/${total}）`;
      }
    };

    window.electron.ipcRenderer.on("music-sync-progress", progressHandler);
  }

  getAllLocalMusic();
});

onUnmounted(() => {
  if (!isElectron) return;

  window.electron.ipcRenderer.removeAllListeners("music-sync-progress");
  window.electron.ipcRenderer.removeAllListeners("music-sync-tracks-batch");
  window.electron.ipcRenderer.removeAllListeners("music-sync-complete");
});
</script>

<style lang="scss" scoped>
.local {
  display: flex;
  flex-direction: column;

  .title {
    display: flex;
    align-items: flex-end;
    line-height: normal;
    margin-top: 12px;
    margin-bottom: 20px;
    height: 40px;

    .keyword {
      font-size: 30px;
      font-weight: bold;
      margin-right: 12px;
      line-height: normal;
    }

    .status {
      font-size: 15px;
      font-weight: normal;
      line-height: 30px;

      .item {
        display: flex;
        align-items: center;
        opacity: 0.9;

        .n-icon {
          margin-right: 4px;
        }
      }
    }
  }

  .menu {
    width: 100%;
    margin-bottom: 20px;
    height: 40px;

    .n-button {
      height: 40px;
      transition: all 0.3s var(--n-bezier);
    }

    .more {
      width: 40px;
    }

    .search {
      height: 40px;
      width: 130px;
      display: flex;
      align-items: center;
      border-radius: 25px;
      transition: all 0.3s var(--n-bezier);

      &.n-input--focus {
        width: 200px;
      }
    }

    .folder-select {
      height: 40px;

      :deep(.n-base-selection) {
        height: 40px;
        border-radius: 25px;

        .n-base-selection-label {
          height: 40px;
          line-height: 40px;
        }
      }
    }

    .n-tabs {
      width: 320px;
      --n-tab-border-radius: 25px !important;

      :deep(.n-tabs-rail) {
        outline: 1px solid var(--n-tab-color-segment);
      }
    }

    @media (max-width: 678px) {
      .search {
        display: none;
      }
    }
  }

  .router-view {
    flex: 1;
    overflow: hidden;
    max-height: calc((var(--layout-height) - 132) * 1px);
  }

  .empty-wrap {
    flex: 1;
    min-height: 320px;
  }

  @media (max-width: 512px) {
    .status {
      display: none !important;
    }
  }
}
</style>
