import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import process from "node:process";
import fastify from "fastify";
import { decryptQrc } from "../electron/server/qqmusic/qrc";
import { encryptQuery } from "../electron/server/unblock/kwDES.js";

const require = createRequire(import.meta.url);
const ncmApiEntry = require.resolve("@neteasecloudmusicapienhanced/api/app.js");

const upstreamHost = process.env.SPLAYER_ANDROID_API_UPSTREAM_HOST || "127.0.0.1";
const upstreamPort = Number(process.env.SPLAYER_ANDROID_API_UPSTREAM_PORT || "3000");
const proxyHost = process.env.SPLAYER_ANDROID_API_HOST || "0.0.0.0";
const proxyPort = Number(
  process.env.SPLAYER_ANDROID_API_PORT || process.env.VITE_SERVER_PORT || "25884",
);

const upstreamRoot = `http://${upstreamHost}:${upstreamPort}`;
const app = fastify();

const ignoredRequestHeaders = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "accept-encoding",
]);

const ignoredResponseHeaders = new Set([
  "connection",
  "content-length",
  "content-encoding",
  "transfer-encoding",
]);

const qmApiUrl = "https://u.y.qq.com/cgi-bin/musicu.fcg";
const qmHeaders = {
  "Content-Type": "application/json",
  "Accept-Encoding": "gzip",
  "User-Agent": "okhttp/3.14.9",
  Cookie: "tmeLoginType=-1;",
};

const qqSessionCache: {
  uid?: string;
  sid?: string;
  userip?: string;
  expireTime?: number;
} = {};

type SongUrlResult = {
  code: number;
  url: string | null;
};

type SongMatchInfo = {
  keyword: string;
  songName: string;
  artist: string;
};

const bodianDeviceId = Math.floor(Math.random() * 100000000001).toString();

const upstreamProcess = spawn(process.execPath, [ncmApiEntry], {
  env: {
    ...process.env,
    HOST: upstreamHost,
    PORT: String(upstreamPort),
  },
  stdio: "inherit",
});

upstreamProcess.on("exit", (code) => {
  process.exit(code ?? 0);
});

const normalizeName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[（(][^）)]*[）)]/g, "")
    .trim();
};

