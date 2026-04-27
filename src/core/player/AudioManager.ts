import { useSettingStore } from "@/stores";
import { checkIsolationSupport, isAndroidApp, isElectron } from "@/utils/env";
import { TypedEventTarget } from "@/utils/TypedEventTarget";
import { AndroidNativeAudioPlayer } from "../audio-player/AndroidNativeAudioPlayer";
import { AudioElementPlayer } from "../audio-player/AudioElementPlayer";
import { AUDIO_EVENTS, type AudioEventMap } from "../audio-player/BaseAudioPlayer";
import { FFmpegAudioPlayer } from "../audio-player/ffmpeg-engine/FFmpegAudioPlayer";
import type {
  EngineCapabilities,
  FadeCurve,
  IPlaybackEngine,
  PauseOptions,
  PlayOptions,
} from "../audio-player/IPlaybackEngine";
import { MpvPlayer, useMpvPlayer } from "../audio-player/MpvPlayer";
import { getSharedAudioContext } from "../automix/SharedAudioContext";

/**
 * 闂傚﹥濞婇。鍓佺不閿涘嫭鍊為柛?
 * 缂備胶鍠嶇粩鎾儍閸曨垳鍙惧Λ鐗堝灦閹搁亶寮ㄩ悙顒€澶嶉柛娆欑秶缁辨繈寮界憴鍕ウ閻犱礁澧介悿鍡涙焻婢跺顏ラ柟缁㈠幗閺備礁顕ｉ弴鐔告儧
 */
class AudioManager extends TypedEventTarget<AudioEventMap> implements IPlaybackEngine {
  /** 鐟滅増鎸告晶鐘裁虹拠鎻捫楅柣銊ュ閹搁亶寮ㄩ幆褏绌块柟?*/
  private engine: IPlaybackEngine;
  /** 鐎垫澘鎳庨崹蹇涘箲閵忋垺鐣遍柟缁㈠幗閺備礁顕ｉ弴鐔告儧 (Crossfade 闁哄牏鍠栧Λ? */
  private pendingEngine: IPlaybackEngine | null = null;
  /** 闁告帒娲﹀畷鎻掝嚕閺囩喐鎯涢柣銊ュ閻ｉ箖寮捄鐑樼彜 */
  private pendingSwitchTimer: ReturnType<typeof setTimeout> | null = null;
  /** 闁活潿鍔嬬花顒€銆掗崨顖涘€炵憸鐗堟尭婢х姴顕ｉ弴鐔告儧闁汇劌瀚花銊︾閸撲焦纾ч柛姘煎墮濞?*/
  private cleanupListeners: (() => void) | null = null;
  /** 闁哄嫷鍨伴幆浣割潰閿濆懏韬弶鈺傜椤?Crossfade (闂侇剙鐏濋崢銈嗙鐎ｂ晜顐芥鐐插级婢? */
  private isCrossfading: boolean = false;

  /** 濞戞挸顭烽悡鍫曟煂?(闁活潿鍔嬬花?Crossfade 闁告帗绻傞～鎰板礌? */
  private _masterVolume: number = 1.0;

  /** 鐟滅増鎸告晶鐘差嚕閺囩喐鎯涚紒顐ヮ嚙閻庣兘鏁嶅鐒瀍ment | ffmpeg | mpv */
  public readonly engineType: "android-native" | "element" | "ffmpeg" | "mpv";

  /** 鐎殿喗娲橀幖鎼佹嚄閽樺顫旈柟璇茬箺閸?*/
  public readonly capabilities: EngineCapabilities;

