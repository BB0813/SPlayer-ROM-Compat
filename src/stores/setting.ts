import { TimeFormat } from "@/composables/useTimeFormat";
import { SongUnlockServer } from "@/core/player/SongManager";
import type { SongLevelType } from "@/types/main";
import { defaultAMLLDbServer } from "@/utils/meta";
import { isAndroidApp } from "@/utils/env";
import { defineStore } from "pinia";
import { CURRENT_SETTING_SCHEMA_VERSION, settingMigrations } from "./migrations/settingMigrations";
import { ThemeColorType } from "@/types/color";
import type { LyricPriority } from "@/types/lyric";

export interface SettingState {
  schemaVersion?: number;

  themeMode: "light" | "dark" | "auto";

  themeColorType: ThemeColorType;

  preferTraditionalChinese: boolean;

  traditionalChineseVariant: "s2t" | "s2tw" | "s2hk" | "s2twp";

  themeCustomColor: string;

  themeGlobalColor: boolean;

  themeVariant: "primary" | "secondary" | "tertiary" | "neutral" | "neutralVariant" | "error";

  themeFollowCover: boolean;

  fontSettingStyle: "single" | "multi" | "custom";

  globalFont: "default" | string;

  LyricFont: "follow" | string;

  japaneseLyricFont: "follow" | string;

  englishLyricFont: "follow" | string;

  koreanLyricFont: "follow" | string;

  showCloseAppTip: boolean;

  closeAppMethod: "exit" | "hide";

  showTaskbarProgress: boolean;

  androidKeepNotificationOnPause: boolean;

  androidNotificationTapAction: "app" | "player";
  androidNotificationShowCover: boolean;
  androidNotificationSubtitleMode: "artist" | "album" | "lyric";
  androidEnhancedNotificationEnabled: boolean;
  androidEnhancedNotificationExclusive: boolean;
  /** Android 性能模式 */
  androidPerformanceMode: boolean;
  /** Android 性能诊断日志 */
  androidPerformanceDiagnostics: boolean;
  /** Android 播放时降低动画 */
  androidReducePlaybackAnimations: boolean;
  /** Android 播放时冻结后台页面 */
  androidFreezePlaybackRoutes: boolean;
  /** Android 播放时降低歌词刷新率 */
  androidLowFrequencyLyrics: boolean;
  /** Android 播放时关闭动态背景 */
  androidDisablePlaybackBackground: boolean;
  /** Android 评论失败静默兜底 */
  androidSilentCommentErrors: boolean;
  /** Android 原生播放页预览 */
  androidNativePlayerPageEnabled: boolean;
  /** Android 界面缩放百分比 */
  androidUiScale: number;
  /** Android 紧凑布局 */
  androidCompactUi: boolean;

  taskbarLyricUseThemeColor: boolean;

  useOnlineService: boolean;

  shareUrlFormat: "web" | "mobile";

  checkUpdateOnStart: boolean;

  hideVipTag: boolean;

  lyricFontSizeMode: "fixed" | "adaptive";

  lyricFontSize: number;

  lyricTranFontSize: number;

  lyricRomaFontSize: number;

  lyricFontWeight: number;

  showWordLyrics: boolean;

  showTran: boolean;

  showRoma: boolean;

  swapTranRoma: boolean;

  showWordsRoma: boolean;

  lyricTransition: "slide" | "fade";

  lyricsPosition: "flex-start" | "center" | "flex-end";

  lyricsScrollOffset: number;

  lyricHorizontalOffset: number;

  lyricAlignRight: boolean;

  hideBracketedContent: boolean;

  replaceLyricBrackets: boolean;

  uncensorMaskedProfanity: boolean;

  bracketReplacementPreset: "dash" | "angleBrackets" | "cornerBrackets" | "custom";

  customBracketReplacement: string;

  downloadPath: string;

  downloadThreadCount: number;

  cacheEnabled: boolean;

  songCacheEnabled: boolean;

  fileNameFormat: "title" | "artist-title" | "title-artist";

  folderStrategy: "none" | "artist" | "artist-album";

  downloadMeta: boolean;

  downloadCover: boolean;

  downloadLyric: boolean;

  downloadLyricTranslation: boolean;

  downloadLyricRomaji: boolean;

  usePlaybackForDownload: boolean;

  saveMetaFile: boolean;

  useUnlockForDownload: boolean;

  downloadMakeYrc: boolean;

  downloadSaveAsAss: boolean;

  downloadLyricToTraditional: boolean;

  downloadLyricEncoding: "utf-8" | "gbk" | "utf-16" | "iso-8859-1";

