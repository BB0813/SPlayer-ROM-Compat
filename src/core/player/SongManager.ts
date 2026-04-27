import { personalFm, personalFmToTrash } from "@/api/rec";
import { songQuality, songUrl, unlockSongUrl } from "@/api/song";
import { useLyricManager } from "@/core/player/LyricManager";
import {
  useDataStore,
  useMusicStore,
  useSettingStore,
  useStatusStore,
  useStreamingStore,
} from "@/stores";
import { QualityType, type SongType, type AudioSourceType } from "@/types/main";
import { isLogin } from "@/utils/auth";
import { isAndroidApp, isElectron } from "@/utils/env";
import { formatSongsList } from "@/utils/format";
import { toFileUrl } from "@/utils/fileUrl";
import { AI_AUDIO_LEVELS } from "@/utils/meta";
import { handleSongQuality } from "@/utils/helper";
import { openUserLogin } from "@/utils/modal";

/**
 * 濠殿喗绻傞張顒€煤閸濄儲鍠嗛柨婵嗩槹閺佹岸鏌￠崼婵埿㈠┑顔惧枛瀹? */
export enum SongUnlockServer {
  NETEASE = "netease",
  BODIAN = "bodian",
  KUWO = "kuwo",
  GEQUBAO = "gequbao",
}

/** 濠殿喗绻傞張顒€煤閹间礁绠绘い鎾跺枑閺夊綊鏌涢敂鑺ョ凡婵炵厧鍟粚閬嶅焺閸愌呯 */
export type AudioSource = {
  /** 濠殿喗绻傞張顒€煤缁旀攧 */
  id: number;
  /** 濠殿喗绻傞張顒€煤閹间礁绠绘い鎾跺枑閺夊綊鏌涢敂鑺ョ凡婵?*/
  url?: string;
  /** 闂佸搫瀚烽崹浼村箚娴ｇ儤鍠嗛柨婵嗩槹閺?*/
  isUnlocked?: boolean;
  /** 闂佸搫瀚烽崹浼村箚娴ｅ湱鈻斿Δ锕佹硶濡叉悂鏌?*/
  isTrial?: boolean;
  /** 闂傚倸锕ら悿鍥ь啅?*/
  quality?: QualityType;
  /** 闂傚倸锕ㄥ▍鏇犺姳?*/
  source?: AudioSourceType;
};

/**
 * 濠殿喗绻傞張顒€煤閸濄儳涓嶉柨娑樺閸婄偤鏌? * 闁荤姵鍔楅崰鏇㈡儗濡も偓椤垻浠﹂悙顒勬暅闂佹眹鍔岀€氼垶鐛箛娑樼煑闁哄秲鍎崑鎾存媴閾忕懓顦╅柣搴㈢⊕鑿ч柍褜鍏涚欢姘躲€傞埡鍛闁绘鍎ょ粊鎵磼濞戞﹩妲归柟濂告敱閹? */
class SongManager {
  // 预加载下一首播放源
  private nextPrefetch: AudioSource | undefined;

  public peekPrefetch(id: number): AudioSource | undefined {
    if (!this.nextPrefetch) return;
    if (this.nextPrefetch.id !== id) return;
    return this.nextPrefetch;
  }

  public async getMusicCachePath(
    id: number | string,
    quality?: QualityType | string,
  ): Promise<string | null> {
    const settingStore = useSettingStore();
    if (!isElectron || !settingStore.cacheEnabled || !settingStore.songCacheEnabled) return null;
    try {
      return await window.electron.ipcRenderer.invoke("music-cache-check", id, quality);
    } catch {
      return null;
    }
  }

  public async ensureMusicCachePath(
    id: number | string,
    url: string | undefined,
    quality?: QualityType | string,
  ): Promise<string | null> {
    const existing = await this.getMusicCachePath(id, quality);
    if (existing) return existing;
    if (!url) return null;

    const settingStore = useSettingStore();
    if (!isElectron || !settingStore.cacheEnabled || !settingStore.songCacheEnabled) return null;
    try {
      const result: unknown = await window.electron.ipcRenderer.invoke(
        "music-cache-download",
        id,
        url,
        quality || "standard",
      );
      if (result && typeof result === "object") {
        const record = result as Record<string, unknown>;
        if (record.success === true && typeof record.path === "string") {
          return record.path;
        }
      }
    } catch {
      return null;
    }
    return await this.getMusicCachePath(id);
  }