  constructor(
    playbackEngine: "android-native" | "web-audio" | "mpv",
    audioEngine: "android-native" | "element" | "ffmpeg",
  ) {
    super();

    if (isAndroidApp || playbackEngine === "android-native" || audioEngine === "android-native") {
      this.engine = new AndroidNativeAudioPlayer();
      this.engineType = "android-native";
    } else if (isElectron && playbackEngine === "mpv") {
      const mpvPlayer = useMpvPlayer();
      mpvPlayer.init();
      this.engine = mpvPlayer;
      this.engineType = "mpv";
    } else if (audioEngine === "ffmpeg" && checkIsolationSupport()) {
      this.engine = new FFmpegAudioPlayer();
      this.engineType = "ffmpeg";
    } else {
      if (audioEngine === "ffmpeg" && !checkIsolationSupport()) {
        console.warn("[AudioManager] 环境未隔离，已从 FFmpeg 回退到 Web Audio");
      }

      this.engine = new AudioElementPlayer();
      this.engineType = "element";
    }

    this.capabilities = this.engine.capabilities;
    this.bindEngineEvents();
  }

  /**
   * 缂備焦鍨甸悾鎯ь嚕閺囩喐鎯涘ù婊冾儎濞嗐垽鏁嶅畝鍐╃ギ闁告瑦鍨甸崺?AudioManager
   */
  private bindEngineEvents() {
    if (this.cleanupListeners) {
      this.cleanupListeners();
    }

    const events = Object.values(AUDIO_EVENTS);
    const handlers: Map<string, EventListener> = new Map();

    events.forEach((eventType) => {
      const handler = (e: Event) => {
        // [濞ｅ浂鍠栭ˇ鐬?Crossfade 闁哄牏鍠栧Λ璺ㄤ沪韫囨碍鏉搁柡鍐勫啰绌块柟鍨捣濞?pause/ended/error 濞存粌顑勫▎銏ゆ晬瀹€鍕╂慨婵勫灮婵悂骞€娴ｇ瓔鍤栭柛?
        if (
          this.isCrossfading &&
          (eventType === "pause" || eventType === "ended" || eventType === "error")
        ) {
          // 濠碘€冲€归悘澶愬及?ended闁挎稑鑻ぐ鏌ユ嚄娴犲浠橀悷鏇氳兌婢规帡宕氶銏╂П闁荤偛妫寸槐鍨▔瀹ュ繒绀塩rossfade 闁哄牏鍠栧Λ鍧楀籍瑜嶇槐鈺呭箼鎼达絿娉㈤柡澶屽枑濡茬顫㈤敐鍛煑闁?
          // 濠碘€冲€归悘澶愬及?error闁挎稑濂旂弧鍐╂償閺冨浂鍤夐柣銏ｉ哺閺屽﹤顕ｉ弴鐔告儧闁规亽鍎抽鎼佹晬鐏炴儳鐏楅柤鏉挎嚇閳ь剚淇虹换?promise 闁硅埖绋戦崵?
          return;
        }

        const detail = (e as CustomEvent).detail;
        this.dispatch(eventType, detail);
      };
      handlers.set(eventType, handler);
      this.engine.addEventListener(eventType, handler);
    });

    this.cleanupListeners = () => {
      handlers.forEach((handler, eventType) => {
        this.engine.removeEventListener(eventType, handler);
      });
    };
  }

  /**
   * 闁告帗绻傞～鎰板礌?
   */
  public init(): void {
    this.engine.init();
  }

  /**
   * 闂佸簱鍋撴慨锝勭缁扁晠骞?
   */
  public destroy(): void {
    this.clearPendingSwitch();
    if (this.cleanupListeners) {
      this.cleanupListeners();
      this.cleanupListeners = null;
    }
    this.engine.destroy();
  }

  /**
   * 闁告梻濮惧ù鍥嵁閼稿灚灏￠柡鈧ィ鍐従濡?
   */
  public async play(url?: string, options?: PlayOptions): Promise<void> {
    await this.engine.play(url, options);
  }