const normalizeArtist = (artist: string): string => {
  return artist
    .toLowerCase()
    .replace(/[&/、，,;；]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const isSongMatch = (
  resultName: string,
  resultArtist: string | undefined,
  match: SongMatchInfo,
): boolean => {
  const normalizedResult = normalizeName(resultName);
  const normalizedOriginal = normalizeName(match.songName);
  if (!normalizedResult) return false;

  if (
    normalizedOriginal &&
    !normalizedResult.includes(normalizedOriginal) &&
    !normalizedOriginal.includes(normalizedResult)
  ) {
    return false;
  }

  if (resultArtist && match.artist) {
    const normalizedResultArtist = normalizeArtist(resultArtist);
    const normalizedOriginalArtist = normalizeArtist(match.artist);
    if (
      normalizedResultArtist &&
      normalizedOriginalArtist &&
      !normalizedResultArtist.includes(normalizedOriginalArtist) &&
      !normalizedOriginalArtist.includes(normalizedResultArtist)
    ) {
      return false;
    }
  }

  return true;
};

const buildMatchInfo = (query: { [key: string]: string | undefined }): SongMatchInfo => {
  let songName = query.songName || "";
  let artist = query.artist || "";
  if (!songName && query.keyword) {
    const lastIndex = query.keyword.lastIndexOf("-");
    if (lastIndex > 0) {
      songName = query.keyword.slice(0, lastIndex).trim();
      artist = artist || query.keyword.slice(lastIndex + 1).trim();
    } else {
      songName = query.keyword.trim();
    }
  }

  return {
    keyword: query.keyword || "",
    songName,
    artist,
  };
};

const getNeteaseSongUrl = async (id: number | string | undefined): Promise<SongUrlResult> => {
  try {
    if (!id) return { code: 404, url: null };
    const url = new URL("https://music-api.gdstudio.xyz/api.php");
    url.searchParams.set("types", "url");
    url.searchParams.set("id", String(id));

    const response = await fetch(url, { redirect: "follow" });
    const data = (await response.json()) as { url?: string | null };
    return { code: data.url ? 200 : 404, url: data.url ?? null };
  } catch (error) {
    console.warn("[android-api-server] unblock netease failed", error);
    return { code: 404, url: null };
  }
};

const getKuwoSongId = async (match: SongMatchInfo): Promise<string | null> => {
  try {
    const url =
      "http://search.kuwo.cn/r.s?&correct=1&stype=comprehensive&encoding=utf8&rformat=json&mobi=1&show_copyright_off=1&searchapi=6&all=" +
      encodeURIComponent(match.keyword);
    const response = await fetch(url, { redirect: "follow" });
    const data = (await response.json()) as {
      content?: Array<{
        musicpage?: {
          abslist?: Array<{ MUSICRID?: string; SONGNAME?: string; ARTIST?: string }>;
        };
      }>;
    };

    const list = data.content?.[1]?.musicpage?.abslist ?? [];
    for (const item of list) {
      const songId = item?.MUSICRID;
      if (!songId) continue;
      if (isSongMatch(item.SONGNAME || "", item.ARTIST || "", match)) {
        return songId.slice("MUSIC_".length);
      }
    }

    return null;
  } catch (error) {
    console.warn("[android-api-server] unblock kuwo search failed", error);
    return null;
  }
};

const getKuwoSongUrl = async (match: SongMatchInfo): Promise<SongUrlResult> => {
  try {
    if (!match.keyword) return { code: 404, url: null };
    const songId = await getKuwoSongId(match);
    if (!songId) return { code: 404, url: null };

    const packageName = "kwplayer_ar_5.1.0.0_B_jiakong_vh.apk";
    const query = `corp=kuwo&source=${packageName}&p2p=1&type=convert_url2&sig=0&format=mp3&rid=${songId}`;
    const url = `http://mobi.kuwo.cn/mobi.s?f=kuwo&q=${encryptQuery(query)}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "okhttp/3.10.0" },
      redirect: "follow",
    });
    const data = await response.text();
    const urlMatch = data.match(/http[^\s$"]+/)?.[0] ?? null;
    return { code: urlMatch ? 200 : 404, url: urlMatch };
  } catch (error) {
    console.warn("[android-api-server] unblock kuwo failed", error);
    return { code: 404, url: null };
  }
};

const formatBodianSong = (song: {
  MUSICRID: string;
  SONGNAME: string;
  DURATION: number;
  ALBUMID: string;
  ALBUM: string;
  ARTIST: string;
  ARTISTID: string;
}) => ({
  id: song.MUSICRID.split("_").pop() || "",
  name: song.SONGNAME,
  duration: song.DURATION * 1000,
  album: { id: song.ALBUMID, name: song.ALBUM },
  artists: song.ARTIST.split("&").map((name, index) => ({
    id: index ? null : song.ARTISTID,
    name,
  })),
});

const generateBodianSign = (rawUrl: string): string => {
  const parsedUrl = new URL(rawUrl);
  const requestUrl = `${rawUrl}&timestamp=${Date.now()}`;
  const filteredChars = requestUrl
    .substring(requestUrl.indexOf("?") + 1)
    .replace(/[^a-zA-Z0-9]/g, "")
    .split("")
    .sort()
    .join("");
  const sign = createHash("md5")
    .update(`kuwotest${filteredChars}${parsedUrl.pathname}`)
    .digest("hex");
  return `${requestUrl}&sign=${sign}`;
};

const searchBodianSongId = async (match: SongMatchInfo): Promise<string | null> => {
  try {
    const keyword = encodeURIComponent(match.keyword.replace(" - ", " "));
    const url =
      "http://search.kuwo.cn/r.s?&correct=1&vipver=1&stype=comprehensive&encoding=utf8&rformat=json&mobi=1&show_copyright_off=1&searchapi=6&all=" +
      keyword;
    const response = await fetch(url, { redirect: "follow" });
    const data = (await response.json()) as {
      content?: Array<{
        musicpage?: {
          abslist?: Array<{
            MUSICRID: string;
            SONGNAME: string;
            DURATION: number;
            ALBUMID: string;
            ALBUM: string;
            ARTIST: string;
            ARTISTID: string;
          }>;
        };
      }>;
    };

    const list = (data.content?.[1]?.musicpage?.abslist ?? []).map(formatBodianSong);
    for (const item of list) {
      const artist = item.artists.map((entry) => entry.name).join("&");
      if (item.id && isSongMatch(item.name || "", artist, match)) {
        return item.id;
      }
    }

    return null;
  } catch (error) {
    console.warn("[android-api-server] unblock bodian search failed", error);
    return null;
  }
};

const sendBodianAdFreeRequest = async (): Promise<void> => {
  try {
    await fetch(
      "http://bd-api.kuwo.cn/api/service/advert/watch?uid=-1&token=&timestamp=1724306124436&sign=15a676d66285117ad714e8c8371691da",
      {
        method: "POST",
        headers: {
          "user-agent": "Dart/2.19 (dart:io)",
          plat: "ar",
          channel: "aliopen",
          devid: bodianDeviceId,
          ver: "3.9.0",
          host: "bd-api.kuwo.cn",
          qimei36: "1e9970cbcdc20a031dee9f37100017e1840e",
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({ type: 5, subType: 5, musicId: 0, adToken: "" }),
      },
    );
  } catch (error) {
    console.warn("[android-api-server] unblock bodian ad-free failed", error);
  }
};

const getBodianSongUrl = async (match: SongMatchInfo): Promise<SongUrlResult> => {
  try {
    if (!match.keyword) return { code: 404, url: null };
    const songId = await searchBodianSongId(match);
    if (!songId) return { code: 404, url: null };

    await sendBodianAdFreeRequest();

    const url = generateBodianSign(
      `http://bd-api.kuwo.cn/api/play/music/v2/audioUrl?&br=320kmp3&musicId=${songId}`,
    );
    const response = await fetch(url, {
      headers: {
        "user-agent": "Dart/2.19 (dart:io)",
        plat: "ar",
        channel: "aliopen",
        devid: bodianDeviceId,
        ver: "3.9.0",
        host: "bd-api.kuwo.cn",
        "X-Forwarded-For": "1.0.1.114",
      },
      redirect: "follow",
    });
    const data = (await response.json()) as { data?: { audioUrl?: string | null } };
    const audioUrl = data.data?.audioUrl ?? null;
    return { code: audioUrl ? 200 : 404, url: audioUrl };
  } catch (error) {
    console.warn("[android-api-server] unblock bodian failed", error);
    return { code: 404, url: null };
  }
};

const searchGequbaoSongId = async (match: SongMatchInfo): Promise<string | null> => {
  try {
    const url = `https://www.gequbao.com/s/${encodeURIComponent(match.keyword)}`;
    const response = await fetch(url, { redirect: "follow" });
    const data = await response.text();
    const regex = /<a href="\/music\/(\d+)" target="_blank" class="music-link d-block">\s*([^<]*)/g;

    for (const result of data.matchAll(regex)) {
      const songName = result[2]?.trim();
      if (songName && isSongMatch(songName, undefined, match)) {
        return result[1] ?? null;
      }
    }

    return null;
  } catch (error) {
    console.warn("[android-api-server] unblock gequbao search failed", error);
    return null;
  }
};

const getGequbaoPlayId = async (id: string): Promise<string | null> => {
  try {
    const response = await fetch(`https://www.gequbao.com/music/${id}`, { redirect: "follow" });
    const data = await response.text();
    return data.match(/"play_id":"(.*?)"/)?.[1] ?? null;
  } catch (error) {
    console.warn("[android-api-server] unblock gequbao play-id failed", error);
    return null;
  }
};

const getGequbaoSongUrl = async (match: SongMatchInfo): Promise<SongUrlResult> => {
  try {
    if (!match.keyword) return { code: 404, url: null };

    const songId = await searchGequbaoSongId(match);
    if (!songId) return { code: 404, url: null };

    const playId = await getGequbaoPlayId(songId);
    if (!playId) return { code: 404, url: null };

    const response = await fetch("https://www.gequbao.com/api/play-url", {
      method: "POST",
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "accept-language": "zh-CN,zh;q=0.9",
        "cache-control": "no-cache",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        pragma: "no-cache",
        priority: "u=1, i",
        "sec-ch-ua": '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-requested-with": "XMLHttpRequest",
        cookie: `server_name_session=${randomBytes(16).toString("hex")}`,
        Referer: `https://www.gequbao.com/music/${songId}`,
      },
      body: `id=${encodeURIComponent(playId)}`,
      redirect: "follow",
    });
    const data = (await response.json()) as { code?: number; data?: { url?: string | null } };
    const songUrl = data.code === 1 ? (data.data?.url ?? null) : null;
    return { code: songUrl ? 200 : 404, url: songUrl };
  } catch (error) {
    console.warn("[android-api-server] unblock gequbao failed", error);
    return { code: 404, url: null };
  }
};
const getQQCommonParams = () => ({
  ct: 11,
  cv: "1003006",
  v: "1003006",
  os_ver: "15",
  phonetype: "24122RKC7C",
  tmeAppID: "qqmusiclight",
  nettype: "NETWORK_WIFI",
  udid: "0",
});

