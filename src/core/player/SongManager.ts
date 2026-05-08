import { personalFm, personalFmToTrash } from "@/api/rec";
import { songQuality, songUrl, unlockSongUrl } from "@/api/song";
import { useLyricManager } from "@/core/player/LyricManager";
import {
  useDataStore,
  useMusicStore,
  useSettingStore,
  useStatusStore,
  useStreamingStore,
} from "@/stores";
import { QualityType, type SongType, type AudioSourceType } from "@/types/main";
import { isLogin } from "@/utils/auth";
import { isAndroidApp, isElectron } from "@/utils/env";
import { formatSongsList } from "@/utils/format";
import { toFileUrl } from "@/utils/fileUrl";
import { AI_AUDIO_LEVELS } from "@/utils/meta";
import { handleSongQuality } from "@/utils/helper";
import { openUserLogin } from "@/utils/modal";

export enum SongUnlockServer {
  NETEASE = "netease",
  BODIAN = "bodian",
  KUWO = "kuwo",
  GEQUBAO = "gequbao",
}

export type AudioSource = {
  /** 音频源 ID */
  id: number;

  url?: string;

  isUnlocked?: boolean;

  isTrial?: boolean;

  quality?: QualityType;

  source?: AudioSourceType;
};

class SongManager {
  // 预加载下一首播放源
  private nextPrefetch: AudioSource | undefined;

  public peekPrefetch(id: number): AudioSource | undefined {
    if (!this.nextPrefetch) return;
    if (this.nextPrefetch.id !== id) return;
    return this.nextPrefetch;
  }

  public async getMusicCachePath(
    id: number | string,
    quality?: QualityType | string,
  ): Promise<string | null> {
    const settingStore = useSettingStore();
    if (!isElectron || !settingStore.cacheEnabled || !settingStore.songCacheEnabled) return null;
    try {
      return await window.electron.ipcRenderer.invoke("music-cache-check", id, quality);
    } catch {
      return null;
    }
  }

  public async ensureMusicCachePath(
    id: number | string,
    url: string | undefined,
    quality?: QualityType | string,
  ): Promise<string | null> {
    const existing = await this.getMusicCachePath(id, quality);
    if (existing) return existing;
    if (!url) return null;

    const settingStore = useSettingStore();
    if (!isElectron || !settingStore.cacheEnabled || !settingStore.songCacheEnabled) return null;
    try {
      const result: unknown = await window.electron.ipcRenderer.invoke(
        "music-cache-download",
        id,
        url,
        quality || "standard",
      );
      if (result && typeof result === "object") {
        const record = result as Record<string, unknown>;
        if (record.success === true && typeof record.path === "string") {
          return record.path;
        }
      }
    } catch {
      return null;
    }
    return await this.getMusicCachePath(id);
  }

  private prefetchCover(song: SongType): void {
    if (!song || song.path) return;
    const coverUrls: string[] = [];

    // 优先预取高质量封面
    if (song.coverSize) {
      // 注释已清理
      if (song.coverSize.xl) coverUrls.push(song.coverSize.xl);
      if (song.coverSize.l) coverUrls.push(song.coverSize.l);
    }
    if (song.cover && !coverUrls.includes(song.cover)) {
      coverUrls.push(song.cover);
    }
    // 注释已清理
    coverUrls.forEach((url) => {
      if (!url || !url.startsWith("http")) return;
      const img = new Image();
      // 注释已清理
      const cleanup = () => {
        img.onload = null;
        img.onerror = null;
      };
      img.onload = cleanup;
      img.onerror = cleanup;
      img.src = url;
    });
  }

  private checkLocalCache = async (
    id: number,
    quality?: QualityType,
    md5?: string,
  ): Promise<string | null> => {
    const settingStore = useSettingStore();
    if (isElectron && settingStore.cacheEnabled && settingStore.songCacheEnabled) {
      try {
        const cachePath = await window.electron.ipcRenderer.invoke(
          "music-cache-check",
          id,
          quality,
          md5,
        );
        if (cachePath) {
          console.log("日志输出");
          return toFileUrl(cachePath);
        }
      } catch (e) {
        console.error("[SongManager] 获取播放地址失败", e);
      }
    }
    return null;
  };

  private triggerCacheDownload = (id: number, url: string, quality?: QualityType | string) => {
    const settingStore = useSettingStore();
    if (isElectron && settingStore.cacheEnabled && settingStore.songCacheEnabled && url) {
      window.electron.ipcRenderer.invoke("music-cache-download", id, url, quality || "standard");
    }
  };