  enableDownloadHttp2: boolean;

  downloadSongLevel: SongLevelType;

  proxyProtocol: "off" | "http" | "https";

  proxyServe: string;

  proxyPort: number;

  songLevel:
    | "standard"
    | "higher"
    | "exhigh"
    | "lossless"
    | "hires"
    | "jyeffect"
    | "sky"
    | "jymaster";

  playDevice: "default" | string;

  audioEngine: "android-native" | "element" | "ffmpeg";

  audioLatencyHint: "interactive" | "playback";

  autoPlay: boolean;

  useNextPrefetch: boolean;

  songVolumeFade: boolean;

  songVolumeFadeTime: number;

  enableReplayGain: boolean;

  replayGainMode: "track" | "album";

  useSongUnlock: boolean;

  songUnlockServer: { key: SongUnlockServer; enabled: boolean }[];

  countDownShow: boolean;

  barLyricShow: boolean;

  timeFormat: TimeFormat;

  playerType: "cover" | "record" | "fullscreen";

  commentDisplayMode: "fullscreen" | "left" | "right";

  playerBackgroundType: "none" | "animation" | "blur" | "color";

  playerBackgroundFps: number;

  playerBackgroundFlowSpeed: number;

  playerBackgroundPause: boolean;

  playerBackgroundLowFreqVolume: boolean;

  playerBackgroundRenderScale: number;

  autoHidePlayerMeta: boolean;

  memoryLastSeek: boolean;

  progressTooltipShow: boolean;

  progressAdjustLyric: boolean;

  showPlaylistCount: boolean;

  showSpectrums: boolean;

  smtcOpen: boolean;

  lyricsBlur: boolean;

  lyricsBlendMode: "screen" | "plus-lighter";

  playSongDemo: boolean;

  useAMLyrics: boolean;

  useAMSpring: boolean;

  hidePassedLines: boolean;

  wordFadeWidth: number;

  lyricOffsetStep: number;

  audioDelayCompensation: number;

  enableOnlineTTMLLyric: boolean;

  enableQQMusicLyric: boolean;

  lyricPriority: LyricPriority;

  localLyricQQMusicMatch: boolean;

  amllDbServer: string;

  menuShowCover: boolean;

  menuExpandedKeys: string[];

  preventSleep: boolean;

  localFilesPath: string[];

  localLyricPath: string[];

  localSeparators: string[];

  showLocalCover: boolean;

  hiddenCovers: {
    home: boolean;

    playlist: boolean;

    toplist: boolean;

    artist: boolean;

    new: boolean;

    player: boolean;

    list: boolean;

    personalFM: boolean;

    artistDetail: boolean;

    radio: boolean;

    album: boolean;

    like: boolean;

    video: boolean;

    videoDetail: boolean;
  };

  hideAllCovers: boolean;

  hideMiniPlayerCover: boolean;

  routeAnimation: "none" | "fade" | "zoom" | "slide" | "up" | "flow" | "mask-left" | "mask-top";

  playerExpandAnimation: "up" | "flow";

  useRealIP: boolean;

  realIP: string;

  scrobbleSong: boolean;

  dynamicCover: boolean;

  useKeepAlive: boolean;

  enableExcludeLyrics: boolean;

  enableExcludeLyricsTTML: boolean;

  enableExcludeLyricsLocal: boolean;

  excludeLyricsUserKeywords: string[];

  excludeLyricsUserRegexes: string[];

  enableExcludeComments: boolean;

  excludeCommentKeywords: string[];

  excludeCommentRegexes: string[];

  showDefaultLocalPath: boolean;

  localFolderDisplayMode: "tab" | "dropdown";

  showPlayMeta: boolean;

  showSongQuality: boolean;

  showPlayerQuality: boolean;

  showSongPrivilegeTag: boolean;

  showSongExplicitTag: boolean;

  showSongOriginalTag: boolean;

  showSongAlbum: boolean;

  showSongDuration: boolean;

  showSongOperations: boolean;

  showSongArtist: boolean;

  sidebarHide: {
    hideDiscover: boolean;

    hidePersonalFM: boolean;

    hideRadioHot: boolean;

    hideLike: boolean;

    hideCloud: boolean;

    hideDownload: boolean;

    hideLocal: boolean;

    hideHistory: boolean;

    hideUserPlaylists: boolean;

    hideLikedPlaylists: boolean;

    hideHeartbeatMode: boolean;
  };

  // Controls the visibility of elements on the playlist detail page
  playlistPageElements: {
    tags: boolean;
    creator: boolean;
    time: boolean;
    description: boolean;
  };

