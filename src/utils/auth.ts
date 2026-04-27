import type {
  AccountType,
  ArtistType,
  CoverType,
  LoginType,
  SongType,
  UserDataType,
} from "@/types/main";
import {
  userAccount,
  userAlbum,
  userArtist,
  userDetail,
  userDj,
  userLike,
  userMv,
  userPlaylist,
  userSubcount,
} from "@/api/user";
import { logout, refreshLogin } from "@/api/login";
import { likeSong } from "@/api/song";
import { dailyRecommend } from "@/api/rec";
import { likePlaylist, playlistTracks } from "@/api/playlist";
import { likeArtist } from "@/api/artist";
import { likeAlbum } from "@/api/album";
import { radioSub } from "@/api/radio";
import { useDataStore, useLocalStore, useMusicStore } from "@/stores";
import { formatArtistsList, formatCoverList, formatSongsList } from "@/utils/format";
import { getCookie, removeCookie, setCookies } from "./cookie";
import { isElectron } from "./env";
import { debounce, isFunction, type DebouncedFunc } from "lodash-es";
import { isBeforeSixAM } from "./time";
import router from "@/router";
import { openUserLogin } from "./modal";

const LOGIN_REFRESH_INTERVAL = 3 * 24 * 60 * 60 * 1000;
const PAGE_LIMIT = 100;
const PLAYLIST_PAGE_LIMIT = 1000;
const LOGIN_COOKIE_KEYS = [
  "MUSIC_U",
  "MUSIC_A",
  "__csrf",
  "NMTID",
  "__remember_me",
  "NTES_P_UTID",
  "WEVNSM",
];

interface DeleteSongsOptions {
  callback?: () => void;
  songName?: string;
}

interface LikeActionOptions {
  likeValue?: number;
  unlikeValue?: number;
  actionName: string;
}

const getDefaultLikeSongsDetail = (): CoverType => ({
  id: 0,
  name: "我喜欢的音乐",
  cover: "/images/album.jpg?asset",
});

const unwrapResponse = <T = any>(result: any): T => {
  if (result?.body !== undefined) return result.body as T;
  if (result?.data !== undefined) return result.data as T;
  return result as T;
};

const getResponseCode = (result: any): number | undefined => {
  return result?.body?.code ?? result?.data?.code ?? result?.code;
};

const isRequestSuccess = (result: any): boolean => {
  if (result?.body !== undefined && typeof result?.status === "number") {
    return result.status === 200 && result.body?.code === 200;
  }
  return getResponseCode(result) === 200;
};

const getArrayByKeys = (source: any, keys: string[]): any[] => {
  for (const key of keys) {
    const value = source?.[key];
    if (Array.isArray(value)) return value;
  }
  return [];
};

const collectCookieSnapshot = (): Record<string, string> => {
  const cookieMap: Record<string, string> = {};

  if (typeof document !== "undefined" && document.cookie) {
    document.cookie.split(";").forEach((cookieItem) => {
      const [rawName, ...rawValue] = cookieItem.split("=");
      const name = rawName?.trim();
      const value = rawValue.join("=").trim();
      if (!name || !value) return;
      cookieMap[name] = value;
    });
  }

  if (typeof localStorage !== "undefined") {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith("cookie-")) continue;
      const cookieName = key.replace(/^cookie-/, "");
      const cookieValue = localStorage.getItem(key);
      if (cookieName && cookieValue) {
        cookieMap[cookieName] = cookieValue;
      }
    }
  }

  LOGIN_COOKIE_KEYS.forEach((key) => {
    const value = getCookie(key);
    if (value) cookieMap[key] = value;
  });

  return cookieMap;
};

