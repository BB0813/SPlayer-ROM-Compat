/**
 * 闁圭虎鍘介弬浣割嚕閺囩喐鎯涢柤瀹犳婵繘骞撹箛姘墯
 */
export interface EngineCapabilities {
  /** 闁哄嫷鍨伴幆渚€寮ㄩ娑樼槷闁稿﹤绉归埀顒傚枑閹搁亶寮?*/
  supportsRate: boolean;
  /** 闁哄嫷鍨伴幆渚€寮ㄩ娑樼槷闁告帒娲﹀畷鍙夋綇閹惧啿姣夐悹浣瑰劤椤?*/
  supportsSinkId: boolean;
  /** 闁哄嫷鍨伴幆渚€寮ㄩ娑樼槷闁秆冩穿閵嗏偓闁?*/
  supportsEqualizer: boolean;
  /** 闁哄嫷鍨伴幆渚€寮ㄩ娑樼槷濡増鍨煎銊╁礆閸℃鈧?*/
  supportsSpectrum: boolean;
}

/**
 * 闂傚﹥濞婇。鍫曟煥濞嗘帩鍤栭悹鍥烽檮閸? */
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
 * 闁圭虎鍘介弬渚€鏌呮径鎰┾偓? */
export interface PlayOptions {
  /** 闁哄嫷鍨伴幆渚€鎳涢鍕楅柟缁㈠幗閺?*/
  autoPlay?: boolean;
  /** 闁哄嫷鍨伴幆浣搞€掗幇顒€寮?*/
  fadeIn?: boolean;
  /** 婵炴挻鍔曢崣鍡涘籍閸洘姣愰柨娑樼墢椤鏁?*/
  fadeDuration?: number;
  /** 婵烇絺鈧啿寮抽柡鍥皺閸ゅ海鐚剧拠鑼偓?*/
  fadeCurve?: FadeCurve;
  /** 闁告帗绻傞～鎰板箻椤撶喐鏉瑰ù锝呯Ф閻ゅ棝鏁嶉崼銏╂健闁?*/
  seek?: number;
  title?: string;
  artist?: string;
  album?: string;
  artworkUri?: string;
  rate?: number;
}

/**
 * 闁哄棗鍊告禒鐘绘焻婢舵劑鈧? */
export interface PauseOptions {
  /** 闁哄嫷鍨伴幆浣搞€掗幇顒€姣?*/
  fadeOut?: boolean;
  /** 婵炴挻鍔曢崵顓㈠籍閸洘姣愰柨娑樼墢椤鏁?*/
  fadeDuration?: number;
  /** 婵烇絺鈧啿姣夐柡鍥皺閸ゅ海鐚剧拠鑼偓?*/
  fadeCurve?: FadeCurve;
  /** 闁哄嫷鍨伴幆浣圭┍濠靛洤鐦?Context 閺夆晜鍔橀、鎴︽晬閸垺鏆忓ù?Crossfade闁?*/
  keepContextRunning?: boolean;
}

/**
 * 缂備胶鍠嶇粩鎾箻椤撶喐鏉圭€殿喗娲橀幖鎼佸箳閵夈儱缍? */
export interface IPlaybackEngine {
  /** 闁告帗绻傞～鎰板礌閺嵮呯┛闁?*/
  init(): void;
  /** 闂佸簱鍋撴慨锝勭缁扁晠骞欐惔顖滅闂佹彃锕ラ弬浣烘導閸曨剛鐖?*/
  destroy(): void;

  /**
   * 闁告梻濮惧ù鍥嵁閼稿灚灏￠柡鈧ィ鍐従濡?   * @param url 闂傚﹥濞婇。鍫曞捶閺夋寧绲?   * @param options 闁圭虎鍘介弬渚€鏌呮径鎰┾偓?   */
  play(url?: string, options?: PlayOptions): Promise<void>;

  /**
   * 闁诡厹鍨归ˇ鏌ュ箻椤撶喐鏉?   * @param options 闁圭虎鍘介弬渚€鏌呮径鎰┾偓?   */
  resume(options?: { fadeIn?: boolean; fadeDuration?: number }): Promise<void>;

  /**
   * 闁哄棗鍊告禒鐘诲箻椤撶喐鏉?   * @param options 闁哄棗鍊告禒鐘绘焻婢舵劑鈧?   */
  pause(options?: PauseOptions): void;

  /** 闁稿绮嶉娑㈠箻椤撶喐鏉规鐐茬埣閸ｅ摜绱旈璺ㄧ閹?*/
  stop(): void;

  /**
   * 閻犲搫鐤囧ù鍡涘礆閻楀牆鐦归悗瑙勭濡炲倿姊?   * @param time 闁哄啫鐖煎Λ鍧楁晬閸埄娼￠柨?   */
  seek(time: number): void;

  // ========== 闁绘鍩栭埀顑跨閻﹢骞€?==========

  /** 闂傚﹥濞婇。鍫曞箑缂佹ɑ顦ч梻鈧崠锛勭缂佸甯槐?*/
  readonly duration: number;

  /** 鐟滅増鎸告晶鐘诲箻椤撶喐鏉瑰ù锝呯Ф閻ゅ棝鏁嶉崼銏╂健闁?*/
  readonly currentTime: number;

  /** 闁哄嫷鍨伴幆浣瑰緞閸曨亞鑹鹃柡鍡楀€告禒鐘绘偐閼哥鍋?*/
  readonly paused: boolean;

