import { useSettingStore } from "@/stores";
import { checkIsolationSupport, isAndroidApp, isElectron } from "@/utils/env";
import { TypedEventTarget } from "@/utils/TypedEventTarget";
import { AndroidNativeAudioPlayer } from "../audio-player/AndroidNativeAudioPlayer";
import { AudioElementPlayer } from "../audio-player/AudioElementPlayer";
import { AUDIO_EVENTS, type AudioEventMap } from "../audio-player/BaseAudioPlayer";
import { FFmpegAudioPlayer } from "../audio-player/ffmpeg-engine/FFmpegAudioPlayer";
import type {
  EngineCapabilities,
  FadeCurve,
  IPlaybackEngine,
  PauseOptions,
  PlayOptions,
} from "../audio-player/IPlaybackEngine";
import { MpvPlayer, useMpvPlayer } from "../audio-player/MpvPlayer";
import { getSharedAudioContext } from "../automix/SharedAudioContext";

class AudioManager extends TypedEventTarget<AudioEventMap> implements IPlaybackEngine {
  /** 注释已清理 */
  private engine: IPlaybackEngine;

  private pendingEngine: IPlaybackEngine | null = null;

  private pendingSwitchTimer: ReturnType<typeof setTimeout> | null = null;
  /** 注释已清理 */
  private cleanupListeners: (() => void) | null = null;

  private isCrossfading: boolean = false;

  /** 上一次交叉淡入淡出的旧引擎销毁定时器 */
  private pendingDestroyTimer: ReturnType<typeof setTimeout> | null = null;

  /** 注释已清理 */
  private _masterVolume: number = 1.0;

  public readonly engineType: "android-native" | "element" | "ffmpeg" | "mpv";

  /** 注释已清理 */
  public readonly capabilities: EngineCapabilities;

  constructor(
    playbackEngine: "android-native" | "web-audio" | "mpv",
    audioEngine: "android-native" | "element" | "ffmpeg",
  ) {
    super();

    if (isAndroidApp || playbackEngine === "android-native" || audioEngine === "android-native") {
      this.engine = new AndroidNativeAudioPlayer();
      this.engineType = "android-native";
    } else if (isElectron && playbackEngine === "mpv") {
      const mpvPlayer = useMpvPlayer();
      mpvPlayer.init();
      this.engine = mpvPlayer;
      this.engineType = "mpv";
    } else if (audioEngine === "ffmpeg" && checkIsolationSupport()) {
      this.engine = new FFmpegAudioPlayer();
      this.engineType = "ffmpeg";
    } else {
      if (audioEngine === "ffmpeg" && !checkIsolationSupport()) {
        console.warn("[AudioManager] 环境未隔离，已从 FFmpeg 回退到 Web Audio");
      }

      this.engine = new AudioElementPlayer();
      this.engineType = "element";
    }

    this.capabilities = this.engine.capabilities;
    this.bindEngineEvents();
  }

  private bindEngineEvents() {
    if (this.cleanupListeners) {
      this.cleanupListeners();
    }

    const events = Object.values(AUDIO_EVENTS);
    const handlers: Map<string, EventListener> = new Map();

    events.forEach((eventType) => {
      const handler = (e: Event) => {
        if (
          this.isCrossfading &&
          (eventType === "pause" || eventType === "ended" || eventType === "error")
        ) {
          return;
        }

        const detail = (e as CustomEvent).detail;
        this.dispatch(eventType, detail);
      };
      handlers.set(eventType, handler);
      this.engine.addEventListener(eventType, handler);
    });

    this.cleanupListeners = () => {
      handlers.forEach((handler, eventType) => {
        this.engine.removeEventListener(eventType, handler);
      });
    };
  }

  /**
   * 注释已清理
   */
  public init(): void {
    this.engine.init();
  }

  public destroy(): void {
    this.clearPendingSwitch();
    if (this.cleanupListeners) {
      this.cleanupListeners();
      this.cleanupListeners = null;
    }
    this.engine.destroy();
  }

  public async play(url?: string, options?: PlayOptions): Promise<void> {
    await this.engine.play(url, options);
  }