const postJson = async <T>(
  url: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<T> => {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`request failed: ${response.status} ${response.statusText}`);
  }

  return JSON.parse(responseText) as T;
};

const ensureQQSession = async () => {
  if (qqSessionCache.uid && qqSessionCache.expireTime && Date.now() < qqSessionCache.expireTime) {
    return;
  }

  try {
    const response = await postJson<any>(
      qmApiUrl,
      {
        comm: getQQCommonParams(),
        request: {
          method: "GetSession",
          module: "music.getSession.session",
          param: { caller: 0, uid: "0", vkey: 0 },
        },
      },
      qmHeaders,
    );

    if (response.code === 0 && response.request?.code === 0) {
      const session = response.request.data?.session;
      if (session) {
        qqSessionCache.uid = session.uid;
        qqSessionCache.sid = session.sid;
        qqSessionCache.userip = session.userip;
        qqSessionCache.expireTime = Date.now() + 3600000;
      }
    }
  } catch (error) {
    console.warn("[android-api-server] qq session init failed", error);
  }
};

const qqRequest = async (method: string, module: string, param: Record<string, unknown>) => {
  await ensureQQSession();

  const comm = {
    ...getQQCommonParams(),
    ...(qqSessionCache.uid ? { uid: qqSessionCache.uid } : {}),
    ...(qqSessionCache.sid ? { sid: qqSessionCache.sid } : {}),
    ...(qqSessionCache.userip ? { userip: qqSessionCache.userip } : {}),
  };

  const response = await postJson<any>(
    qmApiUrl,
    {
      comm,
      request: { method, module, param },
    },
    qmHeaders,
  );

  if (response.code !== 0 || response.request?.code !== 0) {
    throw new Error(`QM API error: ${response.code || response.request?.code || "unknown"}`);
  }

  return response.request.data;
};