  /**
   * 濞存嚎鍊曞璺呵庨垾鍐插汲婵烇絺鈧啿姣夐柛鎺楊暒缁楀懏绋夐埀顒侊純?
   * @param url 濞戞挸顑勭粩瀛橈純閺嶃劎鎽冮柡?URL
   * @param options 闂佹澘绉堕悿?
   */
  public async crossfadeTo(
    url: string,
    options: {
      duration: number;
      seek?: number;
      autoPlay?: boolean;
      uiSwitchDelay?: number;
      onSwitch?: () => void;
      mixType?: "default" | "bassSwap";
      rate?: number;
      replayGain?: number;
      fadeCurve?: FadeCurve;
    },
  ): Promise<void> {
    // MPV 濞戞挸绉甸弫顕€骞?Web Audio API 缂佺嫏鍐ㄧ劶闁?Crossfade闁挎稑鑻ú鏍焻閳ь剟宕氶悧鍫熺彯闂侇偅纰嶉幐閬嶅绩?
    if (this.engineType === "mpv") {
      this.stop();
      if (options.onSwitch) options.onSwitch();
      await this.play(url, {
        autoPlay: options.autoPlay ?? true,
        seek: options.seek,
        fadeIn: true,
        fadeDuration: options.duration,
      });
      return;
    }
    console.log(
      `妫ｅ啯鏁?[AudioManager] Starting Crossfade (duration: ${options.duration}s, type: ${options.mixType})`,
    );
    // 婵炴挸鎳愰幃濠冪▕鐎ｎ亜顤呴柣?pending
    this.clearPendingSwitch();
    this.isCrossfading = true;
    // 闁告帗绋戠紓鎾诲棘閺夎法绌块柟?(濞ｅ洦绻冪€垫棃宕ュ畝鈧悮顐﹀垂?
    let newEngine: IPlaybackEngine;
    if (this.engineType === "android-native") {
      newEngine = new AndroidNativeAudioPlayer();
    } else if (this.engineType === "ffmpeg") {
      newEngine = new FFmpegAudioPlayer();
    } else {
      newEngine = new AudioElementPlayer();
    }
    newEngine.init();
    this.pendingEngine = newEngine;
    // 濡澘瀚鏇㈡偐閼哥鍋?
    newEngine.setVolume(0);
    if (this.engine.capabilities.supportsRate) {
      // 濞村吋锚閸樻稒鎷呯捄銊︽殢濞磋偐濮撮崣鍡涙儍閸曨垪鍋撻悢鍝勮姵
      const targetRate = options.rate ?? this.getRate();
      newEngine.setRate(targetRate);
    }
    // 閻忓繐妫楀ú鏍绩閹屾澔闁烩晛锕ょ花鏌ユ偨閵娿倗鑹鹃柡鍌涙緲缁扁晠骞?
    if (options.replayGain !== undefined) {
      newEngine.setReplayGain?.(options.replayGain);
    }
    // 濞达絽閰ｉ。鑸电閹烘挸搴婃繝濞垮€栫亸婵堟媼閸撗呮瀭
    if (options.mixType === "bassSwap") {
      this.engine.setHighPassQ?.(1.0);
      newEngine.setHighPassQ?.(1.0);
      newEngine.setHighPassFilter?.(400, 0);
    }
    const fadeCurve = options.fadeCurve ?? "equalPower";
    // 闁告凹鍨版慨鈺呭棘閺夎法绌块柟?
    await newEngine.play(url, {
      autoPlay: true,
      seek: options.seek,
      fadeIn: false,
    });
    // 闁哄倹婢樼槐鈺呭箼鎼淬劉鍋撻幇顓犵懁濠⒀呭仜婵偤妫呴幎钘夋
    if (newEngine.rampVolumeTo) {
      newEngine.rampVolumeTo(this._masterVolume, options.duration, fadeCurve);
    } else {
      newEngine.setVolume(this._masterVolume);
    }
    if (options.mixType === "bassSwap") {
      // 闂佽棄鐗嗛?DJ 濡炲瀛╅悧鎼佹儍閸曨亞闉嶉柟璇℃線缂嶅棙锛愰幋鐐村Б闂傗偓濠婃劗绐楀Λ锝嗙墪閸樻稓鎷嬮敍鍕毈閺夆晛娲﹂幎銈嗘姜椤掍礁搴婇柣銊ュ閼垫垿姊荤€电浠☉鎾抽叄閸ｆ挳寮ㄩ崜褍浠?
      const mid = options.duration * 0.5;
      // 婵烇絿鍏橀悡鍓佹偘閺夊灝娅ゅΛ鏉垮閺嗏偓闁挎稑濂旂粭澶屾惥閸涙壆绠?.6s
      const release = Math.min(0.6, options.duration * 0.25);
      const t0 = getSharedAudioContext().currentTime + 0.02;
      const tMid = t0 + mid;
      const tReleaseEnd = tMid + release;
      const tEnd = t0 + options.duration;
      const bypassFreq = 10;
      // 閻庣敻鈧稓鑹剧€垫澘鎳橀埀顑藉亾闁告垼娅ｅ▓鎴﹀籍瑜嶇槐鈺呭箼鎼搭垳绀夐梺顐ｅ姈缁楀孩鏅堕悙鎻掝潱濡ゅ倹锕㈤埀顒佺閹躲倕鈻旈～顔剧闁告帒娲▍搴ㄥ礂閺堢數绉靛Λ?(閻犱讲鏅涢崵顓熸媴鎼淬劎鍙剧紒灞炬そ濡?
      if (this.engine.setHighPassFilterAt && this.engine.rampHighPassFilterToAt) {
        this.engine.setHighPassFilterAt(bypassFreq, t0);
        this.engine.rampHighPassFilterToAt(400, tMid);
      } else {
        this.engine.setHighPassFilter?.(400, mid);
      }
      // 閻庣敻鈧稓鑹剧€垫澘鎳撶换姗€宕楅妷褎鐣遍柡鍌涙緲缁扁晠骞欐惔顖滅闁哄牃鍋撻柛鎺撶箓閸樻盯宕氶崶顒佺彑濞达絽閰ｉ。鍫曟晬瀹€鈧崝褔宕ユ惔鈩冭含婵烇絺鈧啿寮抽弶鍫熷劤閸╁本绋夐埀顒勫础婵犲啯顦ч弶鈺佹嚇閳ь剛鍠愭禒顔藉緞瀹ュ懎寰撳ù锝呴叄椤?(Bass Swap闁汇劌鍤峳op闁告凹鍓氶崝?
      if (newEngine.setHighPassFilterAt && newEngine.rampHighPassFilterToAt) {
        newEngine.setHighPassFilterAt(400, t0);
        newEngine.setHighPassFilterAt(400, tMid);
        newEngine.rampHighPassFilterToAt(bypassFreq, tReleaseEnd);
        newEngine.setHighPassFilterAt(bypassFreq, tEnd + 0.05);
      }
      // 閻犱礁澧介悿鍡橆殗濮椻偓閳ь剚纰嶉幎銈呪枖閵忋垺鐣盦闁稿﹦銆嬬槐?.707闁哄嫷鍨卞〒鑸垫媴瀹曞洦鐣?
      if (newEngine.setHighPassQAt) {
        newEngine.setHighPassQAt(0.707, tEnd + 0.05);
      } else {
        newEngine.setHighPassQ?.(0.707);
      }
    }
    // 闁哄唲鍐┛闁瑰灝瀛╃拹浼村礄閸濆嫯瀚欏ǎ鍥ㄧ箖鐎垫梹绋夋繝浣虹憮闁哄倸娲╃换宥囨偘?
    const oldEngine = this.engine;
    oldEngine.pause({
      fadeOut: true,
      fadeDuration: options.duration,
      fadeCurve,
      keepContextRunning: true,
    });
    const commitSwitch = () => {
      console.log("妫ｅ啯鏁?[AudioManager] Committing Crossfade Switch");
      if (this.cleanupListeners) {
        this.cleanupListeners();
        this.cleanupListeners = null;
      }

      this.engine = newEngine;
      this.pendingEngine = null; // Cleared from pending, now active
      this.isCrossfading = false;
      this.bindEngineEvents();
      // 閻熸瑱绠戣ぐ?UI 闁告帒娲﹀畷鏌ュ炊閻愬墎娈?
      try {
        options.onSwitch?.();
      } catch (e) {
        console.error("妫ｅ啯鏁?[AudioManager] onSwitch callback failed:", e);
      }
      // 閻熸瑱绠戣ぐ鍌涚▔閳ь剙鈻?update 濞存粌顑勫▎銏＄閵夈儱鐓曢柡?UI 閺夆晜绋戠€规娊宕仦鐐啊闁衡偓閸撗冃﹂柟?
      this.dispatch(AUDIO_EVENTS.TIME_UPDATE, undefined);
      this.dispatch(AUDIO_EVENTS.PLAY, undefined);
      if (options.mixType !== "bassSwap") {
        this.engine.setHighPassFilter?.(0, 0);
      }
    };
    const switchDelay = options.uiSwitchDelay ?? 0;
    if (switchDelay > 0) {
      this.pendingSwitchTimer = setTimeout(() => {
        this.pendingSwitchTimer = null;
        commitSwitch();
      }, switchDelay * 1000);
    } else {
      commitSwitch();
    }
    // 闂佸簱鍋撴慨锝勭劍濡偄顕ｉ弴鐔告儧
    setTimeout(() => oldEngine.destroy(), options.duration * 1000 + 1000);
  }

