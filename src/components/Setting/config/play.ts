import type { VNodeChild } from "vue";
import { computed, h, ref } from "vue";
import { NTooltip, type SelectOption } from "naive-ui";
import {
  checkAndroidAudioPermission,
  checkAndroidNotificationPermission,
  getAndroidRomCompatReport,
  getAndroidSystemInfo,
  openAndroidAppDetailSettings,
  openAndroidAutoStartSettings,
  openAndroidBackgroundActivitySettings,
  openAndroidBackgroundPopupSettings,
  openAndroidNotificationSettings,
  openAndroidPowerManagerSettings,
  openAndroidRomSecurityCenterSettings,
  requestAndroidAudioPermission,
  requestAndroidIgnoreBatteryOptimizations,
  requestAndroidNotificationPermission,
  syncAndroidNotificationConfig,
} from "@/platform/bridge/android";
import { scanAndSyncAndroidMediaLibrary } from "@/platform/android/local-media";
import type { AndroidRomCompatAction } from "@/platform/bridge/types";
import { syncAndroidNowPlayingFromStores } from "@/platform/android/nowPlaying";
import { resolveAndroidRomProfile } from "@/platform/android/romProfile";
import { useSettingStore } from "@/stores";
import type { SettingConfig } from "@/types/settings";
import { copyData } from "@/utils/helper";
import { checkIsolationSupport, isAndroidApp, isElectron } from "@/utils/env";
import { uniqBy } from "lodash-es";

const androidRomCompatActionLabels: Record<AndroidRomCompatAction, string> = {
  autoStart: "自启动",
  notification: "通知设置",
  backgroundActivity: "后台活动",
  backgroundPopup: "后台弹出",
  powerManager: "耗电管理",
  securityCenter: "系统管家",
  appDetail: "应用详情",
};

const formatAndroidRomCompatActions = (
  actions?: Partial<Record<AndroidRomCompatAction, boolean>>,
): string => {
  if (!actions) return "暂无原生入口报告";

  return Object.entries(androidRomCompatActionLabels)
    .map(([key, label]) => {
      const actionKey = key as AndroidRomCompatAction;
      return `${label}${actions[actionKey] ? "可打开" : "需手动"}`;
    })
    .join("、");
};