const getQQMusicLyric = async (
  songId: number,
  songName = "",
  singerName = "",
  albumName = "",
  duration = 0,
) => {
  try {
    const encodeBase64 = (value: string) => Buffer.from(value, "utf8").toString("base64");
    const lyricParam = {
      albumName: encodeBase64(albumName),
      crypt: 1,
      ct: 19,
      cv: 2111,
      interval: duration,
      lrc_t: 0,
      qrc: 1,
      qrc_t: 0,
      roma: 1,
      roma_t: 0,
      singerName: encodeBase64(singerName),
      songID: songId,
      songName: encodeBase64(songName),
      trans: 1,
      trans_t: 0,
      type: 0,
    };

    const response = await qqRequest(
      "GetPlayLyricInfo",
      "music.musichallSong.PlayLyricInfo",
      lyricParam,
    );

    const result: Record<string, unknown> = { code: 200 };
    const qrcLyric = response.lyric;

    if (typeof qrcLyric === "string" && qrcLyric.length > 0) {
      try {
        result.qrc = decryptQrc(qrcLyric);
      } catch (error) {
        console.warn("[android-api-server] qq qrc decrypt failed", error);
      }
    }

    if (response.qrc_t === 0 && typeof qrcLyric === "string" && qrcLyric.length > 0) {
      try {
        result.lrc = decryptQrc(qrcLyric);
      } catch {
        void 0;
      }
    } else {
      try {
        const lrcResponse = await qqRequest(
          "GetPlayLyricInfo",
          "music.musichallSong.PlayLyricInfo",
          {
            ...lyricParam,
            qrc: 0,
            qrc_t: 0,
          },
        );
        if (typeof lrcResponse.lyric === "string" && lrcResponse.lyric.length > 0) {
          result.lrc = decryptQrc(lrcResponse.lyric);
        }
      } catch {
        void 0;
      }
    }

    if (typeof response.trans === "string" && response.trans.length > 0) {
      try {
        result.trans = decryptQrc(response.trans);
      } catch {
        void 0;
      }
    }

    if (typeof response.roma === "string" && response.roma.length > 0) {
      try {
        result.roma = decryptQrc(response.roma);
      } catch {
        void 0;
      }
    }

    return result;
  } catch (error) {
    console.error("[android-api-server] qq lyric failed", error);
    return {
      code: 500,
      message: error instanceof Error ? error.message : "server error",
    };
  }
};

