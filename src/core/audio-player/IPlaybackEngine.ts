export interface EngineCapabilities {
  supportsRate: boolean;

  supportsSinkId: boolean;

  supportsEqualizer: boolean;

  supportsSpectrum: boolean;
}

export interface AudioErrorDetail {
  originalEvent?: Event;
  errorCode: number;
  message?: string;
}

export interface AutomationPoint {
  timeOffset: number;
  volume: number;
  lowCut: number;
  highCut: number;
}

export type FadeCurve = "linear" | "exponential" | "equalPower";

/**
 * 注释已清理 */
export interface PlayOptions {
  autoPlay?: boolean;
  /** 注释已清理 */
  fadeIn?: boolean;

  fadeDuration?: number;

  fadeCurve?: FadeCurve;

  seek?: number;
  title?: string;
  artist?: string;
  album?: string;
  artworkUri?: string;
  rate?: number;
}

/**
 * 注释已清理 */
export interface PauseOptions {
  /** 注释已清理 */
  fadeOut?: boolean;

  fadeDuration?: number;

  fadeCurve?: FadeCurve;

  keepContextRunning?: boolean;
}

export interface IPlaybackEngine {
  init(): void;

  destroy(): void;

  play(url?: string, options?: PlayOptions): Promise<void>;

  resume(options?: { fadeIn?: boolean; fadeDuration?: number }): Promise<void>;

  pause(options?: PauseOptions): void;

  stop(): void;

  seek(time: number): void;

  readonly duration: number;

  readonly currentTime: number;

  /** 注释已清理 */
  readonly paused: boolean;

  /** 注释已清理 */
  readonly src: string;

  setVolume(value: number): void;

  rampVolumeTo?(value: number, duration: number, curve?: FadeCurve): void;

  getVolume(): number;

  setRate(rate: number): void;

  getRate(): number;

  setAudioDelayCompensation(offset: number): void;

  setSinkId(deviceId: string): Promise<void>;

  setFilterGain?(index: number, value: number): void;

  /**
   * 注释已清理 */
  getFilterGains?(): number[];

  setHighPassFilter?(frequency: number, rampTime?: number): void;

  setHighPassQ?(q: number): void;

  setHighPassFilterAt?(frequency: number, when: number): void;

  rampHighPassFilterToAt?(frequency: number, when: number): void;

  setHighPassQAt?(q: number, when: number): void;

  setLowPassFilter?(frequency: number, rampTime?: number): void;

  setLowPassQ?(q: number): void;

  setLowPassFilterAt?(frequency: number, when: number): void;

  rampLowPassFilterToAt?(frequency: number, when: number): void;

  setLowPassQAt?(q: number, when: number): void;

  /**
   * 注释已清理 */
  getFrequencyData?(): Uint8Array;

  /**
   * 注释已清理 */
  getLowFrequencyVolume?(): number;

  setReplayGain?(gain: number): void;

  setPitchShift?(semitones: number): void;

  getErrorCode(): number;

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;

  /** 注释已清理 */
  readonly capabilities: EngineCapabilities;
}