const clearAllLoginCookies = () => {
  const keys = new Set<string>(LOGIN_COOKIE_KEYS);

  if (typeof document !== "undefined" && document.cookie) {
    document.cookie.split(";").forEach((cookieItem) => {
      const [rawName] = cookieItem.split("=");
      const name = rawName?.trim();
      if (name) keys.add(name);
    });
  }

  if (typeof localStorage !== "undefined") {
    const localCookieKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith("cookie-")) continue;
      localCookieKeys.push(key);
      keys.add(key.replace(/^cookie-/, ""));
    }
    localCookieKeys.forEach((key) => localStorage.removeItem(key));
  }

  keys.forEach((key) => removeCookie(key));
};

const applyCookieSnapshot = (cookies: Record<string, string>) => {
  const cookieText = Object.entries(cookies)
    .filter(([, value]) => !!value)
    .map(([key, value]) => `${key}=${value}`)
    .join(";");

  if (!cookieText) return;
  setCookies(cookieText);
};

const buildUserData = (
  profile: any,
  detailPayload: any,
  subcountPayload: any,
  playlistPayload: any,
): UserDataType => {
  const playlistItems = getArrayByKeys(playlistPayload, ["playlist"]);
  const createdPlaylistCount =
    Number(subcountPayload?.createdPlaylistCount) ||
    playlistItems.filter((item: any) => Number(item?.userId) === Number(profile?.userId)).length;
  const subPlaylistCount =
    Number(subcountPayload?.subPlaylistCount) ||
    Math.max(playlistItems.length - createdPlaylistCount, 0);
  const createTime = Number(profile?.createTime || detailPayload?.createTime || 0) || undefined;

  return {
    userId: Number(profile?.userId || 0),
    userType: Number(profile?.userType || 0),
    vipType: Number(profile?.vipType || 0),
    name: profile?.nickname || profile?.name || "",
    level: Number(detailPayload?.level || 0) || undefined,
    avatarUrl: profile?.avatarUrl || undefined,
    backgroundUrl: profile?.backgroundUrl || undefined,
    createTime,
    createDays:
      Number(detailPayload?.createDays || profile?.createDays || 0) ||
      (createTime
        ? Math.max(Math.floor((Date.now() - createTime) / (24 * 60 * 60 * 1000)), 1)
        : undefined),
    artistCount: Number(subcountPayload?.artistCount || 0) || undefined,
    djRadioCount: Number(subcountPayload?.djRadioCount || 0) || undefined,
    mvCount: Number(subcountPayload?.mvCount || 0) || undefined,
    subPlaylistCount: subPlaylistCount || undefined,
    createdPlaylistCount: createdPlaylistCount || undefined,
  };
};

const resetDerivedUserCache = async (clearDailySongs: boolean = true) => {
  const dataStore = useDataStore();
  const musicStore = useMusicStore();

  await dataStore.setLikeSongsList(getDefaultLikeSongsDetail(), []);
  if (clearDailySongs) {
    musicStore.dailySongsData = {
      timestamp: null,
      list: [],
    };
  }
};

const ensureNormalLogin = (showTip: boolean = true): boolean => {
  if (isLogin() === 1) return true;
  openUserLogin(showTip, false, undefined, true);
  return false;
};

const fetchPagedList = async (
  fetcher: (limit: number, offset: number) => Promise<any>,
  extractor: (payload: any) => any[],
  limit: number = PAGE_LIMIT,
): Promise<any[]> => {
  let offset = 0;
  const resultList: any[] = [];

  while (true) {
    const result = await fetcher(limit, offset);
    const payload = unwrapResponse(result);
    const currentList = extractor(payload).filter(Boolean);
    resultList.push(...currentList);

    const total = Number(payload?.count ?? payload?.total ?? 0);
    const hasMore =
      payload?.more === true ||
      payload?.hasMore === true ||
      (total > 0 ? resultList.length < total : currentList.length >= limit);

    if (!currentList.length || !hasMore) break;
    offset += limit;
  }

  return resultList;
};