const searchQQMusic = async (keyword: string, page = 1, pageSize = 20) => {
  try {
    const response = await qqRequest("DoSearchForQQMusicLite", "music.search.SearchCgiService", {
      search_id: String(
        Math.floor(Math.random() * 20) * 18014398509481984 +
          Math.floor(Math.random() * 4194304) * 4294967296 +
          (Date.now() % 86400000),
      ),
      remoteplace: "search.android.keyboard",
      query: keyword,
      search_type: 0,
      num_per_page: pageSize,
      page_num: page,
      highlight: 0,
      nqc_flag: 0,
      page_id: 1,
      grp: 1,
    });

    const songList = response.body?.item_song || [];
    const songs = songList.map((song: any) => ({
      id: String(song.id),
      mid: song.mid,
      name: song.title,
      artist:
        song.singer
          ?.map((item: any) => item.name)
          .filter(Boolean)
          .join(" / ") || "Unknown artist",
      album: song.album?.name || "",
      duration: (song.interval || 0) * 1000,
    }));

    return {
      code: 200,
      songs,
      total: response.meta?.sum || songs.length,
    };
  } catch (error) {
    console.error("[android-api-server] qq search failed", error);
    return {
      code: 500,
      message: error instanceof Error ? error.message : "server error",
    };
  }
};

const buildTargetUrl = (requestUrl: string, wildcardPath: string | undefined) => {
  const queryIndex = requestUrl.indexOf("?");
  const queryString = queryIndex >= 0 ? requestUrl.slice(queryIndex) : "";
  const normalizedPath = wildcardPath ? `/${wildcardPath}` : "";
  return `${upstreamRoot}${normalizedPath}${queryString}`;
};

const getRequestBody = (body: unknown) => {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return body;
  return JSON.stringify(body);
};

const forwardRequest = async (request: any, reply: any, wildcardPath?: string) => {
  const targetUrl = buildTargetUrl(request.raw.url || request.url, wildcardPath);
  const method = String(request.method || "GET").toUpperCase();
  const headers = Object.entries(request.headers || {}).reduce<Record<string, string>>(
    (result, [key, value]) => {
      if (!value || ignoredRequestHeaders.has(key.toLowerCase())) {
        return result;
      }
      result[key] = Array.isArray(value) ? value.join("; ") : String(value);
      return result;
    },
    {},
  );
  const body = ["GET", "HEAD"].includes(method) ? undefined : getRequestBody(request.body);

  const response = await fetch(targetUrl, {
    method,
    headers,
    body,
    redirect: "follow",
  });

  reply.code(response.status);
  response.headers.forEach((value, key) => {
    if (ignoredResponseHeaders.has(key.toLowerCase())) return;
    reply.header(key, value);
  });

  const responseText = await response.text();
  reply.send(responseText);
};

app.get("/api", async () => ({
  name: "SPlayer Android API Adapter",
  description: "Expose Android host-side API adapters",
  upstream: upstreamRoot,
  list: [
    {
      name: "NeteaseCloudMusicApi",
      url: "/api/netease",
    },
    {
      name: "QQMusicAPI",
      url: "/api/qqmusic",
    },
    {
      name: "UnblockAPI",
      url: "/api/unblock",
    },
  ],
}));