  public getOnlineUrl = async (id: number, isPc: boolean = false): Promise<AudioSource> => {
    const settingStore = useSettingStore();
    let level: string = isPc ? "exhigh" : settingStore.songLevel;

    if (settingStore.disableAiAudio && AI_AUDIO_LEVELS.includes(level)) {
      level = "hires";
    }

    // 注释已清理
    if (level === "dolby") {
      try {
        const qualityRes = await songQuality(id);
        const hasDb = qualityRes.data?.db && Number(qualityRes.data.db.br) > 0;
        // 注释已清理
        if (!hasDb) {
          console.log("日志输出");

          if (qualityRes.data?.hr && Number(qualityRes.data.hr.br) > 0) {
            level = "hires";
          } else if (qualityRes.data?.sq && Number(qualityRes.data.sq.br) > 0) {
            level = "lossless";
          } else {
            level = "exhigh";
          }
        }
      } catch (e) {
        console.error("[SongManager] 获取播放地址失败", e);
        level = "exhigh";
      }
    }

    const res = await songUrl(id, level as any);
    console.log(`[${id}] 官方播放地址请求完成`);

    // 注释已清理
    const songData = Array.isArray(res.data) ? res.data[0] : res.data?.[0];

    if (!songData || !songData?.url) return { id, url: undefined };
    // 注释已清理
    const isTrial = songData?.freeTrialInfo != null;
    // 注释已清理
    const normalizedUrl = isElectron
      ? songData.url
      : songData.url
          .replace(/^http:/, "https:")
          .replace(/m804\.music\.126\.net/g, "m801.music.126.net")
          .replace(/m704\.music\.126\.net/g, "m701.music.126.net");
    // 注释已清理
    const finalUrl = normalizedUrl;

    let quality: QualityType | undefined;
    if (level === "dolby") {
      quality = QualityType.Dolby;
    } else {
      // 注释已清理
      quality = handleSongQuality(songData, "online");
    }

    // 注释已清理
    if (finalUrl && quality) {
      const cachedUrl = await this.checkLocalCache(id, quality, songData?.md5);
      if (cachedUrl) {
        return { id, url: cachedUrl, isTrial, quality };
      }
    }
    // 注释已清理
    if (finalUrl) {
      this.triggerCacheDownload(id, finalUrl, quality);
    }
    return { id, url: finalUrl, isTrial, quality };
  };