  fullscreenPlayerElements: {
    like: boolean;
    addToPlaylist: boolean;
    download: boolean;
    comments: boolean;
    desktopLyric: boolean;
    moreSettings: boolean;
    copyLyric: boolean;
    lyricOffset: boolean;
    lyricSettings: boolean;
    commentCount: boolean;
  };

  contextMenuOptions: {
    play: boolean;
    playNext: boolean;
    addToPlaylist: boolean;
    mv: boolean;
    dislike: boolean;
    more: boolean;
    cloudImport: boolean;
    deleteFromPlaylist: boolean;
    deleteFromCloud: boolean;
    deleteFromLocal: boolean;
    openFolder: boolean;
    cloudMatch: boolean;
    wiki: boolean;
    search: boolean;
    download: boolean;
    copyName: boolean;
    musicTagEditor: boolean;
  };

  enableSearchKeyword: boolean;

  showSearchHistory: boolean;

  showHotSearch: boolean;

  searchInputBehavior: "normal" | "clear" | "sync";

  showHomeGreeting: boolean;

  homePageSections: Array<{
    key: "playlist" | "radar" | "artist" | "video" | "radio" | "album";
    name: string;
    visible: boolean;
    order: number;
  }>;

  userAgreementVersion: string;

  registryProtocol: {
    orpheus: boolean;
  };

  lastfm: {
    enabled: boolean;
    apiKey: string;
    apiSecret: string;
    sessionKey: string;
    username: string;
    scrobbleEnabled: boolean;
    nowPlayingEnabled: boolean;
  };

  playerFollowCoverColor: boolean;

  progressLyricShow: boolean;

  discordRpc: {
    enabled: boolean;

    showWhenPaused: boolean;

    displayMode: "Name" | "State" | "Details";
  };

  playbackEngine: "android-native" | "web-audio" | "mpv";

  customCss: string;

  customJs: string;

  playerStyleRatio: number;

  playerFullscreenGradient: number;

  streamingEnabled: boolean;

  disableAiAudio: boolean;

  disableDjMode: boolean;

  enableAutomix: boolean;

  automixMaxAnalyzeTime: number;

  enableGlobalErrorDialog: boolean;

  macos: {
    statusBarLyric: {
      enabled: boolean;
    };
  };
}