  public async crossfadeTo(
    url: string,
    options: {
      duration: number;
      seek?: number;
      autoPlay?: boolean;
      uiSwitchDelay?: number;
      onSwitch?: () => void;
      mixType?: "default" | "bassSwap";
      rate?: number;
      replayGain?: number;
      fadeCurve?: FadeCurve;
    },
  ): Promise<void> {
    if (this.engineType === "mpv") {
      this.stop();
      if (options.onSwitch) options.onSwitch();
      await this.play(url, {
        autoPlay: options.autoPlay ?? true,
        seek: options.seek,
        fadeIn: true,
        fadeDuration: options.duration,
      });
      return;
    }
    console.log("[AudioManager] 音频状态已更新");

    this.clearPendingSwitch();
    this.isCrossfading = true;

    let newEngine: IPlaybackEngine;
    if (this.engineType === "android-native") {
      newEngine = new AndroidNativeAudioPlayer();
    } else if (this.engineType === "ffmpeg") {
      newEngine = new FFmpegAudioPlayer();
    } else {
      newEngine = new AudioElementPlayer();
    }
    newEngine.init();
    this.pendingEngine = newEngine;
    // 注释已清理
    newEngine.setVolume(0);
    if (this.engine.capabilities.supportsRate) {
      const targetRate = options.rate ?? this.getRate();
      newEngine.setRate(targetRate);
    }

    if (options.replayGain !== undefined) {
      newEngine.setReplayGain?.(options.replayGain);
    }

    if (options.mixType === "bassSwap") {
      this.engine.setHighPassQ?.(1.0);
      newEngine.setHighPassQ?.(1.0);
      newEngine.setHighPassFilter?.(400, 0);
    }
    const fadeCurve = options.fadeCurve ?? "equalPower";

    await newEngine.play(url, {
      autoPlay: true,
      seek: options.seek,
      fadeIn: false,
    });

    if (newEngine.rampVolumeTo) {
      newEngine.rampVolumeTo(this._masterVolume, options.duration, fadeCurve);
    } else {
      newEngine.setVolume(this._masterVolume);
    }
    if (options.mixType === "bassSwap") {
      const mid = options.duration * 0.5;

      const release = Math.min(0.6, options.duration * 0.25);
      const t0 = getSharedAudioContext().currentTime + 0.02;
      const tMid = t0 + mid;
      const tReleaseEnd = tMid + release;
      const tEnd = t0 + options.duration;
      const bypassFreq = 10;

      if (this.engine.setHighPassFilterAt && this.engine.rampHighPassFilterToAt) {
        this.engine.setHighPassFilterAt(bypassFreq, t0);
        this.engine.rampHighPassFilterToAt(400, tMid);
      } else {
        this.engine.setHighPassFilter?.(400, mid);
      }

      if (newEngine.setHighPassFilterAt && newEngine.rampHighPassFilterToAt) {
        newEngine.setHighPassFilterAt(400, t0);
        newEngine.setHighPassFilterAt(400, tMid);
        newEngine.rampHighPassFilterToAt(bypassFreq, tReleaseEnd);
        newEngine.setHighPassFilterAt(bypassFreq, tEnd + 0.05);
      }

      if (newEngine.setHighPassQAt) {
        newEngine.setHighPassQAt(0.707, tEnd + 0.05);
      } else {
        newEngine.setHighPassQ?.(0.707);
      }
    }
    // 注释已清理
    const oldEngine = this.engine;
    oldEngine.pause({
      fadeOut: true,
      fadeDuration: options.duration,
      fadeCurve,
      keepContextRunning: true,
    });
    const commitSwitch = () => {
      console.log("[AudioManager] 音频状态已更新");
      if (this.cleanupListeners) {
        this.cleanupListeners();
        this.cleanupListeners = null;
      }

      this.engine = newEngine;
      this.pendingEngine = null; // Cleared from pending, now active
      this.isCrossfading = false;
      this.bindEngineEvents();

      try {
        options.onSwitch?.();
      } catch (e) {
        console.error("[AudioManager] 音频操作失败", e);
      }

      this.dispatch(AUDIO_EVENTS.TIME_UPDATE, undefined);
      this.dispatch(AUDIO_EVENTS.PLAY, undefined);
      if (options.mixType !== "bassSwap") {
        this.engine.setHighPassFilter?.(0, 0);
      }
    };
    const switchDelay = options.uiSwitchDelay ?? 0;
    if (switchDelay > 0) {
      this.pendingSwitchTimer = setTimeout(() => {
        this.pendingSwitchTimer = null;
        commitSwitch();
      }, switchDelay * 1000);
    } else {
      commitSwitch();
    }

    this.pendingDestroyTimer = setTimeout(
      () => {
        oldEngine.destroy();
        this.pendingDestroyTimer = null;
      },
      options.duration * 1000 + 1000,
    );
  }

