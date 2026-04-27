import type { LyricLine } from "@applemusic-like-lyrics/lyric";
import type { AndroidNowPlayingMetadata } from "@/platform/bridge/android";
import { syncAndroidNowPlayingMetadata } from "@/platform/bridge/android";
import { useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import { isAndroidApp } from "@/utils/env";
import { getPlaySongData, normalizeImageUrl } from "@/utils/format";

type ExtendedLyricLine = LyricLine & {
  lyric?: string;
  text?: string;
  translatedLyric?: string;
  words?: Array<{ word?: string }>;
};

const getCurrentLyricLine = (): string => {
  const musicStore = useMusicStore();
  const settingStore = useSettingStore();
  const statusStore = useStatusStore();
  const lyricIndex = statusStore.lyricIndex;

  if (lyricIndex < 0) return "";

  const lyrics =
    settingStore.showWordLyrics && musicStore.songLyric.yrcData?.length
      ? musicStore.songLyric.yrcData
      : musicStore.songLyric.lrcData;
  const line = lyrics?.[lyricIndex] as ExtendedLyricLine | undefined;

  if (!line) return "";

  const wordsText = Array.isArray(line.words)
    ? line.words
        .map((item) => item.word?.trim() ?? "")
        .join("")
        .trim()
    : "";

  return (wordsText || line.lyric || line.text || "").trim();
};

export const buildAndroidNowPlayingMetadata = (): AndroidNowPlayingMetadata | null => {
  if (!isAndroidApp) return null;

  const musicStore = useMusicStore();
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
  const artworkUri = normalizeImageUrl(
    musicStore.getSongCover("xl") || musicStore.playSong.cover || "",
  );

  return {
    title: currentSong.name || musicStore.playSong.name || "SPlayer-ROM-Compat",
    artist,
    album,
    artworkUri,
    lyricLine: getCurrentLyricLine(),
  };
};

export const syncAndroidNowPlayingFromStores = (): boolean => {
  const metadata = buildAndroidNowPlayingMetadata();
  if (!metadata) return false;
  return syncAndroidNowPlayingMetadata(metadata);
};
