import { AUDIO_EVENTS, type AudioErrorDetail } from "./BaseAudioPlayer";
import type {
  EngineCapabilities,
  IPlaybackEngine,
  PauseOptions,
  PlayOptions,
} from "./IPlaybackEngine";
import { ANDROID_PLAYER_EVENT, getAndroidPlayerBridge } from "@/platform/bridge/android";
import type { AndroidPlayerEventPayload } from "@/platform/bridge/types";
import { recordAndroidPerformanceEvent } from "@/platform/android/performance";

export class AndroidNativeAudioPlayer extends EventTarget implements IPlaybackEngine {
  private _duration = 0;
  private _currentTime = 0;
  private _paused = true;
  private _src = "";
  private _volume = 1;
  private _rate = 1;
  private _errorCode = 0;
  private isInitialized = false;
  private lastTimeSyncAt = 0;
  private lastNativeGetterSyncAt = 0;

  private static readonly NATIVE_GETTER_THROTTLE_MS = 3000;

  public readonly capabilities: EngineCapabilities = {
    supportsRate: true,
    supportsSinkId: false,
    supportsEqualizer: false,
    supportsSpectrum: false,
  };

  private readonly handlePlayerEvent = (event: Event) => {
    const customEvent = event as CustomEvent<AndroidPlayerEventPayload>;
    const payload = customEvent.detail;
    if (!payload) return;

    recordAndroidPerformanceEvent(`native:${payload.type}`);

    const detail = payload.detail ?? {};
    this.applyNativeSnapshot(detail);

    switch (payload.type) {
      case AUDIO_EVENTS.LOAD_START:
        this.dispatchEvent(new Event(AUDIO_EVENTS.LOAD_START));
        break;
      case AUDIO_EVENTS.CAN_PLAY:
        this.dispatchEvent(new Event(AUDIO_EVENTS.CAN_PLAY));
        break;
      case AUDIO_EVENTS.PLAY:
      case AUDIO_EVENTS.PLAYING:
        this._paused = false;
        this.lastTimeSyncAt = performance.now();
        this.dispatchEvent(new Event(payload.type));
        break;
      case AUDIO_EVENTS.PAUSE:
        this._currentTime = this.getEstimatedCurrentTime();
        this._paused = true;
        this.lastTimeSyncAt = performance.now();
        this.dispatchEvent(new Event(AUDIO_EVENTS.PAUSE));
        break;
      case AUDIO_EVENTS.TIME_UPDATE:
        this.dispatchEvent(new Event(AUDIO_EVENTS.TIME_UPDATE));
        break;
      case AUDIO_EVENTS.SEEKING:
      case AUDIO_EVENTS.SEEKED:
      case AUDIO_EVENTS.WAITING:
      case AUDIO_EVENTS.ENDED:
      case AUDIO_EVENTS.VOLUME_CHANGE:
      case AUDIO_EVENTS.EMPTIED:
        this.dispatchEvent(new Event(payload.type));
        break;
      case AUDIO_EVENTS.ERROR: {
        this._errorCode = Number(detail.errorCode ?? 0);
        const rawDetail = detail as Record<string, unknown>;
        const errorDetail: AudioErrorDetail = {
          originalEvent: new Event(AUDIO_EVENTS.ERROR),
          errorCode: this._errorCode,
          message: typeof rawDetail.message === "string" ? rawDetail.message : undefined,
          errorCodeName:
            typeof rawDetail.errorCodeName === "string" ? rawDetail.errorCodeName : undefined,
          cause: typeof rawDetail.cause === "string" ? rawDetail.cause : undefined,
          causeMessage:
            typeof rawDetail.causeMessage === "string" ? rawDetail.causeMessage : undefined,
          rawDetail,
        };
        this.dispatchEvent(
          new CustomEvent<AudioErrorDetail>(AUDIO_EVENTS.ERROR, {
            detail: errorDetail,
          }),
        );
        break;
      }
      default:
        break;
    }
  };

  private applyNativeSnapshot(detail: Record<string, unknown>): void {
    if (detail.currentTime !== undefined) {
      this._currentTime = Number(detail.currentTime);
      this.lastTimeSyncAt = performance.now();
    }
    if (detail.duration !== undefined) {
      this._duration = Number(detail.duration);
    }
    if (detail.volume !== undefined) {
      this._volume = Number(detail.volume);
    }
    if (detail.rate !== undefined) {
      this._rate = Number(detail.rate);
    }
    if (detail.src !== undefined) {
      this._src = String(detail.src || this._src);
    }
  }

  private getEstimatedCurrentTime(): number {
    if (this._paused || this.lastTimeSyncAt <= 0) return this._currentTime;

    const elapsed = ((performance.now() - this.lastTimeSyncAt) / 1000) * this._rate;
    const estimatedTime = this._currentTime + Math.max(elapsed, 0);
    if (this._duration > 0) return Math.min(estimatedTime, this._duration);
    return estimatedTime;
  }