  public async resume(options?: { fadeIn?: boolean; fadeDuration?: number }): Promise<void> {
    await this.engine.resume(options);
  }

  /**
   * 注释已清理
   */
  public pause(options?: PauseOptions): void {
    this.engine.pause(options);
  }

  public stop(): void {
    this.clearPendingSwitch();
    this.engine.stop();
  }

  private clearPendingSwitch() {
    if (this.pendingSwitchTimer) {
      clearTimeout(this.pendingSwitchTimer);
      this.pendingSwitchTimer = null;
    }
    if (this.pendingDestroyTimer) {
      clearTimeout(this.pendingDestroyTimer);
      this.pendingDestroyTimer = null;
    }
    this.engine.setHighPassFilter?.(0, 0);
    this.engine.setHighPassQ?.(0.707);
    if (this.pendingEngine) {
      try {
        this.pendingEngine.destroy();
      } catch {
        // ignore
      }
      this.pendingEngine = null;
    }
  }

  public seek(time: number): void {
    this.engine.seek(time);
  }

  public setReplayGain(gain: number): void {
    this.engine.setReplayGain?.(gain);
  }

  public setVolume(value: number): void {
    this._masterVolume = value;
    this.engine.setVolume(value);
  }

  /**
   * 注释已清理
   */
  public getVolume(): number {
    return this.engine.getVolume();
  }

  public setRate(value: number): void {
    this.engine.setRate(value);
  }

  public getRate(): number {
    return this.engine.getRate();
  }

  public setAudioDelayCompensation(offset: number): void {
    this.engine.setAudioDelayCompensation?.(offset);
  }

  public async setSinkId(deviceId: string): Promise<void> {
    await this.engine.setSinkId(deviceId);
  }

  /**
   * 注释已清理
   */
  public getFrequencyData(): Uint8Array {
    return this.engine.getFrequencyData?.() ?? new Uint8Array(0);
  }

  /**
   * 注释已清理
   */
  public getLowFrequencyVolume(): number {
    return this.engine.getLowFrequencyVolume?.() ?? 0;
  }

  public setHighPassFilter(frequency: number, rampTime: number = 0): void {
    this.engine.setHighPassFilter?.(frequency, rampTime);
  }

  public setHighPassQ(q: number): void {
    this.engine.setHighPassQ?.(q);
  }

  public setLowPassFilter(frequency: number, rampTime: number = 0): void {
    this.engine.setLowPassFilter?.(frequency, rampTime);
  }

  public setLowPassQ(q: number): void {
    this.engine.setLowPassQ?.(q);
  }

  public setFilterGain(index: number, value: number): void {
    this.engine.setFilterGain?.(index, value);
  }

  /**
   * 注释已清理
   */
  public getFilterGains(): number[] {
    return this.engine.getFilterGains?.() ?? [];
  }

  public get duration(): number {
    return this.engine.duration;
  }

  public get currentTime(): number {
    return this.engine.currentTime;
  }

  /**
   * 注释已清理
   */
  public get paused(): boolean {
    return this.engine.paused;
  }

  public get src(): string {
    return this.engine.src;
  }

  /**
   * 注释已清理
   */
  public getErrorCode(): number {
    return this.engine.getErrorCode();
  }

  public clearForcePaused(): void {
    if (this.engine instanceof MpvPlayer) {
      this.engine.clearForcePaused();
    }
  }

  public setPendingSeek(seconds: number | null): void {
    if (this.engine instanceof MpvPlayer) {
      this.engine.setPendingSeek(seconds);
    }
  }

  public togglePlayPause(): void {
    if (this.paused) {
      this.resume();
    } else {
      this.pause();
    }
  }
}

const AUDIO_MANAGER_KEY = "__SPLAYER_AUDIO_MANAGER__";

export const useAudioManager = (): AudioManager => {
  const win = window as Window & { [AUDIO_MANAGER_KEY]?: AudioManager };
  if (!win[AUDIO_MANAGER_KEY]) {
    const settingStore = useSettingStore();
    win[AUDIO_MANAGER_KEY] = new AudioManager(
      settingStore.playbackEngine,
      settingStore.audioEngine,
    );

    watch(
      () => settingStore.audioDelayCompensation,
      (offset) => {
        win[AUDIO_MANAGER_KEY]?.setAudioDelayCompensation(offset);
      },
      { immediate: true },
    );

    console.log("[AudioManager] 音频状态已更新");
  }
  return win[AUDIO_MANAGER_KEY];
};
