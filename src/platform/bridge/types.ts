export interface AndroidStoreBridge {
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  has(key: string): boolean;
  delete(key: string): boolean;
  reset(keysJson?: string): boolean;
}

export interface AndroidApiBridge {
  request(configJson: string): string;
}

export interface AndroidPlayerBridge {
  play(url: string, optionsJson?: string): boolean;
  resume(optionsJson?: string): boolean;
  pause(optionsJson?: string): boolean;
  stop(): boolean;
  seek(time: number): boolean;
  setVolume(value: number): boolean;
  getVolume(): number;
  setRate(value: number): boolean;
  getRate(): number;
  getDuration(): number;
  getCurrentTime(): number;
  isPaused(): boolean;
  getSrc(): string;
  getErrorCode(): number;
  setNotificationConfig(configJson?: string): boolean;
  updateMetadata(metadataJson?: string): boolean;
  updateNativePlayerState?(stateJson?: string): boolean;
  setNativePlayerVisible?(visible: boolean): boolean;
}

export interface AndroidMediaTrack {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  size: number;
  dateAdded: number;
  dateModified: number;
  mimeType: string;
  contentUri: string;
  artworkUri?: string;
  relativePath?: string;
}

export interface AndroidMediaBridge {
  checkAudioPermission(): boolean;
  requestAudioPermission(): boolean;
  scanMediaStore(): string;
}

export type AndroidRomCompatAction =
  | "autoStart"
  | "notification"
  | "backgroundActivity"
  | "backgroundPopup"
  | "powerManager"
  | "securityCenter"
  | "appDetail";

export interface AndroidRomCompatReport {
  version: string;
  sdkInt: number;
  brand: string;
  manufacturer: string;
  model: string;
  romName: string;
  ignoringBatteryOptimizations: boolean;
  notificationsEnabled: boolean;
  actions: Record<AndroidRomCompatAction, boolean>;
}

export interface AndroidDisplayMetrics {
  widthPixels: number;
  heightPixels: number;
  density: number;
  densityDpi: number;
  fontScale: number;
}
export interface AndroidSystemBridge {
  getVersion(): string;
  getBrand(): string;
  getManufacturer(): string;
  getModel(): string;
  getRomName(): string;
  getDisplayMetrics(): string;
  isIgnoringBatteryOptimizations(): boolean;
  areNotificationsEnabled(): boolean;
  requestNotificationPermission(): boolean;
  requestIgnoreBatteryOptimizations(): boolean;
  openBatteryOptimizationSettings(): boolean;
  openAutoStartSettings(): boolean;
  openNotificationSettings(): boolean;
  openBackgroundActivitySettings(): boolean;
  openBackgroundPopupSettings(): boolean;
  openPowerManagerSettings(): boolean;
  openAppDetailSettings(): boolean;
  openRomSecurityCenterSettings(): boolean;
  getRomCompatReport(): string;
  setSystemBars(configJson?: string): boolean;
  getDiagnosticsReport(): string;
  saveTextFile(fileName: string, content: string): string;
  clearDiagnosticsReport(): boolean;
  recordDiagnosticEvent(source: string, message: string, detailJson?: string): boolean;
}

export interface AndroidBridge {
  store: AndroidStoreBridge;
  api?: AndroidApiBridge;
  player: AndroidPlayerBridge;
  media?: AndroidMediaBridge;
  system?: AndroidSystemBridge;
}

export interface AndroidNativePlayerLyricWord {
  startTime: number;
  endTime?: number;
  word: string;
}

export interface AndroidNativePlayerLyricLine {
  startTime: number;
  endTime?: number;
  text: string;
  translatedText?: string;
  romanText?: string;
  words?: AndroidNativePlayerLyricWord[];
}

export interface AndroidNativePlayerPageState {
  visible: boolean;
  playing: boolean;
  loading: boolean;
  currentTime: number;
  duration: number;
  progress: number;
  themeColor: string;
  song: {
    id?: number | string;
    name: string;
    artist: string;
    album: string;
    cover: string;
    type?: string;
  };
  lyric: {
    index: number;
    offset: number;
    lines: AndroidNativePlayerLyricLine[];
  };
}

export interface AndroidSystemInfo {
  version: string;
  brand: string;
  manufacturer: string;
  model: string;
  romName: string;
  ignoringBatteryOptimizations: boolean;
  notificationsEnabled: boolean;
}

export interface AndroidPlayerEventPayload {
  type: string;
  detail?: Record<string, unknown>;
}
