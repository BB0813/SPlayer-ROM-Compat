import { mediaSessionManager } from "@/core/player/MediaSessionManager";
import { usePlayerController } from "@/core/player/PlayerController";
import { useDownloadManager } from "@/core/resource/DownloadManager";
import { syncAndroidNowPlayingFromStores } from "@/platform/android/nowPlaying";
import { getAndroidPlayerBridge, syncAndroidNotificationConfig } from "@/platform/bridge/android";
import {
  useDataStore,
  useMusicStore,
  useSettingStore,
  useShortcutStore,
  useStatusStore,
} from "@/stores";
import { TASKBAR_IPC_CHANNELS } from "@/types/shared";
import { isAndroidApp, isElectron, isMac } from "@/utils/env";
import { printVersion } from "@/utils/log";
import { calculateProgress } from "@/utils/time";
import { openUserAgreement } from "@/utils/modal";
import { useEventListener } from "@vueuse/core";
import { debounce } from "lodash-es";
import { onMounted, watch } from "vue";

const FINAL_FOCUS_DELAY_MS = 500;
const ANDROID_LYRIC_METADATA_SYNC_INTERVAL_MS = 15000;
const ANDROID_MEMORY_PRESSURE_TIP_INTERVAL_MS = 60 * 1000;
let lastAndroidMemoryPressureTipAt = 0;

export const useInit = () => {
  const dataStore = useDataStore();
  const musicStore = useMusicStore();
  const statusStore = useStatusStore();
  const settingStore = useSettingStore();
  const shortcutStore = useShortcutStore();

  const player = usePlayerController();
  const downloadManager = useDownloadManager();
  let lastAndroidLyricMetadataSyncAt = 0;

  initEventListener();

  onMounted(async () => {
    settingStore.checkAndMigrate();
    printVersion();
    openUserAgreement();
    await dataStore.loadData();
    mediaSessionManager.init();

    if (isAndroidApp) {
      const syncNotificationConfig = () =>
        syncAndroidNotificationConfig({
          keepNotificationOnPause: settingStore.androidKeepNotificationOnPause,
          notificationTapAction: settingStore.androidNotificationTapAction,
          notificationShowCover: settingStore.androidNotificationShowCover,
          notificationSubtitleMode: settingStore.androidNotificationSubtitleMode,
          enhancedNotificationEnabled: settingStore.androidEnhancedNotificationEnabled,
          enhancedNotificationExclusive: settingStore.androidEnhancedNotificationExclusive,
        });

      syncNotificationConfig();
      syncAndroidNowPlayingFromStores();
      watch(
        () => [
          settingStore.androidKeepNotificationOnPause,
          settingStore.androidNotificationTapAction,
          settingStore.androidNotificationShowCover,
          settingStore.androidNotificationSubtitleMode,
          settingStore.androidEnhancedNotificationEnabled,
          settingStore.androidEnhancedNotificationExclusive,
        ],
        () => {
          syncNotificationConfig();
          syncAndroidNowPlayingFromStores();
        },
      );
      watch(
        () => [
          musicStore.playSong.id,
          musicStore.playSong.name,
          musicStore.songCover,
          musicStore.songLyric.lrcData.length,
          musicStore.songLyric.yrcData.length,
          settingStore.showWordLyrics,
          settingStore.androidNotificationSubtitleMode,
          settingStore.androidEnhancedNotificationEnabled,
          settingStore.androidEnhancedNotificationExclusive,
        ],
        () => {
          syncAndroidNowPlayingFromStores();
        },
      );
      watch(
        () => statusStore.lyricIndex,
        () => {
          const usesLyricSubtitle = settingStore.androidNotificationSubtitleMode === "lyric";
          const usesEnhancedNotification = settingStore.androidEnhancedNotificationEnabled;
          if (!usesLyricSubtitle && !usesEnhancedNotification) return;

          const now = Date.now();
          if (
            usesLyricSubtitle &&
            !usesEnhancedNotification &&
            now - lastAndroidLyricMetadataSyncAt < ANDROID_LYRIC_METADATA_SYNC_INTERVAL_MS
          ) {
            return;
          }

          lastAndroidLyricMetadataSyncAt = now;
          syncAndroidNowPlayingFromStores();
        },
      );
    }

    const restoredAndroidNativePlayback = restoreAndroidNativePlaybackState();
    if (!restoredAndroidNativePlayback) {
      player.playSong({
        autoPlay: settingStore.autoPlay,
        seek: settingStore.memoryLastSeek ? statusStore.currentTime : 0,
      });
    }
    player.playModeSyncIpc();

    if (statusStore.autoClose.enable) {
      const { endTime, time } = statusStore.autoClose;
      const now = Date.now();
      if (endTime > now) {
        const realRemainTime = Math.ceil((endTime - now) / 1000);
        player.startAutoCloseTimer(time, realRemainTime);
      } else {
        statusStore.autoClose.enable = false;
        statusStore.autoClose.remainTime = time * 60;
        statusStore.autoClose.endTime = 0;
      }
    }

    watch(
      () => [settingStore.enableReplayGain, settingStore.replayGainMode],
      () => player.applyReplayGain(),
    );

    if (isElectron) {
      shortcutStore.registerAllShortcuts();
      downloadManager.init();
      window.electron.ipcRenderer.send("win-loaded");

      const taskbarConfig = await window.electron.ipcRenderer.invoke(
        TASKBAR_IPC_CHANNELS.GET_OPTION,
      );
      statusStore.showTaskbarLyric =
        taskbarConfig?.enabled ?? statusStore.showTaskbarLyric ?? false;
      window.electron.ipcRenderer.send(
        TASKBAR_IPC_CHANNELS.SET_OPTION,
        { enabled: statusStore.showTaskbarLyric },
        true,
      );
      window.electron.ipcRenderer.send("desktop-lyric:toggle", statusStore.showDesktopLyric);

      if (settingStore.checkUpdateOnStart) {
        window.electron.ipcRenderer.send("check-update", false);
      }

      if (isMac && settingStore.macos.statusBarLyric.enabled) {
        window.electron.ipcRenderer.send(TASKBAR_IPC_CHANNELS.REQUEST_DATA);
      }

      if (statusStore.showDesktopLyric) {
        setTimeout(() => {
          window.electron.ipcRenderer.send("win-show-main");
        }, FINAL_FOCUS_DELAY_MS);
      }
    }
  });
};