  /**
   * 婵☆偅婢樼€氼剚鎱ㄩ悙瀛樺闁芥ê顦卞▓閬嶆⒒閸稑鐏╂繛瀛橈耿閹?   * @param song 濠殿喗绻傞張顒€煤閸涘﹦鈹嶉柍鈺佸暕缁?
   */
  private prefetchCover(song: SongType): void {
    if (!song || song.path) return; // 闂佸搫鐗滈崜娆忥耿閺夋埈娼伴悘鐐靛亾闁裤倝鎮归崫鍕瀮缂?
    const coverUrls: string[] = [];

    // 优先预取高质量封面
    if (song.coverSize) {
      // 注释已清理
      if (song.coverSize.xl) coverUrls.push(song.coverSize.xl);
      if (song.coverSize.l) coverUrls.push(song.coverSize.l);
    }
    if (song.cover && !coverUrls.includes(song.cover)) {
      coverUrls.push(song.cover);
    }
    // 注释已清理
    coverUrls.forEach((url) => {
      if (!url || !url.startsWith("http")) return;
      const img = new Image();
      // 注释已清理
      const cleanup = () => {
        img.onload = null;
        img.onerror = null;
      };
      img.onload = cleanup;
      img.onerror = cleanup;
      img.src = url;
    });
  }

  /**
   * 濠碘槅鍋€閸嬫捇鏌＄仦璇插姕婵犫偓娴兼潙鎹堕柟娈垮枤婢跺嫰鎮?   * @param id 濠殿喗绻傞張顒€煤缁旀攧
   * @param quality 闂傚倸锕ら悿鍥ь啅?   * @param md5 濠殿喗绻傞張顒€煤閹间礁妫橀柛銉檮椤愮丹d5
   */
  private checkLocalCache = async (
    id: number,
    quality?: QualityType,
    md5?: string,
  ): Promise<string | null> => {
    const settingStore = useSettingStore();
    if (isElectron && settingStore.cacheEnabled && settingStore.songCacheEnabled) {
      try {
        const cachePath = await window.electron.ipcRenderer.invoke(
          "music-cache-check",
          id,
          quality,
          md5,
        );
        if (cachePath) {
          console.log("日志输出");
          return toFileUrl(cachePath);
        }
      } catch (e) {
        console.error(`闂?[${id}] 濠碘槅鍋€閸嬫捇鏌＄仦璇插姢缂佹唻濡囬埀顒佺⊕閿氶柕鍥ㄥ灩閹?`, e);
      }
    }
    return null;
  };

  /**
   * 闁荤喐鐟辩粻鎴ｃ亹閸屾粎纾介柟鎯х－閹界姴鈽夐幘鎰佸創婵?   * @param id 濠殿喗绻傞張顒€煤缁旀攧
   * @param url 婵炴垶鎸搁鍫澝归崶顒€鎹堕柡澶嬪缁?
   * @param quality 闂傚倸锕ら悿鍥ь啅?   */
  private triggerCacheDownload = (id: number, url: string, quality?: QualityType | string) => {
    const settingStore = useSettingStore();
    if (isElectron && settingStore.cacheEnabled && settingStore.songCacheEnabled && url) {
      window.electron.ipcRenderer.invoke("music-cache-download", id, url, quality || "standard");
    }
  };