  /**
   * 闁诡厹鍨归ˇ鏌ュ箻椤撶喐鏉?
   */
  public async resume(options?: { fadeIn?: boolean; fadeDuration?: number }): Promise<void> {
    await this.engine.resume(options);
  }

  /**
   * 闁哄棗鍊告禒鐘绘閹剁瓔鏆?
   */
  public pause(options?: PauseOptions): void {
    this.engine.pause(options);
  }

  /**
   * 闁稿绮嶉娑㈠箻椤撶喐鏉规鐐舵硾閻ㄣ垽寮崼鏇燂紵闂佹彃绉堕悿鍡樼▔?0
   */
  public stop(): void {
    this.clearPendingSwitch();
    this.engine.stop();
  }

  private clearPendingSwitch() {
    if (this.pendingSwitchTimer) {
      clearTimeout(this.pendingSwitchTimer);
      this.pendingSwitchTimer = null;
    }
    this.engine.setHighPassFilter?.(0, 0);
    this.engine.setHighPassQ?.(0.707);
    if (this.pendingEngine) {
      // 濠碘€冲€归悘澶愬嫉婢跺﹦绐￠柛鎺戞处瀹曟彃顕ｉ弴鐔告儧闁挎稑鐭傞弨銏犘掓担鍝ユ殜
      try {
        this.pendingEngine.destroy();
      } catch {
        // ignore
      }
      this.pendingEngine = null;
    }
  }

