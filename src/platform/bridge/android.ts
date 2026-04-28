import type {
  AndroidBridge,
  AndroidMediaTrack,
  AndroidPlayerEventPayload,
  AndroidRomCompatReport,
  AndroidSystemInfo,
} from "./types";

export const ANDROID_PLAYER_EVENT = "splayer:android-player";

const composeAndroidBridge = (): AndroidBridge | null => {
  if (window.splayerAndroid) return window.splayerAndroid;
  if (!window.splayerAndroidStore || !window.splayerAndroidPlayer) return null;

  window.splayerAndroid = {
    store: window.splayerAndroidStore,
    api: window.splayerAndroidApi,
    player: window.splayerAndroidPlayer,
    media: window.splayerAndroidMedia,
    system: window.splayerAndroidSystem,
  };

  return window.splayerAndroid;
};

const getAndroidBridge = (): AndroidBridge | null => {
  return composeAndroidBridge();
};

export const isAndroidBridgeAvailable = (): boolean => {
  return getAndroidBridge() !== null;
};

export const emitAndroidPlayerEvent = (payload: AndroidPlayerEventPayload): void => {
  window.dispatchEvent(
    new CustomEvent<AndroidPlayerEventPayload>(ANDROID_PLAYER_EVENT, {
      detail: payload,
    }),
  );
};

