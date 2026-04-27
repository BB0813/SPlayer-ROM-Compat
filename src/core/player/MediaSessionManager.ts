import { useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import { isAndroidApp, isElectron } from "@/utils/env";
import { getPlaySongData, normalizeImageUrl } from "@/utils/format";
import { msToS } from "@/utils/time";
import type { SystemMediaEvent } from "@emi";
import { throttle } from "lodash-es";
import { usePlayerController } from "./PlayerController";
import {
  enableDiscordRpc,
  sendMediaMetadata,
  sendMediaPlayMode,
  sendMediaPlayState,
  sendMediaPlaybackRate,
  sendMediaVolume,
  sendMediaTimeline,
  updateDiscordConfig,
} from "./PlayerIpc";

/**
 * 濯掍綋浼氳瘽绠＄悊鍣紝璐熻矗涓嶅悓骞冲彴鐨勫獟浣撴帶鍒堕泦鎴? * 鍦?Electron 骞冲彴涓婁細浣跨敤鍘熺敓鎻掍欢锛學eb 骞冲彴涓婁細浣跨敤 Navigator.mediaSession
 */
class MediaSessionManager {
  private metadataAbortController: AbortController | null = null;
  private currentRate: number = 1;

  private throttledSendTimeline = throttle((currentTime: number, duration: number) => {
    sendMediaTimeline(currentTime, duration);
  }, 200);

  /**
   * 鏄惁浣跨敤鍘熺敓濯掍綋闆嗘垚
   */
  private shouldUseNativeMedia(): boolean {
    return isElectron;
  }

  /**
   * 澶勭悊鍘熺敓鏉ョ殑濯掍綋浜嬩欢
   */
  private handleMediaEvent(
    event: SystemMediaEvent,
    player: ReturnType<typeof usePlayerController>,
  ) {
    switch (event.type) {
      case "Play":
        player.play();
        break;
      case "Pause":
        player.pause();
        sendMediaPlayState("Paused");
        break;
      case "Stop":
        player.pause();
        player.setSeek(0);
        sendMediaPlayState("Paused");
        break;
      case "NextSong":
        player.nextOrPrev("next");
        break;
      case "PreviousSong":
        player.nextOrPrev("prev");
        break;
      case "Seek":
        if (event.positionMs != null) {
          player.setSeek(event.positionMs);
        }
        break;
      case "ToggleShuffle":
        player.toggleShuffle();
        break;
      case "ToggleRepeat":
        player.toggleRepeat();
        break;
      case "SetRate":
        if (event.rate != null) {
          player.setRate(event.rate);
        }
        break;
      case "SetVolume":
        if (event.volume != null) {
          player.setVolume(event.volume);
        }
        break;
    }
  }

  /**
   * 鍒濆鍖栧獟浣撲細璇?   */
  public init() {
    if (isAndroidApp) return;

    const settingStore = useSettingStore();
    if (!settingStore.smtcOpen) return;

    const player = usePlayerController();
    const statusStore = useStatusStore();

    this.currentRate = statusStore.playRate;

    if (isElectron) {
      window.electron.ipcRenderer.removeAllListeners("media-event");
      window.electron.ipcRenderer.on("media-event", (_, event) => {
        this.handleMediaEvent(event, player);
      });

      // 注释已清理
      const shuffle = statusStore.shuffleMode !== "off";
      const repeat =
        statusStore.repeatMode === "list"
          ? "List"
          : statusStore.repeatMode === "one"
            ? "Track"
            : "None";
      sendMediaPlayMode(shuffle, repeat);
      player.syncMediaPlayMode();

      // 鍚屾鍒濆鎾斁閫熺巼
      sendMediaPlaybackRate(statusStore.playRate);

      // 注释已清理
      if (settingStore.discordRpc.enabled) {
        enableDiscordRpc();
        updateDiscordConfig({
          showWhenPaused: settingStore.discordRpc.showWhenPaused,
          displayMode: settingStore.discordRpc.displayMode,
        });
      }

      // 濡傛灉鏈夊師鐢熼泦鎴愬垯涓嶉渶瑕?Web API
      if (settingStore.smtcOpen) return;
    }

    // 注释已清理
    if ("mediaSession" in navigator) {
      const nav = navigator.mediaSession;
      nav.setActionHandler("play", () => player.play());
      nav.setActionHandler("pause", () => player.pause());
      nav.setActionHandler("previoustrack", () => player.nextOrPrev("prev"));
      nav.setActionHandler("nexttrack", () => player.nextOrPrev("next"));
      nav.setActionHandler("seekto", (e) => {
        if (e.seekTime) player.setSeek(e.seekTime * 1000);
      });
    }
  }

  /**
   * 鏇存柊鍏冩暟鎹?   */
  public async updateMetadata() {
    if (isAndroidApp) return;
    if (!("mediaSession" in navigator) && !isElectron) return;
    const musicStore = useMusicStore();
    const settingStore = useSettingStore();
    const song = getPlaySongData();
    if (!song) return;
    if (this.metadataAbortController) {
      this.metadataAbortController.abort();
    }
    this.metadataAbortController = new AbortController();
    const { signal } = this.metadataAbortController;
    const metadata = this.buildMetadata(song);
    // 鍘熺敓鎻掍欢
    if (this.shouldUseNativeMedia() && settingStore.smtcOpen) {
      try {
        let coverBuffer: Uint8Array | undefined;
        // 鏈湴鏂囦欢涓斿皝闈笉鏄?Blob URL
        if (song.path && isElectron && !isAndroidApp && !metadata.coverUrl.startsWith("blob:")) {
          try {
            const coverData = await window.electron.ipcRenderer.invoke(
              "get-music-cover",
              song.path,
            );
            if (coverData?.data && !signal.aborted) {
              coverBuffer = new Uint8Array(coverData.data);
            }
          } catch {
            // 蹇界暐璇诲彇澶辫触
          }
        }
        // 鍦ㄧ嚎姝屾洸
        else if (
          metadata.coverUrl &&
          (metadata.coverUrl.startsWith("http") || metadata.coverUrl.startsWith("blob:"))
        ) {
          try {
            const resp = await fetch(metadata.coverUrl, { signal });
            coverBuffer = new Uint8Array(await resp.arrayBuffer());
          } catch {
            // 蹇界暐涓嬭浇澶辫触
          }
        }
        sendMediaMetadata({
          songName: metadata.title,
          authorName: metadata.artist,
          albumName: metadata.album,
          originalCoverUrl: metadata.coverUrl,
          coverData: coverBuffer as Buffer,
          duration: song.duration,
          ncmId: typeof song.id === "number" ? song.id : undefined,
        });
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          console.error("操作失败", e);
        }
      } finally {
        if (this.metadataAbortController?.signal === signal) {
          this.metadataAbortController = null;
        }
      }
      return;
    }

    // Web API
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        artwork: this.buildArtwork(musicStore),
      });
    }
  }

  /**
   * 鏋勫缓鍏冩暟鎹?   */
  private buildMetadata(song: ReturnType<typeof getPlaySongData>): {
    title: string;
    artist: string;
    album: string;
    coverUrl: string;
  } {
    const isRadio = song!.type === "radio";
    const musicStore = useMusicStore();

    return {
      title: song!.name,
      artist: isRadio
        ? song!.dj?.creator || "鏈煡鎾"
        : Array.isArray(song!.artists)
          ? song!.artists.map((a) => a.name).join("/")
          : String(song!.artists),
      album: isRadio
        ? song!.dj?.name || "鏈煡鎾"
        : typeof song!.album === "object"
          ? song!.album.name
          : String(song!.album),
      coverUrl: musicStore.getSongCover("xl") || normalizeImageUrl(musicStore.playSong.cover) || "",
    };
  }

  /**
   * 鏋勫缓涓撹緫灏侀潰鏁扮粍
   */
  private buildArtwork(musicStore: ReturnType<typeof useMusicStore>) {
    return [
      {
        src: musicStore.getSongCover("s") || normalizeImageUrl(musicStore.playSong.cover) || "",
        sizes: "100x100",
        type: "image/jpeg",
      },
      {
        src: musicStore.getSongCover("m") || normalizeImageUrl(musicStore.playSong.cover) || "",
        sizes: "300x300",
        type: "image/jpeg",
      },
      {
        src: musicStore.getSongCover("cover") || normalizeImageUrl(musicStore.playSong.cover) || "",
        sizes: "512x512",
        type: "image/jpeg",
      },
      {
        src: musicStore.getSongCover("l") || normalizeImageUrl(musicStore.playSong.cover) || "",
        sizes: "1024x1024",
        type: "image/jpeg",
      },
      {
        src: musicStore.getSongCover("xl") || normalizeImageUrl(musicStore.playSong.cover) || "",
        sizes: "1920x1920",
        type: "image/jpeg",
      },
    ];
  }

  /**
   * 鏇存柊鎾斁杩涘害
   * @param duration 鎬绘椂闀?   * @param position 褰撳墠浣嶇疆
   * @param immediate 鏄惁绔嬪嵆鍙戦€侊紝鐢ㄤ簬 Seek 鎿嶄綔
   */
  public updateState(duration: number, position: number, immediate: boolean = false) {
    const settingStore = useSettingStore();
    if (!settingStore.smtcOpen) return;

    // 鍘熺敓鎻掍欢
    if (this.shouldUseNativeMedia()) {
      if (immediate) {
        this.throttledSendTimeline.cancel();
        // 缁濆浣嶇疆鏇存柊锛岄伩鍏?Seek 鎿嶄綔鐨勮繘搴︽洿鏂拌闄愭祦涓㈠純
        sendMediaTimeline(position, duration, true);
      } else {
        this.throttledSendTimeline(position, duration);
      }
      return;
    }

    // Web API
    this.throttledUpdatePositionState(duration, position);
  }

  /**
   * 鏇存柊鎾斁鐘舵€?   */
  public updatePlaybackStatus(isPlaying: boolean) {
    // 鍙戦€佸埌鍘熺敓鎻掍欢
    if (this.shouldUseNativeMedia()) {
      sendMediaPlayState(isPlaying ? "Playing" : "Paused");
    }
  }

  /**
   * 鏇存柊鎾斁閫熺巼
   */
  public updatePlaybackRate(rate: number) {
    this.currentRate = rate;

    if (this.shouldUseNativeMedia()) {
      sendMediaPlaybackRate(rate);
    }
  }

  public updateVolume(volume: number) {
    if (this.shouldUseNativeMedia()) {
      sendMediaVolume(volume);
    }
  }

  /**
   * 闄愭祦鏇存柊杩涘害鐘舵€?   */
  private throttledUpdatePositionState = throttle((duration: number, position: number) => {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.setPositionState({
        duration: msToS(duration),
        position: msToS(position),
        playbackRate: this.currentRate,
      });
    }
  }, 1000);
}

export const mediaSessionManager = new MediaSessionManager();