  /**
   * 閻犲搫鐤囧ù鍡涘礆閻楀牆鐦归悗瑙勭濡炲倿姊?
   * @param time 闁哄啫鐖煎Λ鍧楁晬閸埄娼￠柨?
   */
  public seek(time: number): void {
    this.engine.seek(time);
  }

  /**
   * 閻犱礁澧介悿?ReplayGain 濠⒀呭仧濞?
   * @param gain 缂佺偓瀵ч埀顑喚鏉婚柣鈺侊工閳?
   */
  public setReplayGain(gain: number): void {
    this.engine.setReplayGain?.(gain);
  }

  /**
   * 閻犱礁澧介悿鍡涙閹惰棄娅?
   * @param value 闂傚﹥濞婇崳娲磹?(0.0 - 1.0)
   */
  public setVolume(value: number): void {
    this._masterVolume = value;
    this.engine.setVolume(value);
  }

  /**
   * 闁兼儳鍢茶ぐ鍥亹閹惧啿顤呴梻濠冨▕閸?
   */
  public getVolume(): number {
    return this.engine.getVolume();
  }

  /**
   * 閻犱礁澧介悿鍡涘箻椤撶喐鏉归梺顐ゅ枔瀹?
   * @param value 闂侇偆鍠撳?(0.5 - 2.0)
   */
  public setRate(value: number): void {
    this.engine.setRate(value);
  }