app.get("/api/unblock", async () => ({
  name: "UnblockAPI",
  description: "SPlayer Android unblock adapter",
  routes: [
    "/api/unblock/netease",
    "/api/unblock/kuwo",
    "/api/unblock/bodian",
    "/api/unblock/gequbao",
  ],
}));

app.get("/api/unblock/netease", async (request) => {
  const query = request.query as { id?: string };
  return getNeteaseSongUrl(query.id);
});

app.get("/api/unblock/kuwo", async (request) => {
  const query = request.query as { keyword?: string; songName?: string; artist?: string };
  return getKuwoSongUrl(buildMatchInfo(query));
});

app.get("/api/unblock/bodian", async (request) => {
  const query = request.query as { keyword?: string; songName?: string; artist?: string };
  return getBodianSongUrl(buildMatchInfo(query));
});

app.get("/api/unblock/gequbao", async (request) => {
  const query = request.query as { keyword?: string; songName?: string; artist?: string };
  return getGequbaoSongUrl(buildMatchInfo(query));
});

app.get("/api/qqmusic", async () => ({
  name: "QQMusicAPI",
  description: "QQMusic lyric and search adapter",
  routes: ["/api/qqmusic/lyric", "/api/qqmusic/search", "/api/qqmusic/match"],
}));

app.get("/api/qqmusic/lyric", async (request, reply) => {
  const query = request.query as {
    id?: string;
    name?: string;
    artist?: string;
    album?: string;
    duration?: string;
  };

  if (!query.id) {
    reply.code(400);
    return { code: 400, message: "id is required" };
  }

  const songId = Number.parseInt(query.id, 10);
  if (Number.isNaN(songId)) {
    reply.code(400);
    return { code: 400, message: "id must be numeric" };
  }

  return getQQMusicLyric(
    songId,
    query.name || "",
    query.artist || "",
    query.album || "",
    Number.parseInt(query.duration || "0", 10) || 0,
  );
});

app.get("/api/qqmusic/search", async (request, reply) => {
  const query = request.query as { keyword?: string; page?: string; pageSize?: string };

  if (!query.keyword) {
    reply.code(400);
    return { code: 400, message: "keyword is required" };
  }

  return searchQQMusic(
    query.keyword,
    Number.parseInt(query.page || "1", 10) || 1,
    Number.parseInt(query.pageSize || "20", 10) || 20,
  );
});

app.get("/api/qqmusic/match", async (request, reply) => {
  const query = request.query as { keyword?: string };

  if (!query.keyword) {
    reply.code(400);
    return { code: 400, message: "keyword is required" };
  }

  const searchResult = await searchQQMusic(query.keyword, 1, 1);
  if (searchResult.code !== 200) {
    reply.code(500);
    return searchResult;
  }

  if (!searchResult.songs || searchResult.songs.length === 0) {
    reply.code(404);
    return { code: 404, message: "song not found" };
  }

  const song = searchResult.songs[0] as {
    id: string;
    mid: string;
    name: string;
    artist: string;
    album: string;
    duration: number;
  };
  const lyricResult = await getQQMusicLyric(
    Number.parseInt(song.id, 10),
    song.name,
    song.artist,
    song.album,
    Math.floor(song.duration / 1000),
  );

  const { code: _code, ...lyrics } = lyricResult;
  return {
    code: 200,
    song,
    ...lyrics,
  };
});

app.all("/api/netease", async (request, reply) => {
  await forwardRequest(request, reply);
});

app.all("/api/netease/*", async (request, reply) => {
  const params = request.params as { "*"?: string };
  await forwardRequest(request, reply, params["*"]);
});

const closeAll = async () => {
  try {
    await app.close();
  } catch {
    void 0;
  }

  if (!upstreamProcess.killed) {
    upstreamProcess.kill();
  }
};

process.on("SIGINT", async () => {
  await closeAll();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeAll();
  process.exit(0);
});

await app.listen({
  host: proxyHost,
  port: proxyPort,
});

ensureQQSession().catch(() => {});

console.log(`[android-api-server] adapter ready at http://${proxyHost}:${proxyPort}`);
console.log(`[android-api-server] upstream at ${upstreamRoot}`);