  /** 鐟滅増鎸告晶鐘绘閹剁瓔鏆ユ繝褎鍔曞﹢鎾锤閳?*/
  readonly src: string;

  /**
   * 閻犱礁澧介悿鍡涙閹惰棄娅?   * @param value 闂傚﹥濞婇崳娲磹?(0.0 - 1.0)
   */
  setVolume(value: number): void;

  rampVolumeTo?(value: number, duration: number, curve?: FadeCurve): void;

  /**
   * 闁兼儳鍢茶ぐ鍥亹閹惧啿顤呴梻濠冨▕閸?   * @returns 闂傚﹥濞婇崳娲磹?(0.0 - 1.0)
   */
  getVolume(): number;

  /**
   * 閻犱礁澧介悿鍡涘箻椤撶喐鏉归梺顐ゅ枔瀹?   * @param rate 闂侇偆鍠撳?(0.5 - 2.0)
   */
  setRate(rate: number): void;

  /**
   * 闁兼儳鍢茶ぐ鍥亹閹惧啿顤呴柟缁㈠幗閺備線鏌呴悢鍝勮姵
   */
  getRate(): number;

  /**
   * 閻犱礁澧介悿鍡涙閹剁瓔鏆ョ€点倖鍎肩换婊堝箥鐎ｎ亜袟閻炴稏鍎辨导?   * @param offset 闁稿绻掍簺闂?(婵綆鍋嗛～?
   */
  setAudioDelayCompensation(offset: number): void;

  /**
   * 閻犱礁澧介悿鍡涙閹剁瓔鏆ラ弶鍫熸尭閸ゎ厾鎷嬮幆褜妲?   * @param deviceId 閻犱焦鍎抽ˇ?ID
   */
  setSinkId(deviceId: string): Promise<void>;

  /**
   * 閻犱礁澧介悿鍡涘锤閸ヮ亗鈧偓闁革絻鍔岄·鍐儎?   * @param index 濡増鍨堕宀€妲愰姀鐘电┛ (0-9)
   * @param value 濠⒀呭仧濞夘參宕?(-40 to 40)
   */
  setFilterGain?(index: number, value: number): void;

  /**
   * 闁兼儳鍢茶ぐ鍥锤閸ヮ亗鈧偓闁革絻鍔岄幃鍥紣閹寸儐鍞藉褏鍋熷▔?   */
  getFilterGains?(): number[];

  /**
   * 閻犱礁澧介悿鍡橆殗濮椻偓閳ь剚纰嶉幎銈呪枖閵忕姵鐝ゅΛ鐗堝灩瀹?   * @param frequency 闁规惌浜濋娑欙紣閹寸姴鑺?(Hz)
   * @param rampTime 婵炴挻鍔曡ぐ澶愬籍閸洘锛?(s)
   */
  setHighPassFilter?(frequency: number, rampTime?: number): void;

  setHighPassQ?(q: number): void;

  setHighPassFilterAt?(frequency: number, when: number): void;

  rampHighPassFilterToAt?(frequency: number, when: number): void;

  setHighPassQAt?(q: number, when: number): void;

  /**
   * 閻犱礁澧介悿鍡樻媴鎼淬劉鍋撳顓熷Б婵炲鍨瑰▍鎺擄紣閹寸姴鑺?   * @param frequency 闁规惌浜濋娑欙紣閹寸姴鑺?(Hz)
   * @param rampTime 婵炴挻鍔曡ぐ澶愬籍閸洘锛?(s)
   */
  setLowPassFilter?(frequency: number, rampTime?: number): void;

  setLowPassQ?(q: number): void;

  setLowPassFilterAt?(frequency: number, when: number): void;

  rampLowPassFilterToAt?(frequency: number, when: number): void;

  setLowPassQAt?(q: number, when: number): void;

  /**
   * 闁兼儳鍢茶ぐ鍥紣閹达絾鐨戦柡浣哄瀹?   */
  getFrequencyData?(): Uint8Array;

  /**
   * 闁兼儳鍢茶ぐ鍥ㄦ媴鎼搭煈鏆ラ梻濠冨▕閸?   */
  getLowFrequencyVolume?(): number;

  /**
   * 閻犱礁澧介悿?ReplayGain 濠⒀呭仧濞?   * @param gain 缂佺偓瀵ч埀顑喚鏉婚柣鈺侊工閳?(1.0 濞戞挸鎼敮顐ｆ叏鐎ｎ喚鍙鹃梺?
   */
  setReplayGain?(gain: number): void;

  /**
   * 閻犱礁澧介悿鍡涙閹剁晫褰柛瀣箳浜?   * @param semitones 闁告锕悡鍫曞磻韫囨泤鈺呮煂?   */
  setPitchShift?(semitones: number): void;

  /**
   * 闁兼儳鍢茶ぐ鍥嫉閳ь剟宕ユ惔婵堫伇婵炲棴绻濋弫濠勬嫚椤栨粎鍨?   */
  getErrorCode(): number;

  /**
   * 婵烇綀顕ф慨鐐寸鐎ｂ晜顐介柣鈺傚灥閹?   */
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;

  /**
   * 缂佸顭峰▍搴㈢鐎ｂ晜顐介柣鈺傚灥閹?   */
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;

  /** 鐎殿喗娲橀幖鎼佹嚄閽樺顫旈柟璇茬箺閸?*/
  readonly capabilities: EngineCapabilities;
}