export const usePlaySettings = (): SettingConfig => {
  const settingStore = useSettingStore();
  const outputDevices = ref<SelectOption[]>([]);
  const androidAudioPermissionGranted = ref(false);
  const androidNotificationPermissionGranted = ref(false);
  const androidMediaTrackCount = ref(0);
  const androidMediaLastScanAt = ref("");

  const audioEngineData = {
    element: {
      label: "Web Audio",
      value: "element",
      tip: "\u6d4f\u89c8\u5668\u539f\u751f\u64ad\u653e\u5f15\u64ce\uff0c\u7a33\u5b9a\u4e14\u5360\u7528\u4f4e\uff0c\u4f46\u4e0d\u652f\u6301\u90e8\u5206\u97f3\u9891\u683c\u5f0f\u3002",
    },
    androidNative: {
      label: "\u5b89\u5353\u539f\u751f",
      value: "android-native",
      tip: "\u4f7f\u7528 AndroidNativeAudioPlayer \u8fdb\u884c\u539f\u751f\u64ad\u653e\uff0c\u9002\u5408 Android \u5bb9\u5668\u4e0e\u540e\u53f0\u64ad\u653e\u573a\u666f\u3002",
    },
    ffmpeg: {
      label: "FFmpeg",
      value: "ffmpeg",
      tip: "FFmpeg \u652f\u6301\u66f4\u591a\u97f3\u9891\u683c\u5f0f\uff0c\u4f46\u6682\u4e0d\u652f\u6301\u90e8\u5206\u80fd\u529b\uff0c\u4f8b\u5982\u500d\u901f\u64ad\u653e\u3002",
    },
    mpv: {
      label: "MPV",
      value: "mpv",
      tip: "MPV \u652f\u6301\u66f4\u591a\u683c\u5f0f\u4e0e\u9ad8\u91c7\u6837\u7387\uff0c\u4f46\u4e0d\u652f\u6301\u5747\u8861\u5668\u548c\u97f3\u8c03\u7b49\u529f\u80fd\u3002",
    },
  } as const;

  const engineTip = computed(() => {
    if (settingStore.playbackEngine === "android-native") {
      return audioEngineData.androidNative.tip;
    }
    if (settingStore.playbackEngine === "mpv") {
      return audioEngineData.mpv.tip;
    }
    return audioEngineData[settingStore.audioEngine as keyof typeof audioEngineData]?.tip;
  });

  const androidSystemInfo = ref<ReturnType<typeof getAndroidSystemInfo>>(null);
  const androidRomCompatReport = ref<ReturnType<typeof getAndroidRomCompatReport>>(null);
  const androidRomProfile = computed(() => resolveAndroidRomProfile(androidSystemInfo.value));

  const androidSystemSummary = computed(() => {
    const info = androidSystemInfo.value;
    if (!info) {
      return "\u5f53\u524d\u5bb9\u5668\u6682\u672a\u63d0\u4f9b Android \u7cfb\u7edf\u4fe1\u606f\u3002";
    }

    const romName = info.romName?.trim() || "\u672a\u77e5 ROM";
    const model = info.model?.trim() || "\u672a\u77e5\u673a\u578b";
    const batteryStatus = info.ignoringBatteryOptimizations
      ? "\u5df2\u5ffd\u7565\u7535\u6c60\u4f18\u5316"
      : "\u672a\u5ffd\u7565\u7535\u6c60\u4f18\u5316";
    const notificationStatus = info.notificationsEnabled
      ? "\u901a\u77e5\u6743\u9650\u5df2\u5f00\u542f"
      : "\u901a\u77e5\u6743\u9650\u672a\u5f00\u542f";

    return `${info.manufacturer} / ${info.brand} / ${model} | Android ${info.version} | ${romName} | ${batteryStatus} | ${notificationStatus}`;
  });

  const androidRomSummary = computed(() => {
    const profile = androidRomProfile.value;
    if (!profile) {
      return "\u5f53\u524d\u6682\u672a\u8bc6\u522b\u5230 ROM \u753b\u50cf\u3002";
    }

    const requiredText = profile.requiredActions.slice(0, 3).join(", ");
    const recommendedText = profile.recommendedActions.slice(0, 2).join(", ");
    const taskLockText = profile.supportsTaskLockGuide
      ? "\u82e5\u7cfb\u7edf\u652f\u6301\uff0c\u5efa\u8bae\u5c06\u5e94\u7528\u52a0\u5165\u6700\u8fd1\u4efb\u52a1\u9501\u5b9a\u540d\u5355\u3002"
      : "\u82e5\u4e0d\u652f\u6301\u4efb\u52a1\u9501\u5b9a\uff0c\u4ecd\u5efa\u8bae\u5173\u95ed\u7535\u6c60\u4f18\u5316\u3002";

    return `${profile.displayName} | 风险： ${profile.riskLabel} | 必做： ${requiredText} | 建议： ${recommendedText} | ${taskLockText}`;
  });

  const androidPowerManagerSummary = computed(() => {
    const profile = androidRomProfile.value;
    if (!profile) {
      return "\u6253\u5f00\u5382\u5546\u8017\u7535\u7ba1\u7406\u6216\u540e\u53f0\u4fdd\u6d3b\u8bbe\u7f6e\uff0c\u68c0\u67e5\u662f\u5426\u5b58\u5728\u9650\u5236\u3002";
    }
    return `建议优先检查：${profile.settingsGuides.slice(0, 3).join("、")}。`;
  });

  const androidBackgroundActivitySummary = computed(() => {
    const profile = androidRomProfile.value;
    if (!profile) {
      return "\u8fdb\u5165\u540e\u53f0\u6d3b\u52a8\u6216\u5e94\u7528\u542f\u52a8\u7ba1\u7406\u9875\uff0c\u907f\u514d\u606f\u5c4f\u540e\u88ab\u7cfb\u7edf\u56de\u6536\u3002";
    }
    return `请开启后台活动、关联启动或受保护应用权限，减少 ${profile.displayName} 的后台限制。`;
  });

  const androidBackgroundPopupSummary = computed(() => {
    const profile = androidRomProfile.value;
    if (!profile) {
      return "\u8fdb\u5165\u540e\u53f0\u5f39\u51fa\u754c\u9762\u6216\u60ac\u6d6e\u7a97\u7ba1\u7406\u9875\uff0c\u907f\u514d\u7cfb\u7edf\u62e6\u622a\u901a\u77e5\u5524\u8d77\u3002";
    }
    return `请检查弹窗、悬浮窗和相关权限，避免 ${profile.displayName} 阻止通知唤醒。`;
  });

  const androidBatteryOptimizationSummary = computed(() => {
    return androidSystemInfo.value?.ignoringBatteryOptimizations
      ? "\u5f53\u524d\u5e94\u7528\u5df2\u52a0\u5165\u7535\u6c60\u4f18\u5316\u767d\u540d\u5355\u3002"
      : "\u5efa\u8bae\u5ffd\u7565\u7535\u6c60\u4f18\u5316\uff0c\u4ee5\u4fdd\u8bc1\u540e\u53f0\u64ad\u653e\u7a33\u5b9a\u3002";
  });

  const androidNotificationSummary = computed(() => {
    return androidNotificationPermissionGranted.value
      ? "\u901a\u77e5\u6743\u9650\u5df2\u5f00\u542f\uff0c\u53ef\u663e\u793a\u7cfb\u7edf\u5a92\u4f53\u63a7\u5236\u3002"
      : "\u901a\u77e5\u6743\u9650\u672a\u5f00\u542f\uff0c\u7cfb\u7edf\u5a92\u4f53\u63a7\u5236\u53ef\u80fd\u4e0d\u4f1a\u663e\u793a\u3002";
  });

  const androidMediaSummary = computed(() => {
    const permissionText = androidAudioPermissionGranted.value
      ? "\u5df2\u6388\u4e88\u672c\u5730\u5a92\u4f53\u8bfb\u53d6\u6743\u9650"
      : "\u5c1a\u672a\u6388\u4e88\u672c\u5730\u5a92\u4f53\u8bfb\u53d6\u6743\u9650";
    const scanTimeText = androidMediaLastScanAt.value
      ? `上次扫描：${androidMediaLastScanAt.value}`
      : "\u5c1a\u672a\u626b\u63cf\u672c\u5730\u5a92\u4f53\u5e93\u3002";
    return `${permissionText} | 已缓存 ${androidMediaTrackCount.value} 首本地音频 | ${scanTimeText}`;
  });

  const androidNotificationControlSummary = computed(() => {
    const modeText = settingStore.androidKeepNotificationOnPause
      ? "\u6682\u505c\u65f6\u4fdd\u7559\u5a92\u4f53\u901a\u77e5"
      : "\u6682\u505c\u65f6\u79fb\u9664\u5a92\u4f53\u901a\u77e5";
    const tapText =
      settingStore.androidNotificationTapAction === "player"
        ? "\u70b9\u51fb\u901a\u77e5\u6253\u5f00\u64ad\u653e\u5668\u9875"
        : "\u70b9\u51fb\u901a\u77e5\u56de\u5230\u5e94\u7528\u9996\u9875";
    const coverText = settingStore.androidNotificationShowCover
      ? "\u901a\u77e5\u663e\u793a\u5c01\u9762"
      : "\u901a\u77e5\u9690\u85cf\u5c01\u9762";
    const subtitleText =
      settingStore.androidNotificationSubtitleMode === "album"
        ? "\u526f\u6807\u9898\u663e\u793a\u4e13\u8f91"
        : settingStore.androidNotificationSubtitleMode === "lyric"
          ? "\u526f\u6807\u9898\u663e\u793a\u6b4c\u8bcd"
          : "\u526f\u6807\u9898\u663e\u793a\u6b4c\u624b";
    const enhancedText = settingStore.androidEnhancedNotificationEnabled
      ? settingStore.androidEnhancedNotificationExclusive
        ? "已启用第三方 ROM 增强卡片（独占）"
        : "已启用第三方 ROM 增强卡片（双轨）"
      : "仅使用系统原生媒体卡片";
    return `${modeText} | ${tapText} | ${coverText} | ${subtitleText} | ${enhancedText}`;
  });

  const androidRomPrimaryActionLabel = computed(() => {
    switch (androidRomProfile.value?.family) {
      case "hyperos":
      case "miui":
        return "\u6253\u5f00\u81ea\u542f\u52a8\u8bbe\u7f6e";
      case "harmonyos":
      case "emui":
      case "magicos":
        return "\u6253\u5f00\u540e\u53f0\u6d3b\u52a8";
      case "coloros":
      case "originos":
        return "\u6253\u5f00\u540e\u53f0\u5f39\u51fa";
      default:
        return "\u6253\u5f00\u8017\u7535\u7ba1\u7406";
    }
  });

  const androidRomPhase2ActionLabel = computed(() => {
    switch (androidRomProfile.value?.family) {
      case "hyperos":
      case "miui":
        return "打开耗电管理";
      case "harmonyos":
      case "emui":
        return "打开通知设置";
      case "magicos":
        return "打开后台活动";
      case "coloros":
      case "originos":
        return "打开后台弹出";
      default:
        return "打开通知设置";
    }
  });

  const androidRomPhase2Summary = computed(() => {
    const reportText = formatAndroidRomCompatActions(androidRomCompatReport.value?.actions);
    const profile = androidRomProfile.value;
    if (!profile) {
      return `第二阶段将围绕通知常驻、后台弹出和厂商耗电管理做精细排查。原生入口：${reportText}。`;
    }

    const focusText = profile.settingsGuides.slice(0, 3).join("、");
    const issueText = profile.knownIssues.slice(0, 2).join("；");

    let verifyText = "重点确认系统通知、后台权限和耗电管理均已放行。";
    if (profile.family === "hyperos" || profile.family === "miui") {
      verifyText = "重点确认自启动、最近任务锁定和电池策略已全部放行。";
    } else if (profile.family === "harmonyos" || profile.family === "emui") {
      verifyText = "重点确认应用启动管理、受保护应用和系统通知均已放行。";
    } else if (profile.family === "coloros" || profile.family === "originos") {
      verifyText = "重点确认后台弹出、关联启动和高耗电限制均已关闭。";
    }

    return `第二阶段用于细抠 ${profile.displayName} 的定制限制，建议依次检查 ${focusText}。常见风险：${issueText || "暂无"}。${verifyText} 原生入口：${reportText}。通知栏默认使用 Android 系统媒体控制卡片。`;
  });
  const syncCurrentSongMetadataToAndroid = () => {
    syncAndroidNowPlayingFromStores();
  };

  const syncNotificationConfigToAndroid = async () => {
    if (!isAndroidApp) return;

    const config = {
      keepNotificationOnPause: settingStore.androidKeepNotificationOnPause,
      notificationTapAction: settingStore.androidNotificationTapAction,
      notificationShowCover: settingStore.androidNotificationShowCover,
      notificationSubtitleMode: settingStore.androidNotificationSubtitleMode,
      enhancedNotificationEnabled: settingStore.androidEnhancedNotificationEnabled,
      enhancedNotificationExclusive: settingStore.androidEnhancedNotificationExclusive,
    } as const;

    await window.api.store.set("android-playback-notification-config", config);
    syncAndroidNotificationConfig(config);
    syncCurrentSongMetadataToAndroid();
  };

  const refreshAndroidSystemInfo = () => {
    androidSystemInfo.value = getAndroidSystemInfo();
    androidRomCompatReport.value = getAndroidRomCompatReport();
    androidNotificationPermissionGranted.value = checkAndroidNotificationPermission();
  };

  const openAndroidSettings = (
    action: () => boolean,
    successMessage: string,
    fallbackMessage: string,
  ) => {
    if (action()) {
      window.$message.success(successMessage);
      return;
    }

    window.$message.warning(fallbackMessage);
  };

  const loadAndroidMediaSummary = async () => {
    if (!isAndroidApp) return;

    refreshAndroidSystemInfo();
    androidAudioPermissionGranted.value = checkAndroidAudioPermission();

    const cachedTracks = await window.api.store.get("android-media-library");
    androidMediaTrackCount.value = Array.isArray(cachedTracks) ? cachedTracks.length : 0;

    const lastScanAt = await window.api.store.get("android-media-last-scan-at");
    androidMediaLastScanAt.value = typeof lastScanAt === "string" ? lastScanAt : "";
  };

  const requestAndroidMediaPermission = () => {
    if (checkAndroidAudioPermission()) {
      androidAudioPermissionGranted.value = true;
      window.$message.success("\u672c\u5730\u5a92\u4f53\u6743\u9650\u5df2\u5f00\u542f\u3002");
      return;
    }

    requestAndroidAudioPermission();
    window.$message.info(
      "\u5df2\u53d1\u8d77\u672c\u5730\u5a92\u4f53\u6743\u9650\u7533\u8bf7\u3002",
    );
    window.setTimeout(() => {
      androidAudioPermissionGranted.value = checkAndroidAudioPermission();
    }, 1200);
  };

  const requestAndroidNotificationAccess = () => {
    refreshAndroidSystemInfo();
    if (androidNotificationPermissionGranted.value) {
      window.$message.success("\u901a\u77e5\u6743\u9650\u5df2\u5f00\u542f\u3002");
      return;
    }

    requestAndroidNotificationPermission();
    window.$message.info("\u5df2\u53d1\u8d77\u901a\u77e5\u6743\u9650\u7533\u8bf7\u3002");
    window.setTimeout(() => {
      refreshAndroidSystemInfo();
    }, 1200);
  };

  const requestIgnoreBatteryOptimization = () => {
    const requested = requestAndroidIgnoreBatteryOptimizations();
    if (requested) {
      window.$message.info("\u5df2\u6253\u5f00\u7535\u6c60\u4f18\u5316\u8bbe\u7f6e\u3002");
    } else {
      window.$message.warning(
        "\u6682\u65f6\u65e0\u6cd5\u76f4\u63a5\u6253\u5f00\u7535\u6c60\u4f18\u5316\u8bbe\u7f6e\u3002",
      );
    }
    window.setTimeout(() => {
      refreshAndroidSystemInfo();
    }, 1200);
  };

  const openAndroidRomSecurityCenter = () => {
    openAndroidSettings(
      openAndroidRomSecurityCenterSettings,
      "已打开系统管家或安全中心。",
      "当前 ROM 暂不支持直接打开系统管家，请从应用详情或系统设置手动配置。",
    );
  };

  const openAndroidPowerManager = () => {
    openAndroidSettings(
      openAndroidPowerManagerSettings,
      "\u5df2\u6253\u5f00\u5382\u5546\u8017\u7535\u7ba1\u7406\u8bbe\u7f6e\u3002",
      "\u5f53\u524d ROM \u6682\u4e0d\u652f\u6301\u76f4\u63a5\u6253\u5f00\u5382\u5546\u8017\u7535\u7ba1\u7406\u8bbe\u7f6e\u3002",
    );
  };

  const openAndroidBackgroundActivity = () => {
    openAndroidSettings(
      openAndroidBackgroundActivitySettings,
      "\u5df2\u6253\u5f00\u540e\u53f0\u6d3b\u52a8\u8bbe\u7f6e\u3002",
      "\u5f53\u524d ROM \u6682\u4e0d\u652f\u6301\u76f4\u63a5\u6253\u5f00\u540e\u53f0\u6d3b\u52a8\u8bbe\u7f6e\u3002",
    );
  };

  const openAndroidBackgroundPopup = () => {
    openAndroidSettings(
      openAndroidBackgroundPopupSettings,
      "\u5df2\u6253\u5f00\u540e\u53f0\u5f39\u51fa\u754c\u9762\u8bbe\u7f6e\u3002",
      "\u5f53\u524d ROM \u6682\u4e0d\u652f\u6301\u76f4\u63a5\u6253\u5f00\u540e\u53f0\u5f39\u51fa\u754c\u9762\u8bbe\u7f6e\u3002",
    );
  };

  const openAndroidPrimaryRomGuide = () => {
    switch (androidRomProfile.value?.family) {
      case "hyperos":
      case "miui":
        openAndroidSettings(
          openAndroidAutoStartSettings,
          "\u5df2\u6253\u5f00\u81ea\u542f\u52a8\u8bbe\u7f6e\u3002",
          "\u5f53\u524d ROM \u6682\u4e0d\u652f\u6301\u76f4\u63a5\u6253\u5f00\u81ea\u542f\u52a8\u8bbe\u7f6e\u3002",
        );
        return;
      case "harmonyos":
      case "emui":
      case "magicos":
        openAndroidBackgroundActivity();
        return;
      case "coloros":
      case "originos":
        openAndroidBackgroundPopup();
        return;
      default:
        openAndroidPowerManager();
    }
  };

  const openAndroidPhase2Guide = () => {
    switch (androidRomProfile.value?.family) {
      case "hyperos":
      case "miui":
        openAndroidPowerManager();
        return;
      case "harmonyos":
      case "emui":
        openAndroidSettings(
          openAndroidNotificationSettings,
          "已打开通知设置。",
          "当前 ROM 暂不支持直接打开通知设置。",
        );
        return;
      case "magicos":
        openAndroidBackgroundActivity();
        return;
      case "coloros":
      case "originos":
        openAndroidBackgroundPopup();
        return;
      default:
        openAndroidSettings(
          openAndroidNotificationSettings,
          "已打开通知设置。",
          "当前 ROM 暂不支持直接打开通知设置。",
        );
    }
  };
  const copyAndroidDiagnosticSummary = async () => {
    await loadAndroidMediaSummary();

    const info = androidSystemInfo.value;
    const profile = androidRomProfile.value;
    const romCompatReport = androidRomCompatReport.value;
    const nativeActionReport = formatAndroidRomCompatActions(romCompatReport?.actions);
    const lines = [
      "SPlayer Android \u8bca\u65ad\u6458\u8981",
      `\u54c1\u724c\uff1a${info?.brand || "\u672a\u77e5"}`,
      `\u5382\u5546\uff1a${info?.manufacturer || "\u672a\u77e5"}`,
      `\u673a\u578b\uff1a${info?.model || "\u672a\u77e5"}`,
      `Android \u7248\u672c\uff1a${info?.version || "\u672a\u77e5"}`,
      `ROM\uff1a${info?.romName || "\u672a\u77e5"}`,
      `ROM \u98ce\u9669\u7b49\u7ea7\uff1a${profile?.riskLabel || "\u672a\u77e5"}`,
      `\u901a\u77e5\u6743\u9650\uff1a${androidNotificationPermissionGranted.value ? "\u5df2\u5f00\u542f" : "\u672a\u5f00\u542f"}`,
      `\u7535\u6c60\u4f18\u5316\u767d\u540d\u5355\uff1a${info?.ignoringBatteryOptimizations ? "\u5df2\u52a0\u5165" : "\u672a\u52a0\u5165"}`,
      `\u64ad\u653e\u5f15\u64ce\uff1a${settingStore.playbackEngine}`,
      `\u97f3\u9891\u89e3\u7801\u5f15\u64ce\uff1a${settingStore.audioEngine}`,
      `\u901a\u77e5\u4fdd\u7559\uff1a${settingStore.androidKeepNotificationOnPause ? "\u662f" : "\u5426"}`,
      `\u901a\u77e5\u70b9\u51fb\u884c\u4e3a\uff1a${settingStore.androidNotificationTapAction === "player" ? "\u6253\u5f00\u64ad\u653e\u5668\u9875" : "\u56de\u5230\u5e94\u7528\u9996\u9875"}`,
      `\u901a\u77e5\u663e\u793a\u5c01\u9762: ${settingStore.androidNotificationShowCover ? "\u662f" : "\u5426"}`,
      `\u901a\u77e5\u526f\u6807\u9898\uff1a${settingStore.androidNotificationSubtitleMode}`,
      `增强通知卡片：${settingStore.androidEnhancedNotificationEnabled ? "已开启" : "未开启"}`,
      `\u672c\u5730\u5a92\u4f53\u6743\u9650\uff1a${androidAudioPermissionGranted.value ? "\u5df2\u5f00\u542f" : "\u672a\u5f00\u542f"}`,
      `\u672c\u5730\u5a92\u4f53\u7f13\u5b58\u6570\u91cf\uff1a${androidMediaTrackCount.value}`,
      `\u6700\u8fd1\u626b\u63cf\u65f6\u95f4\uff1a${androidMediaLastScanAt.value || "未扫描"}`,
      `\u5fc5\u505a\u9879\uff1a${profile?.requiredActions.join("、") || "无"}`,
      `\u5efa\u8bae\u9879\uff1a${profile?.recommendedActions.join("、") || "无"}`,
      `\u5df2\u77e5\u95ee\u9898\uff1a${profile?.knownIssues.join("；") || "无"}`,
      `\u539f\u751f\u5165\u53e3\u63a2\u6d4b\uff1a${nativeActionReport}`,
      `\u539f\u751f\u901a\u77e5\u72b6\u6001\uff1a${romCompatReport?.notificationsEnabled ? "\u5df2\u5f00\u542f" : "\u672a\u5f00\u542f\u6216\u672a\u77e5"}`,
      `\u539f\u751f\u7535\u6c60\u767d\u540d\u5355\uff1a${romCompatReport?.ignoringBatteryOptimizations ? "\u5df2\u52a0\u5165" : "\u672a\u52a0\u5165\u6216\u672a\u77e5"}`,
    ];

    await copyData(lines.join("\n"), "\u5df2\u590d\u5236 Android \u8bca\u65ad\u6458\u8981\u3002");
  };

  const handleAndroidMediaScan = async () => {
    if (!checkAndroidAudioPermission()) {
      requestAndroidMediaPermission();
      return;
    }

    try {
      const { tracks, scannedAt } = await scanAndSyncAndroidMediaLibrary();
      androidAudioPermissionGranted.value = true;
      androidMediaTrackCount.value = tracks.length;
      androidMediaLastScanAt.value = scannedAt;
      window.$message.success(
        `\u672c\u5730\u5a92\u4f53\u5e93\u626b\u63cf\u5b8c\u6210\uff0c\u5df2\u540c\u6b65 ${tracks.length} \u9996\u97f3\u9891\u3002`,
      );
    } catch (error) {
      console.error("Failed to scan Android local media library", error);
      window.$message.error(
        "\u626b\u63cf Android \u672c\u5730\u5a92\u4f53\u5e93\u5931\u8d25\u3002",
      );
    }
  };

  const renderAudioEngineOption = ({
    node,
    option,
  }: {
    node: VNodeChild;
    option: SelectOption;
  }) => {
    if (!option.disabled) return node;

    const tipMap: Record<string, string> = {
      ffmpeg:
        "\u5f53\u524d\u73af\u5883\u672a\u542f\u7528\u9694\u79bb\u80fd\u529b\uff0c\u6682\u4e0d\u53ef\u4f7f\u7528 FFmpeg \u5f15\u64ce\u3002",
      mpv: "MPV \u4ec5\u5728 Electron \u684c\u9762\u7aef\u53ef\u7528\u3002",
      "android-native":
        "Android \u539f\u751f\u5f15\u64ce\u4ec5\u5728 Android \u5bb9\u5668\u4e2d\u53ef\u7528\u3002",
    };

    return h(
      NTooltip,
      { placement: "left", keepAliveOnHover: false },
      {
        trigger: () => h("div", { style: "cursor: not-allowed;" }, [node]),
        default: () =>
          tipMap[String(option.value)] ??
          "\u5f53\u524d\u73af\u5883\u6682\u4e0d\u53ef\u4f7f\u7528\u8be5\u97f3\u9891\u5f15\u64ce\u3002",
      },
    );
  };

  const audioEngineOptions = computed<SelectOption[]>(() => [
    { label: "Web Audio", value: "element" },
    {
      label: "\u5b89\u5353\u539f\u751f",
      value: "android-native",
      disabled: !isAndroidApp,
    },
    {
      label: "FFmpeg",
      value: "ffmpeg",
      disabled: !checkIsolationSupport(),
    },
    {
      label: "MPV",
      value: "mpv",
      disabled: !isElectron,
    },
  ]);

  const audioEngineSelectValue = computed<"android-native" | "element" | "ffmpeg" | "mpv">(() => {
    if (settingStore.playbackEngine === "android-native") return "android-native";
    return settingStore.playbackEngine === "mpv" ? "mpv" : settingStore.audioEngine;
  });

  const handleAudioEngineSelect = async (
    value: "android-native" | "element" | "ffmpeg" | "mpv",
  ) => {
    if (value === "ffmpeg" && !checkIsolationSupport()) {
      window.$message.warning(
        "\u5f53\u524d\u73af\u5883\u6682\u4e0d\u53ef\u4f7f\u7528 FFmpeg \u97f3\u9891\u5f15\u64ce\u3002",
      );
      return;
    }

    if (value === "android-native" && !isAndroidApp) {
      window.$message.warning(
        "Android \u539f\u751f\u97f3\u9891\u5f15\u64ce\u4ec5\u5728 Android \u5bb9\u5668\u4e2d\u53ef\u7528\u3002",
      );
      return;
    }

    if (value === "mpv" && !isElectron) {
      window.$message.warning("MPV 音频引擎仅在 Electron 桌面端可用。");
      return;
    }

    const targetPlaybackEngine =
      value === "mpv" ? "mpv" : value === "android-native" ? "android-native" : "web-audio";
    const targetAudioEngine =
      value === "android-native"
        ? "android-native"
        : value !== "mpv"
          ? value
          : settingStore.audioEngine;

    if (
      targetPlaybackEngine === settingStore.playbackEngine &&
      targetAudioEngine === settingStore.audioEngine
    ) {
      return;
    }

    window.$dialog.warning({
      title: "\u5207\u6362\u97f3\u9891\u5f15\u64ce",
      content:
        "\u5207\u6362\u97f3\u9891\u5f15\u64ce\u4f1a\u91cd\u8f7d\u5e94\u7528\uff0c\u5e76\u4e2d\u65ad\u5f53\u524d\u64ad\u653e\u3002",
      positiveText: "Switch \u5426w",
      negativeText: "\u53d6\u6d88",
      onPositiveClick: () => {
        settingStore.playDevice = targetPlaybackEngine === "mpv" ? "auto" : "default";
        settingStore.playbackEngine = targetPlaybackEngine;
        settingStore.audioEngine = targetAudioEngine;

        if (isElectron) {
          window.electron.ipcRenderer.send("win-restart");
        } else {
          window.location.reload();
        }
      },
    });
  };

  const getOutputDevices = async () => {
    if (!isElectron) {
      outputDevices.value = [];
      return;
    }

    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const devices = uniqBy(
        allDevices.filter((device) => device.kind === "audiooutput" && device.deviceId),
        "groupId",
      );

      outputDevices.value = [
        { label: "\u7cfb\u7edf\u9ed8\u8ba4\u8f93\u51fa", value: "default" },
        ...devices.map((device) => ({
          label: device.label || device.deviceId,
          value: device.deviceId,
        })),
      ];

      if (
        settingStore.playDevice &&
        settingStore.playDevice !== "default" &&
        !devices.some((device) => device.deviceId === settingStore.playDevice)
      ) {
        settingStore.playDevice = "default";
      }
    } catch (error) {
      console.error("Failed to enumerate audio output devices", error);
      outputDevices.value = [{ label: "\u7cfb\u7edf\u9ed8\u8ba4\u8f93\u51fa", value: "default" }];
    }
  };

  const onActivate = () => {
    void getOutputDevices();
    void loadAndroidMediaSummary();
    void syncNotificationConfigToAndroid();
  };

  return {
    onActivate,
    groups: [
      {
        title: "\u64ad\u653e\u8bbe\u5907",
        items: [
          {
            key: "audioEngine",
            label: "\u97f3\u9891\u5f15\u64ce",
            type: "select",
            description: () => engineTip.value,
            options: audioEngineOptions,
            componentProps: {
              renderOption: renderAudioEngineOption,
            },
            value: computed({
              get: () => audioEngineSelectValue.value,
              set: (value) => void handleAudioEngineSelect(value),
            }),
          },
          {
            key: "playDevice",
            label: "\u97f3\u9891\u8f93\u51fa\u8bbe\u5907",
            type: "select",
            show: isElectron,
            description:
              "\u5728 Electron \u684c\u9762\u7aef\u9009\u62e9\u7cfb\u7edf\u9ed8\u8ba4\u6216\u6307\u5b9a\u8f93\u51fa\u8bbe\u5907\u3002",
            options: outputDevices,
            value: computed({
              get: () => settingStore.playDevice,
              set: (value) => {
                settingStore.playDevice = value;
              },
            }),
          },
        ],
      },
      {
        title: "\u57fa\u7840\u64ad\u653e",
        items: [
          {
            key: "autoPlay",
            label: "\u81ea\u52a8\u64ad\u653e",
            type: "switch",
            description:
              "\u542f\u52a8\u5e94\u7528\u540e\u81ea\u52a8\u6062\u590d\u64ad\u653e\u72b6\u6001\u3002",
            value: computed({
              get: () => settingStore.autoPlay,
              set: (value) => (settingStore.autoPlay = value),
            }),
          },
          {
            key: "songVolumeFade",
            label: "\u5207\u6b4c\u6de1\u5165\u6de1\u51fa",
            type: "switch",
            description:
              "\u5207\u6362\u6b4c\u66f2\u65f6\u5e73\u6ed1\u8fc7\u6e21\u97f3\u91cf\uff0c\u51cf\u5c11\u7a81\u5140\u611f\u3002",
            value: computed({
              get: () => settingStore.songVolumeFade,
              set: (value) => (settingStore.songVolumeFade = value),
            }),
          },
          {
            key: "songVolumeFadeTime",
            label: "\u6de1\u5165\u6de1\u51fa\u65f6\u957f",
            type: "slider",
            description:
              "\u8bbe\u7f6e\u5207\u6b4c\u65f6\u7684\u97f3\u91cf\u8fc7\u6e21\u65f6\u957f\u3002",
            min: 0,
            max: 1000,
            step: 50,
            suffix: "ms",
            show: computed(() => settingStore.songVolumeFade),
            value: computed({
              get: () => settingStore.songVolumeFadeTime,
              set: (value) => (settingStore.songVolumeFadeTime = value),
            }),
          },
          {
            key: "enableReplayGain",
            label: "\u542f\u7528 ReplayGain",
            type: "switch",
            description:
              "\u6309 ReplayGain \u5143\u6570\u636e\u81ea\u52a8\u6821\u6b63\u97f3\u91cf\u4e00\u81f4\u6027\u3002",
            value: computed({
              get: () => settingStore.enableReplayGain,
              set: (value) => (settingStore.enableReplayGain = value),
            }),
          },
          {
            key: "replayGainMode",
            label: "ReplayGain \u6a21\u5f0f",
            type: "select",
            description:
              "\u9009\u62e9\u4f18\u5148\u6309\u5355\u66f2\u8fd8\u662f\u4e13\u8f91\u5e94\u7528\u97f3\u91cf\u589e\u76ca\u3002",
            show: computed(() => settingStore.enableReplayGain),
            options: [
              { label: "\u5355\u66f2", value: "track" },
              { label: "\u4e13\u8f91", value: "album" },
            ],
            value: computed({
              get: () => settingStore.replayGainMode,
              set: (value) => (settingStore.replayGainMode = value),
            }),
          },
        ],
      },
      {
        title: "Android \u4e13\u9879\u9002\u914d",
        show: isAndroidApp,
        items: [
          {
            key: "androidSystemSummary",
            label: "\u7cfb\u7edf\u4e0e ROM \u4fe1\u606f",
            type: "button",
            buttonLabel: "\u6253\u5f00\u5e94\u7528\u8bbe\u7f6e",
            description: () => androidSystemSummary.value,
            action: () => {
              openAndroidSettings(
                openAndroidAppDetailSettings,
                "\u5df2\u6253\u5f00\u5e94\u7528\u8be6\u60c5\u8bbe\u7f6e\u3002",
                "\u5f53\u524d ROM \u6682\u4e0d\u652f\u6301\u76f4\u63a5\u6253\u5f00\u5e94\u7528\u8be6\u60c5\u8bbe\u7f6e\u3002",
              );
            },
          },
          {
            key: "androidRomProfile",
            label: "ROM \u517c\u5bb9\u753b\u50cf",
            type: "button",
            buttonLabel: computed(() => androidRomPrimaryActionLabel.value),
            description: () => androidRomSummary.value,
            action: openAndroidPrimaryRomGuide,
            extraButton: {
              label: "\u590d\u5236\u8bca\u65ad",
              type: "primary",
              secondary: true,
              strong: true,
              action: () => {
                void copyAndroidDiagnosticSummary();
              },
            },
          },
          {
            key: "androidRomPhase2",
            label: "ROM 第二阶段排查",
            type: "button",
            buttonLabel: computed(() => androidRomPhase2ActionLabel.value),
            description: () => androidRomPhase2Summary.value,
            action: openAndroidPhase2Guide,
            extraButton: {
              label: "系统管家",
              type: "primary",
              secondary: true,
              strong: true,
              action: openAndroidRomSecurityCenter,
            },
          },
          {
            key: "androidBatteryOptimization",
            label: "\u7535\u6c60\u4f18\u5316",
            type: "button",
            buttonLabel: computed(() =>
              androidSystemInfo.value?.ignoringBatteryOptimizations
                ? "\u5df2\u5ffd\u7565"
                : "\u5ffd\u7565\u7535\u6c60\u4f18\u5316",
            ),
            description: () => androidBatteryOptimizationSummary.value,
            action: requestIgnoreBatteryOptimization,
          },
          {
            key: "androidAutoStart",
            label: "\u81ea\u542f\u52a8\u7ba1\u7406",
            type: "button",
            buttonLabel: "\u6253\u5f00\u81ea\u542f\u52a8\u8bbe\u7f6e",
            description:
              "\u90e8\u5206\u56fd\u5185 ROM \u9700\u8981\u624b\u52a8\u5f00\u542f\u81ea\u542f\u52a8\u548c\u540e\u53f0\u767d\u540d\u5355\u3002",
            action: () => {
              openAndroidSettings(
                openAndroidAutoStartSettings,
                "\u5df2\u6253\u5f00\u81ea\u542f\u52a8\u8bbe\u7f6e\u3002",
                "\u5f53\u524d ROM \u6682\u4e0d\u652f\u6301\u76f4\u63a5\u6253\u5f00\u81ea\u542f\u52a8\u8bbe\u7f6e\u3002",
              );
            },
          },
          {
            key: "androidBackgroundActivity",
            label: "\u540e\u53f0\u6d3b\u52a8",
            type: "button",
            buttonLabel: "\u6253\u5f00\u540e\u53f0\u6d3b\u52a8",
            description: () => androidBackgroundActivitySummary.value,
            action: openAndroidBackgroundActivity,
          },
          {
            key: "androidBackgroundPopup",
            label: "\u540e\u53f0\u5f39\u51fa\u754c\u9762",
            type: "button",
            buttonLabel: "\u6253\u5f00\u540e\u53f0\u5f39\u51fa",
            description: () => androidBackgroundPopupSummary.value,
            action: openAndroidBackgroundPopup,
          },
          {
            key: "androidPowerManager",
            label: "\u5382\u5546\u8017\u7535\u7ba1\u7406",
            type: "button",
            buttonLabel: "\u6253\u5f00\u8017\u7535\u7ba1\u7406",
            description: () => androidPowerManagerSummary.value,
            action: openAndroidPowerManager,
          },
          {
            key: "androidNotificationPermission",
            label: "通知权限",
            type: "button",
            buttonLabel: computed(() =>
              androidNotificationPermissionGranted.value
                ? "\u5df2\u5f00\u542f"
                : "\u7533\u8bf7\u6743\u9650",
            ),
            description: () => androidNotificationSummary.value,
            action: requestAndroidNotificationAccess,
          },
          {
            key: "androidNotificationSettings",
            label: "通知设置",
            type: "button",
            buttonLabel: "打开通知设置",
            description:
              "\u6253\u5f00\u7cfb\u7edf\u901a\u77e5\u9009\u9879\uff0c\u53ef\u8fdb\u4e00\u6b65\u914d\u7f6e\u9501\u5c4f\u663e\u793a\u3001\u6a2a\u5e45\u7b49\u884c\u4e3a\u3002",
            action: () => {
              openAndroidSettings(
                openAndroidNotificationSettings,
                "\u5df2\u6253\u5f00\u901a\u77e5\u8bbe\u7f6e\u3002",
                "\u5f53\u524d ROM \u6682\u4e0d\u652f\u6301\u76f4\u63a5\u6253\u5f00\u901a\u77e5\u8bbe\u7f6e\u3002",
              );
            },
          },
          {
            key: "androidKeepNotificationOnPause",
            label: "暂停时保留通知",
            type: "switch",
            description: () => androidNotificationControlSummary.value,
            value: computed({
              get: () => settingStore.androidKeepNotificationOnPause,
              set: (value) => {
                settingStore.androidKeepNotificationOnPause = value;
                void syncNotificationConfigToAndroid();
              },
            }),
          },
          {
            key: "androidNotificationTapAction",
            label: "通知点击行为",
            type: "select",
            description: () => androidNotificationControlSummary.value,
            options: [
              { label: "打开播放页", value: "player" },
              { label: "返回应用首页", value: "app" },
            ],
            value: computed({
              get: () => settingStore.androidNotificationTapAction,
              set: (value: "app" | "player") => {
                settingStore.androidNotificationTapAction = value;
                void syncNotificationConfigToAndroid();
              },
            }),
          },
          {
            key: "androidNotificationShowCover",
            label: "在通知中显示封面",
            type: "switch",
            description:
              "\u5173\u95ed\u540e\u4e0d\u663e\u793a\u5c01\u9762\uff0c\u7cfb\u7edf\u5a92\u4f53\u5361\u7247\u4f1a\u66f4\u7d27\u51d1\u3002",
            value: computed({
              get: () => settingStore.androidNotificationShowCover,
              set: (value) => {
                settingStore.androidNotificationShowCover = value;
                void syncNotificationConfigToAndroid();
              },
            }),
          },
          {
            key: "androidNotificationSubtitleMode",
            label: "通知副标题",
            type: "select",
            description:
              "\u9009\u62e9\u7cfb\u7edf\u5a92\u4f53\u5361\u7247\u526f\u6807\u9898\u663e\u793a\u6b4c\u624b\u3001\u4e13\u8f91\u6216\u5f53\u524d\u6b4c\u8bcd\u3002",
            options: [
              { label: "\u663e\u793a\u6b4c\u624b", value: "artist" },
              { label: "显示专辑", value: "album" },
              { label: "\u663e\u793a\u6b4c\u8bcd", value: "lyric" },
            ],
            value: computed({
              get: () => settingStore.androidNotificationSubtitleMode,
              set: (value: "artist" | "album" | "lyric") => {
                settingStore.androidNotificationSubtitleMode = value;
                void syncNotificationConfigToAndroid();
              },
            }),
          },
          {
            key: "androidEnhancedNotificationEnabled",
            label: "第三方 ROM 增强通知卡片",
            type: "switch",
            description:
              "开启后会额外显示一张 App 自定义音频控制通知，补齐封面、进度条、上一首、播放暂停和下一首；默认与系统原生媒体卡片双轨共存。",
            value: computed({
              get: () => settingStore.androidEnhancedNotificationEnabled,
              set: (value) => {
                settingStore.androidEnhancedNotificationEnabled = value;
                if (!value) {
                  settingStore.androidEnhancedNotificationExclusive = false;
                }
                void syncNotificationConfigToAndroid();
              },
            }),
          },
          {
            key: "androidEnhancedNotificationExclusive",
            label: "增强通知独占模式",
            type: "switch",
            show: computed(() => settingStore.androidEnhancedNotificationEnabled),
            description:
              "开启后会尽量隐藏 Android / ROM 原生媒体卡片，只保留第三方 ROM 增强通知；可能影响锁屏、蓝牙、车机、HarmonyOS Connect 等系统级控制。",
            value: computed({
              get: () => settingStore.androidEnhancedNotificationExclusive,
              set: (value) => {
                settingStore.androidEnhancedNotificationExclusive = value;
                void syncNotificationConfigToAndroid();
              },
            }),
          },
          {
            key: "androidMediaPermission",
            label: "\u672c\u5730\u5a92\u4f53\u6743\u9650",
            type: "button",
            buttonLabel: computed(() =>
              androidAudioPermissionGranted.value
                ? "\u5df2\u5f00\u542f"
                : "\u7533\u8bf7\u6743\u9650",
            ),
            description: () => androidMediaSummary.value,
            action: requestAndroidMediaPermission,
          },
          {
            key: "androidMediaScan",
            label: "\u626b\u63cf\u672c\u5730\u5a92\u4f53",
            type: "button",
            buttonLabel: "\u91cd\u65b0\u626b\u63cf",
            description:
              "\u8bfb\u53d6 Android MediaStore \u4e2d\u7684\u672c\u5730\u97f3\u9891\u5e76\u540c\u6b65\u5230\u5e94\u7528\u3002",
            action: () => {
              void handleAndroidMediaScan();
            },
          },
        ],
      },
    ],
  };
};
