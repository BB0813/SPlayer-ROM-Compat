import request from "@/utils/request";
import idMeta from "@/assets/data/idMeta.json";

export const dailyRecommend = (type: "songs" | "resource" = "songs") => {
  return request({
    url: `/recommend/${type}`,
    params: { timestamp: Date.now() },
  });
};

export const dailyRecommendDislike = (id: number) => {
  return request({
    url: "/recommend/songs/dislike",
    params: { id, timestamp: Date.now() },
  });
};

export const personalized = (
  type: "playlist" | "mv" | "newsong" | "djprogram" | "privatecontent" = "playlist",
  limit: number = 50,
) => {
  const url = type === "playlist" ? "/personalized" : `/personalized/${type}`;
  return request({
    url,
    params: {
      limit,
    },
  });
};

export const radarPlaylist = async () => {
  const allRadar = idMeta.radarPlaylist.map((playlist) => {
    return request({
      url: "/playlist/detail",
      params: { id: playlist.id },
    });
  });
  const result = await Promise.allSettled(allRadar);
  return result.reduce<any[]>((list, res) => {
    if (res.status === "fulfilled" && res.value?.playlist?.name) {
      list.push(res.value.playlist);
    }
    return list;
  }, []);
};

export const topArtists = async (limit: number = 10) => {
  return request({
    url: "/top/artists",
    params: { limit },
  });
};

export const newSongs = async (type: 0 | 7 | 96 | 16 | 8 = 0) => {
  return request({
    url: "/top/song",
    params: { type },
  });
};

export const newAlbums = async () => {
  return request({
    url: "/album/new",
  });
};

export const newAlbumsAll = (
  cat: "ALL" | "ZH" | "EA" | "KR" | "JP" = "ALL",
  limit: number = 20,
  offset: number = 0,
) => {
  return request({
    url: "/album/new",
    params: { cat, limit, offset },
  });
};

// 注释已清理
export const personalFm = () => {
  return request({
    url: "/personal_fm",
    params: {
      timestamp: Date.now(),
    },
  });
};

export const personalFmToTrash = (id: number) => {
  return request({
    url: "/fm_trash",
    params: { id, timestamp: Date.now() },
  });
};