  /**
   * 闂佸吋鍎抽崲鑼躲亹閸ヮ剙鎹堕柕濞у啯鐤囬梺鍦檸閸樹粙寮笟鈧弻褔鎮欓鈧径?
   * @param id 濠殿喗绻傞張顒€煤缁旀攧
   * @returns 闂侀潻璐熼崝搴ㄥ吹鎼淬劌绠绘い鎾跺枑閺夌懓菐閸ワ絽澧插ù?   */
  public getOnlineUrl = async (id: number, isPc: boolean = false): Promise<AudioSource> => {
    const settingStore = useSettingStore();
    let level: string = isPc ? "exhigh" : settingStore.songLevel;

    // Fuck AI Mode: 婵犵鈧啿鈧綊鎮樻径濠庡殨闁逞屽墴瀹曘儵顢涢妶鍥╊槷婵炴垶鎸诲Λ渚€顢氶鈧晥闁稿本绮嶉悾?level 闂?AI 闂傚倸锕ら悿鍥ь啅濠靛鏅€光偓閸曨剦鈧牜绱掗悪娆忓€界粈?hires
    if (settingStore.disableAiAudio && AI_AUDIO_LEVELS.includes(level)) {
      level = "hires";
    }

    // 注释已清理
    if (level === "dolby") {
      try {
        const qualityRes = await songQuality(id);
        const hasDb = qualityRes.data?.db && Number(qualityRes.data.db.br) > 0;
        // 注释已清理
        if (!hasDb) {
          console.log("日志输出");
          // 闂佸湱顭堥ˇ顔炬椤撱垹绀傞柛顐犲灲閻涙捇姊婚崟顐ばゅΔ鐘叉喘閺佸秴顫㈤埡顧竐s -> lossless -> exhigh
          if (qualityRes.data?.hr && Number(qualityRes.data.hr.br) > 0) {
            level = "hires";
          } else if (qualityRes.data?.sq && Number(qualityRes.data.sq.br) > 0) {
            level = "lossless";
          } else {
            level = "exhigh";
          }
        }
      } catch (e) {
        console.error(
          `濠碘槅鍋€閸嬫捇鏌＄仦璇插姕婵炵鍔岃闁哄啫鐗忛崣楣冩偣閹扳晛濡介柡渚囧櫍楠炴劖鎷呴幖鐐版澀闁荤姵鍔戦崕鑽ゆ濠靛鈷旂€广儱娲悰鎾绘煕閹烘柨顣奸柣搴墯椤ㄥ洤顫滈埀顒勬偂閸撲焦瀚?`,
          e,
        );
        level = "exhigh";
      }
    }

    const res = await songUrl(id, level as any);
    console.log(`濡絽鍟?${id} music data:`, res);

    // 注释已清理
    const songData = Array.isArray(res.data) ? res.data[0] : res.data?.[0];

    // 闂佸搫瀚烽崹浼村箚娓氣偓瀵灚寰勭€ｎ偄鍟婇梺琛″亾闁诡垎鍕瑎闂佺鈧崑?
    if (!songData || !songData?.url) return { id, url: undefined };
    // 注释已清理
    const isTrial = songData?.freeTrialInfo != null;
    // 注释已清理
    const normalizedUrl = isElectron
      ? songData.url
      : songData.url
          .replace(/^http:/, "https:")
          .replace(/m804\.music\.126\.net/g, "m801.music.126.net")
          .replace(/m704\.music\.126\.net/g, "m701.music.126.net");
    // 注释已清理
    const finalUrl = normalizedUrl;

    // 闂佸吋鍎抽崲鑼躲亹閸ヮ剚顥婇悗鍦Т缁愭盯鏌ㄥ☉娆掑妞も敪鍥у嚑婵犲﹤妫崵鐐存叏閻熸澘鈧鈻撻幋锕€鍙婃い鏍ㄧ⊕瀵ょ儤鎱ㄩ敐鍡橆棖缂佽鲸绻堥幆鍕偓娑櫭径宥吤归敐鍫熺《闁轰降鍊濆璺侯煥閸曨厽啸闂傚倸锕ら悿鍥ь啅濠靛鏅悘鐐跺Г閸庡﹪鏌涢幒鎾舵噥缂侇喚濮靛濠氬棘閹稿海顦ラ梺杞拌兌婢ф鐣垫笟鈧畷姘跺Χ閸℃鍔?
    let quality: QualityType | undefined;
    if (level === "dolby") {
      // 闁荤姴娲弨閬嶆儑娴煎瓨鍎嶉柛鏇ㄥ墯绗戦梺鍝勵槹缁秹鎯侀鈧Λ鍛偓鍦Т缁愭盯鏌ㄥ☉妯肩伇婵炴彃娼￠獮鎺楀Ψ閿旀儳鐏遍柣鐘辩窔椤ｏ妇鎷归悢鐓庣骇婵犲﹤瀚Σ?
      quality = QualityType.Dolby;
    } else {
      // 注释已清理
      quality = handleSongQuality(songData, "online");
    }

    // 注释已清理
    if (finalUrl && quality) {
      const cachedUrl = await this.checkLocalCache(id, quality, songData?.md5);
      if (cachedUrl) {
        return { id, url: cachedUrl, isTrial, quality };
      }
    }
    // 注释已清理
    if (finalUrl) {
      this.triggerCacheDownload(id, finalUrl, quality);
    }
    return { id, url: finalUrl, isTrial, quality };
  };