const restoreAndroidNativePlaybackState = (): boolean => {
  if (!isAndroidApp) return false;
  const nativePlayer = getAndroidPlayerBridge();
  if (!nativePlayer) return false;
  const nativeSrc = nativePlayer.getSrc() || "";
  if (!nativeSrc) return false;

  const statusStore = useStatusStore();
  const duration = Number(nativePlayer.getDuration());
  const currentTime = Number(nativePlayer.getCurrentTime());
  const paused = nativePlayer.isPaused();

  statusStore.currentTime = Number.isFinite(currentTime) ? currentTime : 0;
  if (Number.isFinite(duration) && duration > 0) {
    statusStore.duration = duration;
    statusStore.progress = calculateProgress(statusStore.currentTime, duration);
  }
  statusStore.playStatus = !paused;
  statusStore.playLoading = false;
  syncAndroidNowPlayingFromStores();
  return true;
};

const initEventListener = () => {
  useEventListener(window, "keydown", keyDownEvent);
  useEventListener(window, "splayer:android-control", async (event: Event) => {
    if (!isAndroidApp) return;

    const player = usePlayerController();
    const statusStore = useStatusStore();
    const settingStore = useSettingStore();
    const action = (event as CustomEvent<{ action?: string }>).detail?.action;

    switch (action) {
      case "play":
        if (!statusStore.playStatus) await player.playOrPause();
        break;
      case "pause":
        if (statusStore.playStatus) await player.pause();
        break;
      case "playOrPause":
        await player.playOrPause();
        break;
      case "playPrev":
        await player.nextOrPrev("prev");
        break;
      case "playNext":
        await player.nextOrPrev("next");
        break;
      case "openPlayer":
        statusStore.showFullPlayer = true;
        break;
      case "closePlayer":
        statusStore.showFullPlayer = false;
        break;
      case "enableAndroidConservativeMode": {
        settingStore.androidPerformanceMode = true;
        settingStore.androidReducePlaybackAnimations = true;
        settingStore.androidLowFrequencyLyrics = true;
        settingStore.androidDisablePlaybackBackground = true;
        settingStore.androidFreezePlaybackRoutes = false;
        const now = Date.now();
        if (now - lastAndroidMemoryPressureTipAt > ANDROID_MEMORY_PRESSURE_TIP_INTERVAL_MS) {
          lastAndroidMemoryPressureTipAt = now;
          window.$message?.warning("检测到系统内存压力，已切换 Android 保守模式", {
            duration: 2500,
          });
        }
        break;
      }
      default:
        break;
    }
  });
};

const keyDownEvent = debounce((event: KeyboardEvent) => {
  const player = usePlayerController();
  const shortcutStore = useShortcutStore();
  const statusStore = useStatusStore();
  const target = event.target as HTMLElement;
  const extendsDom = ["input", "textarea"];

  if (extendsDom.includes(target.tagName.toLowerCase())) return;

  event.preventDefault();
  event.stopPropagation();

  const key = event.code;
  const isCtrl = event.ctrlKey || event.metaKey;
  const isShift = event.shiftKey;
  const isAlt = event.altKey;

  for (const shortcutKey in shortcutStore.shortcutList) {
    const shortcut = shortcutStore.shortcutList[shortcutKey];
    const shortcutParts = shortcut.shortcut.split("+");
    let match = true;

    const hasCmdOrCtrl = shortcutParts.includes("CmdOrCtrl");
    const hasShift = shortcutParts.includes("Shift");
    const hasAlt = shortcutParts.includes("Alt");

    if (hasCmdOrCtrl && !isCtrl) match = false;
    if (hasShift && !isShift) match = false;
    if (hasAlt && !isAlt) match = false;

    if (!hasCmdOrCtrl && !hasShift && !hasAlt && (isCtrl || isShift || isAlt)) {
      match = false;
    }

    const mainKey = shortcutParts.find(
      (part: string) => part !== "CmdOrCtrl" && part !== "Shift" && part !== "Alt",
    );
    if (mainKey !== key) match = false;

    if (match && shortcutKey) {
      console.log(shortcutKey, `蹇嵎閿Е鍙? ${shortcut.name}`);
      switch (shortcutKey) {
        case "playOrPause":
          player.playOrPause();
          break;
        case "playPrev":
          player.nextOrPrev("prev");
          break;
        case "playNext":
          player.nextOrPrev("next");
          break;
        case "seekForward":
          player.seekBy(5000);
          break;
        case "seekBackward":
          player.seekBy(-5000);
          break;
        case "volumeUp":
          player.setVolume("up");
          break;
        case "volumeDown":
          player.setVolume("down");
          break;
        case "toggle-desktop-lyric":
          player.toggleDesktopLyric();
          break;
        case "openPlayer":
          statusStore.showFullPlayer = true;
          break;
        case "closePlayer":
          if (statusStore.showFullPlayer) {
            statusStore.showFullPlayer = false;
          }
          break;
        case "openPlayList":
          statusStore.playListShow = !statusStore.playListShow;
          break;
        default:
          break;
      }
    }
  }
}, 100);
