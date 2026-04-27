<template>
  <div v-if="isAndroidMode" class="local-music-directory android-mode">
    <n-text class="local-list-tip">
      Android 版通过系统媒体库管理本地音乐，扫描后会自动同步到本地音乐页。
    </n-text>
    <n-list class="local-list" bordered>
      <n-list-item>
        <n-thing title="媒体权限" :description="permissionGranted ? '已授权' : '未授权'" />
      </n-list-item>
      <n-list-item>
        <n-thing title="已缓存音频" :description="`${cachedTrackCount} 首`" />
      </n-list-item>
      <n-list-item>
        <n-thing title="已同步歌曲" :description="`${localSongCount} 首`" />
      </n-list-item>
      <n-list-item>
        <n-thing
          title="最近扫描"
          :description="lastScanAt ? new Date(lastScanAt).toLocaleString() : '暂无扫描记录'"
        />
      </n-list-item>
    </n-list>
    <n-flex justify="center" style="margin-top: 20px" :wrap="true">
      <n-button strong secondary @click="requestPermission">
        <template #icon>
          <SvgIcon name="Shield" />
        </template>
        {{ permissionGranted ? "刷新权限状态" : "申请媒体权限" }}
      </n-button>
      <n-button strong secondary @click="syncCachedLibrary">
        <template #icon>
          <SvgIcon name="Refresh" />
        </template>
        同步已缓存媒体
      </n-button>
      <n-button type="primary" strong secondary @click="scanAndSyncLibrary">
        <template #icon>
          <SvgIcon name="FolderPlus" />
        </template>
        扫描并同步系统媒体库
      </n-button>
    </n-flex>
  </div>
  <div v-else class="local-music-directory">
    <n-text class="local-list-tip">
      请选择本地音乐文件夹，将自动扫描您添加的目录，歌曲增删实时同步。
    </n-text>
    <n-scrollbar style="max-height: 50vh">
      <n-list class="local-list" hoverable clickable bordered>
        <div v-if="!settingStore.localFilesPath.length" class="empty">
          <n-empty description="暂无目录" />
        </div>
        <n-list-item v-for="(path, index) in settingStore.localFilesPath" :key="index">
          <template #prefix>
            <SvgIcon :size="20" name="Folder" />
          </template>
          <template #suffix>
            <n-button :focusable="false" quaternary @click="changeLocalMusicPath(index)">
              <template #icon>
                <SvgIcon :size="20" name="Delete" />
              </template>
            </n-button>
          </template>
          <n-thing :title="path" />
        </n-list-item>
      </n-list>
    </n-scrollbar>
    <n-flex justify="center" style="margin-top: 20px">
      <n-button class="add-path" strong secondary @click="changeLocalMusicPath()">
        <template #icon>
          <SvgIcon name="FolderPlus" />
        </template>
        添加文件夹
      </n-button>
    </n-flex>
  </div>
</template>

<script setup lang="ts">
import SvgIcon from "@/components/Global/SvgIcon.vue";
import {
  readCachedAndroidMediaTracks,
  scanAndSyncAndroidMediaLibrary,
  syncAndroidMediaLibraryToLocalStore,
} from "@/platform/android/local-media";
import {
  checkAndroidAudioPermission,
  requestAndroidAudioPermission,
} from "@/platform/bridge/android";
import { useLocalStore, useSettingStore } from "@/stores";
import { isAndroidApp } from "@/utils/env";
import { changeLocalMusicPath } from "@/utils/helper";

const settingStore = useSettingStore();
const localStore = useLocalStore();
const isAndroidMode = isAndroidApp;
const permissionGranted = ref(false);
const cachedTrackCount = ref(0);
const lastScanAt = ref("");

const localSongCount = computed(() => localStore.localSongs.length);

const loadAndroidState = async () => {
  if (!isAndroidMode) return;

  permissionGranted.value = checkAndroidAudioPermission();
  cachedTrackCount.value = (await readCachedAndroidMediaTracks()).length;
  const value = await window.api.store.get("android-media-last-scan-at");
  lastScanAt.value = typeof value === "string" ? value : "";
};

const requestPermission = () => {
  if (checkAndroidAudioPermission()) {
    permissionGranted.value = true;
    window.$message.success("媒体权限已授权");
    return;
  }

  requestAndroidAudioPermission();
  window.$message.info("已发起系统授权请求，请允许访问音频媒体后再继续");
  window.setTimeout(() => {
    void loadAndroidState();
  }, 1200);
};

const syncCachedLibrary = async () => {
  const songs = await syncAndroidMediaLibraryToLocalStore();
  await loadAndroidState();
  window.$message.success(`已同步 ${songs.length} 首缓存音频到本地音乐库`);
};

const scanAndSyncLibrary = async () => {
  if (!checkAndroidAudioPermission()) {
    requestPermission();
    return;
  }

  const { tracks, songs } = await scanAndSyncAndroidMediaLibrary();
  await loadAndroidState();
  window.$message.success(
    `系统媒体库扫描完成，发现 ${tracks.length} 首音频，已同步 ${songs.length} 首`,
  );
};

onMounted(() => {
  void loadAndroidState();
});
</script>

<style scoped lang="scss">
.local-list-tip {
  display: block;
  margin-bottom: 12px;
  opacity: 0.8;
}
.local-list {
  :deep(.n-list-item__prefix) {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  :deep(.n-list-item__main) {
    .n-thing-main__description {
      font-size: 13px;
      opacity: 0.6;
    }
  }
  .empty {
    padding: 20px 0;
  }
}
.android-mode {
  .local-list {
    margin-top: 8px;
  }
}
</style>