export const readBridgeStore = async (key: string): Promise<unknown> => {
  const bridge = getAndroidBridge();
  if (!bridge) return null;
  const raw = bridge.store.get(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

export const writeBridgeStore = async (key: string, value: unknown): Promise<boolean> => {
  const bridge = getAndroidBridge();
  if (!bridge) return false;
  return bridge.store.set(key, JSON.stringify(value));
};

export const hasBridgeStoreKey = async (key: string): Promise<boolean> => {
  const bridge = getAndroidBridge();
  if (!bridge) return false;
  return bridge.store.has(key);
};

export const deleteBridgeStoreKey = async (key: string): Promise<boolean> => {
  const bridge = getAndroidBridge();
  if (!bridge) return false;
  return bridge.store.delete(key);
};

export const resetBridgeStoreKeys = async (keys?: string[]): Promise<boolean> => {
  const bridge = getAndroidBridge();
  if (!bridge) return false;
  return bridge.store.reset(keys ? JSON.stringify(keys) : undefined);
};

export const getAndroidApiBridge = () => {
  return getAndroidBridge()?.api ?? window.splayerAndroidApi ?? null;
};

export const getAndroidPlayerBridge = () => {
  return getAndroidBridge()?.player ?? null;
};

export const getAndroidMediaBridge = () => {
  return getAndroidBridge()?.media ?? null;
};

export const getAndroidSystemBridge = () => {
  return getAndroidBridge()?.system ?? null;
};

export const checkAndroidAudioPermission = (): boolean => {
  return getAndroidMediaBridge()?.checkAudioPermission() ?? false;
};

export const requestAndroidAudioPermission = (): boolean => {
  return getAndroidMediaBridge()?.requestAudioPermission() ?? false;
};

export const checkAndroidNotificationPermission = (): boolean => {
  return getAndroidSystemBridge()?.areNotificationsEnabled() ?? false;
};

export const requestAndroidNotificationPermission = (): boolean => {
  return getAndroidSystemBridge()?.requestNotificationPermission() ?? false;
};

export const requestAndroidIgnoreBatteryOptimizations = (): boolean => {
  return getAndroidSystemBridge()?.requestIgnoreBatteryOptimizations() ?? false;
};

export const scanAndroidMediaStore = async (): Promise<AndroidMediaTrack[]> => {
  const mediaBridge = getAndroidMediaBridge();
  if (!mediaBridge) return [];

  try {
    const raw = mediaBridge.scanMediaStore();
    if (!raw) return [];
    return JSON.parse(raw) as AndroidMediaTrack[];
  } catch {
    return [];
  }
};

export const getAndroidSystemInfo = (): AndroidSystemInfo | null => {
  const system = getAndroidSystemBridge();
  if (!system) return null;

  return {
    version: system.getVersion(),
    brand: system.getBrand(),
    manufacturer: system.getManufacturer(),
    model: system.getModel(),
    romName: system.getRomName(),
    ignoringBatteryOptimizations: system.isIgnoringBatteryOptimizations(),
    notificationsEnabled: system.areNotificationsEnabled(),
  };
};

export const openAndroidBatteryOptimizationSettings = (): boolean => {
  return getAndroidSystemBridge()?.openBatteryOptimizationSettings() ?? false;
};

export const openAndroidAutoStartSettings = (): boolean => {
  return getAndroidSystemBridge()?.openAutoStartSettings() ?? false;
};

export const openAndroidNotificationSettings = (): boolean => {
  return getAndroidSystemBridge()?.openNotificationSettings() ?? false;
};

export const openAndroidBackgroundActivitySettings = (): boolean => {
  return getAndroidSystemBridge()?.openBackgroundActivitySettings() ?? false;
};

export const openAndroidBackgroundPopupSettings = (): boolean => {
  return getAndroidSystemBridge()?.openBackgroundPopupSettings() ?? false;
};

export const openAndroidPowerManagerSettings = (): boolean => {
  return getAndroidSystemBridge()?.openPowerManagerSettings() ?? false;
};

export interface AndroidNotificationConfig {
  keepNotificationOnPause: boolean;
  notificationTapAction: "app" | "player";
  notificationShowCover: boolean;
  notificationSubtitleMode: "artist" | "album" | "lyric";
  enhancedNotificationEnabled: boolean;
  enhancedNotificationExclusive: boolean;
}

export interface AndroidNowPlayingMetadata {
  title?: string;
  artist?: string;
  album?: string;
  artworkUri?: string;
  lyricLine?: string;
}

export const syncAndroidNotificationConfig = (config: AndroidNotificationConfig): boolean => {
  return getAndroidPlayerBridge()?.setNotificationConfig(JSON.stringify(config)) ?? false;
};

export const syncAndroidNowPlayingMetadata = (metadata: AndroidNowPlayingMetadata): boolean => {
  return getAndroidPlayerBridge()?.updateMetadata(JSON.stringify(metadata)) ?? false;
};

export const openAndroidAppDetailSettings = (): boolean => {
  return getAndroidSystemBridge()?.openAppDetailSettings() ?? false;
};

export const openAndroidRomSecurityCenterSettings = (): boolean => {
  return getAndroidSystemBridge()?.openRomSecurityCenterSettings() ?? false;
};

export interface AndroidSystemBarsConfig {
  statusBarColor: string;
  navigationBarColor: string;
  lightStatusBar: boolean;
  lightNavigationBar: boolean;
}

export const syncAndroidSystemBars = (config: AndroidSystemBarsConfig): boolean => {
  return getAndroidSystemBridge()?.setSystemBars(JSON.stringify(config)) ?? false;
};

export const getAndroidNativeDiagnosticsReport = (): string | null => {
  return getAndroidSystemBridge()?.getDiagnosticsReport() ?? null;
};

export const clearAndroidNativeDiagnosticsReport = (): boolean => {
  return getAndroidSystemBridge()?.clearDiagnosticsReport() ?? false;
};

export const recordAndroidNativeDiagnosticEvent = (
  source: string,
  message: string,
  detail?: Record<string, unknown>,
): boolean => {
  return (
    getAndroidSystemBridge()?.recordDiagnosticEvent(
      source,
      message,
      detail ? JSON.stringify(detail) : undefined,
    ) ?? false
  );
};

export const getAndroidRomCompatReport = (): AndroidRomCompatReport | null => {
  const raw = getAndroidSystemBridge()?.getRomCompatReport();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AndroidRomCompatReport;
  } catch {
    return null;
  }
};