  /**
   * 闁兼儳鍢茶ぐ鍥亹閹惧啿顤呴柟缁㈠幗閺備線鏌呴悢鍝勮姵
   */
  public getRate(): number {
    return this.engine.getRate();
  }

  /**
   * 閻犱礁澧介悿鍡涙閹剁瓔鏆ョ€点倖鍎肩换婊堝箥鐎ｎ亜袟閻炴稏鍎辨导?
   * @param offset 闁稿绻掍簺闂?(婵綆鍋嗛～?
   */
  public setAudioDelayCompensation(offset: number): void {
    // FFmpeg 闁?MPV 鐎殿喗娲橀幖鎼佸矗椤栨繂鍘存繛灞稿墲濠€浣衡偓鍦仧楠炲洤顫㈤妶鍡樼厵婵?
    this.engine.setAudioDelayCompensation?.(offset);
  }

  /**
   * 閻犱礁澧介悿鍡樻綇閹惧啿姣夐悹浣瑰劤椤?
   */
  public async setSinkId(deviceId: string): Promise<void> {
    await this.engine.setSinkId(deviceId);
  }

  /**
   * 闁兼儳鍢茶ぐ鍥紣閹达絾鐨戦柡浣哄瀹?(闁活潿鍔嬬花顒勫矗椤栨繍娼掗柛?
   */
  public getFrequencyData(): Uint8Array {
    return this.engine.getFrequencyData?.() ?? new Uint8Array(0);
  }

  /**
   * 闁兼儳鍢茶ぐ鍥ㄦ媴鎼搭煈鏆ラ梻濠冨▕閸?[0.0-1.0]
   */
  public getLowFrequencyVolume(): number {
    return this.engine.getLowFrequencyVolume?.() ?? 0;
  }

  /**
   * 閻犱礁澧介悿鍡橆殗濮椻偓閳ь剚纰嶉幎銈呪枖閵忕姵鐝ゅΛ鐗堝灩瀹?
   */
  public setHighPassFilter(frequency: number, rampTime: number = 0): void {
    this.engine.setHighPassFilter?.(frequency, rampTime);
  }

  public setHighPassQ(q: number): void {
    this.engine.setHighPassQ?.(q);
  }

  /**
   * 閻犱礁澧介悿鍡樻媴鎼淬劉鍋撳顓熷Б婵炲鍨瑰▍鎺擄紣閹寸姴鑺?
   */
  public setLowPassFilter(frequency: number, rampTime: number = 0): void {
    this.engine.setLowPassFilter?.(frequency, rampTime);
  }

  public setLowPassQ(q: number): void {
    this.engine.setLowPassQ?.(q);
  }

  /**
   * 閻犱礁澧介悿鍡涘锤閸ヮ亗鈧偓闁革絻鍔岄·鍐儎?
   */
  public setFilterGain(index: number, value: number): void {
    this.engine.setFilterGain?.(index, value);
  }

  /**
   * 闁兼儳鍢茶ぐ鍥亹閹惧啿顤呴柛褍娲╅妴鈧柛锝冨姀椤旀洜绱?
   */
  public getFilterGains(): number[] {
    return this.engine.getFilterGains?.() ?? [];
  }