const updateLikeSongsListDetail = async (playlistList: any[]) => {
  const dataStore = useDataStore();
  const rawLikeSongs =
    playlistList.find((item) => Number(item?.specialType) === 5) ||
    playlistList.find((item) => item?.name === "我喜欢的音乐") ||
    playlistList[0];

  const detail = rawLikeSongs ? formatCoverList([rawLikeSongs])[0] : getDefaultLikeSongsDetail();
  const currentDetailId = Number(dataStore.likeSongsList.detail?.id || 0);
  const nextDetailId = Number(detail?.id || 0);
  const nextSongs =
    currentDetailId !== 0 && currentDetailId === nextDetailId ? dataStore.likeSongsList.data : [];

  await dataStore.setLikeSongsList(detail || getDefaultLikeSongsDetail(), nextSongs);
};

const syncElectronLikeState = async (song: SongType, like: boolean) => {
  const dataStore = useDataStore();
  if (!isElectron) return;
  if (Number(dataStore.likeSongsList.detail?.id || 0) === 0) return;

  const exists = dataStore.likeSongsList.data.some((item) => item.id === song.id);
  const nextSongs = like
    ? exists
      ? dataStore.likeSongsList.data
      : [song, ...dataStore.likeSongsList.data]
    : dataStore.likeSongsList.data.filter((item) => item.id !== song.id);

  await dataStore.setLikeSongsList(dataStore.likeSongsList.detail, nextSongs);
};

export const isLogin = (): 0 | 1 | 2 => {
  const dataStore = useDataStore();

  if (
    dataStore.loginType === "uid" &&
    dataStore.userLoginStatus &&
    Number(dataStore.userData.userId) > 0
  ) {
    return 2;
  }

  if (dataStore.userLoginStatus || getCookie("MUSIC_U") !== null) {
    return 1;
  }

  return 0;
};

export const refreshLoginData = async () => {
  if (isLogin() !== 1) return;

  const lastLoginTime = Number(localStorage.getItem("lastLoginTime") || 0);
  if (!lastLoginTime) {
    localStorage.setItem("lastLoginTime", Date.now().toString());
    return;
  }

  if (Date.now() - lastLoginTime < LOGIN_REFRESH_INTERVAL) return;

  try {
    await refreshLogin();
    localStorage.setItem("lastLoginTime", Date.now().toString());
  } catch (error) {
    console.error("刷新登录状态失败：", error);
  }
};

export const getRawCookie = (name: string) => {
  return getCookie(name);
};

export const saveCurrentAccount = () => {
  const dataStore = useDataStore();

  if (isLogin() !== 1 || !Number(dataStore.userData.userId)) return;

  const cookies = collectCookieSnapshot();
  if (!Object.keys(cookies).length) return;

  const currentAccount: AccountType = {
    userId: dataStore.userData.userId,
    name: dataStore.userData.name || "未知用户",
    avatarUrl: dataStore.userData.avatarUrl || "/images/avatar.jpg?asset",
    cookies,
    loginType: dataStore.loginType as LoginType,
    lastLoginTime: Date.now(),
  };

  const nextUserList = [
    currentAccount,
    ...dataStore.userList.filter((item) => item.userId !== currentAccount.userId),
  ].slice(0, 3);

  dataStore.userList = nextUserList;
};

export const switchAccount = async (userId: number) => {
  const dataStore = useDataStore();
  const targetAccount = dataStore.userList.find((item) => item.userId === userId);

  if (!targetAccount) {
    window.$message?.error("未找到目标账号");
    return;
  }

  try {
    clearAllLoginCookies();
    applyCookieSnapshot(targetAccount.cookies);

    dataStore.userLoginStatus = true;
    dataStore.loginType = targetAccount.loginType;
    localStorage.setItem("lastLoginTime", Date.now().toString());

    await refreshLoginData();
    await updateUserData();

    window.$message?.success("账号切换成功");
    await router.push("/");
  } catch (error) {
    console.error("切换账号失败：", error);
    window.$message?.error("账号切换失败，请重试");
  }
};

