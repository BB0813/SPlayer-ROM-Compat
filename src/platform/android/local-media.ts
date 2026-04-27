import { scanAndroidMediaStore } from "@/platform/bridge/android";
import type { AndroidMediaTrack } from "@/platform/bridge/types";
import { useLocalStore } from "@/stores";
import type { SongType } from "@/types/main";
import { isAndroidApp } from "@/utils/env";

const ANDROID_MEDIA_LIBRARY_KEY = "android-media-library";
const ANDROID_MEDIA_LAST_SCAN_AT_KEY = "android-media-last-scan-at";
const DEFAULT_LOCAL_COVER = "/images/song.jpg?asset";
const DEFAULT_ROOT_FOLDER = "系统媒体库";

const normalizeSegment = (value?: string | null): string => {
  return (value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .trim();
};

const getVirtualFolder = (track: AndroidMediaTrack): string => {
  const relativePath = normalizeSegment(track.relativePath);
  if (!relativePath) return DEFAULT_ROOT_FOLDER;
  return relativePath;
};

const getVirtualFileName = (track: AndroidMediaTrack): string => {
  const baseName = (track.title || `音频-${track.id}`).trim() || `音频-${track.id}`;
  const mimeType = (track.mimeType || "").toLowerCase();

  if (mimeType.includes("flac")) return `${baseName}.flac`;
  if (mimeType.includes("wav")) return `${baseName}.wav`;
  if (mimeType.includes("ogg")) return `${baseName}.ogg`;
  if (mimeType.includes("aac")) return `${baseName}.aac`;
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return `${baseName}.m4a`;
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return `${baseName}.mp3`;

  return baseName;
};

const getVirtualPath = (track: AndroidMediaTrack): string => {
  return `${getVirtualFolder(track)}/${getVirtualFileName(track)}`;
};

export const mapAndroidMediaTrackToSong = (track: AndroidMediaTrack): SongType => {
  return {
    id: Number(track.id),
    name: track.title || `音频-${track.id}`,
    artists: track.artist || "未知歌手",
    album: track.album || "未知专辑",
    cover: track.artworkUri || DEFAULT_LOCAL_COVER,
    duration: Number(track.duration || 0),
    free: 0,
    mv: null,
    path: getVirtualPath(track),
    size: Number(track.size || 0),
    createTime: Number(track.dateAdded || 0) * 1000 || undefined,
    updateTime: Number(track.dateModified || 0) * 1000 || undefined,
    type: "song",
    streamUrl: track.contentUri,
    originalId: String(track.id),
  };
};

export const readCachedAndroidMediaTracks = async (): Promise<AndroidMediaTrack[]> => {
  if (!isAndroidApp) return [];

  const cachedTracks = await window.api.store.get(ANDROID_MEDIA_LIBRARY_KEY);
  return Array.isArray(cachedTracks) ? (cachedTracks as AndroidMediaTrack[]) : [];
};

export const syncAndroidMediaLibraryToLocalStore = async (
  tracks?: AndroidMediaTrack[],
): Promise<SongType[]> => {
  if (!isAndroidApp) return [];

  const sourceTracks = tracks ?? (await readCachedAndroidMediaTracks());
  const songs = sourceTracks.map(mapAndroidMediaTrackToSong);
  await useLocalStore().updateLocalSong(songs);
  return songs;
};

export const scanAndSyncAndroidMediaLibrary = async (): Promise<{
  tracks: AndroidMediaTrack[];
  songs: SongType[];
  scannedAt: string;
}> => {
  const tracks = await scanAndroidMediaStore();
  const scannedAt = new Date().toISOString();

  await window.api.store.set(ANDROID_MEDIA_LIBRARY_KEY, tracks);
  await window.api.store.set(ANDROID_MEDIA_LAST_SCAN_AT_KEY, scannedAt);

  const songs = await syncAndroidMediaLibraryToLocalStore(tracks);

  return {
    tracks,
    songs,
    scannedAt,
  };
};
