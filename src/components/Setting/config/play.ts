import type { VNodeChild } from "vue";
import { computed, h, markRaw, ref } from "vue";
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
  saveAndroidTextFile,
  syncAndroidNotificationConfig,
} from "@/platform/bridge/android";
import { scanAndSyncAndroidMediaLibrary } from "@/platform/android/local-media";
import {
  buildAndroidPerformanceDiagnosticsReport,
  clearAndroidPerformanceDiagnostics,
} from "@/platform/android/performance";
import type { AndroidRomCompatAction } from "@/platform/bridge/types";
import { syncAndroidNowPlayingFromStores } from "@/platform/android/nowPlaying";
import { resolveAndroidRomProfile } from "@/platform/android/romProfile";
import { useSettingStore } from "@/stores";
import type { SettingConfig } from "@/types/settings";
import { copyData } from "@/utils/helper";
import { collectCookieSnapshot } from "@/utils/cookie";
import { checkIsolationSupport, isAndroidApp, isElectron, isMobile } from "@/utils/env";
import { uniqBy } from "lodash-es";
import AndroidUiScaleControl from "../components/AndroidUiScaleControl.vue";

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
  const showAndroidSettings = computed(() => isAndroidApp || isMobile);

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
      return "当前暂未识别到 ROM 画像。";
    }

    const requiredText = profile.requiredActions.slice(0, 3).join("、") || "无";
    const recommendedText = profile.recommendedActions.slice(0, 2).join("、") || "无";
    const taskLockText = profile.supportsTaskLockGuide
      ? "若系统支持，建议将应用加入最近任务锁定名单。"
      : "若不支持任务锁定，仍建议关闭电池优化。";

    return `${profile.displayName} | 风险：${profile.riskLabel} | 必做：${requiredText} | 建议：${recommendedText} | ${taskLockText}`;
  });

  const androidPowerManagerSummary = computed(() => {
    const profile = androidRomProfile.value;
    if (!profile) {
      return "打开厂商耗电管理或后台保活设置，检查是否存在限制。";
    }
    return `建议优先检查：${profile.settingsGuides.slice(0, 3).join("、") || "通知与后台权限"}。`;
  });

  const androidBackgroundActivitySummary = computed(() => {
    const profile = androidRomProfile.value;
    if (!profile) {
      return "进入后台活动或应用启动管理页，避免息屏后被系统回收。";
    }
    return `请开启后台活动、关联启动或受保护应用权限，减少 ${profile.displayName} 的后台限制。`;
  });

  const androidBackgroundPopupSummary = computed(() => {
    const profile = androidRomProfile.value;
    if (!profile) {
      return "进入后台弹出界面或悬浮窗管理页，避免系统拦截通知唤起。";
    }
    return `请检查弹窗、悬浮窗和相关权限，避免 ${profile.displayName} 阻止通知唤醒。`;
  });

  const androidBatteryOptimizationSummary = computed(() => {
    return androidSystemInfo.value?.ignoringBatteryOptimizations
      ? "当前应用已加入电池优化白名单。"
      : "建议忽略电池优化，以保证后台播放稳定。";
  });

  const androidNotificationSummary = computed(() => {
    return androidNotificationPermissionGranted.value
      ? "通知权限已开启，可显示系统媒体控制。"
      : "通知权限未开启，系统媒体控制可能不会显示。";
  });

  const androidMediaSummary = computed(() => {
    const permissionText = androidAudioPermissionGranted.value
      ? "已授予本地媒体读取权限"
      : "尚未授予本地媒体读取权限";
    const scanTimeText = androidMediaLastScanAt.value
      ? `上次扫描：${androidMediaLastScanAt.value}`
      : "尚未扫描本地媒体库。";
    return `${permissionText} | 已缓存 ${androidMediaTrackCount.value} 首本地音频 | ${scanTimeText}`;
  });

  const androidNotificationControlSummary = computed(() => {
    const modeText = settingStore.androidKeepNotificationOnPause
      ? "暂停时保留媒体通知"
      : "暂停时移除媒体通知";
    const tapText =
      settingStore.androidNotificationTapAction === "player"
        ? "点击通知打开播放器页"
        : "点击通知回到应用首页";
    const coverText = settingStore.androidNotificationShowCover ? "通知显示封面" : "通知隐藏封面";
    const subtitleText =
      settingStore.androidNotificationSubtitleMode === "album"
        ? "副标题显示专辑"
        : settingStore.androidNotificationSubtitleMode === "lyric"
          ? "副标题显示歌词"
          : "副标题显示歌手";
    const enhancedText = settingStore.androidEnhancedNotificationEnabled
      ? settingStore.androidEnhancedNotificationExclusive
        ? "已启用第三方 ROM 增强卡片（独占）"
        : "已启用第三方 ROM 增强卡片（双轨）"
      : "仅使用系统原生媒体卡片";
    return `${modeText} | ${tapText} | ${coverText} | ${subtitleText} | ${enhancedText}`;
  });

  const androidPerformanceSummary = computed(() => {
    const modeText = settingStore.androidPerformanceMode
      ? "已开启 Android 性能模式"
      : "已关闭 Android 性能模式";
    const strategyText = [
      settingStore.androidReducePlaybackAnimations ? "降低动画" : "保留动画",
      "页面冻结已停用",
      settingStore.androidLowFrequencyLyrics ? "低频歌词" : "常规歌词",
      settingStore.androidDisablePlaybackBackground ? "关闭动态背景" : "保留动态背景",
    ].join(" / ");
    const diagnosticsText = settingStore.androidPerformanceDiagnostics
      ? "已开启诊断日志"
      : "未开启诊断日志";
    const nativePageText = settingStore.androidNativePlayerPageEnabled
      ? "原生播放页接管开启"
      : "原生播放页接管关闭";
    const nativeBarText = settingStore.androidNativeMiniPlayerBarEnabled
      ? "原生底部卡片开启"
      : "原生底部卡片关闭";
    return `${modeText} | ${strategyText} | ${diagnosticsText} | ${nativePageText} | ${nativeBarText}`;
  });

  const androidUiScaleSummary = computed(() => {
    const scale = settingStore.androidUiScale || 80;
    const scaleText = settingStore.androidAutoUiScale
      ? "已按本机分辨率自动匹配"
      : `当前手动缩放为 ${scale}%`;
    const compactText = settingStore.androidCompactUi ? "紧凑布局已开启" : "紧凑布局已关闭";
    return `${scaleText}，${compactText}；缩放会影响列表、设置页、底栏和通用控件密度。`;
  });

  const androidRomPrimaryActionLabel = computed(() => {
    switch (androidRomProfile.value?.family) {
      case "hyperos":
      case "miui":
        return "打开自启动设置";
      case "harmonyos":
      case "emui":
      case "magicos":
        return "打开后台活动";
      case "coloros":
      case "originos":
        return "打开后台弹出";
      default:
        return "打开耗电管理";
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
      return `第二阶段会围绕通知常驻、后台弹出和厂商耗电管理做精细排查。原生入口：${reportText}。`;
    }

    const focusText = profile.settingsGuides.slice(0, 3).join("、") || "通知与后台权限";
    const issueText = profile.knownIssues.slice(0, 2).join("；") || "暂无";

    let verifyText = "重点确认系统通知、后台权限和耗电管理均已放行。";
    if (profile.family === "hyperos" || profile.family === "miui") {
      verifyText = "重点确认自启动、最近任务锁定和电池策略已全部放行。";
    } else if (profile.family === "harmonyos" || profile.family === "emui") {
      verifyText = "重点确认应用启动管理、受保护应用和系统通知均已放行。";
    } else if (profile.family === "coloros" || profile.family === "originos") {
      verifyText = "重点确认后台弹出、关联启动和高耗电限制均已关闭。";
    }

    return `第二阶段用于细化 ${profile.displayName} 的定制限制，建议依次检查 ${focusText}。常见风险：${issueText}。${verifyText} 原生入口：${reportText}。通知栏默认使用 Android 系统媒体控制卡片。`;
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
      "已打开厂商耗电管理设置。",
      "当前 ROM 暂不支持直接打开厂商耗电管理设置。",
    );
  };

  const openAndroidBackgroundActivity = () => {
    openAndroidSettings(
      openAndroidBackgroundActivitySettings,
      "已打开后台活动设置。",
      "当前 ROM 暂不支持直接打开后台活动设置。",
    );
  };

  const openAndroidBackgroundPopup = () => {
    openAndroidSettings(
      openAndroidBackgroundPopupSettings,
      "已打开后台弹出界面设置。",
      "当前 ROM 暂不支持直接打开后台弹出界面设置。",
    );
  };

  const openAndroidPrimaryRomGuide = () => {
    switch (androidRomProfile.value?.family) {
      case "hyperos":
      case "miui":
        openAndroidSettings(
          openAndroidAutoStartSettings,
          "已打开自启动设置。",
          "当前 ROM 暂不支持直接打开自启动设置。",
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
      "SPlayer Android 诊断摘要",
      `品牌：${info?.brand || "未知"}`,
      `厂商：${info?.manufacturer || "未知"}`,
      `机型：${info?.model || "未知"}`,
      `Android 版本：${info?.version || "未知"}`,
      `ROM：${info?.romName || "未知"}`,
      `ROM 风险等级：${profile?.riskLabel || "未知"}`,
      `通知权限：${androidNotificationPermissionGranted.value ? "已开启" : "未开启"}`,
      `电池优化白名单：${info?.ignoringBatteryOptimizations ? "已加入" : "未加入"}`,
      `播放引擎：${settingStore.playbackEngine}`,
      `音频解码引擎：${settingStore.audioEngine}`,
      `Android 性能模式：${settingStore.androidPerformanceMode ? "已开启" : "已关闭"}`,
      `Android 性能诊断日志：${settingStore.androidPerformanceDiagnostics ? "已开启" : "已关闭"}`,
      `通知保留：${settingStore.androidKeepNotificationOnPause ? "是" : "否"}`,
      `通知点击行为：${settingStore.androidNotificationTapAction === "player" ? "打开播放器页" : "回到应用首页"}`,
      `通知显示封面：${settingStore.androidNotificationShowCover ? "是" : "否"}`,
      `通知副标题：${settingStore.androidNotificationSubtitleMode}`,
      `增强通知卡片：${settingStore.androidEnhancedNotificationEnabled ? "已开启" : "未开启"}`,
      `本地媒体权限：${androidAudioPermissionGranted.value ? "已开启" : "未开启"}`,
      `本地媒体缓存数量：${androidMediaTrackCount.value}`,
      `最近扫描时间：${androidMediaLastScanAt.value || "未扫描"}`,
      `必做项：${profile?.requiredActions.join("、") || "无"}`,
      `建议项：${profile?.recommendedActions.join("、") || "无"}`,
      `已知问题：${profile?.knownIssues.join("；") || "无"}`,
      `原生入口探测：${nativeActionReport}`,
      `原生通知状态：${romCompatReport?.notificationsEnabled ? "已开启" : "未开启或未知"}`,
      `原生电池白名单：${romCompatReport?.ignoringBatteryOptimizations ? "已加入" : "未加入或未知"}`,
    ];

    await copyData(lines.join("\n"), "已复制 Android 诊断摘要。");
  };

  const buildAndroidPlaybackDiagnosticsReportPayload = async () => {
    await loadAndroidMediaSummary();
    const cookieSnapshot = collectCookieSnapshot();

    return buildAndroidPerformanceDiagnosticsReport({
      system: androidSystemInfo.value,
      romProfile: androidRomProfile.value,
      romCompatReport: androidRomCompatReport.value,
      summaries: {
        system: androidSystemSummary.value,
        notification: androidNotificationControlSummary.value,
        performance: androidPerformanceSummary.value,
        rom: androidRomSummary.value,
      },
      settings: {
        playbackEngine: settingStore.playbackEngine,
        audioEngine: settingStore.audioEngine,
        androidPerformanceMode: settingStore.androidPerformanceMode,
        androidReducePlaybackAnimations: settingStore.androidReducePlaybackAnimations,
        androidFreezePlaybackRoutes: false,
        androidLowFrequencyLyrics: settingStore.androidLowFrequencyLyrics,
        androidDisablePlaybackBackground: settingStore.androidDisablePlaybackBackground,
        androidPerformanceDiagnostics: settingStore.androidPerformanceDiagnostics,
        androidEnhancedNotificationEnabled: settingStore.androidEnhancedNotificationEnabled,
        androidEnhancedNotificationExclusive: settingStore.androidEnhancedNotificationExclusive,
      },
      media: {
        audioPermissionGranted: androidAudioPermissionGranted.value,
        notificationPermissionGranted: androidNotificationPermissionGranted.value,
        mediaTrackCount: androidMediaTrackCount.value,
        mediaLastScanAt: androidMediaLastScanAt.value,
      },
      login: {
        hasMusicU: Boolean(cookieSnapshot.MUSIC_U),
        hasMusicA: Boolean(cookieSnapshot.MUSIC_A),
        hasCsrf: Boolean(cookieSnapshot.__csrf),
        cookieKeys: Object.keys(cookieSnapshot).sort(),
      },
    });
  };

  const buildAndroidDiagnosticsFileName = () => {
    const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
    return `SPlayer-ROM-Compat-Android-Diagnostics-${timestamp}.txt`;
  };

  const downloadTextFile = (fileName: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportAndroidPlaybackDiagnosticsReport = async () => {
    const report = await buildAndroidPlaybackDiagnosticsReportPayload();
    const fileName = buildAndroidDiagnosticsFileName();

    if (isAndroidApp) {
      const savedUri = saveAndroidTextFile(fileName, report);
      if (savedUri) {
        window.$message.success(`已导出诊断报告：下载/SPlayer-ROM-Compat/${fileName}`);
        return;
      }
    }

    downloadTextFile(fileName, report);
    window.$message.success(`已导出诊断报告：${fileName}`);
  };

  const clearAndroidPlaybackDiagnosticsReport = () => {
    clearAndroidPerformanceDiagnostics();
    window.$message.success("已清空 Android 诊断缓存。");
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
        title: "Android 性能与稳定性",
        show: showAndroidSettings,
        tags: [{ text: "推荐", type: "success" }],
        items: [
          {
            key: "androidPerformanceModeQuick",
            label: "Android 性能模式",
            type: "switch",
            description: () =>
              `${androidPerformanceSummary.value}。播放时会降低全局进度刷新、歌词逐字渲染、背景模糊和部分动画，优先保证低功耗与流畅度。`,
            value: computed({
              get: () => settingStore.androidPerformanceMode,
              set: (value) => {
                settingStore.androidPerformanceMode = value;
              },
            }),
          },
          {
            key: "androidReducePlaybackAnimations",
            label: "播放时降低动画",
            type: "switch",
            show: computed(() => settingStore.androidPerformanceMode),
            description: "播放音乐时关闭弹簧、列表位移和页面切换动画，降低 WebView 主线程压力。",
            value: computed({
              get: () => settingStore.androidReducePlaybackAnimations,
              set: (value) => {
                settingStore.androidReducePlaybackAnimations = value;
              },
            }),
          },
          {
            key: "androidFreezePlaybackRoutes",
            label: "播放时冻结后台页面",
            type: "switch",
            show: computed(() => false),
            description: "该实验项已停用，避免部分 Android 16 / ColorOS 设备播放后页面崩坏。",
            value: computed({
              get: () => false,
              set: () => {
                settingStore.androidFreezePlaybackRoutes = false;
              },
            }),
          },
          {
            key: "androidLowFrequencyLyrics",
            label: "播放时降低歌词刷新率",
            type: "switch",
            show: computed(() => settingStore.androidPerformanceMode),
            description: "播放页歌词改为低频更新，并禁用 Android 上较重的逐字歌词效果。",
            value: computed({
              get: () => settingStore.androidLowFrequencyLyrics,
              set: (value) => {
                settingStore.androidLowFrequencyLyrics = value;
              },
            }),
          },
          {
            key: "androidDisablePlaybackBackground",
            label: "播放时关闭动态背景",
            type: "switch",
            show: computed(() => settingStore.androidPerformanceMode),
            description: "播放音乐时移除视频背景、大图模糊和遮罩滤镜，减少 GPU 合成压力。",
            value: computed({
              get: () => settingStore.androidDisablePlaybackBackground,
              set: (value) => {
                settingStore.androidDisablePlaybackBackground = value;
              },
            }),
          },
          {
            key: "androidSilentCommentErrors",
            label: "评论失败静默兜底",
            type: "switch",
            description: "评论代理失败时不再反复弹出错误，直接显示空评论占位。",
            value: computed({
              get: () => settingStore.androidSilentCommentErrors,
              set: (value) => {
                settingStore.androidSilentCommentErrors = value;
              },
            }),
          },
          {
            key: "androidPerformanceDiagnosticsQuick",
            label: "Android 性能诊断日志",
            type: "switch",
            description:
              "开启后每 10 秒输出播放事件、原生 Bridge 和歌词刷新统计，用于定位真机卡顿。",
            value: computed({
              get: () => settingStore.androidPerformanceDiagnostics,
              set: (value) => {
                settingStore.androidPerformanceDiagnostics = value;
              },
            }),
          },
          {
            key: "androidPlaybackDiagnosticsReport",
            label: "Android 播放诊断报告",
            type: "button",
            buttonLabel: "导出 TXT",
            description:
              "导出完整诊断报告 TXT 文件，包含帧率采样、长任务、Web 错误、原生播放器事件、WebView 渲染进程异常和 ROM 信息。",
            action: () => {
              void exportAndroidPlaybackDiagnosticsReport();
            },
            extraButton: {
              label: "清空缓存",
              type: "primary",
              secondary: true,
              strong: true,
              action: clearAndroidPlaybackDiagnosticsReport,
            },
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
        title: "Android 专项适配",
        show: showAndroidSettings,
        items: [
          {
            key: "androidSystemSummary",
            label: "系统与 ROM 信息",
            type: "button",
            buttonLabel: "打开应用设置",
            description: () => androidSystemSummary.value,
            action: () => {
              openAndroidSettings(
                openAndroidAppDetailSettings,
                "已打开应用详情设置。",
                "当前 ROM 暂不支持直接打开应用详情设置。",
              );
            },
          },
          {
            key: "androidPerformanceMode",
            label: "Android 性能模式",
            type: "switch",
            description: () =>
              `${androidPerformanceSummary.value}。开启后会降低播放页动效、歌词刷新频率和背景模糊，优先保证播放时流畅度。`,
            value: computed({
              get: () => settingStore.androidPerformanceMode,
              set: (value) => {
                settingStore.androidPerformanceMode = value;
              },
            }),
          },
          {
            key: "androidAutoUiScale",
            label: "自动适配本机分辨率",
            type: "switch",
            description:
              "开启后会读取 Android 视口、屏幕像素和密度，按短边宽度自动匹配界面缩放；旋转、分屏或 ROM 缩放变化后会自动重算。",
            value: computed({
              get: () => settingStore.androidAutoUiScale,
              set: (value) => {
                settingStore.androidAutoUiScale = value;
              },
            }),
          },
          {
            key: "androidUiScale",
            label: "Android 手动界面缩放",
            type: "custom",
            show: computed(() => !settingStore.androidAutoUiScale),
            description: () =>
              `${androidUiScaleSummary.value} 当前为自定义百分比，可以在 60% 到 110% 之间连续调整。`,
            component: markRaw(AndroidUiScaleControl),
          },
          {
            key: "androidCompactUi",
            label: "Android 紧凑布局",
            type: "switch",
            description: "开启后会收紧设置项、列表、顶部栏和底部栏间距；触控按钮仍保留可点击尺寸。",
            value: computed({
              get: () => settingStore.androidCompactUi,
              set: (value) => {
                settingStore.androidCompactUi = value;
              },
            }),
          },
          {
            key: "androidPerformanceDiagnostics",
            label: "Android 性能诊断日志",
            type: "switch",
            description:
              "开启后每 10 秒在控制台输出播放事件、原生 Bridge 和歌词刷新统计，便于定位卡顿来源。",
            value: computed({
              get: () => settingStore.androidPerformanceDiagnostics,
              set: (value) => {
                settingStore.androidPerformanceDiagnostics = value;
              },
            }),
          },
          {
            key: "androidNativePlayerPageEnabled",
            label: "原生播放页接管（兼容模式）",
            type: "switch",
            description:
              "默认关闭以使用 Web 卡片式播放器。开启后 Android 全屏播放页由原生层接管，适合低性能设备临时降载，但会关闭卡片跟手展开体验。",
            value: computed({
              get: () => settingStore.androidNativePlayerPageEnabled,
              set: (value) => {
                settingStore.androidNativePlayerPageEnabled = value;
              },
            }),
          },
          {
            key: "androidNativeMiniPlayerBarEnabled",
            label: "原生底部播放卡片（降载模式）",
            type: "switch",
            show: computed(() => settingStore.androidPerformanceMode),
            description:
              "默认关闭以显示 Web 卡片式播放器。开启后底部迷你播放器由原生 View 接管，适合排查卡顿，但不提供 PR #15 的卡片展开手势。",
            value: computed({
              get: () => settingStore.androidNativeMiniPlayerBarEnabled,
              set: (value) => {
                settingStore.androidNativeMiniPlayerBarEnabled = value;
              },
            }),
          },
          {
            key: "androidRomProfile",
            label: "ROM 兼容画像",
            type: "button",
            buttonLabel: computed(() => androidRomPrimaryActionLabel.value),
            description: () => androidRomSummary.value,
            action: openAndroidPrimaryRomGuide,
            extraButton: {
              label: "复制诊断",
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
            label: "电池优化",
            type: "button",
            buttonLabel: computed(() =>
              androidSystemInfo.value?.ignoringBatteryOptimizations ? "已忽略" : "忽略电池优化",
            ),
            description: () => androidBatteryOptimizationSummary.value,
            action: requestIgnoreBatteryOptimization,
          },
          {
            key: "androidAutoStart",
            label: "自启动管理",
            type: "button",
            buttonLabel: "打开自启动设置",
            description: "部分国内 ROM 需要手动开启自启动和后台白名单。",
            action: () => {
              openAndroidSettings(
                openAndroidAutoStartSettings,
                "已打开自启动设置。",
                "当前 ROM 暂不支持直接打开自启动设置。",
              );
            },
          },
          {
            key: "androidBackgroundActivity",
            label: "后台活动",
            type: "button",
            buttonLabel: "打开后台活动",
            description: () => androidBackgroundActivitySummary.value,
            action: openAndroidBackgroundActivity,
          },
          {
            key: "androidBackgroundPopup",
            label: "后台弹出界面",
            type: "button",
            buttonLabel: "打开后台弹出",
            description: () => androidBackgroundPopupSummary.value,
            action: openAndroidBackgroundPopup,
          },
          {
            key: "androidPowerManager",
            label: "厂商耗电管理",
            type: "button",
            buttonLabel: "打开耗电管理",
            description: () => androidPowerManagerSummary.value,
            action: openAndroidPowerManager,
          },
          {
            key: "androidNotificationPermission",
            label: "通知权限",
            type: "button",
            buttonLabel: computed(() =>
              androidNotificationPermissionGranted.value ? "已开启" : "申请权限",
            ),
            description: () => androidNotificationSummary.value,
            action: requestAndroidNotificationAccess,
          },
          {
            key: "androidNotificationSettings",
            label: "通知设置",
            type: "button",
            buttonLabel: "打开通知设置",
            description: "打开系统通知选项，可进一步配置锁屏显示、横幅等行为。",
            action: () => {
              openAndroidSettings(
                openAndroidNotificationSettings,
                "已打开通知设置。",
                "当前 ROM 暂不支持直接打开通知设置。",
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
            description: "关闭后不显示封面，系统媒体卡片会更紧凑。",
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
            description: "选择系统媒体卡片副标题显示歌手、专辑或当前歌词。",
            options: [
              { label: "显示歌手", value: "artist" },
              { label: "显示专辑", value: "album" },
              { label: "显示歌词", value: "lyric" },
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
              "开启后会额外显示一张应用增强音频控制通知，用于补齐封面、进度、上一首、播放暂停和下一首；默认与系统原生媒体卡片共存。",
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