export const removeAccount = (userId: number) => {
  const dataStore = useDataStore();
  dataStore.userList = dataStore.userList.filter((item) => item.userId !== userId);
  window.$message?.success("账号已移除");
};

export const toLogout = async (clearUserList: boolean = false) => {
  const dataStore = useDataStore();

  try {
    if (isLogin() === 1) {
      try {
        await logout();
      } catch (error) {
        console.warn("远端退出失败，继续清理本地状态：", error);
      }
    }

    clearAllLoginCookies();
    localStorage.removeItem("lastLoginTime");

    await dataStore.clearUserData();
    await resetDerivedUserCache();

    if (clearUserList) {
      dataStore.userList = [];
    }

    await router.push("/");
    window.$message?.success("已退出登录");
  } catch (error) {
    console.error("退出登录失败：", error);
    window.$message?.error("退出登录失败，请重试");
  }
};

export const updateUserData = async () => {
  const dataStore = useDataStore();

  try {
    const accountResult = await userAccount();
    const accountPayload = unwrapResponse<any>(accountResult);
    const accountProfile = accountPayload?.profile ?? accountPayload?.data?.profile;
    const accountInfo = accountPayload?.account ?? accountPayload?.data?.account;
    const userId = Number(accountProfile?.userId || accountInfo?.id || accountInfo?.userId || 0);

    if (!userId) {
      throw new Error("未获取到用户 ID");
    }

    const [detailResult, subcountResult, playlistResult] = await Promise.all([
      userDetail(userId),
      userSubcount(),
      userPlaylist(PLAYLIST_PAGE_LIMIT, 0, userId),
    ]);

    const detailPayload = unwrapResponse<any>(detailResult);
    const subcountPayload = unwrapResponse<any>(subcountResult);
    const playlistPayload = unwrapResponse<any>(playlistResult);
    const profile = detailPayload?.profile ?? accountProfile;

    dataStore.userLoginStatus = true;
    dataStore.userData = buildUserData(profile, detailPayload, subcountPayload, playlistPayload);

    await Promise.allSettled([
      updateUserLikeSongs(),
      updateUserLikePlaylist(),
      updateUserLikeArtists(),
      updateUserLikeAlbums(),
      updateUserLikeDjs(),
      updateUserLikeMvs(),
      updateDailySongsData(),
    ]);

    saveCurrentAccount();
  } catch (error) {
    console.error("更新用户信息失败：", error);
    window.$message?.error("获取用户信息失败，请重新登录");
    throw error;
  }
};

export const updateSpecialUserData = async (userData?: any) => {
  const dataStore = useDataStore();

  try {
    const currentUserId = Number(
      userData?.userId || userData?.uid || dataStore.userData.userId || 0,
    );
    if (!currentUserId) {
      throw new Error("未获取到 UID 用户信息");
    }

    let detailPayload: any = null;
    try {
      detailPayload = unwrapResponse(await userDetail(currentUserId));
    } catch (error) {
      console.warn("UID 详情获取失败，使用现有资料：", error);
    }

    const profile = detailPayload?.profile ?? userData;
    dataStore.userLoginStatus = true;
    dataStore.loginType = "uid";
    dataStore.userData = {
      userId: Number(profile?.userId || currentUserId),
      userType: Number(profile?.userType || 0),
      vipType: Number(profile?.vipType || 0),
      name: profile?.nickname || profile?.name || "",
      level: Number(detailPayload?.level || 0) || undefined,
      avatarUrl: profile?.avatarUrl || undefined,
      backgroundUrl: profile?.backgroundUrl || undefined,
      createTime: Number(profile?.createTime || 0) || undefined,
      createDays: Number(detailPayload?.createDays || profile?.createDays || 0) || undefined,
    };

    await Promise.all(
      (["songs", "playlists", "artists", "albums", "mvs", "djs"] as const).map((key) =>
        dataStore.setUserLikeData(key, []),
      ),
    );
    await resetDerivedUserCache();
  } catch (error) {
    console.error("更新 UID 用户信息失败：", error);
    window.$message?.error("获取 UID 用户信息失败");
    throw error;
  }
};