  /**
   * 闁兼儳鍢茶ぐ鍥閹剁瓔鏆ラ柟顒傜帛濡炲倿姊归崠锛勭缂佸甯槐?
   */
  public get duration(): number {
    return this.engine.duration;
  }

  /**
   * 闁兼儳鍢茶ぐ鍥亹閹惧啿顤呴柟缁㈠幗閺備線寮崼鏇燂紵闁挎稑鐗忛～妤呮晬?
   */
  public get currentTime(): number {
    return this.engine.currentTime;
  }

  /**
   * 闁兼儳鍢茶ぐ鍥及椤栨碍鍎婇柡鍡楀€告禒鐘绘偐閼哥鍋?
   */
  public get paused(): boolean {
    return this.engine.paused;
  }

  /**
   * 闁兼儳鍢茶ぐ鍥亹閹惧啿顤呴柟缁㈠幗閺備線宕烽弶鎸庣祷
   */
  public get src(): string {
    return this.engine.src;
  }

  /**
   * 闁兼儳鍢茶ぐ鍥閹剁瓔鏆ラ梺鎸庣懆椤曘倝鎯?
   */
  public getErrorCode(): number {
    return this.engine.getErrorCode();
  }

  /**
   * 閻熸瑱缍佸▍?MPV 鐎殿喖鎼崺妤呭汲閸屾矮绮婚柣妯垮煐閳?
   * 濞寸姴鎳庡﹢?MPV 鐎殿喗娲橀幖鍛婄▔鐎ｎ偅绠掗柡?
   */
  public clearForcePaused(): void {
    if (this.engine instanceof MpvPlayer) {
      this.engine.clearForcePaused();
    }
  }

  /**
   * 閻犱礁澧介悿?MPV 闁哄牏鍠愬﹢婊堟儍?Seek 濞达絽绉堕悿?
   * 濞寸姴鎳庡﹢?MPV 鐎殿喗娲橀幖鍛婄▔鐎ｎ偅绠掗柡?
   */
  public setPendingSeek(seconds: number | null): void {
    if (this.engine instanceof MpvPlayer) {
      this.engine.setPendingSeek(seconds);
    }
  }

  /**
   * 闁告帒娲﹀畷鏌ュ箻椤撶喐鏉?闁哄棗鍊告禒?
   */
  public togglePlayPause(): void {
    if (this.paused) {
      this.resume();
    } else {
      this.pause();
    }
  }
}

const AUDIO_MANAGER_KEY = "__SPLAYER_AUDIO_MANAGER__";

/**
 * 闁兼儳鍢茶ぐ?AudioManager 閻庡湱鍋樼欢?
 * @returns AudioManager
 */
export const useAudioManager = (): AudioManager => {
  const win = window as Window & { [AUDIO_MANAGER_KEY]?: AudioManager };
  if (!win[AUDIO_MANAGER_KEY]) {
    const settingStore = useSettingStore();
    win[AUDIO_MANAGER_KEY] = new AudioManager(
      settingStore.playbackEngine,
      settingStore.audioEngine,
    );

    // 闁烩晜鍨甸幆澶愭閹剁瓔鏆ョ€点倖鍎肩换婊呮偘閵夈儰缂夐柛娆惷€?
    watch(
      () => settingStore.audioDelayCompensation,
      (offset) => {
        win[AUDIO_MANAGER_KEY]?.setAudioDelayCompensation(offset);
      },
      { immediate: true }, // 缂佹柨顑呭畵鍡涘箥瑜戦、鎴炵▔閳ь剙鈻庨垾韫鞍閹煎瓨姊婚弫銈夊礆濠靛棭娼楅柛?
    );

    console.log(
      `[AudioManager] 闁告帗绋戠紓鎾诲棘閺夎法鏉藉〒? engine: ${win[AUDIO_MANAGER_KEY].engineType}`,
    );
  }
  return win[AUDIO_MANAGER_KEY];
};