  private shouldSyncNativeGetter(): boolean {
    const now = performance.now();
    if (now - this.lastNativeGetterSyncAt < AndroidNativeAudioPlayer.NATIVE_GETTER_THROTTLE_MS) {
      return false;
    }
    this.lastNativeGetterSyncAt = now;
    return true;
  }

  public init(): void {
    if (this.isInitialized) return;
    window.addEventListener(ANDROID_PLAYER_EVENT, this.handlePlayerEvent as EventListener);
    this.isInitialized = true;
  }

  public destroy(): void {
    if (!this.isInitialized) return;
    window.removeEventListener(ANDROID_PLAYER_EVENT, this.handlePlayerEvent as EventListener);
    this.isInitialized = false;
  }

  public async play(url?: string, options?: PlayOptions): Promise<void> {
    const player = getAndroidPlayerBridge();
    if (!player) throw new Error("AndroidNativeAudioPlayer bridge unavailable");

    if (!this.isInitialized) this.init();

    if (url) {
      this._src = url;
      this._currentTime = Number(options?.seek ?? 0);
      this._duration = 0;
      this._paused = options?.autoPlay === false;
      this.lastTimeSyncAt = performance.now();
      player.play(url, JSON.stringify(options ?? {}));
      return;
    }

    if (this._paused) {
      await this.resume(options);
    }
  }

  public async resume(options?: { fadeIn?: boolean; fadeDuration?: number }): Promise<void> {
    const player = getAndroidPlayerBridge();
    if (!player) throw new Error("AndroidNativeAudioPlayer bridge unavailable");
    this._paused = false;
    this.lastTimeSyncAt = performance.now();
    player.resume(JSON.stringify(options ?? {}));
  }

  public pause(options?: PauseOptions): void {
    const player = getAndroidPlayerBridge();
    if (!player) return;
    this._currentTime = this.getEstimatedCurrentTime();
    this._paused = true;
    this.lastTimeSyncAt = performance.now();
    player.pause(JSON.stringify(options ?? {}));
  }

  public stop(): void {
    const player = getAndroidPlayerBridge();
    if (!player) return;
    player.stop();
    this._src = "";
    this._currentTime = 0;
    this._duration = 0;
    this._paused = true;
    this.lastTimeSyncAt = 0;
  }

  public seek(time: number): void {
    const player = getAndroidPlayerBridge();
    if (!player) return;
    this._currentTime = time;
    this.lastTimeSyncAt = performance.now();
    player.seek(time);
  }

  public setVolume(value: number): void {
    const player = getAndroidPlayerBridge();
    if (!player) return;
    this._volume = value;
    player.setVolume(value);
  }

  public getVolume(): number {
    const player = getAndroidPlayerBridge();
    if (!player) return this._volume;
    this._volume = Number(player.getVolume());
    return this._volume;
  }

  public setRate(rate: number): void {
    const player = getAndroidPlayerBridge();
    if (!player) return;
    this._rate = rate;
    player.setRate(rate);
  }

  public getRate(): number {
    const player = getAndroidPlayerBridge();
    if (!player) return this._rate;
    this._rate = Number(player.getRate());
    return this._rate;
  }

  public setAudioDelayCompensation(offset: number): void {
    void offset;
  }

  public async setSinkId(deviceId: string): Promise<void> {
    void deviceId;
  }

  public getErrorCode(): number {
    const player = getAndroidPlayerBridge();
    if (!player) return this._errorCode;
    this._errorCode = Number(player.getErrorCode());
    return this._errorCode;
  }

  public get duration(): number {
    const player = getAndroidPlayerBridge();
    if (player && (this._duration <= 0 || this._paused) && this.shouldSyncNativeGetter()) {
      this._duration = Number(player.getDuration());
    }
    return this._duration;
  }

  public get currentTime(): number {
    const player = getAndroidPlayerBridge();
    if (player && this._paused && this.shouldSyncNativeGetter()) {
      this._currentTime = Number(player.getCurrentTime());
      this.lastTimeSyncAt = performance.now();
    }
    return this.getEstimatedCurrentTime();
  }

  public get paused(): boolean {
    const player = getAndroidPlayerBridge();
    if (player && this.shouldSyncNativeGetter()) {
      this._paused = !!player.isPaused();
      this.lastTimeSyncAt = performance.now();
    }
    return this._paused;
  }

  public get src(): string {
    const player = getAndroidPlayerBridge();
    if (player && !this._src && this.shouldSyncNativeGetter()) {
      this._src = player.getSrc() || this._src;
    }
    return this._src;
  }
}
