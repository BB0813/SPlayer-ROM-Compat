import { keywords, regexes } from "@/assets/data/exclude";
import { SongUnlockServer } from "@/core/player/SongManager";
import { defaultAMLLDbServer } from "@/utils/meta";
import { isAndroidApp } from "@/utils/env";
import type { SettingState } from "../setting";

export const CURRENT_SETTING_SCHEMA_VERSION = 38;

export type MigrationFunction = (state: Partial<SettingState>) => Partial<SettingState>;

export const settingMigrations: Record<number, MigrationFunction> = {
  3: () => {
    return {
      enableTTMLLyric: false,
      amllDbServer: defaultAMLLDbServer,
    };
  },
  4: () => {
    return {
      songUnlockServer: [
        { key: SongUnlockServer.BODIAN, enabled: true },
        { key: SongUnlockServer.GEQUBAO, enabled: true },
        { key: SongUnlockServer.NETEASE, enabled: true },
        { key: SongUnlockServer.KUWO, enabled: false },
      ],
    };
  },
  5: (state) => {
    interface OldSettingState extends Partial<SettingState> {
      excludeKeywords?: string[];
      excludeRegexes?: string[];
    }

    const oldState = state as OldSettingState;
    const oldKeywords = oldState.excludeKeywords;
    const oldRegexes = oldState.excludeRegexes;
    const userKeywords: string[] = [];
    const userRegexes: string[] = [];

    if (oldKeywords && Array.isArray(oldKeywords)) {
      oldKeywords.forEach((keyword) => {
        if (!keywords.includes(keyword)) {
          userKeywords.push(keyword);
        }
      });
    }

    if (oldRegexes && Array.isArray(oldRegexes)) {
      oldRegexes.forEach((regex) => {
        if (!regexes.includes(regex)) {
          userRegexes.push(regex);
        }
      });
    }

    return {
      excludeUserKeywords: userKeywords,
      excludeUserRegexes: userRegexes,
    } as Partial<SettingState>;
  },
  6: (state) => {
    interface OldSettingState extends Partial<SettingState> {
      enableTTMLLyric?: boolean;
      hideDiscover?: boolean;
      hidePersonalFM?: boolean;
      hideRadioHot?: boolean;
      hideLike?: boolean;
      hideCloud?: boolean;
      hideDownload?: boolean;
      hideLocal?: boolean;
      hideHistory?: boolean;
      hideUserPlaylists?: boolean;
      hideLikedPlaylists?: boolean;
      hideHeartbeatMode?: boolean;
    }

    const oldState = state as OldSettingState;

    return {
      enableOnlineTTMLLyric: oldState.enableTTMLLyric,
      sidebarHide: {
        hideDiscover: oldState.hideDiscover || false,
        hidePersonalFM: oldState.hidePersonalFM || false,
        hideRadioHot: oldState.hideRadioHot || false,
        hideLike: oldState.hideLike || false,
        hideCloud: oldState.hideCloud || false,
        hideDownload: oldState.hideDownload || false,
        hideLocal: oldState.hideLocal || false,
        hideHistory: oldState.hideHistory || false,
        hideUserPlaylists: oldState.hideUserPlaylists || false,
        hideLikedPlaylists: oldState.hideLikedPlaylists || false,
        hideHeartbeatMode: oldState.hideHeartbeatMode || false,
      },
    };
  },
  7: (state) => {
    interface OldSettingState extends Omit<Partial<SettingState>, "discordRpc"> {
      discordRpc?: {
        enabled: boolean;
        showWhenPaused: boolean;
        displayMode: string;
      };
    }

    const oldState = state as OldSettingState;
    const oldRpc = oldState.discordRpc;

    if (!oldRpc || !oldRpc.displayMode) {
      return {};
    }

    const modeMap: Record<string, "Name" | "State" | "Details"> = {
      name: "Name",
      state: "State",
      details: "Details",
    };

    const currentMode = oldRpc.displayMode;

    if (Object.hasOwn(modeMap, currentMode)) {
      return {
        discordRpc: {
          enabled: oldRpc.enabled,
          showWhenPaused: oldRpc.showWhenPaused,
          displayMode: modeMap[currentMode],
        },
      };
    }

    return {};
  },
  8: (state) => {
    interface OldSettingState extends Partial<SettingState> {
      enableExcludeTTML?: boolean;
      enableExcludeLocalLyrics?: boolean;
      excludeUserKeywords?: string[];
      excludeUserRegexes?: string[];
    }

    const oldState = state as OldSettingState;

    return {
      enableExcludeLyricsTTML: oldState.enableExcludeTTML,
      enableExcludeLyricsLocal: oldState.enableExcludeLocalLyrics,
      excludeLyricsUserKeywords: oldState.excludeUserKeywords,
      excludeLyricsUserRegexes: oldState.excludeUserRegexes,
    };
  },
  9: (state) => {
    interface OldSettingState extends Partial<SettingState> {
      preferQQMusicLyric?: boolean;
    }

    const oldState = state as OldSettingState;
    const preferQM = oldState.preferQQMusicLyric ?? false;

    return {
      enableQQMusicLyric: preferQM,
      lyricPriority: preferQM ? "qm" : "auto",
    };
  },
  10: (state) => {
    interface OldSettingState extends Partial<SettingState> {
      clearSearchOnBlur?: boolean;
    }

    const oldState = state as OldSettingState;
    return oldState.clearSearchOnBlur === true ? { searchInputBehavior: "clear" } : {};
  },
  11: () => {
    return {
      uncensorMaskedProfanity: false,
    };
  },
  12: () => {
    return {
      androidKeepNotificationOnPause: true,
      androidNotificationTapAction: "player",
    };
  },
  13: () => {
    return {
      androidNotificationShowCover: true,
      androidNotificationSubtitleMode: "artist",
    };
  },
  14: () => {
    return {
      androidEnhancedNotificationEnabled: false,
    };
  },
  15: () => {
    return {
      androidEnhancedNotificationExclusive: false,
    };
  },
  16: () => {
    return {
      androidPerformanceMode: isAndroidApp,
      androidPerformanceDiagnostics: false,
    };
  },
  17: () => {
    return isAndroidApp ? { androidPerformanceMode: true } : {};
  },
  18: () => {
    return isAndroidApp ? { androidPerformanceMode: true } : {};
  },
  19: () => {
    return {
      androidReducePlaybackAnimations: isAndroidApp,
      androidFreezePlaybackRoutes: isAndroidApp,
      androidLowFrequencyLyrics: isAndroidApp,
      androidDisablePlaybackBackground: isAndroidApp,
      androidSilentCommentErrors: isAndroidApp,
    };
  },
  20: () => {
    if (!isAndroidApp) return {};

    return {
      androidPerformanceMode: true,
      androidReducePlaybackAnimations: false,
      androidFreezePlaybackRoutes: true,
      androidLowFrequencyLyrics: false,
      androidDisablePlaybackBackground: false,
    };
  },
  21: () => {
    return {
      androidNativePlayerPageEnabled: false,
    };
  },
  22: () => {
    return {
      androidFreezePlaybackRoutes: false,
    };
  },
  23: () => {
    return {
      androidFreezePlaybackRoutes: false,
    };
  },
  24: () => {
    return {
      androidUiScale: isAndroidApp ? 90 : 100,
      androidCompactUi: isAndroidApp,
    };
  },
  25: () => {
    return isAndroidApp ? { androidUiScale: 85 } : {};
  },
  26: (state) => {
    if (!isAndroidApp) return {};
    const currentScale = state.androidUiScale;
    const androidUiScale =
      !currentScale || currentScale === 85 || currentScale === 90 ? 80 : currentScale;
    return { androidUiScale, androidCompactUi: true };
  },
  27: (state) => {
    if (!isAndroidApp) return {};
    const currentScale = Number(state.androidUiScale ?? 80);
    const androidUiScale = Number.isFinite(currentScale)
      ? Math.min(110, Math.max(60, Math.round(currentScale)))
      : 80;
    return { androidUiScale };
  },
  28: (state) => {
    if (!isAndroidApp) return {};
    const currentScale = Number(state.androidUiScale ?? 80);
    const androidUiScale = Number.isFinite(currentScale)
      ? Math.min(110, Math.max(60, Math.round(currentScale)))
      : 80;
    return {
      androidUiScale,
      androidCompactUi: state.androidCompactUi ?? true,
    };
  },
  29: (state) => {
    if (!isAndroidApp) return {};
    const currentScale = Number(state.androidUiScale ?? 80);
    const androidUiScale =
      !Number.isFinite(currentScale) || currentScale >= 100
        ? 80
        : Math.min(110, Math.max(60, Math.round(currentScale)));
    return {
      androidUiScale,
      androidCompactUi: true,
    };
  },
  30: (state) => {
    if (!isAndroidApp) return {};
    const currentScale = Number(state.androidUiScale ?? 80);
    const androidUiScale =
      !Number.isFinite(currentScale) || currentScale >= 85
        ? 80
        : Math.min(110, Math.max(60, Math.round(currentScale)));
    return {
      androidUiScale,
      androidCompactUi: true,
    };
  },
  31: (state) => {
    if (!isAndroidApp) return {};
    const currentScale = Number(state.androidUiScale ?? 80);
    const androidUiScale = Number.isFinite(currentScale)
      ? Math.min(110, Math.max(60, Math.round(currentScale)))
      : 80;
    return {
      androidUiScale,
      androidCompactUi: true,
    };
  },
  32: (state) => {
    if (!isAndroidApp) return {};
    const currentScale = Number(state.androidUiScale ?? 80);
    const androidUiScale =
      !Number.isFinite(currentScale) || currentScale >= 95
        ? 80
        : Math.min(110, Math.max(60, Math.round(currentScale)));
    return {
      androidUiScale,
      androidCompactUi: true,
    };
  },
  33: () => {
    return isAndroidApp
      ? {
          androidAutoUiScale: true,
          androidCompactUi: true,
        }
      : {};
  },
  34: () => {
    return isAndroidApp
      ? {
          androidPerformanceMode: true,
          androidReducePlaybackAnimations: true,
          androidLowFrequencyLyrics: true,
          androidDisablePlaybackBackground: true,
          androidFreezePlaybackRoutes: false,
        }
      : {};
  },
  35: () => {
    return isAndroidApp
      ? {
          androidLowFrequencyLyrics: false,
          androidCompactUi: false,
          androidUiScale: 90,
          androidNativePlayerPageEnabled: false,
        }
      : {};
  },
  36: () => {
    return isAndroidApp
      ? {
          androidNativePlayerPageEnabled: true,
          androidPerformanceMode: true,
          androidReducePlaybackAnimations: true,
          androidDisablePlaybackBackground: true,
          androidFreezePlaybackRoutes: false,
        }
      : {};
  },
  37: () => {
    return isAndroidApp
      ? {
          androidNativeMiniPlayerBarEnabled: true,
          androidPerformanceMode: true,
        }
      : {};
  },
  38: () => {
    return isAndroidApp
      ? {
          androidNativePlayerPageEnabled: false,
          androidNativeMiniPlayerBarEnabled: false,
        }
      : {};
  },
};
