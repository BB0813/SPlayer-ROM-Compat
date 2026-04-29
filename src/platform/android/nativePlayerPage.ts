import type {
  AndroidNativePlayerLyricLine,
  AndroidNativePlayerPageState,
} from "@/platform/bridge/types";
import {
  setAndroidNativePlayerVisible,
  syncAndroidNativePlayerState,
} from "@/platform/bridge/android";
import { useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import { isAndroidApp } from "@/utils/env";
import { getPlaySongData, normalizeImageUrl } from "@/utils/format";

type NativeLyricWordSource = {
  startTime?: number;
  endTime?: number;
  word?: string;
};

type NativeLyricLineSource = {
  startTime?: number;
  endTime?: number;
  lyric?: string;
  text?: string;
  translatedLyric?: string;
  romanLyric?: string;
  words?: NativeLyricWordSource[];
};

const normalizeLyricLines = (lines: NativeLyricLineSource[]): AndroidNativePlayerLyricLine[] => {
  return lines.map((line) => ({
    startTime: Number(line.startTime ?? 0),
    endTime: line.endTime === undefined ? undefined : Number(line.endTime),
    text:
      line.lyric ||
      line.text ||
      line.words
        ?.map((word) => word.word || "")
        .join("")
        .trim() ||
      "",
    translatedText: line.translatedLyric || undefined,
    romanText: line.romanLyric || undefined,
    words: line.words?.map((word) => ({
      startTime: Number(word.startTime ?? line.startTime ?? 0),
      endTime: word.endTime === undefined ? undefined : Number(word.endTime),
      word: word.word || "",
    })),
  }));
};

export const buildAndroidNativePlayerPageState = (): AndroidNativePlayerPageState | null => {
  if (!isAndroidApp) return null;

  const musicStore = useMusicStore();
  const settingStore = useSettingStore();
  const statusStore = useStatusStore();
  if (!settingStore.androidNativePlayerPageEnabled) return null;
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
  const lyricLines =
    settingStore.showWordLyrics && musicStore.songLyric.yrcData?.length
      ? musicStore.songLyric.yrcData
      : musicStore.songLyric.lrcData;

  return {
    visible: statusStore.showFullPlayer,
    playing: statusStore.playStatus,
    loading: statusStore.playLoading,
    currentTime: statusStore.currentTime,
    duration: statusStore.duration,
    progress: statusStore.progress,
    themeColor: statusStore.mainColor,
    song: {
      id: currentSong.id,
      name: currentSong.name || musicStore.playSong.name || "SPlayer-ROM-Compat",
      artist,
      album,
      cover: normalizeImageUrl(musicStore.getSongCover("m") || musicStore.playSong.cover || ""),
      type: currentSong.type,
    },
    lyric: {
      index: statusStore.lyricIndex,
      offset: statusStore.getSongOffset(musicStore.playSong?.id),
      lines: normalizeLyricLines((lyricLines || []) as NativeLyricLineSource[]),
    },
  };
};

export const syncAndroidNativePlayerPageFromStores = (): boolean => {
  const state = buildAndroidNativePlayerPageState();
  if (!state) return false;
  return syncAndroidNativePlayerState(state);
};

export const setAndroidNativePlayerPageVisible = (visible: boolean): boolean => {
  if (!isAndroidApp) return false;
  const settingStore = useSettingStore();
  return setAndroidNativePlayerVisible(visible && settingStore.androidNativePlayerPageEnabled);
};