export const updateUserLikeSongs = async () => {
  const dataStore = useDataStore();
  if (isLogin() !== 1 || !dataStore.userData.userId) return;

  const result = await userLike(dataStore.userData.userId);
  const payload = unwrapResponse<any>(result);
  const ids = Array.isArray(payload?.ids) ? payload.ids.map((item: any) => Number(item)) : [];
  await dataStore.setUserLikeData("songs", ids);
};

export const updateUserLikePlaylist = async () => {
  const dataStore = useDataStore();
  const userId = Number(dataStore.userData.userId || 0);
  if (!userId) return;

  const rawPlaylists = await fetchPagedList(
    (limit, offset) => userPlaylist(limit, offset, userId),
    (payload) => getArrayByKeys(payload, ["playlist"]),
    PLAYLIST_PAGE_LIMIT,
  );

  const playlistData = formatCoverList(rawPlaylists);
  await dataStore.setUserLikeData("playlists", playlistData);
  await updateLikeSongsListDetail(rawPlaylists);
};

export const updateUserLikeArtists = async () => {
  const dataStore = useDataStore();
  if (isLogin() !== 1) return;

  const rawArtists = await fetchPagedList(
    (limit, offset) => userArtist(limit, offset),
    (payload) => getArrayByKeys(payload, ["data", "artists"]),
  );

  await dataStore.setUserLikeData("artists", formatArtistsList(rawArtists) as ArtistType[]);
};

export const updateUserLikeAlbums = async () => {
  const dataStore = useDataStore();
  if (isLogin() !== 1) return;

  const rawAlbums = await fetchPagedList(
    (limit, offset) => userAlbum(limit, offset),
    (payload) => getArrayByKeys(payload, ["data", "albums"]),
  );

  await dataStore.setUserLikeData("albums", formatCoverList(rawAlbums));
};

export const updateUserLikeDjs = async () => {
  const dataStore = useDataStore();
  if (isLogin() !== 1) return;

  const rawDjs = await fetchPagedList(
    (limit, offset) => userDj(limit, offset),
    (payload) => getArrayByKeys(payload, ["djRadios", "data", "djRadio"]),
  );

  await dataStore.setUserLikeData("djs", formatCoverList(rawDjs));
};

export const updateUserLikeMvs = async () => {
  const dataStore = useDataStore();
  if (isLogin() !== 1) return;

  const rawMvs = await fetchPagedList(
    (limit, offset) => userMv(limit, offset),
    (payload) => getArrayByKeys(payload, ["data", "mvs"]),
  );

  await dataStore.setUserLikeData("mvs", formatCoverList(rawMvs));
};

export const toLikeSong: DebouncedFunc<(song: SongType, like: boolean) => Promise<void>> = debounce(
  async (song: SongType, like: boolean) => {
    const dataStore = useDataStore();

    if (!ensureNormalLogin()) return;
    if (song?.path) {
      window.$message?.warning("本地歌曲暂不支持此操作");
      return;
    }
    if (song?.type === "streaming") {
      window.$message?.warning("流媒体歌曲暂不支持此操作");
      return;
    }

    try {
      await likeSong(song.id, like);
      const currentIds = [...dataStore.userLikeData.songs];
      const nextIds = like
        ? Array.from(new Set([...currentIds, song.id]))
        : currentIds.filter((item) => item !== song.id);

      await dataStore.setUserLikeData("songs", nextIds);
      await syncElectronLikeState(song, like);
      window.$message?.success(like ? "已添加到我喜欢的音乐" : "已取消喜欢");
    } catch (error) {
      console.error("喜欢歌曲失败：", error);
      window.$message?.error("操作失败，请重试");
    }
  },
  300,
  { leading: true, trailing: false },
);

