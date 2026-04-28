import { toRaw } from "vue";
import { AudioErrorCode, type AudioErrorDetail } from "@/core/audio-player/BaseAudioPlayer";
import { useDataStore, useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import type { AudioSourceType, QualityType, SongType } from "@/types/main";
import type { RepeatModeType, ShuffleModeType } from "@/types/shared/play-mode";
import { type AudioAnalysis } from "@/types/audio/automix";
import { calculateLyricIndex } from "@/utils/calc";
import { getCoverColor } from "@/utils/color";
import { isAndroidApp, isElectron, isMac } from "@/utils/env";
import { getPlayerInfoObj, getPlaySongData } from "@/utils/format";
import { handleSongQuality, shuffleArray, sleep } from "@/utils/helper";
import lastfmScrobbler from "@/utils/lastfmScrobbler";
import { DJ_MODE_KEYWORDS } from "@/utils/meta";
import { calculateProgress } from "@/utils/time";
import type { LyricLine } from "@applemusic-like-lyrics/lyric";
import { type DebouncedFunc, throttle } from "lodash-es";
import { useBlobURLManager } from "../resource/BlobURLManager";
import { useAudioManager } from "./AudioManager";
import { useAutomixManager } from "@/core/automix/AutomixManager";
import { recordAndroidPerformanceEvent } from "@/platform/android/performance";
import { useLyricManager } from "./LyricManager";
import { mediaSessionManager } from "./MediaSessionManager";
import * as playerIpc from "./PlayerIpc";
import { PlayModeManager } from "./PlayModeManager";
import { useSongManager } from "./SongManager";

/**
 * 闂備礁婀遍搹搴ㄥ储娴犲妫樺〒姘ｅ亾鐎规洘濞婃俊鎼佹晜閹屾闂傚鍋勫ú銈夊疮閹殿喗鍋? * 闂備胶鍘у畷顒勬儗娓氣偓閹苯螖閸涱喗娅栧┑顔矫壕顓⑺囨导瀛樺仯闁规澘澧庣粔顕€鏌ｉ幘鐟扮厫闁挎稒鍔欓獮瀣偐閾忣偅顏熼梻浣告啞缁嬫牕螞閸曨垰绠犻柛鈩冪☉鐎氬鏌ｉ弬鎹愵劅闁告埃鍋撻梻浣藉吹閸嬫稑螞鎼淬劌鐒垫い鎴炲椤﹂绱?AudioManager 濠电偛鐡ㄩ崵搴ㄥ磹閹炬儼濮冲ù鍏兼綑杩濇繛杈剧悼閺咁偄鈻撻崼鏇炵?Store
 */
class PlayerController {
  /** 闂備胶鍘ч〃搴㈢濠婂嫭鍙忛柍鍝勬噹缁€鍌炴煙閹澘袚闁挎稒妫冮幃妤冩喆閸曨収鏆″┑锛勫仜閸婂灝鐣?*/
  private autoCloseInterval: ReturnType<typeof setInterval> | undefined;
  /** 闂備礁鎼悧鍐磻閹炬剚鐔嗛柛顐㈡濞层倕鈻嶉姀銈嗗仯闁搞儯鍔嶇粈鍐┿亜閹邦兙鍋㈢€?*/
  private readonly MAX_RETRY_COUNT = 3;
  /** 闁荤喐绮庢晶妤呭箰閸涘﹥娅犻柣妯款嚙閸楁娊鏌ょ喊鍗炲缂佹劖顨婂娲箵閹烘枬銉╂煟閿旇鐏＄紒宀勪憾閸╁嫰宕樿缁€鈧梻浣瑰缁嬫垿鎮ф繝鍕ㄥ亾閸偆鐭婃い顐犲灮娴狅箓鎮欓鍕殔缂傚倸鍊烽悞锕€顭囧▎鎴斿亾鐟欏嫬鈻曢柡?*/
  private retryInfo: { songId: number | string; count: number } = { songId: 0, count: 0 };
  /** 闁荤喐绮庢晶妤呭箰閸涘﹥娅犻柣妯款嚙缁犵粯銇勯幘璺烘瀾闁哄缍婇幃褰掑炊椤掍焦鏆犻梺娲讳簷閸楀啿顕ｆ禒瀣倞妞ゅ繐妫欓～?*/
  public currentRequestToken = 0;
  /** 闂佸搫顦弲婵嬪磻閻斿吋鍋ㄩ柤濮愬€栧畷澶愭倵閸︻厼啸缂佺姵鐗犻幃瑙勬媴閹绘帒鈷夐梺?*/
  private failSkipCount = 0;
  /** 闂備礁鎼€氱兘宕规导鏉戠畾濞达絽澹婂浼存煥濠靛棙鍣洪棅顒夊墴瀵爼鍩￠崒婊庣伇濡?Automix 闂佸搫顦弲娑樏洪敃鈧湁?*/
  public isTransitioning = false;
  /** 闂佽崵濮甸崝妤呭窗閺囥垺鍎楁俊銈呭暟娑撳秹鏌ㄥ☉妯侯仾闁稿﹦鍋ら弻鐔虹磼閵忕姴绠洪梺鍝勫€风粈浣界亽闂佺偨鍎辩壕顓犳兜閳ь剟姊洪悜鈺傛珖妞ゎ厼鐗撳畷锝堫樄闁诡垰鍟村畷鐔碱敍濡も偓娴滈箖鏌￠崟顐ょ閻?*/
  private playModeManager = new PlayModeManager();
  /** 闂備礁婀遍搹搴ㄥ储娴犲妫樺ù锝堫潐娴溿倖绻涢幋鐏活亪顢欐繝鍥ㄧ厸闁搞儜鍛喖闂佸搫鑻敃顏勭暦閸洘鍊烽柛鎾茬劍椤?*/
  private onTimeUpdate: DebouncedFunc<() => void> | null = null;
  /** 濠电偞鍨堕幐鎼佹晝閵夆晩鏁冨┑鍌氭啞閻撱儲绻涢崱妯轰刊闁搞倖鐗曢…璺ㄦ崉閸濆嫷浼€闂佽鍠栭敃顏勵嚕椤曗偓瀹曞ジ寮撮悤鍌滃惞 */
  private lastErrorTime = 0;
  /** 闁荤喐绮庢晶妤呭箰閸涘﹥娅犻柣妯烘▕濞间即鎮橀悙闈涗壕闂佽￥鍊濋弻娑㈠箳閹寸儐妫￠梺璇叉捣閺咁偆妲愰幒妤€绠婚悗鐢告櫜閸?*/
  public currentAnalysis: AudioAnalysis | null = null;
  public currentAnalysisKey: string | null = null;
  public currentAnalysisKind: "none" | "head" | "full" = "none";
  public currentAudioSource: {
    url: string;
    quality: QualityType | undefined;
    source: AudioSourceType | undefined;
  } | null = null;
  /** 闂傚倷绶￠崑鍡涘窗閹炬剚鍟呭┑鍌氭啞閻撳倻鈧箍鍎卞ú銊╁几閸岀偞鍊甸悷娆忓椤ｅ弶淇婇悙鎻掆偓鍨暦?*/
  private rateResetTimer: ReturnType<typeof setTimeout> | undefined;
  /** 闂傚倷绶￠崑鍡涘窗閹炬剚鍟呴柣鎾崇昂閳ь剚甯￠獮鍥敆閳ь剛绱炴笟鈧弻娑㈠棘鐠囨彃顬嬮梺杞扮婢т粙寮?*/
  private rateRampFrame: number | undefined;

  constructor() {
    // 注释已清理
    const audioManager = useAudioManager();
    const settingStore = useSettingStore();
    // 注释已清理
    if (settingStore.playDevice) {
      audioManager.setSinkId(settingStore.playDevice).catch(console.warn);
    }
    // 注释已清理
    this.bindAudioEvents();
  }

  /**
   * 闂佸湱鍘ч悺銊ヮ潖婵犳艾鏋?ReplayGain (闂傚倸鍊搁敃銉︾箾婵犲洤闂繛宸簽瀹撲線鎮楅崷顓炐為柍褜鍏橀崑?
   * @param songOverride 闁诲孩顔栭崰鏍箹椤愶箑鏄ユ俊銈呮噹缁犱即鏌涢妷鎴濇噺濮ｅ骸鈹戦鐣岀畵闁哄牜鍓欑叅?   * @param apply 闂備礁鎼€氱兘宕规导鏉戠畾濞达綀娅ｉ崡姘舵倵閿濆簼绨荤紒渚囧櫍楠炴牜鈧稒蓱閳锋帡鏌℃担闈涒偓婵嗙暦濮樿泛绾ч悹鎭掑妿姝囬梻浣告啞閹稿摜绮旂€靛憡顫曢柍鍝勬噹缁?   * @returns 闂佽崵濮崇欢銈囨閺囥垺鍋╁┑鐘宠壘缁€鍕煣韫囨凹娼愰柣锝呭船椤儻顦撮柛瀣枎閳绘棃顢橀姀鐘碉紮?   */
  public applyReplayGain(songOverride?: SongType, apply: boolean = true): number {
    const musicStore = useMusicStore();
    const settingStore = useSettingStore();
    const audioManager = useAudioManager();
    const automixManager = useAutomixManager();
    if (!settingStore.enableReplayGain) {
      if (apply) audioManager.setReplayGain(1);
      return 1;
    }
    const song = songOverride || musicStore.playSong;
    if (!song || !song.replayGain) {
      if (apply) audioManager.setReplayGain(1);
      return 1;
    }
    const { trackGain, albumGain, trackPeak, albumPeak } = song.replayGain;
    let targetGain = 1;
    // 注释已清理
    if (settingStore.replayGainMode === "album") {
      targetGain = albumGain ?? trackGain ?? 1;
    } else {
      targetGain = trackGain ?? albumGain ?? 1;
    }
    // 注释已清理
    const peak =
      settingStore.replayGainMode === "album" ? (albumPeak ?? trackPeak) : (trackPeak ?? albumPeak);
    // 注释已清理
    targetGain *= automixManager.automixGain;
    if (peak && peak > 0) {
      if (targetGain * peak > 1.0) {
        targetGain = 1.0 / peak;
      }
    }
    console.log(
      `婵☆偓绲介崯顖炲极?[ReplayGain] Applied: ${targetGain.toFixed(4)} (Mode: ${settingStore.replayGainMode})`,
    );
    if (apply) audioManager.setReplayGain(targetGain);
    return targetGain;
  }

  /**
   * 闂備礁鎲￠崹闈浳涘Δ鍚藉洭顢楅崟顒夋闂佺懓澧庨悺鏃堝汲閵夛妇绡€鐟滃酣宕濋幒鏃傜當鐎光偓閸曨偆顦梺绯曞墲椤洭鍩€椤戣法鐭欑€殿噮鍋婇幃褔宕煎┑鍫涘亰
   * @param song - 婵犳鍠楃换鍌炲嫉椤掆偓鐓?   * @param requestToken - 闂佽崵濮村ú顓㈠绩闁秵鍎戝ù鍏兼綑閸愨偓闂佹悶鍎烘禍鐐参?
   * @param options - 闂傚倷鐒﹀妯肩矓閸洘鍋?   * @param options.forceCacheForOnline - 闂備礁鎼€氱兘宕规导鏉戠畾濞达絽澹婇崵鏇㈡煕濠靛棗顏╅柣鎾村灩缁辨捇宕掑☉娆忕闂佸鏉垮鐎规洜鍏樻俊姝岊槻婵炲牏濮甸幈銊モ攽閸℃ɑ鎷卞┑?   * @param options.analysis - 闂備礁鎲＄敮鎺懳涘▎鎾村€甸柦妯猴級閻旂厧鐏崇€规洖娲ㄩ、?
   */
  public async prepareAudioSource(
    song: SongType,
    requestToken: number,
    options?: { forceCacheForOnline?: boolean; analysis?: "none" | "head" | "full" },
  ): Promise<{
    audioSource: {
      url: string;
      quality: QualityType | undefined;
      source: AudioSourceType | undefined;
    };
    analysis: AudioAnalysis | null;
    analysisKind: "none" | "head" | "full";
  }> {
    const songManager = useSongManager();
    const automixManager = useAutomixManager();
    const settingStore = useSettingStore();
    const audioSource = await songManager.getAudioSource(song);
    // 注释已清理
    if (requestToken !== this.currentRequestToken) {
      throw new Error("EXPIRED");
    }
    if (!audioSource.url) throw new Error("AUDIO_SOURCE_EMPTY");
    // 注释已清理
    const safeAudioSource = {
      ...audioSource,
      url: audioSource.url!,
      quality: audioSource.quality,
      source: audioSource.source,
    };
    // 注释已清理
    let analysis: AudioAnalysis | null = null;
    let analysisKind: "none" | "head" | "full" = "none";
    if (settingStore.enableAutomix) {
      if (options?.forceCacheForOnline) {
        safeAudioSource.url = await automixManager.ensureAutomixAudioSource(
          song,
          safeAudioSource.url,
          safeAudioSource.quality,
        );
        if (requestToken !== this.currentRequestToken) throw new Error("EXPIRED");
      }
      this.currentAudioSource = safeAudioSource;
      // 注释已清理
      const analysisKey = song.path || automixManager.fileUrlToPath(safeAudioSource.url);
      this.currentAnalysisKey = analysisKey;
      const analysisMode = options?.analysis ?? "full";
      const result = await automixManager.fetchAudioAnalysis(analysisKey, analysisMode);
      analysis = result.analysis;
      analysisKind = result.analysisKind;

      if (requestToken !== this.currentRequestToken) throw new Error("EXPIRED");
    } else {
      this.currentAudioSource = safeAudioSource;
    }
    return { audioSource: safeAudioSource, analysis, analysisKind };
  }

  /**
   * 闂佽崵濮崇粈浣规櫠娴犲鍋柛鈩冾殢濞间即鎮橀悙闈涗壕闂?UI 闂備胶绮…鍫ュ春閺嶎厼鐒?   * @param song - 婵犳鍠楃换鍌炲嫉椤掆偓鐓?   * @param startSeek - 闁诲孩顔栭崰鎺楀磻閹炬枼鏀芥い鏃囧亹瀹撳垾ek闂備礁鎼崯顐︽偉閻撳宫?   */
  public setupSongUI(song: SongType, startSeek: number) {
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    const lyricManager = useLyricManager();

    musicStore.playSong = song;
    statusStore.currentTime = startSeek;
    // 闂傚倷鐒﹁ぐ鍐矓閸洘鍋柛鈩兩戞禍銈嗙箾閹寸伝顏堫敊?
    statusStore.progress = 0;
    statusStore.lyricIndex = -1;
    // 注释已清理
    const sid = song.type === "radio" ? song.dj?.id : song.id;
    if (this.retryInfo.songId !== sid) {
      this.retryInfo = { songId: sid || 0, count: 0 };
    }
    statusStore.lyricLoading = true;
    // 注释已清理
    statusStore.abLoop.enable = false;
    statusStore.abLoop.pointA = null;
    statusStore.abLoop.pointB = null;
    // 注释已清理
    if (isElectron) {
      window.electron.ipcRenderer.send("desktop-lyric:update-data", {
        lyricLoading: true,
      });
    }
    // 注释已清理
    const { name, artist, album } = getPlayerInfoObj(song) || {};
    const coverUrl = song.coverSize?.s || song.cover || "";
    playerIpc.sendTaskbarMetadata({
      title: name || "",
      artist: artist || "",
      cover: coverUrl,
    });
    // 濠电偞鍨堕幑渚€顢氳閹便劑鍩￠崨顔惧姷濠殿喗顭堟禍顒勫矗閳ь剙鈹戦埄鍐炬當闁活厼鍊搁…鍥级濞嗙偓妗ㄩ悗鍏夊亾闁告劦浜濊闂?macOS 闂備胶绮…鍫ュ春閺嶎厼鐒垫い鎴ｆ硶閸斿秹鏌ｉ弽鏉戞灈妞ゎ偁鍨归悾婵嬪礃椤忓憛?缂備胶铏庨崣搴ㄥ窗閺囩姵宕?AutoMix 婵°倗濮烽崑鐘测枍閺囩姴鍨濋柨鏃囧Г娴溿倝鏌涢妷锝呭閻犲洨鍋ら弻锟犲礃閳哄倹鐎紓浣测偓鍐叉殶闁瑰弶鎸抽弫鍐焵椤掑啨浜归柛宀€鍋涢崡鎶芥倵濞戞鎴︽偂閳?
    if (isElectron) {
      const playTitle = `${name} - ${artist}`;
      playerIpc.sendSongChange(playTitle, name || "", artist || "", album || "");
      if (isMac) {
        playerIpc.sendMacStatusBarProgress({
          currentTime: startSeek,
          duration: song.duration,
          offset: statusStore.getSongOffset(song.id),
        });
      }
    }
    // 闂備礁鍚嬮崕鎶藉床閼艰翰浜归柛銉戝本妗ㄩ悗鍏夊亾闁告劦浜濊
    lyricManager.handleLyric(song);
  }

  /**
   * 闂備礁鎲＄敮妤冩崲閸岀儑缍栭柟鐗堟緲缁€宀勬煛瀹擃喖妫楅悵顖炴⒑閸︻叀妾搁柛妯圭矙瀵剚鎷呴崜鍙夋〃闁诲繒鍋熼崑鎾绘煥?
   * @param options 闂傚倷鐒﹀妯肩矓閸洘鍋?   * @param options.autoPlay 闂備礁鎼€氱兘宕规导鏉戠畾濞撴埃鍋撻柟铏洴椤㈡棃宕熼宥嗩殜閺岀喓绱掗姀鐘茬闂?   * @param options.seek 闂備礁鎲＄敮妤冩崲閸岀儑缍栭柟鐗堟緲缁犵粯銇勯幘璺烘瀾闁哄缍婂鍫曞煛閸屾壕妲堥柣搴ゎ潐婵炲﹪寮澶婇唶闁绘洑绀佸▓銈囩磽娴ｅ壊妲归悽顖ｄ簽濡?   */
  public async playSong(
    options: {
      autoPlay?: boolean;
      seek?: number;
      crossfade?: boolean;
      crossfadeDuration?: number;
      song?: SongType;
    } = { autoPlay: true, seek: 0 },
  ) {
    const statusStore = useStatusStore();
    const audioManager = useAudioManager();
    // 注释已清理
    this.isTransitioning = false;
    useAutomixManager().resetNextAnalysisCache();
    this.currentAnalysisKey = null;
    this.currentAudioSource = null;
    // 闂備焦鐪归崹濠氬窗閹版澘鍨傛慨妯挎硾濡﹢鏌熷▓鍨灍闁伙綁浜堕幃褰掑炊椤掍焦鏆犻梺娲讳簷閸楀啿顕ｆ禒瀣倞妞ゅ繐妫欓～?
    this.currentRequestToken++;
    const requestToken = this.currentRequestToken;
    const { autoPlay = true, seek = 0 } = options;
    // 注释已清理
    const playSongData = options.song || getPlaySongData();
    if (!playSongData) {
      statusStore.playLoading = false;
      // 闂備礁鎲＄敮妤冩崲閸岀儑缍栭柟鐗堟緲缁€宀勬煛瀹ュ啫濡奸柣蹇旑殜閺岋繝宕橀鍕戯綁鏌ｉ埄鍐╃鐎殿喗鎸冲畷锝嗗緞鐎ｅ灚袧
      if (!statusStore.playStatus && !autoPlay) return;
      return;
    }
    // Fuck DJ Mode
    if (this.shouldSkipSong(playSongData)) {
      console.log(`[Fuck DJ] Skipping: ${playSongData.name}`);
      window.$message.warning(`已跳过疑似 DJ/电台曲目：${playSongData.name}`);
      this.nextOrPrev("next");
      return;
    }
    try {
      // 缂傚倷鐒﹂弻銊╊敄閸涱厾鏆ら柛鈩冪☉绾剧粯绻濇繝鍌氼伌闁告挸澧介幉鎼佹偋閸喎纰嶆繝鈷€鍛枅妤犵偞锕㈤、姗€鎮㈤崨濠冪番 (闂傚倸鍊哥€氥劑宕愬┑鍡╃劷妞ゅ繐鐗嗛崣?Crossfade)
      statusStore.playLoading = true;
      if (!options.crossfade) {
        audioManager.stop();
      }
      // 缂傚倷鐒﹂弻銊╊敄閸涱厾鏆ら柛鈩冪☉閸楁娊鎮楀☉娅虫垿鎮￠埀?UI闂備焦瀵х粙鎴︽偋婵犲洦鍋ら柡鍥ュ灩閸楁娊妫呴顐㈠箳缂佽妫濋弻鐔碱敇瑜嶉悘娑㈡煃瑜滈崗娑氱矆娓氣偓閹啫鈹戠€ｎ偒妫冨銈庡亽閸忔﹢宕戦幘瀛樺闁革富鍘介幉娆撴煟閻樺弶鎼愮紒澶婄埣閹椽骞嬮敂鑺ユ珫婵犮垼鍩栫粙鎾剁矆婢舵劖鐓涢柛鎰典簻閳诲牊绻涢幘鍐差暢缂侇喖鐏氬鍕節閸曨収鈧偓缂傚倸鍊搁崯顖炲垂閸︻厼鍨濋柛鎾茬劍鐎氭岸姊洪崹顕呭剳婵犫偓?
      this.setupSongUI(playSongData, seek);
      const { audioSource, analysis, analysisKind } = await this.prepareAudioSource(
        playSongData,
        requestToken,
        { analysis: options.crossfade ? "head" : "none" },
      );
      if (requestToken !== this.currentRequestToken) return;
      // Automix 闂備礁鎲＄敮鎺懳涘▎鎾村€甸柤鎭掑劜閸庣喖鏌￠崘銊モ偓褰掑汲?
      const lastAnalysis = this.currentAnalysis;
      this.currentAnalysis = analysis;
      this.currentAnalysisKind = analysis ? analysisKind : "none";

      let startSeek = seek ?? 0;
      let initialRate = 1.0;
      const settingStore = useSettingStore();
      // Automix 闂備礁鎲￠悷銉╁磹瑜版帒姹查柣鏃傚劋婵ジ鏌ㄥ☉妯侯伀闁?
      if (settingStore.enableAutomix) {
        const automixManager = useAutomixManager();
        const automixParams = automixManager.calculateInitialAutomixParameters(
          analysis,
          lastAnalysis,
          options,
          startSeek,
        );
        startSeek = automixParams.startSeek;
        initialRate = automixParams.initialRate;
      }
      if (requestToken !== this.currentRequestToken) return;
      // 注释已清理
      console.log(
        `婵☆偓绲介崯顐ｇ?[${playSongData.id}] 闂備礁鎼悧鍐磻閹惧墎纾藉ù锝呮憸婢ф盯鏌熼幖浣锋喚鐎殿喓鍔戝畷锝夊Ψ閵堝洨鐣鹃梻?`,
        audioSource,
      );
      statusStore.songQuality = audioSource.quality;
      statusStore.audioSource = audioSource.source;
      // 闂備礁婀遍悷鎶藉幢閳哄倹鏉搁梺鍦帶閻°劌煤閺嶎厽鍎戝ù鍏兼綑缁犵粯銇勯幘璺烘瀾闁?
      await this.loadAndPlay(
        audioSource.url,
        autoPlay,
        startSeek,
        options.crossfade ? { duration: options.crossfadeDuration ?? 5 } : undefined,
        initialRate,
      );
      if (requestToken !== this.currentRequestToken) return;
      // 闂備礁鎲￠懝鎯归悜鑺ュ仾闁糕剝锚缁剁偤鏌涢弴銊ュ箺闁?
      await this.afterPlaySetup(playSongData);
      statusStore.playLoading = false;
    } catch (error) {
      if (requestToken === this.currentRequestToken) {
        console.error(
          "闂?闂備礁婀遍搹搴ㄥ储娴犲妫樺〒姘ｅ亾鐎规洘鑹鹃埞鎴﹀幢閳哄倻绋勯梻浣告啞閻楁鎮ч弴銏犖﹂柟瀵稿У鐎?",
          error,
        );
        this.handlePlaybackError(undefined);
      }
    }
  }

  /**
   * 闂備礁鎲＄敮鎺懨洪敃鈧悾鐑藉蓟閵夛富妫呴柣搴℃贡婵绮ｅ☉銏＄叆婵炴垶顭囨晶鏃傜磼椤斿ジ鍙勭€规洘宀稿畷鍫曞Ω閵夈儳鍝庨梻鍌氬€搁敃銉︾箾婵犲洢鈧倻鎹勭悰鈩冩暊闂佽婢樻晶搴ｇ矆婢跺ň妲堥柟鎯х－鏁堥梺闈╃稻閹倸顕ｉ鍕骇闁割煈鍣閬嶆煛婢跺苯浠╁┑顔哄€濋幃娲即閻樺啿鐝伴悗骞垮劚缁绘帞绮?
   * @param seek 闁荤喐绮庢晶妤呭箰閸涘﹥娅犻柣妯款嚙缁犵粯銇勯幘璺烘瀾闁哄缍婂鍫曞煛閸屾壕妲堥柣搴ゎ潐婵炲﹪寮澶婇唶闁绘洑绀佸▓銈囩磽娴ｅ壊妲归悽顖ｄ簽濡?   * @param autoPlay 闂備礁鎼€氱兘宕规导鏉戠畾濞撴埃鍋撻柟铏洴椤㈡棃宕熼宥嗩殜閺岀喓绱掗姀鐘茬闂佸搫鍊风欢姘跺极瀹ュ閱囬柕澹啰顐奸梺鑽ゅС闂勫秹宕愰幘鑸靛床婵娉涚粻鏉棵归敐鍛喐缂佸銈搁弻娑㈠箻瀹曞泦銈呪攽椤旇姤鍊愭鐐╁亾婵炴挻鑹鹃敃锔剧矆?
   */
  async switchQuality(seek: number = 0, autoPlay?: boolean) {
    const statusStore = useStatusStore();
    const songManager = useSongManager();
    const audioManager = useAudioManager();
    const playSongData = getPlaySongData();
    if (!playSongData || playSongData.path) return;
    // 注释已清理
    const shouldAutoPlay = autoPlay ?? statusStore.playStatus;
    try {
      statusStore.playLoading = true;
      // 注释已清理
      songManager.clearPrefetch();
      // 注释已清理
      const audioSource = await songManager.getAudioSource(playSongData);
      if (!audioSource.url) {
        window.$message.error("操作失败");
        statusStore.playLoading = false;
        return;
      }
      console.log(
        `婵☆偓绲介崯顖炲极?[${playSongData.id}] 闂備礁鎲＄敮鎺懨洪敃鈧悾鐑藉蓟閵夛富妫呴柣搴℃贡婵绮?`,
        audioSource,
      );
      // 注释已清理
      statusStore.songQuality = audioSource.quality;
      statusStore.audioSource = audioSource.source;
      // 注释已清理
      audioManager.stop();
      // 注释已清理
      await this.loadAndPlay(audioSource.url, shouldAutoPlay, seek);
      statusStore.playLoading = false;
    } catch (error) {
      console.error(
        "闂?闂備礁鎲＄敮鎺懨洪敃鈧悾鐑藉蓟閵夛富妫呴柣搴℃贡婵绮ｅ☉姗嗙唵闁诡垱澹嗙花鍧楁偡?",
        error,
      );
      statusStore.playLoading = false;
      window.$message.error("操作失败");
    }
  }

  /**
   * 闂備礁鎲＄敮鎺懨洪敃鈧悾鐑藉蓟閵夛富妫呴梺鐟板閻℃棃寮抽妷锔剧瘈?   * @param source 闂傚倸鍊搁敃銉︾箾婵犲洢鈧倻鎹勭悰鈩冩暊闂佸綊鍋婇崢楣冨垂婵傚憡鍋?   */
  public async switchAudioSource(source: string) {
    const statusStore = useStatusStore();
    const songManager = useSongManager();
    const musicStore = useMusicStore();
    const audioManager = useAudioManager();
    const playSongData = musicStore.playSong;
    if (!playSongData || playSongData.path) return;
    try {
      statusStore.playLoading = true;
      // 注释已清理
      songManager.clearPrefetch();
      // 注释已清理
      const audioSource = await songManager.getAudioSource(playSongData, source);
      if (!audioSource.url) {
        window.$message.error("操作失败");
        statusStore.playLoading = false;
        return;
      }
      console.log(
        `婵☆偓绲介崯顖炲极?[${playSongData.id}] 闂備礁鎲＄敮鎺懨洪敃鈧悾鐑藉蓟閵夛富妫呴梺鐟板閻℃棃寮抽妷锔剧瘈?`,
        audioSource,
      );
      // 注释已清理
      statusStore.songQuality = audioSource.quality;
      statusStore.audioSource = audioSource.source;
      // 注释已清理
      const seek = statusStore.currentTime;
      const shouldAutoPlay = statusStore.playStatus;
      // 注释已清理
      audioManager.stop();
      await this.loadAndPlay(audioSource.url, shouldAutoPlay, seek);
      statusStore.playLoading = false;
    } catch (error) {
      console.error(
        "闂?闂備礁鎲＄敮鎺懨洪敃鈧悾鐑藉蓟閵夛富妫呴梺鐟板閻℃棃寮抽妷锔剧瘈鐟滃酣宕濋弴銏犖﹂柟瀵稿У鐎?",
        error,
      );
      statusStore.playLoading = false;
      window.$message.error("操作失败");
    }
  }

  /**
   * 闂備礁鎲″缁樻叏閹灐褰掑炊椤掍緡妫呴梺鐟板閻℃棃寮抽妷锔剧缂傚牏濮烽ˇ锕傛煠閼姐倕鏋涙鐐达耿椤㈡﹢鎮㈤崨濠冪番
   * @param url 闂傚倸鍊搁敃銉︾箾婵犲洢鈧倻鎹勬總?URL
   * @param autoPlay 闂備礁鎼€氱兘宕规导鏉戠畾濞撴埃鍋撻柟铏洴椤㈡棃宕熼宥嗩殜閺岀喓绱掗姀鐘茬闂?   * @param seek 闁诲孩顔栭崰鎺楀磻閹炬枼鏀芥い鏃傗拡閸庢劙鏌熼幖浣锋喚鐎殿喓鍔戦幃娆擃敆娓氬洦袧闂?   * @param crossfadeOptions 婵犵數鍎戠徊娲焵椤掆偓閸熷灝顕ｉ搹顐ょ闁挎繂鍊甸崑鎾诲礃閸欏妲橀梻鍌欑劍濠㈡绮旈崼鏇熷仾?   * @param initialRate 闂備礁鎲＄敮妤冩崲閸岀儑缍栭柟鐗堟緲缁犵粯銇勯幘璺烘瀾闁哄缍婂娲敃閵堝懏鐏侀悗?   */
  public async loadAndPlay(
    url: string,
    autoPlay: boolean,
    seek: number,
    crossfadeOptions?: {
      duration: number;
      uiSwitchDelay?: number;
      onSwitch?: () => void;
      deferStateSync?: boolean;
      mixType?: "default" | "bassSwap";
      replayGain?: number;
    },
    initialRate: number = 1.0,
  ) {
    const statusStore = useStatusStore();
    const settingStore = useSettingStore();
    const audioManager = useAudioManager();

    if (this.rateResetTimer) {
      clearTimeout(this.rateResetTimer);
      this.rateResetTimer = undefined;
    }
    if (this.rateRampFrame) {
      cancelAnimationFrame(this.rateRampFrame);
      this.rateRampFrame = undefined;
    }

    audioManager.setVolume(statusStore.playVolume);

    if (audioManager.capabilities.supportsRate) {
      const baseRate = statusStore.playRate;
      if (!crossfadeOptions) {
        audioManager.setRate(baseRate * initialRate);
      }
      if (initialRate !== 1.0 && crossfadeOptions) {
        this.rateResetTimer = setTimeout(() => {
          this.rampRateTo(baseRate, 2000);
        }, crossfadeOptions.duration * 1000);
      }
    }

    const replayGain =
      crossfadeOptions?.replayGain ?? this.applyReplayGain(undefined, !crossfadeOptions);

    if (audioManager.engineType !== "mpv" && !settingStore.showSpectrums) {
      this.toggleOutputDevice();
    }

    try {
      const updateSeekState = () => {
        statusStore.currentTime = seek;
        const duration = this.getDuration() || statusStore.duration;
        if (duration > 0) {
          statusStore.progress = calculateProgress(seek, duration);
        } else {
          statusStore.progress = 0;
        }
        return duration;
      };

      const shouldDeferStateSync = !!(crossfadeOptions?.deferStateSync && autoPlay);

      if (seek > 0) {
        audioManager.setPendingSeek(seek / 1000);
      }

      if (crossfadeOptions) {
        const onSwitch = crossfadeOptions.onSwitch;
        const wrappedOnSwitch = shouldDeferStateSync
          ? () => {
              onSwitch?.();
              updateSeekState();
            }
          : onSwitch;

        await audioManager.crossfadeTo(url, {
          duration: crossfadeOptions.duration,
          seek: seek / 1000,
          autoPlay,
          uiSwitchDelay: crossfadeOptions.uiSwitchDelay,
          onSwitch: wrappedOnSwitch,
          mixType: crossfadeOptions.mixType,
          rate: audioManager.capabilities.supportsRate
            ? statusStore.playRate * initialRate
            : undefined,
          replayGain,
        });
      } else {
        const fadeTime = settingStore.getFadeTime ? settingStore.getFadeTime / 1000 : 0;
        const musicStore = useMusicStore();
        const currentSong = getPlaySongData();
        const currentArtist =
          currentSong?.type === "radio"
            ? currentSong.dj?.creator || "Unknown Creator"
            : Array.isArray(currentSong?.artists)
              ? currentSong.artists.map((item) => item.name).join("/")
              : String(currentSong?.artists || "Unknown Artist");
        const currentAlbum =
          currentSong?.type === "radio"
            ? currentSong.dj?.name || "Podcast"
            : typeof currentSong?.album === "object"
              ? currentSong.album?.name || "Unknown Album"
              : String(currentSong?.album || "Unknown Album");
        const currentArtworkUri = musicStore.getSongCover("xl") || musicStore.playSong.cover || "";

        await audioManager.play(url, {
          fadeIn: !!fadeTime,
          fadeDuration: fadeTime,
          autoPlay,
          seek: seek / 1000,
          rate: audioManager.capabilities.supportsRate
            ? statusStore.playRate * initialRate
            : undefined,
          title: currentSong?.name || musicStore.playSong.name || "SPlayer-ROM-Compat",
          artist: currentArtist,
          album: currentAlbum,
          artworkUri: currentArtworkUri,
        });
      }

      const duration = !crossfadeOptions || !shouldDeferStateSync ? updateSeekState() : 0;

      if (!autoPlay) {
        statusStore.playStatus = false;
        playerIpc.sendPlayStatus(false);
        playerIpc.sendTaskbarState({ isPlaying: false });
        playerIpc.sendTaskbarMode("paused");
        if (seek > 0) {
          const safeDuration = duration || this.getDuration() || statusStore.duration;
          const progress = calculateProgress(seek, safeDuration);
          playerIpc.sendTaskbarProgress(progress);
        }
      }
    } catch (error) {
      console.error("loadAndPlay failed", error);
      throw error;
    }
  }

  /**
   * 婵°倗濮烽崑鐘测枍閺囩姴鍨濋柨鏃囧Г娴溿倝鏌涢妷锝呭閻犲洨鍋ら弻鐔虹磼閵忕姴绠洪梺鍝勫€风欢姘跺蓟閸涘瓨鍋勯柛婵嗗婵?
   */
  private rampRateTo(targetRate: number, duration: number) {
    const audioManager = useAudioManager();
    const startRate = audioManager.getRate();
    const startTime = Date.now();

    const tick = () => {
      const now = Date.now();
      const progress = Math.min((now - startTime) / duration, 1.0);
      const current = startRate + (targetRate - startRate) * progress;
      audioManager.setRate(current);

      if (progress < 1.0) {
        this.rateRampFrame = requestAnimationFrame(tick);
      } else {
        this.rateRampFrame = undefined;
        this.rateResetTimer = undefined;
      }
    };
    this.rateRampFrame = requestAnimationFrame(tick);
  }

  /**
   * 闂備礁婀遍搹搴ㄥ储娴犲妫樺〒姘ｅ亾妤犵偛顑夐獮鍥敆閳ь剟锝為悩缁樼厱婵﹩鍓氶幑锝嗙箾閸喎鐏寸€规洏鍎查幆鏃堟晲閸ャ劍姣庨梺鑽ゅС缁€浣规櫠娴犲鍋?   * @param song 婵犳鍠楃换鍌炲嫉椤掆偓鐓?   */
  public async afterPlaySetup(song: SongType) {
    const dataStore = useDataStore();
    const musicStore = useMusicStore();
    const settingStore = useSettingStore();
    const songManager = useSongManager();

    if (song.type !== "radio") dataStore.setHistory(song);

    if (!song.path || song.type === "streaming") {
      mediaSessionManager.updateMetadata();
      getCoverColor(musicStore.songCover);
    } else if (isElectron) {
      await this.parseLocalMusicInfo(song.path);
    } else if (isAndroidApp) {
      mediaSessionManager.updateMetadata();
      getCoverColor(musicStore.songCover);
    }

    if (settingStore.useNextPrefetch) songManager.prefetchNextSong();

    if (settingStore.lastfm.enabled && settingStore.isLastfmConfigured) {
      const { name, artist, album } = getPlayerInfoObj() || {};
      const durationInSeconds = song.duration > 0 ? Math.floor(song.duration / 1000) : undefined;
      lastfmScrobbler.startPlaying(name || "", artist || "", album, durationInSeconds);
    }
  }

  private async parseLocalMusicInfo(path: string) {
    try {
      const musicStore = useMusicStore();
      if (musicStore.playSong.type === "streaming") return;

      const statusStore = useStatusStore();
      const blobURLManager = useBlobURLManager();
      const oldCover = musicStore.playSong.cover;
      if (oldCover && oldCover.startsWith("blob:")) {
        blobURLManager.revokeBlobURL(musicStore.playSong.path || "");
      }

      if (!oldCover || oldCover === "/images/song.jpg?asset") {
        console.log("閼惧嘲褰囩亸渚€娼伴弫鐗堝祦");
        const coverData = await window.electron.ipcRenderer.invoke("get-music-cover", path);
        if (coverData) {
          const blobURL = blobURLManager.createBlobURL(coverData.data, coverData.format, path);
          if (blobURL) musicStore.playSong.cover = blobURL;
        } else {
          musicStore.playSong.cover = "/images/song.jpg?asset";
        }
      }

      const infoData = await window.electron.ipcRenderer.invoke("get-music-metadata", path);
      statusStore.songQuality = handleSongQuality(infoData.format?.bitrate ?? 0, "local");
      getCoverColor(musicStore.playSong.cover);
      mediaSessionManager.updateMetadata();

      const { name, artist } = getPlayerInfoObj() || {};
      playerIpc.sendTaskbarMetadata({
        title: name || "",
        artist: artist || "",
        cover: musicStore.playSong.cover || "",
      });
    } catch (error) {
      console.error("操作失败", error);
    }
  }
  /**
   * 缂傚倸鍊烽懗鍫曞窗瀹ュ洨鍗氶柟缁㈠枟椤ュ﹪鏌熼崜浣烘憘闁哄棎鍎遍湁婵犲﹤鍠氶崕搴㈢箾閸℃劕鐏紒杈ㄥ浮楠炲鈹戦崼鐔哥槥
   */
  private getTimeUpdateThrottleWait(): number {
    const settingStore = useSettingStore();
    if (isAndroidApp && settingStore.androidPerformanceMode) return 3000;
    if (isAndroidApp) return 500;
    return 200;
  }

  private bindAudioEvents() {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    const musicStore = useMusicStore();
    const settingStore = useSettingStore();

    const audioManager = useAudioManager();

    // 注释已清理
    audioManager.addEventListener("loadstart", () => {
      statusStore.playLoading = true;
    });

    // 注释已清理
    audioManager.addEventListener("canplay", () => {
      const playSongData = getPlaySongData();
      // 缂傚倸鍊烽悞锕傚箰鐠囧樊鐒芥い鎰剁畱缁€澶愭煟濡厧鍔嬬紒?
      statusStore.playLoading = false;
      // 闂備浇顕栭崢褰掑垂瑜版崵?EQ
      if (isElectron && statusStore.eqEnabled) {
        const bands = statusStore.eqBands;
        if (bands && bands.length === 10) {
          bands.forEach((val, idx) => audioManager.setFilterGain(idx, val));
        }
      }
      if (isElectron) {
        // 注释已清理
        playerIpc.sendLikeStatus(dataStore.isLikeSong(playSongData?.id || 0));
        // 闂備礁鎼ú銈夋偤閵娾晛钃熷┑鐘插暟閳瑰秹鏌嶉埡浣告殨缂?
        const { name, artist, album } = getPlayerInfoObj() || {};
        const playTitle = `${name} - ${artist}`;
        playerIpc.sendSongChange(playTitle, name || "", artist || "", album || "");
      }
    });
    // 注释已清理
    audioManager.addEventListener("play", () => {
      const { name, artist } = getPlayerInfoObj() || {};
      const playTitle = `${name} - ${artist}`;
      // 注释已清理
      statusStore.playStatus = true;
      if (!isAndroidApp) {
        playerIpc.sendMediaPlayState("Playing");
        mediaSessionManager.updatePlaybackStatus(true);
        playerIpc.sendPlayStatus(true);
        playerIpc.sendTaskbarState({ isPlaying: true });
        playerIpc.sendTaskbarMode("normal");
        playerIpc.sendTaskbarProgress(statusStore.progress);
        console.log(`开始播放 [${musicStore.playSong?.id}]`, name);
      }
      window.document.title = `${playTitle} | SPlayer-ROM-Compat`;
      // 重置失败跳过计数
      if (this.retryInfo.count > 0) this.retryInfo.count = 0;
      // Last.fm Scrobbler
      lastfmScrobbler.resume();
    });
    // 注释已清理
    audioManager.addEventListener("pause", () => {
      statusStore.playStatus = false;
      if (!(isAndroidApp && settingStore.androidPerformanceMode)) {
        useAutomixManager().resetAutomixScheduling("IDLE");
      }
      if (!isAndroidApp) {
        playerIpc.sendMediaPlayState("Paused");
        mediaSessionManager.updatePlaybackStatus(false);
        playerIpc.sendPlayStatus(false);
        playerIpc.sendTaskbarState({ isPlaying: false });
        playerIpc.sendTaskbarMode("paused");
        playerIpc.sendTaskbarProgress(statusStore.progress);
        console.log("播放暂停");
      }
      if (!isElectron) window.document.title = "SPlayer-ROM-Compat";
      lastfmScrobbler.pause();
    });
    // 注释已清理
    audioManager.addEventListener("seeking", () => {
      if (!(isAndroidApp && settingStore.androidPerformanceMode)) {
        useAutomixManager().resetAutomixScheduling("MONITORING");
      }
    });
    // 闂備礁婀遍搹搴ㄥ储娴犲妫樺ù锝堟绾惧ジ鏌熼幆褏鎽犻悘?
    audioManager.addEventListener("ended", () => {
      if (this.isTransitioning) return;
      if (!(isAndroidApp && settingStore.androidPerformanceMode)) {
        useAutomixManager().resetAutomixScheduling("IDLE");
      }
      if (!isAndroidApp) console.log("播放结束");
      lastfmScrobbler.stop();
      // 注释已清理
      if (this.checkAutoClose()) return;
      // 注释已清理
      this.nextOrPrev("next", true, true);
    });
    // 闂佸搫顦弲婊呯矙閹寸姭鍋撶憴鍕枙鐎殿喖顕埀顒佺⊕钃遍柣鎾亾
    this.onTimeUpdate = throttle(() => {
      // 注释已清理
      recordAndroidPerformanceEvent("player:timeupdate");
      const { enable, pointA, pointB } = statusStore.abLoop;
      if (enable && pointA !== null && pointB !== null) {
        if (audioManager.currentTime >= pointB) {
          audioManager.seek(pointA);
        }
      }
      const rawTime = audioManager.currentTime;
      const currentTime = Math.floor(rawTime * 1000);
      const duration = Math.floor(audioManager.duration * 1000) || statusStore.duration;
      if (!(isAndroidApp && settingStore.androidPerformanceMode)) {
        useAutomixManager().updateAutomixMonitoring();
      }
      // 注释已清理
      const songId = musicStore.playSong?.id;
      const offset = statusStore.getSongOffset(songId);
      const useLiteLyrics = !!(
        isAndroidApp &&
        settingStore.androidPerformanceMode &&
        musicStore.songLyric.lrcData?.length
      );
      const useYrc = !!(
        settingStore.showWordLyrics &&
        musicStore.songLyric.yrcData?.length &&
        !useLiteLyrics
      );
      let rawLyrics: LyricLine[] = [];
      if (useYrc) {
        rawLyrics = toRaw(musicStore.songLyric.yrcData);
      } else {
        rawLyrics = toRaw(musicStore.songLyric.lrcData);
      }
      const lyricIndex = calculateLyricIndex(currentTime, rawLyrics, offset);
      // 注释已清理
      statusStore.$patch({
        currentTime,
        duration,
        progress: calculateProgress(currentTime, duration),
        lyricIndex,
      });
      // 注释已清理
      if (currentTime > 500 && this.failSkipCount > 0) {
        this.failSkipCount = 0;
      }
      // 闂備礁鎼ú銈夋偤閵娾晛钃熷┑鐘插鐎垫煡鏌ゆ慨鎰偓妤呭春?MediaSession
      if (!isAndroidApp) {
        mediaSessionManager.updateState(duration, currentTime);
      }
      if (!isAndroidApp) {
        // 注释已清理
        playerIpc.sendLyric({
          currentTime,
          songId: musicStore.playSong?.id,
          songOffset: statusStore.getSongOffset(musicStore.playSong?.id),
        });
        // 注释已清理
        if (settingStore.showTaskbarProgress) {
          playerIpc.sendTaskbarProgress(statusStore.progress);
        } else {
          playerIpc.sendTaskbarProgress("none");
        }
        // 注释已清理
        playerIpc.sendTaskbarProgressData({
          currentTime,
          duration,
          offset,
        });
        // 注释已清理
        if (isMac) {
          playerIpc.sendMacStatusBarProgress({
            currentTime,
            duration,
            offset,
          });
        }
        // 注释已清理
        playerIpc.sendSocketProgress(currentTime, duration);
      }
    }, this.getTimeUpdateThrottleWait());
    audioManager.addEventListener("timeupdate", this.onTimeUpdate);
    // 闂傚倷鐒︾€笛囨偡閵娾晩鏁嬮柕鍫濇缁剁偤鏌涢弴銊ュ箺闁?
    audioManager.addEventListener("error", (e) => {
      const detail = (e as CustomEvent<AudioErrorDetail>).detail;
      this.handlePlaybackError(detail, this.getSeek());
    });
  }

  /**
   * 缂傚倸鍊烽懗鍫曞窗瀹ュ洨鍗氶柟缁㈠枟閻撱儲绻涢崱妯轰刊闁搞倖鐗曢…璺ㄦ崉閸濆嫷浼€闂佽鍠栭敃锔惧垝閻㈢鍐€妞ゆ劧绲鹃?
   * @param errCode 闂傚倷鐒︾€笛囨偡閵娾晩鏁嬮柕鍫濐槹閸?   * @param currentSeek 闁荤喐绮庢晶妤呭箰閸涘﹥娅犻柣妯款嚙缁犵粯銇勯幘璺烘瀾闁哄鎳撻湁闁挎繂鎳愯倴闂?(闂備焦妞垮鍧楀礉鐎ｎ剝濮虫い鎺戝缁犳帡鏌曡箛鏇烆€屾俊?
   */
  private normalizePlaybackError(detail?: AudioErrorDetail) {
    const errorCode = typeof detail?.errorCode === "number" ? detail.errorCode : undefined;
    const errorCodeName =
      typeof detail?.errorCodeName === "string" ? detail.errorCodeName.trim() : "";
    const messageParts = [
      typeof detail?.message === "string" ? detail.message.trim() : "",
      typeof detail?.causeMessage === "string" ? detail.causeMessage.trim() : "",
      errorCodeName,
    ].filter(Boolean);
    const uniqueMessageParts = [...new Set(messageParts)];

    return {
      errorCode,
      displayMessage: this.resolvePlaybackDisplayMessage(
        errorCode,
        errorCodeName,
        uniqueMessageParts,
      ),
      debugMessage: uniqueMessageParts.join(" | "),
    };
  }

  private resolvePlaybackDisplayMessage(
    errorCode: number | undefined,
    errorCodeName: string,
    rawMessages: string[],
  ) {
    const safeMessage = rawMessages
      .map((message) => this.normalizeRawPlaybackMessage(message))
      .find(Boolean);

    if (errorCode === AudioErrorCode.ABORTED || errorCode === AudioErrorCode.DOM_ABORT) {
      return "";
    }

    if (
      errorCode === AudioErrorCode.NETWORK ||
      errorCodeName.startsWith("ERROR_CODE_IO_") ||
      errorCodeName === "ERROR_CODE_TIMEOUT"
    ) {
      return safeMessage || "网络异常，暂时无法获取可播放音源";
    }

    if (
      errorCode === AudioErrorCode.DECODE ||
      errorCodeName.startsWith("ERROR_CODE_DECODING_") ||
      errorCodeName.startsWith("ERROR_CODE_PARSING_")
    ) {
      return safeMessage || "音源解析失败，暂时无法播放";
    }

    if (
      errorCode === AudioErrorCode.SRC_NOT_SUPPORTED ||
      errorCodeName == "ERROR_CODE_UNSPECIFIED"
    ) {
      return safeMessage || "当前音源暂不支持播放";
    }

    return safeMessage || "播放出现异常";
  }

  private normalizeRawPlaybackMessage(message: string) {
    const text = message.replace(/\s+/g, " ").trim();
    if (!text) return "";
    if (text.length > 80) return "";
    if (/^ERROR_CODE_/i.test(text)) return "";
    if (this.looksLikeGarbledPlaybackMessage(text)) return "";

    if (
      /song url unavailable|remote api root missing|android local api failed|remote api proxy failed/i.test(
        text,
      )
    ) {
      return "未获取到可播放音源";
    }

    if (
      /timed out|timeout|Unable to connect|Connection refused|No route to host|Network is unreachable|Unable to resolve host|Network Error/i.test(
        text,
      )
    ) {
      return "网络异常，无法连接音源服务";
    }

    if (
      /Source error|ParserException|Unrecognized input format|Malformed|Decoding|Decoder/i.test(
        text,
      )
    ) {
      return "音源解析失败，当前音源暂不可用";
    }

    return text;
  }

  private looksLikeGarbledPlaybackMessage(text: string) {
    const replacementCount = (text.match(/�/g) || []).length;
    const mojibakeCount = (text.match(/[闂閻閹閼缂缁濞鍙鍔鐎顑鈺鎾]/g) || []).length;
    return replacementCount >= 1 || mojibakeCount >= 3;
  }

  private buildPlaybackRetryMessage(retryCount: number, maxRetryCount: number, message?: string) {
    const retryText = `播放异常，正在重试 ${retryCount}/${maxRetryCount}`;
    return message ? `${retryText}：${message}` : retryText;
  }

  private async handlePlaybackError(detail: AudioErrorDetail | undefined, currentSeek: number = 0) {
    const now = Date.now();
    if (now - this.lastErrorTime < 200) return;
    this.lastErrorTime = now;
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    const songManager = useSongManager();
    songManager.clearPrefetch();
    const currentSongId = musicStore.playSong?.id || 0;
    if (this.retryInfo.songId !== currentSongId) {
      this.retryInfo = { songId: currentSongId, count: 0 };
    }

    const { errorCode, displayMessage, debugMessage } = this.normalizePlaybackError(detail);
    if (debugMessage) {
      console.warn(`[Player] 播放异常详情: ${debugMessage}`);
    }
    if (detail?.rawDetail) {
      console.warn("[Player] 原生错误原始详情:", detail.rawDetail);
    }

    const absoluteMaxRetry = 3;
    if (this.retryInfo.count >= absoluteMaxRetry) {
      const finalMessage = displayMessage || "当前歌曲播放失败，已自动切换下一首";
      console.error(`[Player] ${finalMessage}`);
      window.$message.error(finalMessage);
      statusStore.playLoading = false;
      this.retryInfo.count = 0;
      await this.skipToNextWithDelay();
      return;
    }

    if (errorCode === AudioErrorCode.ABORTED || errorCode === AudioErrorCode.DOM_ABORT) {
      this.retryInfo.count = 0;
      return;
    }

    if (errorCode === AudioErrorCode.SRC_NOT_SUPPORTED || errorCode === 9) {
      const unsupportedMessage = displayMessage || "当前音源暂不支持播放，已自动切换下一首";
      console.warn(`[Player] ${unsupportedMessage}`);
      window.$message.error(unsupportedMessage);
      statusStore.playLoading = false;
      this.retryInfo.count = 0;
      await this.skipToNextWithDelay();
      return;
    }

    if (musicStore.playSong.path && musicStore.playSong.type !== "streaming") {
      console.error("[Player] 本地音频文件不可用");
      window.$message.error("本地音频文件不可用，已自动切换下一首");
      statusStore.playLoading = false;
      this.retryInfo.count = 0;
      await this.skipToNextWithDelay();
      return;
    }

    this.retryInfo.count++;
    console.warn(
      `[Player] 播放异常(Code: ${errorCode ?? "unknown"})，正在重试 ${this.retryInfo.count}/${this.MAX_RETRY_COUNT}`,
    );

    if (this.retryInfo.count <= this.MAX_RETRY_COUNT) {
      await sleep(1000);
      if (this.retryInfo.count === 1) {
        statusStore.playLoading = true;
        window.$message.warning(
          this.buildPlaybackRetryMessage(
            this.retryInfo.count,
            this.MAX_RETRY_COUNT,
            displayMessage,
          ),
        );
      }
      await this.playSong({ autoPlay: true, seek: currentSeek });
      return;
    }

    const finalMessage = displayMessage || "播放失败，已自动切换下一首";
    console.error(`[Player] ${finalMessage}`);
    this.retryInfo.count = 0;
    window.$message.error(finalMessage);
    await this.skipToNextWithDelay();
  }

  /**
   * 闂佹眹鍩勯崹鐣岀不閹存績鏋庨柕蹇婂墲娴溿倝鏌ｉ弮鍌氬妺闁伙綁浜堕幃褰掑传閸曨厽鐎┑鐐存綑濡瑧绮欐径灞稿亾閿濆倹娅囨い蹇撳船铻?   */
  private async skipToNextWithDelay() {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    this.failSkipCount++;
    // 闂佸搫顦弲婵嬪磻閻斿吋鍋ㄩ柤濮愬€栧畷澶愭倵閸︻厼啸缂?3 濠?-> 闂備胶顭堥鍡欏垝瀹ュ鏁嗘繛鎴欏灩缁犵粯銇勯幘璺烘瀾闁?
    if (this.failSkipCount >= 3) {
      window.$message.error("操作失败");
      statusStore.playLoading = false;
      this.pause(true);
      this.failSkipCount = 0;
      return;
    }
    // 闂備礁鎲＄敮妤呫€冩径鎰ラ柛鎰靛枛閻銇勮箛鎾村櫤缂佺姵甯掗埥澶愬箻椤栨矮澹曞┑?-> 闂備胶顭堥鍡欏垝瀹ュ鏁嗘繛鎴欏灩缁犵粯銇勯幘璺烘瀾闁?
    if (dataStore.playList.length <= 1) {
      window.$message.error("操作失败");
      this.cleanPlayList();
      this.failSkipCount = 0;
      return;
    }
    // 注释已清理
    await sleep(500);
    await this.nextOrPrev("next");
  }

  /** 闂備礁婀遍搹搴ㄥ储娴犲妫?*/
  async play() {
    const statusStore = useStatusStore();
    const settingStore = useSettingStore();
    const audioManager = useAudioManager();
    // 濠电姷顣介埀顒€鍟块埀顒€缍婇幃妯诲緞婵犲骸鏅犻梺鑲┾拡閸撴盯鎯€閸涘瓨鐓曢柨鏂挎惈婵′粙鏌熼幖浣锋喚鐎殿喓鍔戦獮姗€宕ㄩ婊庢Х闂備胶鍎甸弲娑㈡偤閵娧勬殰閻庢稒蓱娴溿倝鏌￠崒娑橆嚋缂佲偓閳?
    if (statusStore.playStatus) return;
    // 注释已清理
    audioManager.clearForcePaused();
    // 注释已清理
    if (!audioManager.src) {
      await this.playSong({
        autoPlay: true,
        seek: statusStore.currentTime,
      });
      return;
    }
    // 濠电姷顣介埀顒€鍟块埀顒€缍婇幃妯诲緞婵犲骸鏅犻梺鑲┾拡閸撴盯鎯€閸涘瓨鐓曢柨鏂挎惈婵′粙鏌熼幖浣锋喚鐎殿喓鍔戦獮姗€宕ㄩ婊庢Х闂備胶鍎甸弲娑㈡偤閵娧勬殰閻庢稒蓱娴溿倝鏌￠崒娑橆嚋缂佲偓閳?
    if (!audioManager.paused) {
      statusStore.playStatus = true;
      return;
    }
    const fadeTime = settingStore.getFadeTime ? settingStore.getFadeTime / 1000 : 0;
    try {
      await audioManager.resume({ fadeIn: !!fadeTime, fadeDuration: fadeTime });
      statusStore.playStatus = true;
    } catch (error) {
      console.error("闂?闂備礁婀遍搹搴ㄥ储娴犲妫樺ù锝囨嚀缁剁偤寮堕崼顐函鐞?", error);
      // 注释已清理
      if (error instanceof Error && error.name === "AbortError") {
        await this.playSong({ autoPlay: true });
      }
    }
  }

  /** 闂備礁鎼Λ妤呭磹閸涘﹦顩?*/
  async pause(changeStatus: boolean = true) {
    const statusStore = useStatusStore();
    const settingStore = useSettingStore();
    const audioManager = useAudioManager();
    // 注释已清理
    const fadeTime = settingStore.getFadeTime ? settingStore.getFadeTime / 1000 : 0;
    audioManager.pause({ fadeOut: !!fadeTime, fadeDuration: fadeTime });

    if (changeStatus) statusStore.playStatus = false;
  }

  /** 闂備礁婀遍搹搴ㄥ储娴犲妫?闂備礁鎼Λ妤呭磹閸涘﹦顩烽柣妯款嚙缁€鍡涙煕閵夛絽濡奸幖?*/
  async playOrPause() {
    const statusStore = useStatusStore();
    if (statusStore.playStatus) await this.pause();
    else await this.play();
  }

  /**
   * 闂備礁鎲＄敮鎺懨洪敃鍌涘仱闁哄洢鍨洪弲顒佹叏濮楀棗浜為柣鐔稿姇閳藉骞橀姘濠?濠电偞鍨堕幐鎼侇敄閸曨厾鍗氶悗娑欙公缁?   * @param type 闂備礁鎼崐濠氬箠閹捐绠?   * @param play 闂備礁鎼€氱兘宕规导鏉戠畾濞达綀娅ｉ崡姘舵倵閿濆簼绨荤紒渚囧櫍閺岀喓绱掗姀鐘茬闂?   * @param autoEnd 闂備礁鎼€氱兘宕规导鏉戠畾濞撴埃鍋撶€殿喕鍗抽、娑樷攽閸℃﹩鍞堕梻浣告啞閺岋綁宕濇惔锝呭灊闁靛ň鏅涚痪褔鏌ｉ弮鈧禍鍫曞即閵忕姷鐓戦梺鐟邦嚟婵敻鎮?
   */
  public async nextOrPrev(
    type: "next" | "prev" = "next",
    play: boolean = true,
    autoEnd: boolean = false,
  ) {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    const songManager = useSongManager();
    // 注释已清理
    const audioManager = useAudioManager();
    // 注释已清理
    statusStore.playLoading = true;
    audioManager.stop();
    // 缂傚倷绀侀ˇ顔碱渻閹烘嚩褎绻呴崠?
    if (statusStore.personalFmMode) {
      await songManager.initPersonalFM(true);
      await this.playSong({ autoPlay: play });
      return;
    }
    // 注释已清理
    const playListLength = dataStore.playList.length;
    if (playListLength === 0) {
      window.$message.error("操作失败");
      return;
    }
    // 闂備礁鎲￠〃鍡椕哄Ο濂借櫣绮欏▎鎯ф濡炪倕绻愬Λ妤冪不?
    // 濠电姷顣介埀顒€鍟块埀顒€缍婇幃妯诲緞閹邦剙寮峰銈嗙墬缁诲倸鈻撴导瀛樼厱闁哄倽顕ф俊璺ㄧ磼椤斿搫濮傜€殿喖鐖奸幃銏ゅ箒瀹ュ棙绀嬬€规洩缍侀獮瀣偐瀹曞洦娈搁梻浣告啞椤ㄥ棗煤濡ソ铏圭矙濞嗘儳娈銈呯箰濡绮诲鑸电叆婵炴垶顭堢€氫即鏌涢…鎴濈仸闁哄苯鑻濂稿幢濡搫鏅╅柣鐔哥矌婢ф骞愰崨濠冩珷闁绘ê妯婂浼存倶閻愰潧浜鹃梺?
    if (statusStore.repeatMode === "one" && autoEnd) {
      await this.playSong({ autoPlay: play, seek: 0 });
      return;
    }
    // 闂佽崵濮崇欢銈囨閺囥垺鍋╅柤濮愬€栭～鏇㈡煏韫囨洖啸缂?
    let nextIndex = statusStore.playIndex;
    let attempts = 0;
    const maxAttempts = playListLength;
    // Fuck DJ Mode: 闂佽娴烽弫鍝ュ垝椤栨稓鐝舵俊顖濆吹閳绘棃鎮楅敐鍌涙珖妞ゅ繐宕埥澶愬箼閸愌呰兒缂備焦顨呴ˇ閬嶅箖椤曗偓椤㈡洟濡疯閸旀粓鏌℃径鍡樻珔婵炲眰鍔岄埢鎾诲箣濠垫劖妗ㄩ柣蹇曞仧閸嬫捇鏌?
    while (attempts < maxAttempts) {
      nextIndex += type === "next" ? 1 : -1;
      // 闂佸搫顦悧鍡楋耿闁秴鐤炬い鎰剁到缁剁偤鏌涢弴銊ュ箺闁?(缂傚倷妞掔粚鍫曞垂閸︻厽顫曢柍鍝勫暞閹儱鈹戦悩鎻掝仾婵?
      if (nextIndex >= playListLength) nextIndex = 0;
      if (nextIndex < 0) nextIndex = playListLength - 1;
      const nextSong = dataStore.playList[nextIndex];
      if (!this.shouldSkipSong(nextSong)) {
        break;
      }
      attempts++;
    }
    if (attempts >= maxAttempts) {
      window.$message.warning("请检查当前操作");
      audioManager.stop();
      statusStore.playStatus = false;
      return;
    }
    // 注释已清理
    statusStore.playIndex = nextIndex;
    await this.playSong({ autoPlay: play });
  }

  /** 闂備礁鍚嬮崕鎶藉床閼艰翰浜归柛銉墮缁犳垹绱撴担鑲℃垿藝瑜斿濠氬焵?(ms) */
  public getDuration(): number {
    const statusStore = useStatusStore();
    const audioManager = useAudioManager();
    const duration = audioManager.duration;
    return duration > 0 ? Math.floor(duration * 1000) : statusStore.duration;
  }

  /** 闂備礁鍚嬮崕鎶藉床閼艰翰浜归柛銉簵娴滃綊鏌熼幆褍鏆辨い銈呮嚇閺岀喓绱掗姀鐘茬闂佸搫鍊烽悞锕傚箯閸涱収鍚嬮柛銉㈡櫆閻?(ms) */
  public getSeek(): number {
    const statusStore = useStatusStore();
    const audioManager = useAudioManager();
    // 注释已清理
    const currentTime = audioManager.currentTime;
    return currentTime > 0 ? Math.floor(currentTime * 1000) : statusStore.currentTime;
  }

  /**
   * 闂佽崵濮崇粈浣规櫠娴犲鍋柛鈩兩戞禍銈嗙箾閹寸伝顏堫敊?
   * @param time 闂備礁鎼崯顐︽偉閻撳宫?(ms)
   */
  public setSeek(time: number) {
    if (this.onTimeUpdate) {
      this.onTimeUpdate.cancel();
    }
    const statusStore = useStatusStore();
    const audioManager = useAudioManager();
    const safeTime = Math.max(0, Math.min(time, this.getDuration()));
    audioManager.seek(safeTime / 1000);
    statusStore.currentTime = safeTime;
    if (!isAndroidApp) {
      mediaSessionManager.updateState(this.getDuration(), safeTime, true);
    }
  }

  /**
   * 闂傚鍋勫ù鍌炲磻婢跺本宕?闂傚鍋勫ù鍌炲磻婵犲洤鐒垫い鎴ｆ娴滈箖姊洪崷顓х劸婵炲眰鍊濋幃鐐偅閸愩劎鐫勯梺鍓插亝濞叉﹢鏁?
   * @param delta 闂備礁鎼崯顐︽偉閻撳宫娑㈠箰鎼淬垺鐝烽梺缁樺姇閹碱偄鈻?(ms)闂備焦瀵х粙鎴﹀嫉椤掑嫷鏁嗘繝濠傜墕閺嬩線鏌℃径瀣嚋鐟滆埇鍎靛鍫曞煛閸屾艾鏋欑紓浣介哺缁诲嫰骞忚ぐ鎺撳亜闁告稑锕ラ宥夋椤愩垺绁╅柛瀣躬閸┾偓妞ゆ垼妫勬禍?
   */
  public seekBy(delta: number) {
    const currentTime = this.getSeek();
    this.setSeek(currentTime + delta);
  }

  /**
   * 闂佽崵濮崇粈浣规櫠娴犲鍋柛鈩冪⊕椤ュ﹪鏌熼幆鐗堫棄婵?
   * @param actions 闂傚倸鍊搁敃銉︾箾婵犲洤闂繛宸簻绾惧綊鏌涜箛鏇炲付闁诲繑顨嗙换婵囩節閸愵厼顥濇繝娈垮枓閺呮粎绮嬪鍥ｅ亾閿濆倹娅嗘い?
   */
  public setVolume(actions: number | "up" | "down" | WheelEvent) {
    const statusStore = useStatusStore();
    const audioManager = useAudioManager();
    // 注释已清理
    const increment = 0.05;
    // 注释已清理
    if (typeof actions === "number") {
      actions = Math.max(0, Math.min(actions, 1));
      statusStore.playVolume = actions;
    }
    // 闂傚倸鍊搁敃銉︾箾婵犲洤闂繛宸簻缁€澶愭煟濡绲绘繛?
    else if (actions === "up" || actions === "down") {
      statusStore.playVolume = Math.max(
        0,
        Math.min(statusStore.playVolume + (actions === "up" ? increment : -increment), 1),
      );
    }
    // 婵犵數濮撮敃銉╂嚌閻愵剚鍙忛柍鍝勫€婚々鏌ユ倵閿濆倹娅嗘い?
    else {
      const deltaY = actions.deltaY;
      const volumeChange = deltaY > 0 ? -increment : increment;
      statusStore.playVolume = Math.max(0, Math.min(statusStore.playVolume + volumeChange, 1));
    }
    audioManager.setVolume(statusStore.playVolume);
    mediaSessionManager.updateVolume(statusStore.playVolume);
  }

  /** 闂備礁鎲＄敮鎺懨洪敃鈧悾鐑藉蓟閵夛富妫冨┑鐐叉閹搁箖宕?*/
  public toggleMute() {
    const statusStore = useStatusStore();
    const audioManager = useAudioManager();
    // 闂備礁鎼€氱兘宕规导鏉戠畾濞撴埃鍋撴俊顐㈠暙閳诲酣骞樼捄鍝勭翻
    const isMuted = statusStore.playVolume === 0;
    if (isMuted) {
      statusStore.playVolume = statusStore.playVolumeMute;
    } else {
      statusStore.playVolumeMute = statusStore.playVolume;
      statusStore.playVolume = 0;
    }
    audioManager.setVolume(statusStore.playVolume);
  }

  /**
   * 闂佽崵濮崇粈浣规櫠娴犲鍋柛鈩冪☉缁犵粯銇勯幘璺烘瀾闁哄缍婂娲敃閵堝懏鐏侀悗?   * @param rate 闂傚倷绶￠崑鍡涘窗閹炬剚鍟?(0.2 - 2.0)
   */
  public setRate(rate: number) {
    const statusStore = useStatusStore();
    const audioManager = useAudioManager();
    if (!Number.isFinite(rate)) {
      console.warn(
        "闂備礁鐤囧▔鏇熷垔鐎靛摜绠?闂備礁鎼崯鐗堟叏閻㈢鐤鹃柕澶嗘櫆閸庡秹鏌涢弴銊ュ閻忓骏绻濋弻锟犲焵椤掍降鍋呴柛鎰剁到娴滈箖鏌ｉ弬鎸庢儓闁?",
        rate,
      );
      return;
    }
    if (!audioManager.capabilities.supportsRate) {
      console.warn("操作警告");
      return;
    }
    const safeRate = Math.max(0.2, Math.min(rate, 2.0));
    statusStore.playRate = safeRate;
    audioManager.setRate(safeRate);
    mediaSessionManager.updatePlaybackRate(safeRate);
  }

  /**
   * 婵犵妲呴崑鈧柛瀣崌閺岋紕浠︾拠鎻掑濠碘€冲级閹倸鐣烽妷鈺傛櫇闁稿本绋愮划顖炴煟閻斿憡纾绘繛鏉戞喘閹粓鏁傞懞銉ゆ唉闂佹悶鍎崝搴ㄥ箺閸愵喗鐓?(Fuck DJ Mode)
   * @param song 婵犳鍠楃换鍌炲嫉椤掆偓鐓ら柛娑橈功閳瑰秹鏌嶉埡浣告殨缂?
   */
  public shouldSkipSong(song: SongType): boolean {
    const settingStore = useSettingStore();
    if (!settingStore.disableDjMode) return false;
    // 注释已清理
    const name = (song.name || "").toUpperCase();
    const alia = song.alia;
    const aliaStr = (Array.isArray(alia) ? alia.join("") : alia || "").toUpperCase();
    const fullText = name + aliaStr;
    return DJ_MODE_KEYWORDS.some((k) => fullText.includes(k.toUpperCase()));
  }

  /**
   * 闂備礁鎼ú銈夋偤閵娾晛钃熷┑鐘叉搐缁犵粯銇勯幘璺烘瀾闁哄缍婇弻娑㈠箳閹垮啯鐣介梺闈涙閸熸挳鎮伴鈧幊婊堝垂椤愩垹鏅╅梻浣姐€€閸?   * @param data 婵犳鍠楃换鍌炲嫉椤掆偓鐓ら柟闂寸缁€鍡樹繆閵堝懎顏ラ柍?   * @param song 闂備礁婀遍…鍫澝洪妶澶嬪仼濡わ絽鍟粻缁樸亜閹捐泛鏋戦柡澶婄秺閺岋綁濡搁妷銉痪闂佺儵鍓濆ú鐔奉嚕?   * @param pid 婵犳鍠楃换鍌炴嚐椤栨氨鏆?ID
   * @param options 闂傚倷鐒﹀妯肩矓閸洘鍋柛鈩兦滄禍?   * @param options.showTip 闂備礁鎼€氱兘宕规导鏉戠畾濞撴埃鍋撶€殿喕鍗冲畷婊嗩槹濞寸姵鐩弻鐔虹磼濡搫顫庨梺?   * @param options.play 闂備礁鎼€氱兘宕规导鏉戠畾濞撴埃鍋撴鐐达耿椤㈡﹢鎮㈤崨濠冪番
   * @param options.keepHeartbeatMode 闂備礁鎼€氱兘宕规导鏉戠畾濞达絽婀遍埞宥嗙節闂堟稒鎼愰柣锔诲櫍閻擃偊宕惰閺嗘瑥鈹戦瑙勬珔閾伙綁鏌嶉妷銉э紞缁绢厸鍋?
   */
  public async updatePlayList(
    data: SongType[],
    song?: SongType,
    pid?: number,
    options: {
      showTip?: boolean;
      play?: boolean;
      keepHeartbeatMode?: boolean;
    } = { showTip: true, play: true },
  ) {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    const musicStore = useMusicStore();
    if (!data || !data.length) return;
    // 濠电姰鍨煎▔娑氣偓姘煎櫍楠炲啯绻濋崶銊㈡寗闂婎偄娲﹀鍦姳濮橆厺绻嗘い鏍ㄣ仜閸嬫挸鐣烽崶鈺婃敤
    let processedData = [...data];
    if (statusStore.shuffleMode === "on") {
      await dataStore.setOriginalPlayList([...data]);
      processedData = shuffleArray(processedData);
    }
    // 注释已清理
    await dataStore.setPlayList(processedData);
    // 闂備胶顭堢换鎴炵箾婵犲伣娑氬鐎ｎ剛鏉搁梺鍛婂姂閸斿矁顤勬繝纰樻閸亪鍩€椤掆偓绾绢厾娑甸埀?
    if (!options.keepHeartbeatMode && statusStore.shuffleMode === "heartbeat") {
      statusStore.shuffleMode = "off";
    }
    if (statusStore.personalFmMode) statusStore.personalFmMode = false;
    // 注释已清理
    if (song && song.id) {
      const newIndex = processedData.findIndex((s) => s.id === song.id);
      if (musicStore.playSong.id === song.id) {
        // 濠电姷顣介埀顒€鍟块埀顒€缍婇幃妯诲緞閹邦剙寮峰銈嗙墬绾板秹宕愰崡鐐╂闁圭虎鍨版禍鐐繆椤愵剛绋婚柣妤侇殜閹椽寮撮姀鈩冩珫闁诲繒鍋犻崑鎰版儗瀹€鍕厸闁搞儜鍛喖闂佸搫鑻敃锕€危閹版澘顫呴柣妯兼暩閳?
        if (newIndex !== -1) statusStore.playIndex = newIndex;
        // 注释已清理
        if (options.play) await this.play();
      } else {
        // 注释已清理
        statusStore.playLoading = true;
        statusStore.playIndex = newIndex;
        await this.playSong({ autoPlay: options.play });
      }
    } else {
      // 注释已清理
      statusStore.playLoading = true;
      statusStore.playIndex = 0;
      await this.playSong({ autoPlay: options.play });
    }
    musicStore.playPlaylistId = pid ?? 0;
    if (options.showTip) window.$message.success("播放列表已更新");
  }

  /**
   * 婵犵數鍋為幐鎼佸箠閹版澘鐓橀柡宥庡幖缁犵粯銇勯幘璺烘瀾闁哄缍婇弻娑㈠箳閹垮啯鐣介梺?   */
  public async cleanPlayList() {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    const musicStore = useMusicStore();
    const audioManager = useAudioManager();
    // 注释已清理
    audioManager.stop();
    statusStore.resetPlayStatus();
    musicStore.resetMusicData();
    // 注释已清理
    await dataStore.setPlayList([]);
    await dataStore.clearOriginalPlayList();
    if (!isAndroidApp) {
      playerIpc.sendTaskbarProgress("none");
    }
  }

  /**
   * 婵犵數鍎戠紞鈧い鏇嗗嫭鍙忛柣鎰嚟閳绘棃鎮楅敐鍌涙珖妞ゅ繐宕灋闁挎繂妫涙晶顒勬煟閳╁啯绀嬬€?   * @param song 婵犳鍠楃换鍌炲嫉椤掆偓鐓?   * @param play 闂備礁鎼€氱兘宕规导鏉戠畾濞达綀娅ｉ崡姘舵倵閿濆簼绨荤紒渚囧櫍閺岀喓绱掗姀鐘茬闂?   */
  public async addNextSong(song: SongType, play: boolean = false) {
    const dataStore = useDataStore();
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();
    const wasPersonalFm = statusStore.personalFmMode;
    // 闂備胶顭堢换鎴炵箾婵犲伣娑㈠箻椤旇棄浜遍柣鐔哥懃鐎氼噣寮抽弴鐔剁箚妞ゆ牗銇涢崑鎾崇暦閸モ晩鏀?
    if (statusStore.personalFmMode) statusStore.personalFmMode = false;
    if (!wasPersonalFm && musicStore.playSong.id === song.id) {
      await this.play();
      window.$message.success("操作成功");
      return;
    }
    // 闂佽绻愮换鎴犳崲閸℃稒鍎婃い鏍嚙鎼达絾瀚氶柟缁樺俯濞?
    const currentSongId = musicStore.playSong.id;
    const songIndex = await dataStore.setNextPlaySong(song, statusStore.playIndex);
    // 濠电儑绲藉ù鍌炲窗濡ゅ拋鏁嗘繝濠傛娴滃綊鏌熼幆褍鏆辨い銈呮嚇閺岀喓绱掗姀鐘茬闂佸搫鍊烽懗璺何ｉ幇鏉款潊闁绘鏁搁埞?
    const newCurrentIndex = dataStore.playList.findIndex((s) => s.id === currentSongId);
    if (newCurrentIndex !== -1 && newCurrentIndex !== statusStore.playIndex) {
      statusStore.playIndex = newCurrentIndex;
    }
    // 闂備礁婀遍搹搴ㄥ储娴犲妫樺ù锝呭濞间即鎮橀悙闈涗壕闂?
    if (songIndex < 0) return;
    if (play) {
      await this.togglePlayIndex(songIndex, true);
    } else {
      window.$message.success("操作成功");
    }
  }

  /**
   * 闂備礁鎲＄敮鎺懨洪敃鈧悾鐑藉蓟閵夈儳顔掑銈嗘尵閸犳劙寮堕崷顓犵＜濞撴艾鐏濋悘鈺冪磼?   * @param index 闂備礁婀遍搹搴ㄥ储娴犲妫樺ù锝囧劋椤洟鏌曡箛鏇炐ョ紒?
   * @param play 闂備礁鎼€氱兘宕规导鏉戠畾濞达綀娅ｉ崡姘舵倵閿濆簼绨荤紒渚囧櫍閺岀喓绱掗姀鐘茬闂?   */
  public async togglePlayIndex(index: number, play: boolean = false) {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    const audioManager = useAudioManager();

    try {
      // 闂備礁鍚嬮崕鎶藉床閼艰翰浜归柛銉墮閺嬩線鏌ｅΔ鈧悧鍡欑矈?
      const { playList } = dataStore;
      // 注释已清理
      if (index >= playList.length) return;
      // 注释已清理
      audioManager.stop();
      // 注释已清理
      if (statusStore.playIndex === index) {
        if (play) await this.play();
        return;
      }
      // 注释已清理
      statusStore.playIndex = index;
      // 注释已清理
      statusStore.currentTime = 0;
      statusStore.progress = 0;
      statusStore.lyricIndex = -1;
      await this.playSong({ autoPlay: play });
    } catch (error) {
      console.error("Error in togglePlayIndex:", error);
      statusStore.playLoading = false;
      throw error;
    }
  }

  /**
   * 缂傚倷绀侀ˇ顖炩€﹀畡鎵虫瀺閹兼番鍔岀粻浼存煕閵夋垵鎳忓В搴♀攽椤旂晫绠撻柡鍫墮鐓?   * @param index 婵犳鍠楃换鍌炲嫉椤掆偓鐓ら柛婵勫劜椤洟鏌曡箛鏇炐ョ紒?
   */
  public removeSongIndex(index: number) {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    // 闂備礁鍚嬮崕鎶藉床閼艰翰浜归柛銉墮閺嬩線鏌ｅΔ鈧悧鍡欑矈?
    const { playList } = dataStore;
    // 注释已清理
    if (index >= playList.length) return;
    // 注释已清理
    if (playList.length === 1) {
      this.cleanPlayList();
      return;
    }
    // 注释已清理
    const isCurrentPlay = statusStore.playIndex === index;
    // 注释已清理
    if (index === playList.length - 1) {
      statusStore.playIndex = 0;
    }
    // 闂備礁鍚嬮惇褰掑磿閹殿喗瀚婚柣鏃€鐪规禍褰掓煙閹冩毐妞ゃ倕鎳橀弻鐔虹磼閵忕姴绠洪梺鍝勫€烽悞锔剧矙婵犲嫧鍋撻敐搴濈凹闁?
    else if (statusStore.playIndex > index) {
      statusStore.playIndex--;
    }
    // 注释已清理
    const newPlaylist = [...playList];
    newPlaylist.splice(index, 1);
    dataStore.setPlayList(newPlaylist);
    // 注释已清理
    if (isCurrentPlay) {
      this.playSong({ autoPlay: statusStore.playStatus });
    }
  }

  /**
   * 缂傚倷绀侀ˇ鎶筋敋瑜庨幈銊╁煛娓氬洦妗ㄩ柣蹇曞仧閸嬫捇鏌?
   * @param fromIndex 缂傚倷绀侀ˇ鎶筋敋瑜庨幈銊╁煛閸涱厾顦悗骞垮劚濞层倝宕戝鍥ｅ亾?   * @param toIndex 缂傚倷绀侀ˇ鎶筋敋瑜庨幈銊╁煛閸涱叀袝闁硅壈鎻徊浠嬪磻瀹ュ洠鍋?   */
  public async moveSong(fromIndex: number, toIndex: number) {
    const dataStore = useDataStore();
    const statusStore = useStatusStore();
    // 注释已清理
    if (fromIndex === toIndex) return;
    // 注释已清理
    if (fromIndex < 0 || fromIndex >= dataStore.playList.length) return;
    if (toIndex < 0 || toIndex >= dataStore.playList.length) return;
    // 注释已清理
    const list = [...dataStore.playList];
    const [movedSong] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, movedSong);
    // 闂佽崵濮崇欢銈囨閺囥垺鍋╁┑鐘宠壘濡﹢鏌熷▓鍨灍闁伙綁浜堕弻鐔虹磼閵忕姴绠洪梺鍝勫€烽懗璺何ｉ幇鏉款潊闁绘鏁搁埞?
    let newPlayIndex = statusStore.playIndex;
    if (statusStore.playIndex === fromIndex) {
      newPlayIndex = toIndex;
    } else if (fromIndex < statusStore.playIndex && toIndex >= statusStore.playIndex) {
      newPlayIndex--;
    } else if (fromIndex > statusStore.playIndex && toIndex <= statusStore.playIndex) {
      newPlayIndex++;
    }
    // 注释已清理
    statusStore.playIndex = newPlayIndex;
    // 注释已清理
    await dataStore.setPlayList(list);
    // 注释已清理
    if (statusStore.shuffleMode === "off") {
      await dataStore.setOriginalPlayList([...list]);
    }
  }

  /**
   * 闁诲孩顔栭崰鎺楀磻閹剧粯鐓曟慨妯煎帶閻忕娀鏌ｉ敐澶岀暫鐎殿噮鍠氶幑鍕传閸曨偆绋戦梻?   * @param time 闂備胶鍘ч〃搴㈢濠婂嫭鍙忛柍鍝勬噹缁€鍌炴煙閹澘袚闁挎稒妫冮弻锟犲礃閵娧冪厽濠碘槅鍋勫锟犲极瀹ュ閱囨繝闈涙閳ь剙顭峰娲偩鐏炶姤鐝㈢紓?   * @param remainTime 闂備礁鎲￠幐鎾疾濞嗘垹绀婇柟杈剧畱缁秹鏌涢锝嗙闁挎稓鍠栭弻銊モ槈濡厧鈪卞銈庡亝椤ㄥ﹪寮?   */
  public startAutoCloseTimer(time: number, remainTime: number) {
    const statusStore = useStatusStore();
    if (!time || !remainTime) return;
    // 注释已清理
    if (this.autoCloseInterval) {
      clearInterval(this.autoCloseInterval);
    }
    // 注释已清理
    const endTime = Date.now() + remainTime * 1000;
    statusStore.autoClose.enable = true;
    statusStore.autoClose.time = time;
    statusStore.autoClose.endTime = endTime;
    statusStore.autoClose.remainTime = remainTime;
    // 注释已清理
    this.autoCloseInterval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((statusStore.autoClose.endTime - now) / 1000));
      statusStore.autoClose.remainTime = remaining;
      // 闂備礁鎲＄敮妤佸垔娴犲绠垫い蹇撶墕缁秹鏌涢锝嗙闁?
      if (remaining <= 0) {
        clearInterval(this.autoCloseInterval);
        if (!statusStore.autoClose.waitSongEnd) {
          this.pause();
          statusStore.autoClose.enable = false;
          statusStore.autoClose.remainTime = statusStore.autoClose.time * 60;
          statusStore.autoClose.endTime = 0;
        }
      }
    }, 1000);
  }

  /** 婵犵妲呴崑鈧柛瀣崌閺岋紕浠︾拠鎻掑闂佽壈宕甸崰鏍嵁瀹ュ牜妯佸銈冨灪閸ㄥ潡骞婂☉銏╂晜闁告洦鍊ｅΔ鍛厱闊洦鏌ㄩ埢鏇熶繆?*/
  private checkAutoClose(): boolean {
    const statusStore = useStatusStore();
    const { enable, waitSongEnd, remainTime } = statusStore.autoClose;
    if (enable && waitSongEnd && remainTime <= 0) {
      console.log("日志输出");
      this.pause();
      statusStore.autoClose.enable = false;
      // 闂傚倷鐒﹁ぐ鍐矓閸洘鍋柛鈩冪☉缁秹鏌涢锝嗙闁?
      statusStore.autoClose.remainTime = statusStore.autoClose.time * 60;
      statusStore.autoClose.endTime = 0;
      return true;
    }
    return false;
  }

  /**
   * 闂備礁鎲＄敮鎺懨洪敃鈧悾鐑藉矗婢跺绉堕梺瑙勫劤閸熷灝袙婢舵劖鍋ｅù锝囨嚀閸斻倖銇?   * @param deviceId 闂佽崵濮抽悞锕傚磿閹跺壙?ID
   */
  public async toggleOutputDevice(deviceId?: string) {
    const settingStore = useSettingStore();
    const audioManager = useAudioManager();
    const device = deviceId ?? settingStore.playDevice;
    await audioManager.setSinkId(device);
  }

  /**
   * 闂備礁鎲＄敮鎺懨洪敃鈧悾鐑藉箵閹烘繂娈銈呯箰濡绮诲顓濈箚妞ゆ牗銇涢崑鎾崇暦閸モ晩鏀?
   * @param mode 闂備礁鎲￠悷顖炲垂閸洖鐒垫い鎺嗗亾妞ぱ€鍋撶紓浣介哺缁诲牓骞嗛崟顓涘亾濞戞顏呭緞瀹ュ鍋ｅù锝囶焾閳锋棃鏌ｉ妶鍛棦闁诡垰瀚伴、娆撴偩鐏炵晫浼囨繝纰樻閸亪鍩€椤掆偓绾绢厾娑甸埀顒勬⒑闂堟稒顥滈柛濠冩倐閵嗗懓顦圭€殿喚顭堥…銊╁焵椤掑倻绠斿璺侯儏椤曢亶鏌ｅ▎蹇斿櫧缂佲偓婢舵劖鐓曢柟鐑樻尵閹冲嫰鎮?List -> One -> Off 濠碉紕鍋戦崐鏇㈠箹椤愩倛濮虫い鎾跺枑婵粍銇勯弮鈧€笛呯矈?
   */
  public toggleRepeat(mode?: RepeatModeType) {
    this.playModeManager.toggleRepeat(mode);
  }

  /**
   * 闂備礁鎲＄敮鎺懨洪敃鈧悾鐑藉蓟閵夛腹鎸勯棅顐㈡处濮婂湱鑺卞顓濈箚妞ゆ牗銇涢崑鎾崇暦閸モ晩鏀?
   * @param mode 闂備礁鎲￠悷顖炲垂閸洖鐒垫い鎺嗗亾妞ぱ€鍋撶紓浣介哺缁诲牓骞嗛崟顓涘亾濞戞顏呭緞瀹ュ鍋ｅù锝囶焾閳锋棃鏌ｉ妶鍛棦闁诡垰瀚伴、娆撴偩鐏炵晫浼囨繝纰樻閸亪鍩€椤掆偓绾绢厾娑甸埀顒勬⒑闂堟稒顥滈柛濠冩倐閵嗗懓顦圭€殿喚顭堥…銊╁焵椤掑倻绠斿璺侯儏椤曢亶鏌ｅΟ璇茬祷闁诲繒鍠栭弻?Off -> On -> Off 濠碉紕鍋戦崐鏇㈠箹椤愩倛濮虫い鎾跺枑婵粍銇勯弮鈧€笛呯矈?
   * @note 闂傚鍋勫ú銈夊疮閹惰姤鍊婚柨鏇楀亾閾伙綁鏌嶉妷銉э紞缁绢厸鍋撻梻浣告啞閻燁垱绂嶉敐澶婄婵せ鍋撻柡灞芥噹椤繂鐣烽崶鈺冩毇闂備礁鍚嬬€笛呭垝鐏炵晫鏆﹂柣鏂款殠閸ゆ洟鏌嶈閸撶喎鐣烽妷鈺婃晬闁靛牆娲ㄩˇ鈺傜箾绾惧浜瑰┑顔芥尦瀹?"heartbeat" 闂備礁鎲￠悷銉╁磹瑜版帒姹查柣鏂垮悑閺咁剙顭块懜鐢点€掔紒鈧径鎰厽闁归偊鍠楅崵鈧梺鎼炲€ら崳锝咁潖閹规劗鐤€闁哄啠鍋撶紒銊﹀哺閺岀喓绮欏▎鐐枅闂佽鐡曞▍鏇犵矙婢跺鍚嬮柛鏇ㄥ幘閻涖儵鏌℃径鍡樻珕缂佸鍨垮畷锝夊幢濮樿京鏉搁梺鍛婂姦閸橀箖宕曢崣澶夌箚妞ゆ牗銇涢崑鎾崇暦閸モ晩鏀?
   * @note 闁荤喐绮庢晶妤呭箰婵犳艾绠伴梺顒€绉寸紒鈺呮煙椤栧棗鍟版禒姘舵煟閻愬鈼ら柛鏂跨灱閳ь剙鐏氶敃銏犵暦閵夆晩鏁冮柨婵嗘鐎氭娊姊洪棃鈺侇洭濠⒀勵殜閹椽寮撮姀鐘插祮闂佸憡鐟ラˇ浼此囪閺屻劌鈽夊Ο鑲╁姰闂佺粯鍩婇梽鍕焽婵犳艾鐐婄憸蹇斾繆閸ヮ剚鐓曢柡鍌濐嚙婵′粙鎳氶埡鍐ｅ亾濞堝灝鏋涘Δ鐘茬箳濡叉劕鈹戠€ｎ亞鐓戝銈呯箰鐎氼參鐓?Off 闂?On 濠电偞鍨堕弻銊╊敄婢跺á娑㈠锤濡も偓缁€鍡涙煕閵夛絽濡奸幖?
   */
  public async toggleShuffle(mode?: ShuffleModeType) {
    const statusStore = useStatusStore();
    const currentMode = statusStore.shuffleMode;
    // 注释已清理
    const nextMode = mode ?? this.playModeManager.calculateNextShuffleMode(currentMode);
    // 注释已清理
    if (currentMode !== nextMode) {
      await this.playModeManager.toggleShuffle(nextMode);
    }
  }

  /**
   * 闂備礁鎲￠懝楣冨嫉椤掑嫷鏁嗛柣鎰堪娴滃綊鏌熼幆褍鏆辨い銈呮嚇閺岋綁濡搁妷銉痪闂佽鎮傛禍璺侯嚕閵娾晜鍊锋い鎴犲枍缁€渚€顢氶敐鍫㈢杸闁规儳纾崢鎺撶節濞堝灝鐏￠悽顖氾功缁辩偟鈧綆鍠栫粻宕囨喐鐏炶В鏋?   */
  public syncMediaPlayMode() {
    this.playModeManager.syncMediaPlayMode();
  }

  /**
   * 闂備礁鍚嬮崕鎶藉床閼艰翰浜归柛銉厜缁憋綁鏌熸潏鍓хɑ闁汇劍鍨块弻鈩冩媴閸濆嫷鏆悗?   */
  public getSpectrumData(): Uint8Array | null {
    const audioManager = useAudioManager();
    return audioManager.getFrequencyData();
  }

  /**
   * 闂備礁鍚嬮崕鎶藉床閼艰翰浜归柛銉ｅ妽婵挳骞栭幖顓犲帥闁哄棎鍎靛缁樼節閸愩劉鏋欓梺?[0.0-1.0]
   * 闂備焦妞垮鍧楀礉鐎ｎ剝濮虫い鎺嶉檷娴犳岸鏌涘Δ鍐ㄤ粶鐞氱喖姊洪悡搴℃毐闁哄牜鍓欓埢宥呪枎閹惧磭顦梺闈浤涢崟顒佺槥缂傚倷鐒︾粙鎴λ囬幎鏂ょ稏閻庯綆鍓氶崰鍡楊熆鐠轰警鍎愭繛鍛箻閺?   */
  public getLowFrequencyVolume(): number {
    const audioManager = useAudioManager();
    return audioManager.getLowFrequencyVolume();
  }

  /**
   * 闂備礁鎼ú銈夋偤閵娾晛钃熷┑鐘叉搐闁裤倝鏌涢妷顔荤暗闁逞屽厴閸嬫捇姊?   * @param options 闂備胶顫嬮崘鈺冣敍闂侀潧妫岄崑鎾绘⒑闂堚晝绁烽柛鏃€鍨块崺鈧い鎺嗗亾妞わ妇鏁绘俊?   * @param options.bands 濠碘槅鍋嗘晶妤呭垂閻㈠憡鍋ㄦい鎰剁稻濞呯娀鏌ｉ幇顒備粵闁?
   * @param options.preamp 濠碘槅鍋呭妯尖偓姘煎弮瀵剚鎷呴悷鎵獮?   * @param options.q Q 闂?   * @param options.frequencies 濠碘槅鍋嗘晶妤呭垂閻熼偊鍟?   */
  public updateEq(options?: {
    bands?: number[];
    preamp?: number;
    q?: number;
    frequencies?: number[];
  }) {
    const audioManager = useAudioManager();
    // 闂備礁鎼Λ妤呭磹閻熷府鑰挎い鎾跺Л閸嬫捇鎮烽幏灞筋伃闂佸憡鐟ョ换姗€寮婚崨鏉戠＜闁绘劖褰冪挧?preamp 闂?q 闂備焦鐪归崝宀€鈧凹鍓氶幈銊╁煛閸涱厾鐣辨繛杈剧悼閺咁偄鈻撻崼鏇熺厸濞达綀濮よぐ褏绱掓潏銊х畺缂佸倹甯″畷銊╊敇瑜庤ⅸ闂?bands
    if (options?.bands) {
      options.bands.forEach((val, idx) => audioManager.setFilterGain(idx, val));
    }
  }

  /**
   * 缂傚倷绀侀崐鐑芥嚄閸洖鏋侀柕鍫濐槸闁裤倝鏌涢妷顔荤暗闁逞屽厴閸嬫捇姊?   */
  public disableEq() {
    const audioManager = useAudioManager();
    for (let i = 0; i < 10; i++) audioManager.setFilterGain(i, 0);
  }

  /**
   * 闂備礁鎲＄敮鎺懨洪敃鈧悾鐑藉箵閹烘繃绂嗛悗鍏夊亾闁告洦鍓氶妴鍐ㄢ攽椤旂晫绠撻柣顓濈窔閹?   */
  public toggleDesktopLyric() {
    const statusStore = useStatusStore();
    this.setDesktopLyricShow(!statusStore.showDesktopLyric);
  }

  /**
   * 婵犵鍓濋〃鍛存儗閸屾凹鐒介柡澶嬵儥濞兼壆鈧厜鍋撻柛鎰典簼琚氶梻浣侯攰閻洭宕橀妸褍骞€
   * @param show 闂備礁鎼€氱兘宕规导鏉戠畾濞撴埃鍋撶€殿喕鍗冲畷婊嗩槹濞?
   */
  public setDesktopLyricShow(show: boolean) {
    const statusStore = useStatusStore();
    if (statusStore.showDesktopLyric === show) return;
    statusStore.showDesktopLyric = show;
    playerIpc.toggleDesktopLyric(show);
    window.$message.success("操作成功");
  }

  /** 闂備礁鎲＄敮鎺懨洪敃鈧悾鐑藉矗婢跺矈娴勯柣鐘叉处瑜板啴锝為妶澶嬬厸鐎广儱鎳愮粻鏌ユ煟閳╁啯绀堥柟?*/
  public toggleTaskbarLyric() {
    const statusStore = useStatusStore();
    this.setTaskbarLyricShow(!statusStore.showTaskbarLyric);
  }

  /**
   * 闂佽崵濮崇粈浣规櫠娴犲鍋柛鈩冾焽椤╃兘鎮归崶銊ョ祷妞ゎ偁鍊濋弻鈥愁吋閸涱垳顔夐梺鐑╁墲濞叉粓骞忛悩宸悑闁糕剝菤閺嬫牜绱撴担鎻掍壕?   * @param show 闂備礁鎼€氱兘宕规导鏉戠畾濞撴埃鍋撶€殿喕鍗冲畷婊嗩槹濞?
   */
  public setTaskbarLyricShow(show: boolean) {
    const statusStore = useStatusStore();
    if (statusStore.showTaskbarLyric === show) return;
    statusStore.showTaskbarLyric = show;
    playerIpc.setTaskbarLyricShow(show);
    window.$message.success("操作成功");
  }

  /**
   * 闂備礁鎲￠懝楣冨嫉椤掑嫷鏁嗛柣鎰惈缁犵粯銇勯幘璺烘瀾闁哄顫夋穱濠囶敍濡炶浜剧€规洖娲ㄩ、鍛磽閸屾瑧鍔嶉柣鐕傞檮閺呭爼顢橀姀鈥冲壆?   */
  public playModeSyncIpc() {
    this.playModeManager.playModeSyncIpc();
  }
}

const PLAYER_CONTROLLER_KEY = "__SPLAYER_PLAYER_CONTROLLER__";

/**
 * 闂備礁鍚嬮崕鎶藉床閼艰翰浜?PlayerController 闂佽楠稿﹢閬嶅磻濡吋顐? * @returns PlayerController
 */
export const usePlayerController = (): PlayerController => {
  const win = window as Window & { [PLAYER_CONTROLLER_KEY]?: PlayerController };
  if (!win[PLAYER_CONTROLLER_KEY]) {
    win[PLAYER_CONTROLLER_KEY] = new PlayerController();
    console.log("日志输出");
  }
  return win[PLAYER_CONTROLLER_KEY];
};