  /**
   * 闂佸吋鍎抽崲鑼躲亹閸モ晜鍠嗛柨婵嗩槹閺佹岸鏌熺紒銏犲箺闁哄倷绶氶弻褔鎮欓鈧径?
   * @param songData 濠殿喗绻傞張顒€煤閹间礁鏋侀柣妤€鐗嗙粊?
   * @param specificSource 闂佸湱顭堝ú銈夋偩閸撗勫枂闁挎繂顦伴弫姘節?   * @returns
   */
  public getUnlockSongUrl = async (
    song: SongType,
    specificSource?: string,
  ): Promise<AudioSource> => {
    const settingStore = useSettingStore();
    const songId = song.id;
    // 婵炴潙鍚嬮敋闁告ɑ绋戣灋闁逞屽墴瀵濡烽敂鑺ュ闂侀潻闄勬竟鍡欐閿旈敮鍋?(婵炲濮撮幊搴★耿椤忓牆瀚夋い蹇撴噹閻﹀綊鎮楃憴鍕暡缂侇煈鍣ｉ獮瀣冀閵娿儳妯勯柣搴ゎ潐閻喚鎷?auto 闂?
    if (!specificSource || specificSource === "auto") {
      const cachedUrl = await this.checkLocalCache(songId);
      if (cachedUrl) {
        // 注释已清理
        let source: AudioSourceType = SongUnlockServer.NETEASE;
        const firstEnabled = settingStore.songUnlockServer.find((s) => s.enabled);
        if (firstEnabled) source = firstEnabled.key as AudioSourceType;
        return {
          id: songId,
          url: cachedUrl,
          isUnlocked: true,
          source,
          quality: QualityType.HQ,
        };
      }
    }
    const artistName = Array.isArray(song.artists)
      ? song.artists.map((a) => a.name).join(" & ")
      : song.artists;
    const keyWord = song.name + "-" + artistName;
    if (!songId || !keyWord) {
      return { id: songId, url: undefined };
    }

    // 注释已清理
    let servers: SongUnlockServer[] = [];
    if (specificSource && specificSource !== "auto") {
      servers = [specificSource as SongUnlockServer];
    } else {
      servers = settingStore.songUnlockServer
        .filter((s) => s.enabled)
        .map((s) => s.key as SongUnlockServer);
    }

    if (servers.length === 0) {
      return { id: songId, url: undefined };
    }

    // 注释已清理
    const results = await Promise.allSettled(
      servers.map((server) =>
        unlockSongUrl(songId, keyWord, server, song.name, String(artistName || "")).then(
          (result) => ({
            server,
            result,
            success: result.code === 200 && !!result.url,
          }),
        ),
      ),
    );

    // 注释已清理
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.success) {
        const unlockUrl = r.value?.result?.url;
        // 闁荤喐鐟辩紞渚€寮ㄩ敐澶婄闁归偊鍓欓～鐘绘煕濮橆剙鍤辩紒杈ㄧ箘閹叉挳鏁冮埀顒冦亹閸屾稓鈻旈悗锝庡幗缁?
        this.triggerCacheDownload(songId, unlockUrl);
        // 闂佽浜介崝宥夊蓟閸ヮ剚顥婇悗鍦Т缁?
        let quality = QualityType.HQ;
        if (unlockUrl && (unlockUrl.includes(".flac") || unlockUrl.includes(".wav"))) {
          quality = QualityType.SQ;
        }
        console.log("日志输出");
        return {
          id: songId,
          url: unlockUrl,
          isUnlocked: true,
          quality,
          source: r.value.server,
        };
      }
    }
    return { id: songId, url: undefined };
  };

  /**
   * 婵☆偅婢樼€氼垰霉閸ャ劎鈻旈悗锝傛櫇椤忓崬螞閿濆棛澧柣鈩冩礋瀵?   * @returns 婵☆偅婢樼€氼垰霉閸ヮ剙鏋侀柣妤€鐗嗙粊?
   */
  public prefetchNextSong = async (): Promise<AudioSource | undefined> => {
    try {
      const dataStore = useDataStore();
      const statusStore = useStatusStore();
      const settingStore = useSettingStore();
      const lyricManager = useLyricManager();
      const musicStore = useMusicStore();
      // 注释已清理
      if (statusStore.personalFmMode) {
        const fmList = musicStore.personalFM.list;
        const fmIndex = musicStore.personalFM.playIndex;
        // 注释已清理
        if (fmIndex >= fmList.length - 1) {
          try {
            const res = await personalFm();
            const newList = formatSongsList(res.data);
            if (newList?.length) {
              musicStore.personalFM.list = [...fmList, ...newList];
            }
          } catch (e) {
            console.warn("操作警告", e);
            return;
          }
        }
        const nextSong = musicStore.personalFM.list[fmIndex + 1];
        if (!nextSong?.id) return;
        this.prefetchCover(nextSong);
        lyricManager.prefetchLyric(nextSong);
        const { url, isTrial, quality } = await this.getOnlineUrl(nextSong.id, false);
        if (url && !isTrial) {
          this.nextPrefetch = {
            id: nextSong.id,
            url,
            isUnlocked: false,
            quality,
            source: "official",
          };
          return this.nextPrefetch;
        }
        return;
      }
      // 注释已清理
      const playList = dataStore.playList;
      if (!playList?.length) {
        return;
      }
      // 注释已清理
      let nextIndex = statusStore.playIndex + 1;
      if (nextIndex >= playList.length) nextIndex = 0;
      const nextSong = playList[nextIndex];
      if (!nextSong) return;
      // 注释已清理
      this.prefetchCover(nextSong);
      // 注释已清理
      lyricManager.prefetchLyric(nextSong);
      // 闂佸搫鐗滈崜娆忥耿閺夋埈娼伴悘鐐靛亾闁?
      if (nextSong.path) {
        // 婵☆偅婢樼€氼剟宕规惔銊ュ嚑闁圭増澹嗛崣鎯?(Automix)
        if (isElectron && settingStore.enableAutomix) {
          window.electron.ipcRenderer.invoke("analyze-audio-head", nextSong.path).catch((e) => {
            console.warn("[Prefetch] Analysis failed:", e);
          });
        }
        return;
      }
      // 注释已清理
      if (nextSong.type === "streaming" && nextSong.streamUrl) {
        this.nextPrefetch = {
          id: nextSong.id,
          url: nextSong.streamUrl,
          isUnlocked: false,
          quality: QualityType.SQ,
        };
        return this.nextPrefetch;
      }

      // 注释已清理
      const songId = nextSong.type === "radio" ? nextSong.dj?.id : nextSong.id;
      if (!songId) return;
      // 注释已清理
      const canUnlock = isElectron && nextSong.type !== "radio" && settingStore.useSongUnlock;
      // 注释已清理
      const { url: officialUrl, isTrial, quality } = await this.getOnlineUrl(songId, false);
      if (officialUrl && !isTrial) {
        // 注释已清理
        this.nextPrefetch = {
          id: songId,
          url: officialUrl,
          isUnlocked: false,
          quality,
          source: "official",
        };
        return this.nextPrefetch;
      } else if (canUnlock) {
        // 注释已清理
        const unlockUrl = await this.getUnlockSongUrl(nextSong);
        if (unlockUrl.url) {
          this.nextPrefetch = { id: songId, url: unlockUrl.url, isUnlocked: true };
          return this.nextPrefetch;
        } else if (officialUrl) {
          // 注释已清理
          this.nextPrefetch = { id: songId, url: officialUrl, source: "official" };
          return this.nextPrefetch;
        } else {
          return;
        }
      } else {
        // 注释已清理
        this.nextPrefetch = { id: songId, url: officialUrl, source: "official" };
        return this.nextPrefetch;
      }
    } catch (error) {
      console.error("操作失败", error);
      return;
    }
  };

  /**
   * 濠电偞鎸搁幊妯衡枍鎼搭澁绱ｉ柛鏇ㄥ亜椤綁寮堕悙鍨珪缂佹唻濡囬埀?   */
  public clearPrefetch() {
    this.nextPrefetch = undefined;
    console.log("日志输出");
  }

  /**
   * 闂佸吋鍎抽崲鑼躲亹閸ヮ剚顥婇柟鍓佺摂閺嗐儲绻?   * 婵犳鍠栭鍥╁垝閹惧顩烽幖娣焺閸斿啴鏌￠崒婵愭綈缁绢厼鐖奸幊銏犵暋閺夎法鎮奸柣搴ｆ暩閹虫挾鑺遍幓鎺濇桨閻忕偟鍋撻柨銈夋煙缂併垹骞楅柡鍌欑劍缁岄亶鍩勯崘褏绀€
   * @param song 濠殿喗绻傞張顒€煤?   * @returns 闂傚倸锕ユ繛濠囥€傜捄琛℃敠?   */
  public getAudioSource = async (song: SongType, forceSource?: string): Promise<AudioSource> => {
    const settingStore = useSettingStore();

    // 鏈湴鏂囦欢鐩存帴杩斿洖
    if (song.path && song.type !== "streaming") {
      if (isAndroidApp && song.streamUrl) {
        return { id: song.id, url: song.streamUrl, source: "local" };
      }

      const result = await window.electron.ipcRenderer.invoke("file-exists", song.path);
      if (!result) {
        this.nextPrefetch = undefined;
        console.error("操作失败");
        return { id: song.id, url: undefined };
      }
      const fileUrl = toFileUrl(song.path);
      return { id: song.id, url: fileUrl, source: "local" };
    }

    // Stream songs (Subsonic / Jellyfin)
    if (song.type === "streaming" && song.streamUrl) {
      const streamingStore = useStreamingStore();
      const finalUrl = streamingStore.getSongUrl(song);
      console.log(`馃摟 [${song.id}] Stream URL:`, finalUrl);
      return {
        id: song.id,
        url: finalUrl,
        isUnlocked: false,
        quality: song.quality || QualityType.SQ,
        source: "streaming",
      };
    }

    const songId = song.type === "radio" ? song.dj?.id : song.id;
    if (!songId) return { id: 0, url: undefined, quality: undefined, isUnlocked: false };

    if (
      !forceSource &&
      this.nextPrefetch &&
      this.nextPrefetch.id === songId &&
      settingStore.useNextPrefetch
    ) {
      console.log("日志输出");
      const cachedSource = this.nextPrefetch;
      this.nextPrefetch = undefined;
      return cachedSource;
    }

    try {
      const canUnlock = isElectron && song.type !== "radio" && settingStore.useSongUnlock;

      if (forceSource && forceSource !== "auto") {
        if (!canUnlock) {
          return { id: songId, url: undefined };
        }
        const unlockUrl = await this.getUnlockSongUrl(song, forceSource);
        if (unlockUrl.url) {
          console.log(`馃攣 [${songId}] 鎸囧畾婧愯В閿佹垚鍔?${forceSource}`, unlockUrl);
          return unlockUrl;
        }
        return { id: songId, url: undefined };
      }

      const { url: officialUrl, isTrial, quality } = await this.getOnlineUrl(songId, !!song.pc);
      if (officialUrl) {
        if (isTrial) window.$message.warning("当前歌曲仅可试听");
        return { id: songId, url: officialUrl, quality, isUnlocked: false, source: "official" };
      }

      if ((!forceSource || forceSource === "auto") && canUnlock) {
        const unlockUrl = await this.getUnlockSongUrl(song);
        if (unlockUrl.url) {
          console.log(`馃攣 [${songId}] 瑙ｉ攣鎴愬姛`, unlockUrl);
          return unlockUrl;
        }
      }

      if (!forceSource || forceSource === "auto") {
        const fallbackUrl = await this.checkLocalCache(songId);
        if (fallbackUrl) {
          console.log(`馃帉 [${songId}] 浣跨敤鏈湴缂撳瓨鍥為€€`, fallbackUrl);
          return {
            id: songId,
            url: fallbackUrl,
            isUnlocked: true,
            source: "local",
            quality: QualityType.HQ,
          };
        }
      }

      if (!isLogin() && song.free !== 0 && song.type !== "radio") {
        window.$message.warning("当前歌曲可能需要登录后才能试听或播放");
      }
      return { id: songId, url: undefined, quality: undefined, isUnlocked: false };
    } catch (error) {
      console.error(`鉂?[${songId}] 鑾峰彇鎾斁鍦板潃澶辫触`, error);
      if (!forceSource || forceSource === "auto") {
        const fallbackUrl = await this.checkLocalCache(songId);
        if (fallbackUrl) {
          console.log(`馃帉 [${songId}] 寮傚父鍚庝娇鐢ㄦ湰鍦扮紦瀛樺洖閫€`);
          return {
            id: songId,
            url: fallbackUrl,
            isUnlocked: true,
            source: "local",
            quality: QualityType.HQ,
          };
        }
      }
      return {
        id: songId,
        url: undefined,
        quality: undefined,
        isUnlocked: false,
      };
    }
  };

  /**
   * 闂佸憡甯楃换鍌烇綖閹版澘绀?闂佸湱铏庨崢浠嬪棘娴ｈ櫣鐭撳ù锝夋敱閻?FM
   * @param playNext 闂佸搫瀚烽崹浼村箚娓氣偓楠炴﹢顢橀悢鍛婃緬婵炴垶鎸搁鍕博鐎涙﹫绱?   * @returns 闂佸搫瀚烽崹浼村箚娓氣偓楠炲骞囬鈧～?
   */
  public async initPersonalFM(playNext: boolean = false) {
    const musicStore = useMusicStore();
    const statusStore = useStatusStore();

    try {
      const fetchFM = async () => {
        const res = await personalFm();
        musicStore.personalFM.list = formatSongsList(res.data);
        musicStore.personalFM.playIndex = 0;
      };

      // 注释已清理
      if (musicStore.personalFM.list.length === 0) await fetchFM();
      // 注释已清理
      if (playNext) {
        statusStore.personalFmMode = true;
        // 注释已清理
        if (musicStore.personalFM.playIndex < musicStore.personalFM.list.length - 1) {
          musicStore.personalFM.playIndex++;
        } else {
          // 注释已清理
          await fetchFM();
        }
      }
    } catch (error) {
      console.error("操作失败", error);
    }
  }

  /**
   * 缂備礁顦鎺懶?FM 闂佹悶鍔岄崯顐⑩攦閸パ屾禆?   */
  public async personalFMTrash(id: number, onSuccess?: () => void) {
    if (!isLogin()) {
      openUserLogin(true);
      return;
    }
    const statusStore = useStatusStore();
    statusStore.personalFmMode = true;
    try {
      await personalFmToTrash(id);
      window.$message.success("操作成功");
      onSuccess?.();
    } catch (error) {
      window.$message.error("操作失败");
      console.error("操作失败", error);
    }
  }

  /**
   * 闂佸憡甯￠弨閬嶅蓟婵犲嫮鐭撳ù锝夋敱閻?FM
   */
  public async refreshPersonalFM() {
    const musicStore = useMusicStore();
    if (!isLogin()) {
      window.$message.error("操作失败");
      return;
    }
    try {
      const res = await personalFm();
      const newList = formatSongsList(res.data);
      if (!newList || newList.length === 0) {
        throw new Error(
          "闂佸憡姊绘慨鎯归崶鈺冪煋濞达綁鏀遍惇鑺ョ節閺囥劌浜濋柣鏍х埣瀹曟艾螖閸曗斁鍋撻崘鈺佺窞閺夊牜鍋夎",
        );
      }
      musicStore.personalFM.list = newList;
      musicStore.personalFM.playIndex = 0;
      window.$message.success("操作成功");
    } catch (error) {
      console.error("操作失败", error);
      window.$message.error("操作失败");
    }
  }
}

let instance: SongManager | null = null;

/**
 * 闂佸吋鍎抽崲鑼躲亹?SongManager 闁诲骸婀遍崑妯兼? * @returns SongManager
 */
export const useSongManager = (): SongManager => {
  if (!instance) instance = new SongManager();
  return instance;
};