export const toLikeSomething = (
  request: (id: number, t: number) => Promise<any>,
  update: () => Promise<void>,
  options: LikeActionOptions,
): DebouncedFunc<(id: number, like: boolean) => Promise<void>> =>
  debounce(
    async (id: number, like: boolean) => {
      if (!ensureNormalLogin()) return;

      try {
        const result = await request(
          id,
          like ? (options.likeValue ?? 1) : (options.unlikeValue ?? 2),
        );
        if (!isRequestSuccess(result)) {
          window.$message?.error(`${options.actionName}失败，请稍后重试`);
          return;
        }
        await update();
        window.$message?.success(`${options.actionName}成功`);
      } catch (error) {
        console.error(`${options.actionName}失败：`, error);
        window.$message?.error(`${options.actionName}失败，请稍后重试`);
      }
    },
    300,
    { leading: true, trailing: false },
  );

export const toLikePlaylist = toLikeSomething(likePlaylist, updateUserLikePlaylist, {
  actionName: "歌单操作",
});

export const toLikeAlbum = toLikeSomething(likeAlbum, updateUserLikeAlbums, {
  actionName: "专辑操作",
});

export const toLikeArtist = toLikeSomething(likeArtist, updateUserLikeArtists, {
  actionName: "歌手操作",
});

export const toSubRadio = toLikeSomething(radioSub, updateUserLikeDjs, {
  actionName: "电台操作",
  unlikeValue: 0,
});

export const updateDailySongsData = async (refresh: boolean = false) => {
  const musicStore = useMusicStore();

  if (isLogin() !== 1) return;

  const lastTimestamp = musicStore.dailySongsData.timestamp;
  if (!refresh && lastTimestamp) {
    const lastDate = new Date(lastTimestamp);
    const nowDate = new Date();
    const isSameDay = lastDate.toDateString() === nowDate.toDateString();
    const shouldReuseToday = !isBeforeSixAM(lastTimestamp) && isSameDay;
    const shouldReuseBeforeSix = isBeforeSixAM(Date.now()) && !isBeforeSixAM(lastTimestamp);
    if (shouldReuseToday || shouldReuseBeforeSix) return;
  }

  try {
    const result = await dailyRecommend();
    const payload = unwrapResponse<any>(result);
    const songList = formatSongsList(
      payload?.data?.dailySongs ?? payload?.dailySongs ?? payload?.recommend ?? [],
    );

    musicStore.dailySongsData = {
      timestamp: Date.now(),
      list: songList,
    };
  } catch (error) {
    console.error("更新每日推荐失败：", error);
  }
};

export const deleteSongs = async (pid: number, ids: number[], options: DeleteSongsOptions = {}) => {
  const localStore = useLocalStore();
  const runDelete = async () => {
    try {
      if (localStore.isLocalPlaylist(pid)) {
        const success = await localStore.removeSongsFromLocalPlaylist(
          pid,
          ids.map((item) => item.toString()),
        );
        if (!success) {
          window.$message?.error("操作失败，请重试");
          return;
        }
        if (isFunction(options.callback)) options.callback();
        window.$message?.success("操作成功");
        return;
      }

      if (!ensureNormalLogin()) return;

      const result = await playlistTracks(pid, ids, "del");
      if (!isRequestSuccess(result)) {
        window.$message?.error("操作失败，请重试");
        return;
      }

      if (isFunction(options.callback)) options.callback();
      window.$message?.success("操作成功");
    } catch (error) {
      console.error("删除歌曲失败：", error);
      window.$message?.error("操作失败，请重试");
    }
  };

  const content = options.songName
    ? `确认从歌单中删除《${options.songName}》吗？`
    : `确认删除选中的 ${ids.length} 首歌曲吗？`;

  if (window.$dialog?.warning) {
    window.$dialog.warning({
      title: "删除歌曲",
      content,
      positiveText: "确认",
      negativeText: "取消",
      onPositiveClick: runDelete,
    });
    return;
  }

  await runDelete();
};
