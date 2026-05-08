import { toRaw } from "vue";
import { AudioErrorCode, type AudioErrorDetail } from "@/core/audio-player/BaseAudioPlayer";
import { useDataStore, useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import type { AudioSourceType, QualityType, SongType } from "@/types/main";
import type { RepeatModeType, ShuffleModeType } from "@/types/shared/play-mode";
import { type AudioAnalysis } from "@/types/audio/automix";
import { calculateLyricIndex } from "@/utils/calc";
import { getCoverColor } from "@/utils/color";
import { isAndroidApp, isElectron, isMac } from "@/utils/env";
import { getPlayerInfoObj, getPlaySongData } from "@/utils/format";
import { handleSongQuality, shuffleArray, sleep } from "@/utils/helper";
import lastfmScrobbler from "@/utils/lastfmScrobbler";
import { DJ_MODE_KEYWORDS } from "@/utils/meta";
import { calculateProgress } from "@/utils/time";
import type { LyricLine } from "@applemusic-like-lyrics/lyric";
import { type DebouncedFunc, throttle } from "lodash-es";
import { useBlobURLManager } from "../resource/BlobURLManager";
import { useAudioManager } from "./AudioManager";
import { useAutomixManager } from "@/core/automix/AutomixManager";
import { recordAndroidPerformanceEvent } from "@/platform/android/performance";
import { useLyricManager } from "./LyricManager";
import { mediaSessionManager } from "./MediaSessionManager";
import * as playerIpc from "./PlayerIpc";
import { PlayModeManager } from "./PlayModeManager";
import { useSongManager } from "./SongManager";

class PlayerController {
  private autoCloseInterval: ReturnType<typeof setInterval> | undefined;

  private readonly MAX_RETRY_COUNT = 3;

  private retryInfo: { songId: number | string; count: number } = { songId: 0, count: 0 };

  public currentRequestToken = 0;

  private failSkipCount = 0;
  /** 防止播放结束重复触发切歌 */
  private isHandlingPlaybackEnded = false;
  /** 记录 Android 最近一次结束事件 */
  private lastPlaybackEndedAt = 0;

  public isTransitioning = false;

  private playModeManager = new PlayModeManager();

  private onTimeUpdate: DebouncedFunc<() => void> | null = null;

  private lastErrorTime = 0;

  public currentAnalysis: AudioAnalysis | null = null;
  public currentAnalysisKey: string | null = null;
  public currentAnalysisKind: "none" | "head" | "full" = "none";
  public currentAudioSource: {
    url: string;
    quality: QualityType | undefined;
    source: AudioSourceType | undefined;
  } | null = null;

  private rateResetTimer: ReturnType<typeof setTimeout> | undefined;

  private rateRampFrame: number | undefined;

  constructor() {
    // 注释已清理
    const audioManager = useAudioManager();
    const settingStore = useSettingStore();
    // 注释已清理
    if (settingStore.playDevice) {
      audioManager.setSinkId(settingStore.playDevice).catch(console.warn);
    }
    // 注释已清理
    this.bindAudioEvents();
  }

  public applyReplayGain(songOverride?: SongType, apply: boolean = true): number {
    const musicStore = useMusicStore();
    const settingStore = useSettingStore();
    const audioManager = useAudioManager();
    const automixManager = useAutomixManager();
    if (!settingStore.enableReplayGain) {
      if (apply) audioManager.setReplayGain(1);
      return 1;
    }
    const song = songOverride || musicStore.playSong;
    if (!song || !song.replayGain) {
      if (apply) audioManager.setReplayGain(1);
      return 1;
    }
    const { trackGain, albumGain, trackPeak, albumPeak } = song.replayGain;
    let targetGain = 1;
    // 注释已清理
    if (settingStore.replayGainMode === "album") {
      targetGain = albumGain ?? trackGain ?? 1;
    } else {
      targetGain = trackGain ?? albumGain ?? 1;
    }
    // 注释已清理
    const peak =
      settingStore.replayGainMode === "album" ? (albumPeak ?? trackPeak) : (trackPeak ?? albumPeak);
    // 注释已清理
    targetGain *= automixManager.automixGain;
    if (peak && peak > 0) {
      if (targetGain * peak > 1.0) {
        targetGain = 1.0 / peak;
      }
    }
    console.log("[PlayerController] 播放状态已更新");
    if (apply) audioManager.setReplayGain(targetGain);
    return targetGain;
  }

  public async prepareAudioSource(
    song: SongType,
    requestToken: number,
    options?: { forceCacheForOnline?: boolean; analysis?: "none" | "head" | "full" },
  ): Promise<{
    audioSource: {
      url: string;
      quality: QualityType | undefined;
      source: AudioSourceType | undefined;
    };
    analysis: AudioAnalysis | null;
    analysisKind: "none" | "head" | "full";
  }> {
    const songManager = useSongManager();
    const automixManager = useAutomixManager();
    const settingStore = useSettingStore();
    const audioSource = await songManager.getAudioSource(song);
    // 注释已清理
    if (requestToken !== this.currentRequestToken) {
      throw new Error("EXPIRED");
    }
    if (!audioSource.url) throw new Error("AUDIO_SOURCE_EMPTY");
    // 注释已清理
    const safeAudioSource = {
      ...audioSource,
      url: audioSource.url!,
      quality: audioSource.quality,
      source: audioSource.source,
    };
    // 注释已清理
    let analysis: AudioAnalysis | null = null;
    let analysisKind: "none" | "head" | "full" = "none";
    if (settingStore.enableAutomix) {
      if (options?.forceCacheForOnline) {
        safeAudioSource.url = await automixManager.ensureAutomixAudioSource(
          song,
          safeAudioSource.url,
          safeAudioSource.quality,
        );
        if (requestToken !== this.currentRequestToken) throw new Error("EXPIRED");
      }
      this.currentAudioSource = safeAudioSource;
      // 注释已清理
      const analysisKey = song.path || automixManager.fileUrlToPath(safeAudioSource.url);
      this.currentAnalysisKey = analysisKey;
      const analysisMode = options?.analysis ?? "full";
      const result = await automixManager.fetchAudioAnalysis(analysisKey, analysisMode);
      analysis = result.analysis;
      analysisKind = result.analysisKind;

      if (requestToken !== this.currentRequestToken) throw new Error("EXPIRED");
    } else {
      this.currentAudioSource = safeAudioSource;
    }
    return { audioSource: safeAudioSource, analysis, analysisKind };
  }

  public setupSongUI(song: SongType, startSeek: number) {
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    const lyricManager = useLyricManager();

    musicStore.playSong = song;
    statusStore.currentTime = startSeek;

    statusStore.progress = 0;
    statusStore.lyricIndex = -1;
    // 注释已清理
    const sid = song.type === "radio" ? song.dj?.id : song.id;
    if (this.retryInfo.songId !== sid) {
      this.retryInfo = { songId: sid || 0, count: 0 };
    }
    statusStore.lyricLoading = true;
    // 注释已清理
    statusStore.abLoop.enable = false;
    statusStore.abLoop.pointA = null;
    statusStore.abLoop.pointB = null;
    // 注释已清理
    if (isElectron) {
      window.electron.ipcRenderer.send("desktop-lyric:update-data", {
        lyricLoading: true,
      });
    }
    // 注释已清理
    const { name, artist, album } = getPlayerInfoObj(song) || {};
    const coverUrl = song.coverSize?.s || song.cover || "";
    playerIpc.sendTaskbarMetadata({
      title: name || "",
      artist: artist || "",
      cover: coverUrl,
    });

    if (isElectron) {
      const playTitle = `${name} - ${artist}`;
      playerIpc.sendSongChange(playTitle, name || "", artist || "", album || "");
      if (isMac) {
        playerIpc.sendMacStatusBarProgress({
          currentTime: startSeek,
          duration: song.duration,
          offset: statusStore.getSongOffset(song.id),
        });
      }
    }

    lyricManager.handleLyric(song);
  }

  private shouldKeepAndroidNativeSessionDuringTransition(
    audioManager: ReturnType<typeof useAudioManager>,
  ): boolean {
    return isAndroidApp && audioManager.engineType === "android-native" && !!audioManager.src;
  }

  public async playSong(
    options: {
      autoPlay?: boolean;
      seek?: number;
      crossfade?: boolean;
      crossfadeDuration?: number;
      song?: SongType;
    } = { autoPlay: true, seek: 0 },
  ) {
    const statusStore = useStatusStore();
    const audioManager = useAudioManager();
    // 注释已清理
    this.isTransitioning = false;
    useAutomixManager().resetNextAnalysisCache();
    this.currentAnalysisKey = null;
    this.currentAudioSource = null;

    this.currentRequestToken++;
    const requestToken = this.currentRequestToken;
    const { autoPlay = true, seek = 0 } = options;
    // 注释已清理
    const playSongData = options.song || getPlaySongData();
    if (!playSongData) {
      statusStore.playLoading = false;

      if (!statusStore.playStatus && !autoPlay) return;
      return;
    }
    // Fuck DJ Mode
    if (this.shouldSkipSong(playSongData)) {
      console.log(`[Fuck DJ] Skipping: ${playSongData.name}`);
      window.$message.warning(`已跳过疑似 DJ/电台曲目：${playSongData.name}`);
      this.nextOrPrev("next");
      return;
    }
    try {
      statusStore.playLoading = true;
      if (
        !options.crossfade &&
        !this.shouldKeepAndroidNativeSessionDuringTransition(audioManager)
      ) {
        audioManager.stop();
      }

      this.setupSongUI(playSongData, seek);
      const { audioSource, analysis, analysisKind } = await this.prepareAudioSource(
        playSongData,
        requestToken,
        { analysis: options.crossfade ? "head" : "none" },
      );
      if (requestToken !== this.currentRequestToken) return;

      const lastAnalysis = this.currentAnalysis;
      this.currentAnalysis = analysis;
      this.currentAnalysisKind = analysis ? analysisKind : "none";

      let startSeek = seek ?? 0;
      let initialRate = 1.0;
      const settingStore = useSettingStore();

      if (settingStore.enableAutomix) {
        const automixManager = useAutomixManager();
        const automixParams = automixManager.calculateInitialAutomixParameters(
          analysis,
          lastAnalysis,
          options,
          startSeek,
        );
        startSeek = automixParams.startSeek;
        initialRate = automixParams.initialRate;
      }
      if (requestToken !== this.currentRequestToken) return;
      // 注释已清理
      console.log("[PlayerController] 播放状态已更新", audioSource);
      statusStore.songQuality = audioSource.quality;
      statusStore.audioSource = audioSource.source;

      await this.loadAndPlay(
        audioSource.url,
        autoPlay,
        startSeek,
        options.crossfade ? { duration: options.crossfadeDuration ?? 5 } : undefined,
        initialRate,
      );
      if (requestToken !== this.currentRequestToken) return;

      await this.afterPlaySetup(playSongData);
      statusStore.playLoading = false;
    } catch (error) {
      if (requestToken === this.currentRequestToken) {
        console.error("[PlayerController] 播放器操作失败", error);
        this.handlePlaybackError(undefined);
      }
    }
  }

  async switchQuality(seek: number = 0, autoPlay?: boolean) {
    const statusStore = useStatusStore();
    const songManager = useSongManager();
    const audioManager = useAudioManager();
    const playSongData = getPlaySongData();
    if (!playSongData || playSongData.path) return;
    // 注释已清理
    const shouldAutoPlay = autoPlay ?? statusStore.playStatus;
    try {
      statusStore.playLoading = true;
      // 注释已清理
      songManager.clearPrefetch();
      // 注释已清理
      const audioSource = await songManager.getAudioSource(playSongData);
      if (!audioSource.url) {
        window.$message.error("操作失败");
        statusStore.playLoading = false;
        return;
      }
      console.log("[PlayerController] 播放状态已更新", audioSource);
      // 注释已清理
      statusStore.songQuality = audioSource.quality;
      statusStore.audioSource = audioSource.source;
      // 注释已清理
      audioManager.stop();
      // 注释已清理
      await this.loadAndPlay(audioSource.url, shouldAutoPlay, seek);
      statusStore.playLoading = false;
    } catch (error) {
      console.error("[PlayerController] 播放器操作失败", error);
      statusStore.playLoading = false;
      window.$message.error("操作失败");
    }
  }

  public async switchAudioSource(source: string) {
    const statusStore = useStatusStore();
    const songManager = useSongManager();
    const musicStore = useMusicStore();
    const audioManager = useAudioManager();
    const playSongData = musicStore.playSong;
    if (!playSongData || playSongData.path) return;
    try {
      statusStore.playLoading = true;
      // 注释已清理
      songManager.clearPrefetch();
      // 注释已清理
      const audioSource = await songManager.getAudioSource(playSongData, source);
      if (!audioSource.url) {
        window.$message.error("操作失败");
        statusStore.playLoading = false;
        return;
      }
      console.log("[PlayerController] 播放状态已更新", audioSource);
      // 注释已清理
      statusStore.songQuality = audioSource.quality;
      statusStore.audioSource = audioSource.source;
      // 注释已清理
      const seek = statusStore.currentTime;
      const shouldAutoPlay = statusStore.playStatus;
      // 注释已清理
      audioManager.stop();
      await this.loadAndPlay(audioSource.url, shouldAutoPlay, seek);
      statusStore.playLoading = false;
    } catch (error) {
      console.error("[PlayerController] 播放器操作失败", error);
      statusStore.playLoading = false;
      window.$message.error("操作失败");
    }
  }

  public async loadAndPlay(
    url: string,
    autoPlay: boolean,
    seek: number,
    crossfadeOptions?: {
      duration: number;
      uiSwitchDelay?: number;
      onSwitch?: () => void;
      deferStateSync?: boolean;
      mixType?: "default" | "bassSwap";
      replayGain?: number;
    },
    initialRate: number = 1.0,
  ) {
    const statusStore = useStatusStore();
    const settingStore = useSettingStore();
    const audioManager = useAudioManager();

    if (this.rateResetTimer) {
      clearTimeout(this.rateResetTimer);
      this.rateResetTimer = undefined;
    }
    if (this.rateRampFrame) {
      cancelAnimationFrame(this.rateRampFrame);
      this.rateRampFrame = undefined;
    }

    audioManager.setVolume(statusStore.playVolume);

    if (audioManager.capabilities.supportsRate) {
      const baseRate = statusStore.playRate;
      if (!crossfadeOptions) {
        audioManager.setRate(baseRate * initialRate);
      }
      if (initialRate !== 1.0 && crossfadeOptions) {
        this.rateResetTimer = setTimeout(() => {
          this.rampRateTo(baseRate, 2000);
        }, crossfadeOptions.duration * 1000);
      }
    }

    const replayGain =
      crossfadeOptions?.replayGain ?? this.applyReplayGain(undefined, !crossfadeOptions);

    if (audioManager.engineType !== "mpv" && !settingStore.showSpectrums) {
      this.toggleOutputDevice();
    }

    try {
      const updateSeekState = () => {
        statusStore.currentTime = seek;
        const duration = this.getDuration() || statusStore.duration;
        if (duration > 0) {
          statusStore.progress = calculateProgress(seek, duration);
        } else {
          statusStore.progress = 0;
        }
        return duration;
      };

      const shouldDeferStateSync = !!(crossfadeOptions?.deferStateSync && autoPlay);

      if (seek > 0) {
        audioManager.setPendingSeek(seek / 1000);
      }

      if (crossfadeOptions) {
        const onSwitch = crossfadeOptions.onSwitch;
        const wrappedOnSwitch = shouldDeferStateSync
          ? () => {
              onSwitch?.();
              updateSeekState();
            }
          : onSwitch;

        await audioManager.crossfadeTo(url, {
          duration: crossfadeOptions.duration,
          seek: seek / 1000,
          autoPlay,
          uiSwitchDelay: crossfadeOptions.uiSwitchDelay,
          onSwitch: wrappedOnSwitch,
          mixType: crossfadeOptions.mixType,
          rate: audioManager.capabilities.supportsRate
            ? statusStore.playRate * initialRate
            : undefined,
          replayGain,
        });
      } else {
        const fadeTime = settingStore.getFadeTime ? settingStore.getFadeTime / 1000 : 0;
        const musicStore = useMusicStore();
        const currentSong = getPlaySongData();
        const currentArtist =
          currentSong?.type === "radio"
            ? currentSong.dj?.creator || "Unknown Creator"
            : Array.isArray(currentSong?.artists)
              ? currentSong.artists.map((item) => item.name).join("/")
              : String(currentSong?.artists || "Unknown Artist");
        const currentAlbum =
          currentSong?.type === "radio"
            ? currentSong.dj?.name || "Podcast"
            : typeof currentSong?.album === "object"
              ? currentSong.album?.name || "Unknown Album"
              : String(currentSong?.album || "Unknown Album");
        const currentArtworkUri = musicStore.getSongCover("xl") || musicStore.playSong.cover || "";

        await audioManager.play(url, {
          fadeIn: !!fadeTime,
          fadeDuration: fadeTime,
          autoPlay,
          seek: seek / 1000,
          rate: audioManager.capabilities.supportsRate
            ? statusStore.playRate * initialRate
            : undefined,
          title: currentSong?.name || musicStore.playSong.name || "SPlayer-ROM-Compat",
          artist: currentArtist,
          album: currentAlbum,
          artworkUri: currentArtworkUri,
        });
      }

      const duration = !crossfadeOptions || !shouldDeferStateSync ? updateSeekState() : 0;

      if (!autoPlay) {
        statusStore.playStatus = false;
        playerIpc.sendPlayStatus(false);
        playerIpc.sendTaskbarState({ isPlaying: false });
        playerIpc.sendTaskbarMode("paused");
        if (seek > 0) {
          const safeDuration = duration || this.getDuration() || statusStore.duration;
          const progress = calculateProgress(seek, safeDuration);
          playerIpc.sendTaskbarProgress(progress);
        }
      }
    } catch (error) {
      console.error("loadAndPlay failed", error);
      throw error;
    }
  }

  private rampRateTo(targetRate: number, duration: number) {
    const audioManager = useAudioManager();
    const startRate = audioManager.getRate();
    const startTime = Date.now();

    const tick = () => {
      const now = Date.now();
      const progress = Math.min((now - startTime) / duration, 1.0);
      const current = startRate + (targetRate - startRate) * progress;
      audioManager.setRate(current);

      if (progress < 1.0) {
        this.rateRampFrame = requestAnimationFrame(tick);
      } else {
        this.rateRampFrame = undefined;
        this.rateResetTimer = undefined;
      }
    };
    this.rateRampFrame = requestAnimationFrame(tick);
  }

  public async afterPlaySetup(song: SongType) {
    const dataStore = useDataStore();
    const musicStore = useMusicStore();
    const settingStore = useSettingStore();
    const songManager = useSongManager();

    if (song.type !== "radio") dataStore.setHistory(song);

    if (!song.path || song.type === "streaming") {
      mediaSessionManager.updateMetadata();
      getCoverColor(musicStore.songCover);
    } else if (isElectron) {
      await this.parseLocalMusicInfo(song.path);
    } else if (isAndroidApp) {
      mediaSessionManager.updateMetadata();
      getCoverColor(musicStore.songCover);
    }

    if (settingStore.useNextPrefetch) songManager.prefetchNextSong();

    if (settingStore.lastfm.enabled && settingStore.isLastfmConfigured) {
      const { name, artist, album } = getPlayerInfoObj() || {};
      const durationInSeconds = song.duration > 0 ? Math.floor(song.duration / 1000) : undefined;
      lastfmScrobbler.startPlaying(name || "", artist || "", album, durationInSeconds);
    }
  }

  private async parseLocalMusicInfo(path: string) {
    try {
      const musicStore = useMusicStore();
      if (musicStore.playSong.type === "streaming") return;

      const statusStore = useStatusStore();
      const blobURLManager = useBlobURLManager();
      const oldCover = musicStore.playSong.cover;
      if (oldCover && oldCover.startsWith("blob:")) {
        blobURLManager.revokeBlobURL(musicStore.playSong.path || "");
      }

      if (!oldCover || oldCover === "/images/song.jpg?asset") {
        console.log("开始读取音乐封面");
        const coverData = await window.electron.ipcRenderer.invoke("get-music-cover", path);
        if (coverData) {
          const blobURL = blobURLManager.createBlobURL(coverData.data, coverData.format, path);
          if (blobURL) musicStore.playSong.cover = blobURL;
        } else {
          musicStore.playSong.cover = "/images/song.jpg?asset";
        }
      }

      const infoData = await window.electron.ipcRenderer.invoke("get-music-metadata", path);
      statusStore.songQuality = handleSongQuality(infoData.format?.bitrate ?? 0, "local");
      getCoverColor(musicStore.playSong.cover);
      mediaSessionManager.updateMetadata();

      const { name, artist } = getPlayerInfoObj() || {};
      playerIpc.sendTaskbarMetadata({
        title: name || "",
        artist: artist || "",
        cover: musicStore.playSong.cover || "",
      });
    } catch (error) {
      console.error("操作失败", error);
    }
  }
  /** 刷新播放进度 */
  private getTimeUpdateThrottleWait(): number {
    if (isAndroidApp) return 1000;
    return 200;
  }

  private bindAudioEvents() {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    const musicStore = useMusicStore();
    const settingStore = useSettingStore();

    const audioManager = useAudioManager();

    // 注释已清理
    audioManager.addEventListener("loadstart", () => {
      statusStore.playLoading = true;
    });

    // 注释已清理
    audioManager.addEventListener("canplay", () => {
      const playSongData = getPlaySongData();

      statusStore.playLoading = false;

      if (isElectron && statusStore.eqEnabled) {
        const bands = statusStore.eqBands;
        if (bands && bands.length === 10) {
          bands.forEach((val, idx) => audioManager.setFilterGain(idx, val));
        }
      }
      if (isElectron) {
        // 注释已清理
        playerIpc.sendLikeStatus(dataStore.isLikeSong(playSongData?.id || 0));

        const { name, artist, album } = getPlayerInfoObj() || {};
        const playTitle = `${name} - ${artist}`;
        playerIpc.sendSongChange(playTitle, name || "", artist || "", album || "");
      }
    });
    // 注释已清理
    audioManager.addEventListener("play", () => {
      const { name, artist } = getPlayerInfoObj() || {};
      const playTitle = `${name} - ${artist}`;
      // 注释已清理
      statusStore.playStatus = true;
      if (!isAndroidApp) {
        playerIpc.sendMediaPlayState("Playing");
        mediaSessionManager.updatePlaybackStatus(true);
        playerIpc.sendPlayStatus(true);
        playerIpc.sendTaskbarState({ isPlaying: true });
        playerIpc.sendTaskbarMode("normal");
        playerIpc.sendTaskbarProgress(statusStore.progress);
        console.log("开始读取音乐封面");
      }
      window.document.title = `${playTitle} | SPlayer-ROM-Compat`;
      // 重置失败跳过计数
      if (this.retryInfo.count > 0) this.retryInfo.count = 0;
      // Last.fm Scrobbler
      lastfmScrobbler.resume();
    });
    // 注释已清理
    audioManager.addEventListener("pause", () => {
      statusStore.playStatus = false;
      if (!(isAndroidApp && settingStore.androidPerformanceMode)) {
        useAutomixManager().resetAutomixScheduling("IDLE");
      }
      if (!isAndroidApp) {
        playerIpc.sendMediaPlayState("Paused");
        mediaSessionManager.updatePlaybackStatus(false);
        playerIpc.sendPlayStatus(false);
        playerIpc.sendTaskbarState({ isPlaying: false });
        playerIpc.sendTaskbarMode("paused");
        playerIpc.sendTaskbarProgress(statusStore.progress);
        console.log("播放暂停");
      }
      if (!isElectron) window.document.title = "SPlayer-ROM-Compat";
      lastfmScrobbler.pause();
    });
    // 注释已清理
    audioManager.addEventListener("seeking", () => {
      if (!(isAndroidApp && settingStore.androidPerformanceMode)) {
        useAutomixManager().resetAutomixScheduling("MONITORING");
      }
    });

    audioManager.addEventListener("ended", () => {
      void this.handlePlaybackEnded();
    });

    this.onTimeUpdate = throttle(() => {
      // 注释已清理
      recordAndroidPerformanceEvent("player:timeupdate");
      const { enable, pointA, pointB } = statusStore.abLoop;
      if (enable && pointA !== null && pointB !== null) {
        if (audioManager.currentTime >= pointB) {
          audioManager.seek(pointA);
        }
      }
      const rawTime = audioManager.currentTime;
      const currentTime = Math.floor(rawTime * 1000);
      const duration = Math.floor(audioManager.duration * 1000) || statusStore.duration;
      if (!(isAndroidApp && settingStore.androidPerformanceMode)) {
        useAutomixManager().updateAutomixMonitoring();
      }
      // 注释已清理
      const songId = musicStore.playSong?.id;
      const offset = statusStore.getSongOffset(songId);
      const useLiteLyrics = !!(
        isAndroidApp &&
        settingStore.androidPerformanceMode &&
        settingStore.androidLowFrequencyLyrics &&
        musicStore.songLyric.lrcData?.length
      );
      const useYrc = !!(
        settingStore.showWordLyrics &&
        musicStore.songLyric.yrcData?.length &&
        !useLiteLyrics
      );
      let rawLyrics: LyricLine[] = [];
      if (useYrc) {
        rawLyrics = toRaw(musicStore.songLyric.yrcData);
      } else {
        rawLyrics = toRaw(musicStore.songLyric.lrcData);
      }
      const lyricIndex = calculateLyricIndex(currentTime, rawLyrics, offset);
      // 注释已清理
      statusStore.$patch({
        currentTime,
        duration,
        progress: calculateProgress(currentTime, duration),
        lyricIndex,
      });
      // 注释已清理
      if (currentTime > 500 && this.failSkipCount > 0) {
        this.failSkipCount = 0;
      }

      if (!isAndroidApp) {
        mediaSessionManager.updateState(duration, currentTime);
      }
      if (!isAndroidApp) {
        // 注释已清理
        playerIpc.sendLyric({
          currentTime,
          songId: musicStore.playSong?.id,
          songOffset: statusStore.getSongOffset(musicStore.playSong?.id),
        });
        // 注释已清理
        if (settingStore.showTaskbarProgress) {
          playerIpc.sendTaskbarProgress(statusStore.progress);
        } else {
          playerIpc.sendTaskbarProgress("none");
        }
        // 注释已清理
        playerIpc.sendTaskbarProgressData({
          currentTime,
          duration,
          offset,
        });
        // 注释已清理
        if (isMac) {
          playerIpc.sendMacStatusBarProgress({
            currentTime,
            duration,
            offset,
          });
        }
        // 注释已清理
        playerIpc.sendSocketProgress(currentTime, duration);
      }
    }, this.getTimeUpdateThrottleWait());
    audioManager.addEventListener("timeupdate", this.onTimeUpdate);

    audioManager.addEventListener("error", (e) => {
      const detail = (e as CustomEvent<AudioErrorDetail>).detail;
      this.handlePlaybackError(detail, this.getSeek());
    });
  }

  /** 处理播放结束后的自动切歌 */
  private async handlePlaybackEnded() {
    const now = Date.now();
    if (this.isTransitioning || this.isHandlingPlaybackEnded) return;
    if (isAndroidApp && now - this.lastPlaybackEndedAt < 3000) return;
    this.lastPlaybackEndedAt = now;
    this.isHandlingPlaybackEnded = true;
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    const settingStore = useSettingStore();
    try {
      if (!(isAndroidApp && settingStore.androidPerformanceMode)) {
        useAutomixManager().resetAutomixScheduling("IDLE");
      }
      if (!isAndroidApp) console.log("播放结束");
      lastfmScrobbler.stop();
      if (this.checkAutoClose()) return;
      if (isAndroidApp) {
        statusStore.playLoading = true;
        if (!statusStore.personalFmMode && dataStore.playList.length === 0) {
          statusStore.playLoading = false;
          statusStore.playStatus = false;
          return;
        }
        await sleep(120);
      }
      await this.nextOrPrev("next", true, true);
    } catch (error) {
      statusStore.playLoading = false;
      console.error("处理播放结束失败", error);
    } finally {
      window.setTimeout(
        () => {
          this.isHandlingPlaybackEnded = false;
        },
        isAndroidApp ? 1800 : 0,
      );
    }
  }

  private normalizePlaybackError(detail?: AudioErrorDetail) {
    const errorCode = typeof detail?.errorCode === "number" ? detail.errorCode : undefined;
    const errorCodeName =
      typeof detail?.errorCodeName === "string" ? detail.errorCodeName.trim() : "";
    const messageParts = [
      typeof detail?.message === "string" ? detail.message.trim() : "",
      typeof detail?.causeMessage === "string" ? detail.causeMessage.trim() : "",
      errorCodeName,
    ].filter(Boolean);
    const uniqueMessageParts = [...new Set(messageParts)];

    return {
      errorCode,
      displayMessage: this.resolvePlaybackDisplayMessage(
        errorCode,
        errorCodeName,
        uniqueMessageParts,
      ),
      debugMessage: uniqueMessageParts.join(" | "),
    };
  }

  private resolvePlaybackDisplayMessage(
    errorCode: number | undefined,
    errorCodeName: string,
    rawMessages: string[],
  ) {
    const safeMessage = rawMessages
      .map((message) => this.normalizeRawPlaybackMessage(message))
      .find(Boolean);

    if (errorCode === AudioErrorCode.ABORTED || errorCode === AudioErrorCode.DOM_ABORT) {
      return "";
    }

    if (
      errorCode === AudioErrorCode.NETWORK ||
      errorCodeName.startsWith("ERROR_CODE_IO_") ||
      errorCodeName === "ERROR_CODE_TIMEOUT"
    ) {
      return safeMessage || "网络异常，暂时无法获取可播放音源";
    }

    if (
      errorCode === AudioErrorCode.DECODE ||
      errorCodeName.startsWith("ERROR_CODE_DECODING_") ||
      errorCodeName.startsWith("ERROR_CODE_PARSING_")
    ) {
      return safeMessage || "音源解析失败，暂时无法播放";
    }

    if (
      errorCode === AudioErrorCode.SRC_NOT_SUPPORTED ||
      errorCodeName == "ERROR_CODE_UNSPECIFIED"
    ) {
      return safeMessage || "当前音源暂不支持播放";
    }

    return safeMessage || "播放出现异常";
  }

  private normalizeRawPlaybackMessage(message: string) {
    const text = message.replace(/\s+/g, " ").trim();
    if (!text) return "";
    if (text.length > 80) return "";
    if (/^ERROR_CODE_/i.test(text)) return "";
    if (this.looksLikeGarbledPlaybackMessage(text)) return "";

    if (
      /song url unavailable|remote api root missing|android local api failed|remote api proxy failed/i.test(
        text,
      )
    ) {
      return "未获取到可播放音源";
    }

    if (
      /timed out|timeout|Unable to connect|Connection refused|No route to host|Network is unreachable|Unable to resolve host|Network Error/i.test(
        text,
      )
    ) {
      return "网络异常，无法连接音源服务";
    }

    if (
      /Source error|ParserException|Unrecognized input format|Malformed|Decoding|Decoder/i.test(
        text,
      )
    ) {
      return "音源解析失败，当前音源暂不可用";
    }

    return text;
  }

  private looksLikeGarbledPlaybackMessage(text: string) {
    const replacementCount = (text.match(/�/g) || []).length;
    const mojibakeCount = (text.match(/[闂閻閹閼缂缁濞鍙鍔鐎顑鈺鎾]/g) || []).length;
    return replacementCount >= 1 || mojibakeCount >= 3;
  }

  private buildPlaybackRetryMessage(retryCount: number, maxRetryCount: number, message?: string) {
    const retryText = `播放异常，正在重试 ${retryCount}/${maxRetryCount}`;
    return message ? `${retryText}：${message}` : retryText;
  }

  private async handlePlaybackError(detail: AudioErrorDetail | undefined, currentSeek: number = 0) {
    const now = Date.now();
    if (now - this.lastErrorTime < 200) return;
    this.lastErrorTime = now;
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    const songManager = useSongManager();
    songManager.clearPrefetch();
    const currentSongId = musicStore.playSong?.id || 0;
    if (this.retryInfo.songId !== currentSongId) {
      this.retryInfo = { songId: currentSongId, count: 0 };
    }

    const { errorCode, displayMessage, debugMessage } = this.normalizePlaybackError(detail);
    if (debugMessage) {
      console.warn(`[Player] 播放异常详情: ${debugMessage}`);
    }
    if (detail?.rawDetail) {
      console.warn("[Player] 原生错误原始详情:", detail.rawDetail);
    }

    const absoluteMaxRetry = 3;
    if (this.retryInfo.count >= absoluteMaxRetry) {
      const finalMessage = displayMessage || "当前歌曲播放失败，已自动切换下一首";
      console.error(`[Player] ${finalMessage}`);
      window.$message.error(finalMessage);
      statusStore.playLoading = false;
      this.retryInfo.count = 0;
      await this.skipToNextWithDelay();
      return;
    }

    if (errorCode === AudioErrorCode.ABORTED || errorCode === AudioErrorCode.DOM_ABORT) {
      this.retryInfo.count = 0;
      return;
    }

    if (errorCode === AudioErrorCode.SRC_NOT_SUPPORTED || errorCode === 9) {
      const unsupportedMessage = displayMessage || "当前音源暂不支持播放，已自动切换下一首";
      console.warn(`[Player] ${unsupportedMessage}`);
      window.$message.error(unsupportedMessage);
      statusStore.playLoading = false;
      this.retryInfo.count = 0;
      await this.skipToNextWithDelay();
      return;
    }

    if (musicStore.playSong.path && musicStore.playSong.type !== "streaming") {
      console.error("[Player] 本地音频文件不可用");
      window.$message.error("本地音频文件不可用，已自动切换下一首");
      statusStore.playLoading = false;
      this.retryInfo.count = 0;
      await this.skipToNextWithDelay();
      return;
    }

    this.retryInfo.count++;
    console.warn(
      `[Player] 播放异常(Code: ${errorCode ?? "unknown"})，正在重试 ${this.retryInfo.count}/${this.MAX_RETRY_COUNT}`,
    );

    if (this.retryInfo.count <= this.MAX_RETRY_COUNT) {
      await sleep(1000);
      if (this.retryInfo.count === 1) {
        statusStore.playLoading = true;
        window.$message.warning(
          this.buildPlaybackRetryMessage(
            this.retryInfo.count,
            this.MAX_RETRY_COUNT,
            displayMessage,
          ),
        );
      }
      await this.playSong({ autoPlay: true, seek: currentSeek });
      return;
    }

    const finalMessage = displayMessage || "播放失败，已自动切换下一首";
    console.error(`[Player] ${finalMessage}`);
    this.retryInfo.count = 0;
    window.$message.error(finalMessage);
    await this.skipToNextWithDelay();
  }

  private async skipToNextWithDelay() {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    this.failSkipCount++;

    if (this.failSkipCount >= 3) {
      window.$message.error("操作失败");
      statusStore.playLoading = false;
      this.pause(true);
      this.failSkipCount = 0;
      return;
    }

    if (dataStore.playList.length <= 1) {
      window.$message.error("操作失败");
      this.cleanPlayList();
      this.failSkipCount = 0;
      return;
    }
    // 注释已清理
    await sleep(500);
    await this.nextOrPrev("next");
  }

  async play() {
    const statusStore = useStatusStore();
    const settingStore = useSettingStore();
    const audioManager = useAudioManager();

    if (statusStore.playStatus) return;
    // 注释已清理
    audioManager.clearForcePaused();
    // 注释已清理
    if (!audioManager.src) {
      await this.playSong({
        autoPlay: true,
        seek: statusStore.currentTime,
      });
      return;
    }

    if (!audioManager.paused) {
      statusStore.playStatus = true;
      return;
    }
    const fadeTime = settingStore.getFadeTime ? settingStore.getFadeTime / 1000 : 0;
    try {
      await audioManager.resume({ fadeIn: !!fadeTime, fadeDuration: fadeTime });
      statusStore.playStatus = true;
    } catch (error) {
      console.error("[PlayerController] 播放器操作失败", error);
      // 注释已清理
      if (error instanceof Error && error.name === "AbortError") {
        await this.playSong({ autoPlay: true });
      }
    }
  }

  async pause(changeStatus: boolean = true) {
    const statusStore = useStatusStore();
    const settingStore = useSettingStore();
    const audioManager = useAudioManager();
    // 注释已清理
    const fadeTime = settingStore.getFadeTime ? settingStore.getFadeTime / 1000 : 0;
    audioManager.pause({ fadeOut: !!fadeTime, fadeDuration: fadeTime });

    if (changeStatus) statusStore.playStatus = false;
  }

  async playOrPause() {
    const statusStore = useStatusStore();
    if (statusStore.playStatus) await this.pause();
    else await this.play();
  }

  public async nextOrPrev(
    type: "next" | "prev" = "next",
    play: boolean = true,
    autoEnd: boolean = false,
  ) {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    const songManager = useSongManager();
    // 注释已清理
    const audioManager = useAudioManager();
    // 注释已清理
    statusStore.playLoading = true;

    if (statusStore.personalFmMode) {
      await songManager.initPersonalFM(true);
      await this.playSong({ autoPlay: play });
      return;
    }
    // 注释已清理
    const playListLength = dataStore.playList.length;
    if (playListLength === 0) {
      audioManager.stop();
      statusStore.playLoading = false;
      statusStore.playStatus = false;
      window.$message.error("播放列表为空");
      return;
    }

    if (statusStore.repeatMode === "one" && autoEnd) {
      await this.playSong({ autoPlay: play, seek: 0 });
      return;
    }

    let nextIndex = statusStore.playIndex;
    let attempts = 0;
    const maxAttempts = playListLength;

    while (attempts < maxAttempts) {
      nextIndex += type === "next" ? 1 : -1;

      if (nextIndex >= playListLength) nextIndex = 0;
      if (nextIndex < 0) nextIndex = playListLength - 1;
      const nextSong = dataStore.playList[nextIndex];
      if (!this.shouldSkipSong(nextSong)) {
        break;
      }
      attempts++;
    }
    if (attempts >= maxAttempts) {
      window.$message.warning("请检查当前操作");
      audioManager.stop();
      statusStore.playLoading = false;
      statusStore.playStatus = false;
      return;
    }
    // 注释已清理
    statusStore.playIndex = nextIndex;
    await this.playSong({ autoPlay: play });
  }

  public getDuration(): number {
    const statusStore = useStatusStore();
    const audioManager = useAudioManager();
    const duration = audioManager.duration;
    return duration > 0 ? Math.floor(duration * 1000) : statusStore.duration;
  }

  public getSeek(): number {
    const statusStore = useStatusStore();
    const audioManager = useAudioManager();
    // 注释已清理
    const currentTime = audioManager.currentTime;
    return currentTime > 0 ? Math.floor(currentTime * 1000) : statusStore.currentTime;
  }

  public setSeek(time: number) {
    if (this.onTimeUpdate) {
      this.onTimeUpdate.cancel();
    }
    const statusStore = useStatusStore();
    const audioManager = useAudioManager();
    const safeTime = Math.max(0, Math.min(time, this.getDuration()));
    audioManager.seek(safeTime / 1000);
    statusStore.currentTime = safeTime;
    if (!isAndroidApp) {
      mediaSessionManager.updateState(this.getDuration(), safeTime, true);
    }
  }

  public seekBy(delta: number) {
    const currentTime = this.getSeek();
    this.setSeek(currentTime + delta);
  }

  public setVolume(actions: number | "up" | "down" | WheelEvent) {
    const statusStore = useStatusStore();
    const audioManager = useAudioManager();
    // 注释已清理
    const increment = 0.05;
    // 注释已清理
    if (typeof actions === "number") {
      actions = Math.max(0, Math.min(actions, 1));
      statusStore.playVolume = actions;
    } else if (actions === "up" || actions === "down") {
      statusStore.playVolume = Math.max(
        0,
        Math.min(statusStore.playVolume + (actions === "up" ? increment : -increment), 1),
      );
    } else {
      const deltaY = actions.deltaY;
      const volumeChange = deltaY > 0 ? -increment : increment;
      statusStore.playVolume = Math.max(0, Math.min(statusStore.playVolume + volumeChange, 1));
    }
    audioManager.setVolume(statusStore.playVolume);
    mediaSessionManager.updateVolume(statusStore.playVolume);
  }

  public toggleMute() {
    const statusStore = useStatusStore();
    const audioManager = useAudioManager();

    const isMuted = statusStore.playVolume === 0;
    if (isMuted) {
      statusStore.playVolume = statusStore.playVolumeMute;
    } else {
      statusStore.playVolumeMute = statusStore.playVolume;
      statusStore.playVolume = 0;
    }
    audioManager.setVolume(statusStore.playVolume);
  }

  public setRate(rate: number) {
    const statusStore = useStatusStore();
    const audioManager = useAudioManager();
    if (!Number.isFinite(rate)) {
      console.warn("[PlayerController] 播放器操作失败", rate);
      return;
    }
    if (!audioManager.capabilities.supportsRate) {
      console.warn("操作警告");
      return;
    }
    const safeRate = Math.max(0.2, Math.min(rate, 2.0));
    statusStore.playRate = safeRate;
    audioManager.setRate(safeRate);
    mediaSessionManager.updatePlaybackRate(safeRate);
  }

  public shouldSkipSong(song: SongType): boolean {
    const settingStore = useSettingStore();
    if (!settingStore.disableDjMode) return false;
    // 注释已清理
    const name = (song.name || "").toUpperCase();
    const alia = song.alia;
    const aliaStr = (Array.isArray(alia) ? alia.join("") : alia || "").toUpperCase();
    const fullText = name + aliaStr;
    return DJ_MODE_KEYWORDS.some((k) => fullText.includes(k.toUpperCase()));
  }

  public async updatePlayList(
    data: SongType[],
    song?: SongType,
    pid?: number,
    options: {
      showTip?: boolean;
      play?: boolean;
      keepHeartbeatMode?: boolean;
    } = { showTip: true, play: true },
  ) {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    const musicStore = useMusicStore();
    if (!data || !data.length) return;

    let processedData = [...data];
    if (statusStore.shuffleMode === "on") {
      await dataStore.setOriginalPlayList([...data]);
      processedData = shuffleArray(processedData);
    }
    // 注释已清理
    await dataStore.setPlayList(processedData);

    if (!options.keepHeartbeatMode && statusStore.shuffleMode === "heartbeat") {
      statusStore.shuffleMode = "off";
    }
    if (statusStore.personalFmMode) statusStore.personalFmMode = false;
    // 注释已清理
    if (song && song.id) {
      const newIndex = processedData.findIndex((s) => s.id === song.id);
      if (musicStore.playSong.id === song.id) {
        if (newIndex !== -1) statusStore.playIndex = newIndex;
        // 注释已清理
        if (options.play) await this.play();
      } else {
        // 注释已清理
        statusStore.playLoading = true;
        statusStore.playIndex = newIndex;
        await this.playSong({ autoPlay: options.play });
      }
    } else {
      // 注释已清理
      statusStore.playLoading = true;
      statusStore.playIndex = 0;
      await this.playSong({ autoPlay: options.play });
    }
    musicStore.playPlaylistId = pid ?? 0;
    if (options.showTip) window.$message.success("播放列表已更新");
  }

  public async cleanPlayList() {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    const musicStore = useMusicStore();
    const audioManager = useAudioManager();
    // 注释已清理
    audioManager.stop();
    statusStore.resetPlayStatus();
    musicStore.resetMusicData();
    // 注释已清理
    await dataStore.setPlayList([]);
    await dataStore.clearOriginalPlayList();
    if (!isAndroidApp) {
      playerIpc.sendTaskbarProgress("none");
    }
  }

  public async addNextSong(song: SongType, play: boolean = false) {
    const dataStore = useDataStore();
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    const wasPersonalFm = statusStore.personalFmMode;

    if (statusStore.personalFmMode) statusStore.personalFmMode = false;
    if (!wasPersonalFm && musicStore.playSong.id === song.id) {
      await this.play();
      window.$message.success("操作成功");
      return;
    }

    const currentSongId = musicStore.playSong.id;
    const songIndex = await dataStore.setNextPlaySong(song, statusStore.playIndex);

    const newCurrentIndex = dataStore.playList.findIndex((s) => s.id === currentSongId);
    if (newCurrentIndex !== -1 && newCurrentIndex !== statusStore.playIndex) {
      statusStore.playIndex = newCurrentIndex;
    }

    if (songIndex < 0) return;
    if (play) {
      await this.togglePlayIndex(songIndex, true);
    } else {
      window.$message.success("操作成功");
    }
  }

  public async togglePlayIndex(index: number, play: boolean = false) {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    const audioManager = useAudioManager();

    try {
      const { playList } = dataStore;
      // 注释已清理
      if (index >= playList.length) return;
      // 注释已清理
      if (!this.shouldKeepAndroidNativeSessionDuringTransition(audioManager)) {
        audioManager.stop();
      }
      // 注释已清理
      if (statusStore.playIndex === index) {
        if (play) await this.play();
        return;
      }
      // 注释已清理
      statusStore.playIndex = index;
      // 注释已清理
      statusStore.currentTime = 0;
      statusStore.progress = 0;
      statusStore.lyricIndex = -1;
      await this.playSong({ autoPlay: play });
    } catch (error) {
      console.error("Error in togglePlayIndex:", error);
      statusStore.playLoading = false;
      throw error;
    }
  }

  public removeSongIndex(index: number) {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();

    const { playList } = dataStore;
    // 注释已清理
    if (index >= playList.length) return;
    // 注释已清理
    if (playList.length === 1) {
      this.cleanPlayList();
      return;
    }
    // 注释已清理
    const isCurrentPlay = statusStore.playIndex === index;
    // 注释已清理
    if (index === playList.length - 1) {
      statusStore.playIndex = 0;
    } else if (statusStore.playIndex > index) {
      statusStore.playIndex--;
    }
    // 注释已清理
    const newPlaylist = [...playList];
    newPlaylist.splice(index, 1);
    dataStore.setPlayList(newPlaylist);
    // 注释已清理
    if (isCurrentPlay) {
      this.playSong({ autoPlay: statusStore.playStatus });
    }
  }

  public async moveSong(fromIndex: number, toIndex: number) {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    // 注释已清理
    if (fromIndex === toIndex) return;
    // 注释已清理
    if (fromIndex < 0 || fromIndex >= dataStore.playList.length) return;
    if (toIndex < 0 || toIndex >= dataStore.playList.length) return;
    // 注释已清理
    const list = [...dataStore.playList];
    const [movedSong] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, movedSong);

    let newPlayIndex = statusStore.playIndex;
    if (statusStore.playIndex === fromIndex) {
      newPlayIndex = toIndex;
    } else if (fromIndex < statusStore.playIndex && toIndex >= statusStore.playIndex) {
      newPlayIndex--;
    } else if (fromIndex > statusStore.playIndex && toIndex <= statusStore.playIndex) {
      newPlayIndex++;
    }
    // 注释已清理
    statusStore.playIndex = newPlayIndex;
    // 注释已清理
    await dataStore.setPlayList(list);
    // 注释已清理
    if (statusStore.shuffleMode === "off") {
      await dataStore.setOriginalPlayList([...list]);
    }
  }

  public startAutoCloseTimer(time: number, remainTime: number) {
    const statusStore = useStatusStore();
    if (!time || !remainTime) return;
    // 注释已清理
    if (this.autoCloseInterval) {
      clearInterval(this.autoCloseInterval);
    }
    // 注释已清理
    const endTime = Date.now() + remainTime * 1000;
    statusStore.autoClose.enable = true;
    statusStore.autoClose.time = time;
    statusStore.autoClose.endTime = endTime;
    statusStore.autoClose.remainTime = remainTime;
    // 注释已清理
    this.autoCloseInterval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((statusStore.autoClose.endTime - now) / 1000));
      statusStore.autoClose.remainTime = remaining;

      if (remaining <= 0) {
        clearInterval(this.autoCloseInterval);
        if (!statusStore.autoClose.waitSongEnd) {
          this.pause();
          statusStore.autoClose.enable = false;
          statusStore.autoClose.remainTime = statusStore.autoClose.time * 60;
          statusStore.autoClose.endTime = 0;
        }
      }
    }, 1000);
  }

  private checkAutoClose(): boolean {
    const statusStore = useStatusStore();
    const { enable, waitSongEnd, remainTime } = statusStore.autoClose;
    if (enable && waitSongEnd && remainTime <= 0) {
      console.log("日志输出");
      this.pause();
      statusStore.autoClose.enable = false;

      statusStore.autoClose.remainTime = statusStore.autoClose.time * 60;
      statusStore.autoClose.endTime = 0;
      return true;
    }
    return false;
  }

  public async toggleOutputDevice(deviceId?: string) {
    const settingStore = useSettingStore();
    const audioManager = useAudioManager();
    const device = deviceId ?? settingStore.playDevice;
    await audioManager.setSinkId(device);
  }

  public toggleRepeat(mode?: RepeatModeType) {
    this.playModeManager.toggleRepeat(mode);
  }

  public async toggleShuffle(mode?: ShuffleModeType) {
    const statusStore = useStatusStore();
    const currentMode = statusStore.shuffleMode;
    // 注释已清理
    const nextMode = mode ?? this.playModeManager.calculateNextShuffleMode(currentMode);
    // 注释已清理
    if (currentMode !== nextMode) {
      await this.playModeManager.toggleShuffle(nextMode);
    }
  }

  public syncMediaPlayMode() {
    this.playModeManager.syncMediaPlayMode();
  }

  public getSpectrumData(): Uint8Array | null {
    const audioManager = useAudioManager();
    return audioManager.getFrequencyData();
  }

  public getLowFrequencyVolume(): number {
    const audioManager = useAudioManager();
    return audioManager.getLowFrequencyVolume();
  }

  public updateEq(options?: {
    bands?: number[];
    preamp?: number;
    q?: number;
    frequencies?: number[];
  }) {
    const audioManager = useAudioManager();

    if (options?.bands) {
      options.bands.forEach((val, idx) => audioManager.setFilterGain(idx, val));
    }
  }

  public disableEq() {
    const audioManager = useAudioManager();
    for (let i = 0; i < 10; i++) audioManager.setFilterGain(i, 0);
  }

  public toggleDesktopLyric() {
    const statusStore = useStatusStore();
    this.setDesktopLyricShow(!statusStore.showDesktopLyric);
  }

  public setDesktopLyricShow(show: boolean) {
    const statusStore = useStatusStore();
    if (statusStore.showDesktopLyric === show) return;
    statusStore.showDesktopLyric = show;
    playerIpc.toggleDesktopLyric(show);
    window.$message.success("操作成功");
  }

  public toggleTaskbarLyric() {
    const statusStore = useStatusStore();
    this.setTaskbarLyricShow(!statusStore.showTaskbarLyric);
  }

  public setTaskbarLyricShow(show: boolean) {
    const statusStore = useStatusStore();
    if (statusStore.showTaskbarLyric === show) return;
    statusStore.showTaskbarLyric = show;
    playerIpc.setTaskbarLyricShow(show);
    window.$message.success("操作成功");
  }

  public playModeSyncIpc() {
    this.playModeManager.playModeSyncIpc();
  }
}

const PLAYER_CONTROLLER_KEY = "__SPLAYER_PLAYER_CONTROLLER__";

export const usePlayerController = (): PlayerController => {
  const win = window as Window & { [PLAYER_CONTROLLER_KEY]?: PlayerController };
  if (!win[PLAYER_CONTROLLER_KEY]) {
    win[PLAYER_CONTROLLER_KEY] = new PlayerController();
    console.log("日志输出");
  }
  return win[PLAYER_CONTROLLER_KEY];
};