  public getUnlockSongUrl = async (
    song: SongType,
    specificSource?: string,
  ): Promise<AudioSource> => {
    const settingStore = useSettingStore();
    const songId = song.id;

    if (!specificSource || specificSource === "auto") {
      const cachedUrl = await this.checkLocalCache(songId);
      if (cachedUrl) {
        // 注释已清理
        let source: AudioSourceType = SongUnlockServer.NETEASE;
        const firstEnabled = settingStore.songUnlockServer.find((s) => s.enabled);
        if (firstEnabled) source = firstEnabled.key as AudioSourceType;
        return {
          id: songId,
          url: cachedUrl,
          isUnlocked: true,
          source,
          quality: QualityType.HQ,
        };
      }
    }
    const artistName = Array.isArray(song.artists)
      ? song.artists.map((a) => a.name).join(" & ")
      : song.artists;
    const keyWord = song.name + "-" + artistName;
    if (!songId || !keyWord) {
      return { id: songId, url: undefined };
    }

    // 注释已清理
    let servers: SongUnlockServer[] = [];
    if (specificSource && specificSource !== "auto") {
      servers = [specificSource as SongUnlockServer];
    } else {
      servers = settingStore.songUnlockServer
        .filter((s) => s.enabled)
        .map((s) => s.key as SongUnlockServer);
    }

    if (servers.length === 0) {
      return { id: songId, url: undefined };
    }

    // 注释已清理
    const results = await Promise.allSettled(
      servers.map((server) =>
        unlockSongUrl(songId, keyWord, server, song.name, String(artistName || "")).then(
          (result) => ({
            server,
            result,
            success: result.code === 200 && !!result.url,
          }),
        ),
      ),
    );

    // 注释已清理
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.success) {
        const unlockUrl = r.value?.result?.url;

        this.triggerCacheDownload(songId, unlockUrl);

        let quality = QualityType.HQ;
        if (unlockUrl && (unlockUrl.includes(".flac") || unlockUrl.includes(".wav"))) {
          quality = QualityType.SQ;
        }
        console.log("日志输出");
        return {
          id: songId,
          url: unlockUrl,
          isUnlocked: true,
          quality,
          source: r.value.server,
        };
      }
    }
    return { id: songId, url: undefined };
  };

  public prefetchNextSong = async (): Promise<AudioSource | undefined> => {
    try {
      const dataStore = useDataStore();
      const statusStore = useStatusStore();
      const settingStore = useSettingStore();
      const lyricManager = useLyricManager();
      const musicStore = useMusicStore();
      // 注释已清理
      if (statusStore.personalFmMode) {
        const fmList = musicStore.personalFM.list;
        const fmIndex = musicStore.personalFM.playIndex;
        // 注释已清理
        if (fmIndex >= fmList.length - 1) {
          try {
            const res = await personalFm();
            const newList = formatSongsList(res.data);
            if (newList?.length) {
              musicStore.personalFM.list = [...fmList, ...newList];
            }
          } catch (e) {
            console.warn("操作警告", e);
            return;
          }
        }
        const nextSong = musicStore.personalFM.list[fmIndex + 1];
        if (!nextSong?.id) return;
        this.prefetchCover(nextSong);
        lyricManager.prefetchLyric(nextSong);
        const { url, isTrial, quality } = await this.getOnlineUrl(nextSong.id, false);
        if (url && !isTrial) {
          this.nextPrefetch = {
            id: nextSong.id,
            url,
            isUnlocked: false,
            quality,
            source: "official",
          };
          return this.nextPrefetch;
        }
        return;
      }
      // 注释已清理
      const playList = dataStore.playList;
      if (!playList?.length) {
        return;
      }
      // 注释已清理
      let nextIndex = statusStore.playIndex + 1;
      if (nextIndex >= playList.length) nextIndex = 0;
      const nextSong = playList[nextIndex];
      if (!nextSong) return;
      // 注释已清理
      this.prefetchCover(nextSong);
      // 注释已清理
      lyricManager.prefetchLyric(nextSong);

      if (nextSong.path) {
        if (isElectron && settingStore.enableAutomix) {
          window.electron.ipcRenderer.invoke("analyze-audio-head", nextSong.path).catch((e) => {
            console.warn("[Prefetch] Analysis failed:", e);
          });
        }
        return;
      }
      // 注释已清理
      if (nextSong.type === "streaming" && nextSong.streamUrl) {
        this.nextPrefetch = {
          id: nextSong.id,
          url: nextSong.streamUrl,
          isUnlocked: false,
          quality: QualityType.SQ,
        };
        return this.nextPrefetch;
      }

      // 注释已清理
      const songId = nextSong.type === "radio" ? nextSong.dj?.id : nextSong.id;
      if (!songId) return;
      // 注释已清理
      const canUnlock = isElectron && nextSong.type !== "radio" && settingStore.useSongUnlock;
      // 注释已清理
      const { url: officialUrl, isTrial, quality } = await this.getOnlineUrl(songId, false);
      if (officialUrl && !isTrial) {
        // 注释已清理
        this.nextPrefetch = {
          id: songId,
          url: officialUrl,
          isUnlocked: false,
          quality,
          source: "official",
        };
        return this.nextPrefetch;
      } else if (canUnlock) {
        // 注释已清理
        const unlockUrl = await this.getUnlockSongUrl(nextSong);
        if (unlockUrl.url) {
          this.nextPrefetch = { id: songId, url: unlockUrl.url, isUnlocked: true };
          return this.nextPrefetch;
        } else if (officialUrl) {
          // 注释已清理
          this.nextPrefetch = { id: songId, url: officialUrl, source: "official" };
          return this.nextPrefetch;
        } else {
          return;
        }
      } else {
        // 注释已清理
        this.nextPrefetch = { id: songId, url: officialUrl, source: "official" };
        return this.nextPrefetch;
      }
    } catch (error) {
      console.error("操作失败", error);
      return;
    }
  };

  public clearPrefetch() {
    this.nextPrefetch = undefined;
    console.log("日志输出");
  }

  public getAudioSource = async (song: SongType, forceSource?: string): Promise<AudioSource> => {
    const settingStore = useSettingStore();

    // 本地文件直接返回
    if (song.path && song.type !== "streaming") {
      if (isAndroidApp && song.streamUrl) {
        return { id: song.id, url: song.streamUrl, source: "local" };
      }

      const result = await window.electron.ipcRenderer.invoke("file-exists", song.path);
      if (!result) {
        this.nextPrefetch = undefined;
        console.error("操作失败");
        return { id: song.id, url: undefined };
      }
      const fileUrl = toFileUrl(song.path);
      return { id: song.id, url: fileUrl, source: "local" };
    }

    // Stream songs (Subsonic / Jellyfin)
    if (song.type === "streaming" && song.streamUrl) {
      const streamingStore = useStreamingStore();
      const finalUrl = streamingStore.getSongUrl(song);
      console.log(`[${song.id}] 流媒体播放地址:`, finalUrl);
      return {
        id: song.id,
        url: finalUrl,
        isUnlocked: false,
        quality: song.quality || QualityType.SQ,
        source: "streaming",
      };
    }

    const songId = song.type === "radio" ? song.dj?.id : song.id;
    if (!songId) return { id: 0, url: undefined, quality: undefined, isUnlocked: false };

    if (
      !forceSource &&
      this.nextPrefetch &&
      this.nextPrefetch.id === songId &&
      settingStore.useNextPrefetch
    ) {
      console.log("日志输出");
      const cachedSource = this.nextPrefetch;
      this.nextPrefetch = undefined;
      return cachedSource;
    }

    try {
      const canUnlock = isElectron && song.type !== "radio" && settingStore.useSongUnlock;

      if (forceSource && forceSource !== "auto") {
        if (!canUnlock) {
          return { id: songId, url: undefined };
        }
        const unlockUrl = await this.getUnlockSongUrl(song, forceSource);
        if (unlockUrl.url) {
          console.log(`[${songId}] 指定源解锁成功：${forceSource}`, unlockUrl);
          return unlockUrl;
        }
        return { id: songId, url: undefined };
      }

      const { url: officialUrl, isTrial, quality } = await this.getOnlineUrl(songId, !!song.pc);
      if (officialUrl) {
        if (isTrial) window.$message.warning("当前歌曲仅可试听");
        return { id: songId, url: officialUrl, quality, isUnlocked: false, source: "official" };
      }

      if ((!forceSource || forceSource === "auto") && canUnlock) {
        const unlockUrl = await this.getUnlockSongUrl(song);
        if (unlockUrl.url) {
          console.log(`[${songId}] 解锁成功`, unlockUrl);
          return unlockUrl;
        }
      }

      if (!forceSource || forceSource === "auto") {
        const fallbackUrl = await this.checkLocalCache(songId);
        if (fallbackUrl) {
          console.log("[SongManager] 播放地址处理完成", fallbackUrl);
          return {
            id: songId,
            url: fallbackUrl,
            isUnlocked: true,
            source: "local",
            quality: QualityType.HQ,
          };
        }
      }

      if (!isLogin() && song.free !== 0 && song.type !== "radio") {
        window.$message.warning("当前歌曲可能需要登录后才能试听或播放");
      }
      return { id: songId, url: undefined, quality: undefined, isUnlocked: false };
    } catch (error) {
      console.error(`[${songId}] 获取播放地址失败`, error);
      if (!forceSource || forceSource === "auto") {
        const fallbackUrl = await this.checkLocalCache(songId);
        if (fallbackUrl) {
          console.log(`[${songId}] 异常后使用本地缓存回退`);
          return {
            id: songId,
            url: fallbackUrl,
            isUnlocked: true,
            source: "local",
            quality: QualityType.HQ,
          };
        }
      }
      return {
        id: songId,
        url: undefined,
        quality: undefined,
        isUnlocked: false,
      };
    }
  };

  public async initPersonalFM(playNext: boolean = false) {
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();

    try {
      const fetchFM = async () => {
        const res = await personalFm();
        musicStore.personalFM.list = formatSongsList(res.data);
        musicStore.personalFM.playIndex = 0;
      };

      // 注释已清理
      if (musicStore.personalFM.list.length === 0) await fetchFM();
      // 注释已清理
      if (playNext) {
        statusStore.personalFmMode = true;
        // 注释已清理
        if (musicStore.personalFM.playIndex < musicStore.personalFM.list.length - 1) {
          musicStore.personalFM.playIndex++;
        } else {
          // 注释已清理
          await fetchFM();
        }
      }
    } catch (error) {
      console.error("操作失败", error);
    }
  }

  public async personalFMTrash(id: number, onSuccess?: () => void) {
    if (!isLogin()) {
      openUserLogin(true);
      return;
    }
    const statusStore = useStatusStore();
    statusStore.personalFmMode = true;
    try {
      await personalFmToTrash(id);
      window.$message.success("操作成功");
      onSuccess?.();
    } catch (error) {
      window.$message.error("操作失败");
      console.error("操作失败", error);
    }
  }

  public async refreshPersonalFM() {
    const musicStore = useMusicStore();
    if (!isLogin()) {
      window.$message.error("操作失败");
      return;
    }
    try {
      const res = await personalFm();
      const newList = formatSongsList(res.data);
      if (!newList || newList.length === 0) {
        throw new Error("私人 FM 暂无可用歌曲");
      }
      musicStore.personalFM.list = newList;
      musicStore.personalFM.playIndex = 0;
      window.$message.success("操作成功");
    } catch (error) {
      console.error("操作失败", error);
      window.$message.error("操作失败");
    }
  }
}

let instance: SongManager | null = null;

export const useSongManager = (): SongManager => {
  if (!instance) instance = new SongManager();
  return instance;
};
