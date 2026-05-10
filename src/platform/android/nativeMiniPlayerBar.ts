import type { AndroidNativeMiniPlayerBarState } from "@/platform/bridge/types";
import {
  setAndroidNativeMiniPlayerVisible,
  syncAndroidNativeMiniPlayerState,
} from "@/platform/bridge/android";
import { useDataStore, useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import { isAndroidApp } from "@/utils/env";
import { getPlaySongData, normalizeImageUrl } from "@/utils/format";

export const isAndroidNativeMiniPlayerBarEnabled = (): boolean => {
  if (!isAndroidApp) return false;
  const settingStore = useSettingStore();
  return settingStore.androidNativeMiniPlayerBarEnabled && settingStore.androidPerformanceMode;
};

export const shouldShowAndroidNativeMiniPlayerBar = (): boolean => {
  if (!isAndroidNativeMiniPlayerBarEnabled()) return false;
  const musicStore = useMusicStore();
  const statusStore = useStatusStore();
  return musicStore.isHasPlayer && statusStore.showPlayBar && !statusStore.showFullPlayer;
};

export const buildAndroidNativeMiniPlayerBarState = (): AndroidNativeMiniPlayerBarState | null => {
  if (!isAndroidApp) return null;

  const dataStore = useDataStore();
  const musicStore = useMusicStore();
  const statusStore = useStatusStore();
  if (!musicStore.isHasPlayer) return null;

  const currentSong = getPlaySongData() || musicStore.playSong;
  if (!currentSong) return null;

  const artist =
    currentSong.type === "radio"
      ? currentSong.dj?.creator || "未知播客"
      : Array.isArray(currentSong.artists)
        ? currentSong.artists.map((item: { name: string }) => item.name).join("/")
        : String(currentSong.artists || "未知歌手");
  const album =
    currentSong.type === "radio"
      ? currentSong.dj?.name || "未知播客"
      : typeof currentSong.album === "object"
        ? currentSong.album?.name || "未知专辑"
        : String(currentSong.album || "未知专辑");
  const queueTotal = dataStore.playList.length;
  const queueCurrent =
    queueTotal > 0 ? Math.min(Math.max(statusStore.playIndex + 1, 1), queueTotal) : 0;

  return {
    visible: shouldShowAndroidNativeMiniPlayerBar(),
    playing: statusStore.playStatus,
    loading: statusStore.playLoading,
    currentTime: statusStore.currentTime / 1000,
    duration: statusStore.duration / 1000,
    progress: statusStore.progress,
    themeColor: statusStore.mainColor,
    song: {
      id: currentSong.id,
      name: currentSong.name || musicStore.playSong.name || "SPlayer-ROM-Compat",
      artist,
      album,
      cover: normalizeImageUrl(musicStore.getSongCover("s") || musicStore.playSong.cover || ""),
      type: currentSong.type,
    },
    queue: {
      current: queueCurrent,
      total: queueTotal,
    },
  };
};

export const syncAndroidNativeMiniPlayerBarFromStores = (): boolean => {
  const state = buildAndroidNativeMiniPlayerBarState();
  if (!state) return setAndroidNativeMiniPlayerVisible(false);
  return syncAndroidNativeMiniPlayerState(state);
};

export const setAndroidNativeMiniPlayerBarVisible = (visible: boolean): boolean => {
  if (!isAndroidApp) return false;
  return setAndroidNativeMiniPlayerVisible(visible && shouldShowAndroidNativeMiniPlayerBar());
};