export const useSettingStore = defineStore("setting", {
  state: (): SettingState => ({
    schemaVersion: 0,
    themeMode: "auto",
    themeColorType: "default",
    preferTraditionalChinese: false,
    traditionalChineseVariant: "s2t",
    themeCustomColor: "#fe7971",
    themeFollowCover: false,
    themeGlobalColor: false,
    themeVariant: "secondary",
    fontSettingStyle: "single",
    globalFont: "default",
    LyricFont: "follow",
    japaneseLyricFont: "follow",
    englishLyricFont: "follow",
    koreanLyricFont: "follow",
    hideVipTag: false,
    menuShowCover: true,
    menuExpandedKeys: [],
    routeAnimation: "slide",
    playerExpandAnimation: "up",
    useOnlineService: true,
    shareUrlFormat: "web",
    showCloseAppTip: true,
    closeAppMethod: "hide",
    showTaskbarProgress: false,
    androidKeepNotificationOnPause: true,
    androidNotificationTapAction: "player",
    androidNotificationShowCover: true,
    androidNotificationSubtitleMode: "artist",
    androidEnhancedNotificationEnabled: false,
    androidEnhancedNotificationExclusive: false,
    androidPerformanceMode: isAndroidApp,
    androidPerformanceDiagnostics: false,
    androidReducePlaybackAnimations: false,
    androidFreezePlaybackRoutes: false,
    androidLowFrequencyLyrics: false,
    androidDisablePlaybackBackground: false,
    androidSilentCommentErrors: isAndroidApp,
    androidNativePlayerPageEnabled: false,
    androidUiScale: isAndroidApp ? 80 : 100,
    androidCompactUi: isAndroidApp,
    taskbarLyricUseThemeColor: false,
    checkUpdateOnStart: true,
    preventSleep: false,
    useKeepAlive: true,
    songLevel: "exhigh",
    playDevice: "default",
    audioEngine: isAndroidApp ? "android-native" : "element",
    audioLatencyHint: "interactive",
    autoPlay: false,
    useNextPrefetch: true,
    songVolumeFade: true,
    songVolumeFadeTime: 300,
    enableReplayGain: false,
    replayGainMode: "track",
    useSongUnlock: true,
    songUnlockServer: [
      { key: SongUnlockServer.BODIAN, enabled: true },
      { key: SongUnlockServer.GEQUBAO, enabled: true },
      { key: SongUnlockServer.NETEASE, enabled: true },
      { key: SongUnlockServer.KUWO, enabled: false },
    ],
    countDownShow: true,
    barLyricShow: true,
    timeFormat: "current-total",
    playerType: "cover",
    commentDisplayMode: "fullscreen",
    playerBackgroundType: "blur",
    playerBackgroundFps: 30,
    playerBackgroundFlowSpeed: 4,
    playerBackgroundPause: false,
    playerBackgroundLowFreqVolume: false,
    playerBackgroundRenderScale: 0.5,
    autoHidePlayerMeta: true,
    memoryLastSeek: true,
    progressTooltipShow: true,
    progressAdjustLyric: false,
    showPlaylistCount: true,
    showSpectrums: false,
    smtcOpen: true,
    playSongDemo: false,
    scrobbleSong: false,
    dynamicCover: false,
    lyricFontSizeMode: "adaptive",
    lyricFontSize: 46,
    lyricTranFontSize: 22,
    lyricRomaFontSize: 18,
    lyricFontWeight: 700,
    useAMLyrics: false,
    useAMSpring: false,
    hidePassedLines: false,
    wordFadeWidth: 0.5,
    lyricOffsetStep: 500,
    audioDelayCompensation: 0,
    enableOnlineTTMLLyric: false,
    enableQQMusicLyric: false,
    lyricPriority: "auto",
    localLyricQQMusicMatch: false,
    amllDbServer: defaultAMLLDbServer,
    showWordLyrics: true,
    showTran: true,
    showRoma: true,
    swapTranRoma: false,
    showWordsRoma: true,
    lyricTransition: "slide",
    lyricsPosition: "flex-start",
    lyricsBlur: false,
    lyricsBlendMode: "screen",
    lyricsScrollOffset: 0.25,
    lyricHorizontalOffset: 10,
    lyricAlignRight: false,
    hideBracketedContent: false,
    replaceLyricBrackets: false,
    uncensorMaskedProfanity: false,
    bracketReplacementPreset: "dash",
    customBracketReplacement: "-",
    enableExcludeLyrics: true,
    enableExcludeLyricsTTML: false,
    enableExcludeLyricsLocal: false,
    excludeLyricsUserKeywords: [],
    excludeLyricsUserRegexes: [],
    enableExcludeComments: false,
    excludeCommentKeywords: [],
    excludeCommentRegexes: [],
    localFilesPath: [],
    localLyricPath: [],
    showDefaultLocalPath: true,
    localFolderDisplayMode: "tab",
    localSeparators: ["/", "&"],
    showLocalCover: true,
    hiddenCovers: {
      home: false,
      playlist: false,
      toplist: false,
      artist: false,
      new: false,
      player: false,
      list: false,
      personalFM: false,
      artistDetail: false,
      radio: false,
      album: false,
      like: false,
      video: false,
      videoDetail: false,
    },
    hideAllCovers: false,
    hideMiniPlayerCover: false,
    downloadPath: "",
    downloadThreadCount: 8,
    cacheEnabled: true,
    songCacheEnabled: true,
    fileNameFormat: "title-artist",
    folderStrategy: "none",
    downloadMeta: true,
    downloadCover: true,
    downloadLyric: true,
    downloadLyricTranslation: true,
    downloadLyricRomaji: false,
    usePlaybackForDownload: false,
    useUnlockForDownload: false,
    downloadMakeYrc: false,
    downloadSaveAsAss: false,
    downloadLyricToTraditional: false,
    downloadLyricEncoding: "utf-8",
    enableDownloadHttp2: true,
    saveMetaFile: false,
    downloadSongLevel: "h",
    proxyProtocol: "off",
    proxyServe: "127.0.0.1",
    proxyPort: 80,
    useRealIP: false,
    realIP: "",
    showPlayMeta: true,
    showSongQuality: true,
    showPlayerQuality: true,
    showSongPrivilegeTag: true,
    showSongExplicitTag: true,
    showSongOriginalTag: true,
    showSongAlbum: true,
    showSongDuration: true,
    showSongOperations: true,
    showSongArtist: true,
    sidebarHide: {
      hideDiscover: false,
      hidePersonalFM: false,
      hideRadioHot: false,
      hideLike: false,
      hideCloud: false,
      hideDownload: false,
      hideLocal: false,
      hideHistory: false,
      hideUserPlaylists: false,
      hideLikedPlaylists: false,
      hideHeartbeatMode: false,
    },
    playlistPageElements: {
      tags: true,
      creator: true,
      time: true,
      description: true,
    },
    fullscreenPlayerElements: {
      like: true,
      addToPlaylist: true,
      download: true,
      comments: true,
      desktopLyric: true,
      moreSettings: true,
      copyLyric: true,
      lyricOffset: true,
      lyricSettings: true,
      commentCount: false,
    },
    contextMenuOptions: {
      play: true,
      playNext: true,
      addToPlaylist: true,
      mv: true,
      dislike: true,
      more: true,
      cloudImport: true,
      deleteFromPlaylist: true,
      deleteFromCloud: true,
      deleteFromLocal: true,
      openFolder: true,
      cloudMatch: true,
      wiki: true,
      search: true,
      download: true,
      copyName: true,
      musicTagEditor: true,
    },
    enableSearchKeyword: true,
    showSearchHistory: true,
    showHotSearch: true,
    searchInputBehavior: "normal",
    showHomeGreeting: true,
    homePageSections: [
      { key: "playlist", name: "推荐歌单", visible: true, order: 0 },
      { key: "radar", name: "每日推荐", visible: true, order: 1 },
      { key: "artist", name: "推荐歌手", visible: true, order: 2 },
      { key: "video", name: "推荐 MV", visible: true, order: 3 },
      { key: "radio", name: "推荐电台", visible: true, order: 4 },
      { key: "album", name: "新碟上架", visible: true, order: 5 },
    ],
    userAgreementVersion: "",
    registryProtocol: {
      orpheus: false,
    },
    lastfm: {
      enabled: false,
      apiKey: "",
      apiSecret: "",
      sessionKey: "",
      username: "",
      scrobbleEnabled: true,
      nowPlayingEnabled: true,
    },
    playerFollowCoverColor: true,
    progressLyricShow: true,
    discordRpc: {
      enabled: false,
      showWhenPaused: true,
      displayMode: "Name",
    },
    playbackEngine: isAndroidApp ? "android-native" : "web-audio",
    customCss: "",
    customJs: "",
    playerStyleRatio: 50,
    playerFullscreenGradient: 15,
    streamingEnabled: false,
    disableAiAudio: false,
    disableDjMode: false,
    enableAutomix: false,
    automixMaxAnalyzeTime: 60,
    enableGlobalErrorDialog: true,
    macos: {
      statusBarLyric: {
        enabled: false,
      },
    },
  }),
  getters: {
    getFadeTime(state): number {
      return state.songVolumeFade ? state.songVolumeFadeTime : 0;
    },

    isLastfmConfigured(state): boolean {
      const { lastfm } = state;
      return Boolean(lastfm.apiKey && lastfm.apiSecret);
    },
  },
  actions: {
    checkAndMigrate() {
      const currentVersion = this.schemaVersion ?? 0;
      const targetVersion = CURRENT_SETTING_SCHEMA_VERSION;

      if (currentVersion !== targetVersion) {
        console.log(`[Setting Migration] 设置版本迁移：${currentVersion} -> ${targetVersion}`);
        const currentState = { ...this.$state } as Partial<SettingState>;
        const updates: Partial<SettingState> = {};

        for (let version = currentVersion + 1; version <= targetVersion; version++) {
          const migration = settingMigrations[version];
          if (migration) {
            const migrationUpdates = migration(currentState);
            Object.assign(updates, migrationUpdates);
            Object.assign(currentState, migrationUpdates);
          }
        }

        this.$patch(updates);
        this.schemaVersion = targetVersion;
        console.log(`[Setting Migration] 设置版本已更新到 ${targetVersion}`);
      }
    },

    setThemeMode(mode?: "auto" | "light" | "dark") {
      if (mode === undefined) {
        if (this.themeMode === "auto") {
          this.themeMode = "light";
        } else if (this.themeMode === "light") {
          this.themeMode = "dark";
        } else {
          this.themeMode = "auto";
        }
      } else {
        this.themeMode = mode;
      }

      const themeModeText =
        this.themeMode === "auto"
          ? "\u8ddf\u968f\u7cfb\u7edf\u4e3b\u9898"
          : this.themeMode === "light"
            ? "\u6d45\u8272\u6a21\u5f0f"
            : "\u6df1\u8272\u6a21\u5f0f";

      window.$message.info(`\u4e3b\u9898\u5df2\u5207\u6362\u4e3a ${themeModeText}`, {
        showIcon: false,
      });
    },
  },
  persist: {
    key: "setting-store",
    storage: localStorage,
  },
});
