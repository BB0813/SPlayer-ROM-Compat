package top.imsyy.splayer.android.api

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import top.imsyy.splayer.android.BuildConfig
import top.imsyy.splayer.android.bridge.AndroidWebActionDispatcher
import top.imsyy.splayer.android.player.AndroidNativeAudioPlayer
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.Locale

class AndroidLocalApiService {
  companion object {
    private const val TAG = "SPlayerLocalApi"
    private val IGNORED_REQUEST_HEADERS = setOf(
      "host",
      "origin",
      "referer",
      "content-length",
      "accept-encoding",
      "connection",
    )
  }
  fun handle(rawRequestJson: String): String {
    return try {
      val request = JSONObject(rawRequestJson)
      val requestPath = request.optString("path", "/")
      val requestUrl = buildLocalUrl(requestPath)

      when {
        requestUrl.path == "/api" || requestUrl.path == "/api/" -> buildApiInfoResponse()
        requestUrl.path == "/api/qqmusic" || requestUrl.path == "/api/qqmusic/" -> buildJsonResponse(200, AndroidQQMusicService.buildInfoBody())
        requestUrl.path.startsWith("/api/qqmusic/") -> handleQqMusicRequest(request, requestUrl)
        requestUrl.path == "/api/unblock" || requestUrl.path == "/api/unblock/" -> buildUnblockInfoResponse()
        requestUrl.path == "/api/unblock/netease" -> handleUnblockNeteaseRequest(requestUrl)
        requestUrl.path == "/api/unblock/kuwo" || requestUrl.path == "/api/unblock/bodian" || requestUrl.path == "/api/unblock/gequbao" -> proxyRemoteRequest(request, requestUrl)
        requestUrl.path.startsWith("/api/control/") -> handleControlRequest(requestUrl.path)
        requestUrl.path == "/api/netease/personalized" -> handleNeteasePersonalizedRequest(requestUrl)
        requestUrl.path == "/api/netease/playlist/detail" -> handleNeteasePlaylistDetailRequest(requestUrl)
        requestUrl.path == "/api/netease/top/artists" -> handleNeteaseTopArtistsRequest(requestUrl)
        requestUrl.path == "/api/netease/dj/recommend" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildDjRecommendFallbackResponse)
        requestUrl.path == "/api/netease/album/new" -> handleNeteaseAlbumNewRequest(requestUrl)
        requestUrl.path == "/api/netease/mv/all" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildMvAllFallbackResponse)
        requestUrl.path == "/api/netease/search/hot/detail" -> handleNeteaseSearchHotDetailRequest(requestUrl)
        requestUrl.path == "/api/netease/search/default" -> handleNeteaseSearchDefaultRequest(requestUrl)
        AndroidNeteaseApiService.canHandle(requestUrl.path) -> AndroidNeteaseApiService.handle(request, requestUrl)
        requestUrl.path == "/api/netease/login/status" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildLoginStatusFallbackResponse)
        requestUrl.path == "/api/netease/search/suggest" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildSearchSuggestFallbackResponse)
        requestUrl.path == "/api/netease/search/multimatch" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildSearchMultimatchFallbackResponse)
        requestUrl.path == "/api/netease/toplist/detail" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildToplistFallbackResponse)
        requestUrl.path == "/api/netease/toplist" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildToplistFallbackResponse)
        requestUrl.path == "/api/netease/user/account" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildUserAccountFallbackResponse)
        requestUrl.path == "/api/netease/login/refresh" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildLoginRefreshFallbackResponse)
        requestUrl.path == "/api/netease/logout" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildLogoutFallbackResponse)
        requestUrl.path == "/api/netease/countries/code/list" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildCountryCodeListFallbackResponse)
        requestUrl.path == "/api/netease/dj/toplist" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildDjToplistFallbackResponse)
        requestUrl.path == "/api/netease/dj/catelist" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildDjCatlistFallbackResponse)
        requestUrl.path == "/api/netease/dj/category/recommend" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildDjCategoryRecommendFallbackResponse)
        requestUrl.path == "/api/netease/cloudsearch" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildCloudSearchFallbackResponse)
        requestUrl.path == "/api/netease/login/qr/key" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildQrKeyFallbackResponse)
        requestUrl.path == "/api/netease/login/qr/create" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildQrCreateFallbackResponse)
        requestUrl.path == "/api/netease/login/qr/check" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildQrCheckFallbackResponse)
        requestUrl.path == "/api/netease/captcha/sent" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildCaptchaSentFallbackResponse)
        requestUrl.path == "/api/netease/captcha/verify" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildCaptchaVerifyFallbackResponse)
        requestUrl.path == "/api/netease/login/cellphone" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildLoginCellphoneFallbackResponse)
        requestUrl.path == "/api/netease/user/detail" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildUserDetailFallbackResponse)
        requestUrl.path == "/api/netease/user/subcount" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildUserSubcountFallbackResponse)
        requestUrl.path == "/api/netease/likelist" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildLikelistFallbackResponse)
        requestUrl.path == "/api/netease/user/playlist" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildUserPlaylistFallbackResponse)
        requestUrl.path == "/api/netease/album/sublist" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildAlbumSublistFallbackResponse)
        requestUrl.path == "/api/netease/artist/sublist" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildArtistSublistFallbackResponse)
        requestUrl.path == "/api/netease/mv/sublist" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildMvSublistFallbackResponse)
        requestUrl.path == "/api/netease/dj/sublist" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildDjSublistFallbackResponse)
        requestUrl.path == "/api/netease/playlist/subscribe" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildPlaylistSubscribeFallbackResponse)
        requestUrl.path == "/api/netease/album/sub" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildAlbumSubFallbackResponse)
        requestUrl.path == "/api/netease/artist/sub" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildArtistSubFallbackResponse)
        requestUrl.path == "/api/netease/mv/sub" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildMvSubFallbackResponse)
        requestUrl.path == "/api/netease/dj/sub" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildDjSubFallbackResponse)
        requestUrl.path == "/api/netease/like" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildLikeSongFallbackResponse)
        requestUrl.path == "/api/netease/scrobble" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildScrobbleFallbackResponse)
        requestUrl.path == "/api/netease/daily_signin" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildDailySigninFallbackResponse)
        requestUrl.path == "/api/netease/playlist/tracks" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildPlaylistTracksFallbackResponse)
        requestUrl.path == "/api/netease/playlist/create" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildPlaylistCreateFallbackResponse)
        requestUrl.path == "/api/netease/playlist/delete" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildPlaylistDeleteFallbackResponse)
        requestUrl.path == "/api/netease/playlist/update" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildPlaylistUpdateFallbackResponse)
        requestUrl.path == "/api/netease/playlist/privacy" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildPlaylistPrivacyFallbackResponse)
        requestUrl.path == "/api/netease/song/order/update" -> proxyRemoteRequestWithFallback(request, requestUrl, ::buildSongOrderUpdateFallbackResponse)
        requestUrl.path == "/api/netease/playlist/track/all" -> handleNeteasePlaylistTrackAllRequest(requestUrl)
        requestUrl.path == "/api/netease/album" -> handleNeteaseAlbumDetailRequest(requestUrl)
        requestUrl.path == "/api/netease/album/detail/dynamic" -> handleNeteaseAlbumDynamicRequest(requestUrl)
        requestUrl.path == "/api/netease/artist/detail" -> handleNeteaseArtistDetailRequest(requestUrl)
        requestUrl.path == "/api/netease/artists" -> handleNeteaseArtistHotSongsRequest(requestUrl)
        requestUrl.path == "/api/netease/artist/songs" -> handleNeteaseArtistSongsRequest(requestUrl)
        requestUrl.path == "/api/netease/song/detail" -> handleNeteaseSongDetailRequest(request, requestUrl)
        requestUrl.path == "/api/netease/song/music/detail" -> handleNeteaseSongMusicDetailRequest(request, requestUrl)
        requestUrl.path == "/api/netease/song/download/url/v1" -> handleNeteaseSongUrlRequest(request, requestUrl)
        requestUrl.path == "/api/netease/lyric/new" -> handleNeteaseLyricRequest(requestUrl)
        requestUrl.path == "/api/netease/song/url" || requestUrl.path == "/api/netease/song/url/v1" -> handleNeteaseSongUrlRequest(request, requestUrl)
        requestUrl.path.startsWith("/api/") -> proxyRemoteRequest(request, requestUrl)
        else -> buildJsonResponse(404, errorBody("api not found"))
      }
    } catch (error: Exception) {
      buildJsonResponse(500, errorBody(error.message ?: "android local api failed"))
    }
  }

  private fun buildApiInfoResponse(): String {
    val body = JSONObject()
      .put("name", "SPlayer-ROM-Compat Android Local API")
      .put("description", "SPlayer-ROM-Compat Android local api facade")
      .put("author", "@imsyy")
      .put(
        "list",
        JSONArray()
          .put(JSONObject().put("name", "NeteaseAPI").put("url", "/api/netease"))
          .put(JSONObject().put("name", "UnblockAPI").put("url", "/api/unblock"))
          .put(JSONObject().put("name", "QQMusicAPI").put("url", "/api/qqmusic"))
          .put(JSONObject().put("name", "ControlAPI").put("url", "/api/control")),
      )

    return buildJsonResponse(200, body)
  }

  private fun buildUnblockInfoResponse(): String {
    val body = JSONObject()
      .put("name", "UnblockAPI")
      .put("description", "SPlayer-ROM-Compat Android local unblock api")
      .put("author", "@imsyy")
      .put(
        "providers",
        JSONArray()
          .put("netease")
          .put("kuwo")
          .put("bodian")
          .put("gequbao"),
      )

    return buildJsonResponse(200, body)
  }

  private fun handleUnblockNeteaseRequest(requestUrl: URL): String {
    val songId = requestUrl.getQueryParameter("id")
    if (songId.isNullOrBlank()) {
      return buildJsonResponse(400, errorBody("missing song id"))
    }

    return try {
      val songUrl = fetchMirrorSongUrl(songId)
      Log.d(TAG, "songUrlResolved id=$songId empty=${songUrl.isNullOrBlank()}")
      val body =
        if (!songUrl.isNullOrBlank()) {
          JSONObject()
            .put("code", 200)
            .put("url", songUrl)
        } else {
          JSONObject()
            .put("code", 404)
            .put("url", JSONObject.NULL)
        }

      buildJsonResponse(200, body)
    } catch (error: Exception) {
      buildJsonResponse(
        502,
        JSONObject()
          .put("code", 404)
          .put("url", JSONObject.NULL)
          .put("message", error.message ?: "unblock url fetch failed"),
      )
    }
  }

  private fun handleNeteasePersonalizedRequest(requestUrl: URL): String {
    val limit = requestUrl.getQueryParameter("limit")?.toIntOrNull()?.coerceAtLeast(1) ?: 12
    return try {
      val endpoint =
        "https://music.163.com/api/personalized/playlist?limit=" +
          URLEncoder.encode(limit.toString(), StandardCharsets.UTF_8.name())
      buildRawJsonResponse(200, fetchText(endpoint))
    } catch (_: Exception) {
      buildPersonalizedFallbackResponse(requestUrl)
    }
  }

  private fun handleNeteaseTopArtistsRequest(requestUrl: URL): String {
    val limit = requestUrl.getQueryParameter("limit")?.toIntOrNull()?.coerceAtLeast(1) ?: 30
    val offset = requestUrl.getQueryParameter("offset")?.toIntOrNull()?.coerceAtLeast(0) ?: 0
    return try {
      val endpoint =
        "https://music.163.com/api/artist/top?offset=" +
          URLEncoder.encode(offset.toString(), StandardCharsets.UTF_8.name()) +
          "&limit=" + URLEncoder.encode(limit.toString(), StandardCharsets.UTF_8.name()) +
          "&total=true"
      buildRawJsonResponse(200, fetchText(endpoint))
    } catch (_: Exception) {
      buildTopArtistsFallbackResponse(requestUrl)
    }
  }

  private fun handleNeteaseAlbumNewRequest(requestUrl: URL): String {
    val area = requestUrl.getQueryParameter("cat") ?: requestUrl.getQueryParameter("area") ?: "ALL"
    val limit = requestUrl.getQueryParameter("limit")?.toIntOrNull()?.coerceAtLeast(1) ?: 20
    val offset = requestUrl.getQueryParameter("offset")?.toIntOrNull()?.coerceAtLeast(0) ?: 0
    return try {
      val endpoint =
        "https://music.163.com/api/album/new?area=" +
          URLEncoder.encode(area, StandardCharsets.UTF_8.name()) +
          "&limit=" + URLEncoder.encode(limit.toString(), StandardCharsets.UTF_8.name()) +
          "&offset=" + URLEncoder.encode(offset.toString(), StandardCharsets.UTF_8.name()) +
          "&total=true"
      buildRawJsonResponse(200, fetchText(endpoint))
    } catch (_: Exception) {
      buildAlbumNewFallbackResponse(requestUrl)
    }
  }

  private fun handleNeteaseSearchHotDetailRequest(requestUrl: URL): String {
    return try {
      buildRawJsonResponse(200, fetchText("https://music.163.com/api/search/hot/detail"))
    } catch (_: Exception) {
      buildSearchHotDetailFallbackResponse(requestUrl)
    }
  }

  private fun handleNeteaseSearchDefaultRequest(requestUrl: URL): String {
    return try {
      buildRawJsonResponse(200, fetchText("https://music.163.com/api/search/defaultkeyword/get"))
    } catch (_: Exception) {
      buildSearchDefaultFallbackResponse(requestUrl)
    }
  }
  private fun handleNeteasePlaylistDetailRequest(requestUrl: URL): String {
    val playlistId = requestUrl.getQueryParameter("id")
    if (playlistId.isNullOrBlank()) {
      return buildPlaylistDetailFallbackResponse(requestUrl)
    }

    return try {
      val endpoint =
        "https://music.163.com/api/v6/playlist/detail?id=" +
          URLEncoder.encode(playlistId, StandardCharsets.UTF_8.name()) +
          "&n=" + URLEncoder.encode(requestUrl.getQueryParameter("n") ?: "100000", StandardCharsets.UTF_8.name()) +
          "&s=" + URLEncoder.encode(requestUrl.getQueryParameter("s") ?: "0", StandardCharsets.UTF_8.name())
      buildRawJsonResponse(200, fetchText(endpoint))
    } catch (_: Exception) {
      buildPlaylistDetailFallbackResponse(requestUrl)
    }
  }

  private fun handleNeteasePlaylistTrackAllRequest(requestUrl: URL): String {
    val playlistId = requestUrl.getQueryParameter("id")
    if (playlistId.isNullOrBlank()) {
      return buildJsonResponse(200, JSONObject().put("code", 400).put("songs", JSONArray()).put("privileges", JSONArray()))
    }

    val limit = requestUrl.getQueryParameter("limit")?.toIntOrNull()?.coerceAtLeast(1) ?: 50
    val offset = requestUrl.getQueryParameter("offset")?.toIntOrNull()?.coerceAtLeast(0) ?: 0

    return try {
      val playlistResponse = JSONObject(fetchText(
        "https://music.163.com/api/v6/playlist/detail?id=" +
          URLEncoder.encode(playlistId, StandardCharsets.UTF_8.name()) +
          "&n=100000&s=0",
      ))
      val tracks = playlistResponse.optJSONObject("playlist")?.optJSONArray("tracks") ?: JSONArray()
      val privileges = playlistResponse.optJSONArray("privileges") ?: JSONArray()
      buildJsonResponse(
        200,
        JSONObject()
          .put("code", playlistResponse.optInt("code", 200))
          .put("songs", sliceJsonArray(tracks, offset, limit))
          .put("privileges", sliceJsonArray(privileges, offset, limit))
          .put("total", tracks.length())
          .put("more", offset + limit < tracks.length()),
      )
    } catch (error: Exception) {
      buildJsonResponse(
        200,
        JSONObject()
          .put("code", 500)
          .put("songs", JSONArray())
          .put("privileges", JSONArray())
          .put("total", 0)
          .put("more", false)
          .put("message", error.message ?: "playlist tracks fetch failed"),
      )
    }
  }

  private fun handleNeteaseAlbumDetailRequest(requestUrl: URL): String {
    val albumId = requestUrl.getQueryParameter("id")
    if (albumId.isNullOrBlank()) {
      return buildJsonResponse(200, JSONObject().put("code", 400).put("album", JSONObject()).put("songs", JSONArray()))
    }

    return try {
      val endpoint = "https://music.163.com/api/v1/album/" + URLEncoder.encode(albumId, StandardCharsets.UTF_8.name())
      buildRawJsonResponse(200, fetchText(endpoint))
    } catch (error: Exception) {
      buildJsonResponse(
        200,
        JSONObject()
          .put("code", 500)
          .put("album", JSONObject().put("id", albumId.toLongOrNull() ?: albumId))
          .put("songs", JSONArray())
          .put("message", error.message ?: "album detail fetch failed"),
      )
    }
  }

  private fun handleNeteaseAlbumDynamicRequest(requestUrl: URL): String {
    val albumId = requestUrl.getQueryParameter("id")
    if (albumId.isNullOrBlank()) {
      return buildJsonResponse(200, JSONObject().put("code", 400))
    }

    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("albumId", albumId.toLongOrNull() ?: albumId)
        .put("commentCount", 0)
        .put("likedCount", 0)
        .put("shareCount", 0)
        .put("isSub", false)
        .put("subCount", 0)
        .put("onSale", false),
    )
  }

  private fun handleNeteaseArtistDetailRequest(requestUrl: URL): String {
    val artistId = requestUrl.getQueryParameter("id")
    if (artistId.isNullOrBlank()) {
      return buildJsonResponse(200, JSONObject().put("code", 400).put("data", JSONObject().put("artist", JSONObject())))
    }

    return try {
      val artistResponse = fetchArtistPayload(artistId)
      buildJsonResponse(
        200,
        JSONObject()
          .put("code", artistResponse.optInt("code", 200))
          .put(
            "data",
            JSONObject()
              .put("videoCount", 0)
              .put("artist", artistResponse.optJSONObject("artist") ?: JSONObject())
              .put("identify", JSONObject().put("imageDesc", "")),
          ),
      )
    } catch (error: Exception) {
      buildJsonResponse(
        200,
        JSONObject()
          .put("code", 500)
          .put(
            "data",
            JSONObject()
              .put("artist", JSONObject().put("id", artistId.toLongOrNull() ?: artistId))
              .put("identify", JSONObject().put("imageDesc", "")),
          )
          .put("message", error.message ?: "artist detail fetch failed"),
      )
    }
  }

  private fun handleNeteaseArtistHotSongsRequest(requestUrl: URL): String {
    val artistId = requestUrl.getQueryParameter("id")
    if (artistId.isNullOrBlank()) {
      return buildJsonResponse(200, JSONObject().put("code", 400).put("artist", JSONObject()).put("hotSongs", JSONArray()))
    }

    return try {
      buildRawJsonResponse(200, fetchArtistPayload(artistId).toString())
    } catch (error: Exception) {
      buildJsonResponse(
        200,
        JSONObject()
          .put("code", 500)
          .put("artist", JSONObject().put("id", artistId.toLongOrNull() ?: artistId))
          .put("hotSongs", JSONArray())
          .put("more", false)
          .put("message", error.message ?: "artist hot songs fetch failed"),
      )
    }
  }

  private fun handleNeteaseArtistSongsRequest(requestUrl: URL): String {
    val artistId = requestUrl.getQueryParameter("id")
    if (artistId.isNullOrBlank()) {
      return buildJsonResponse(200, JSONObject().put("code", 400).put("songs", JSONArray()).put("more", false))
    }

    val limit = requestUrl.getQueryParameter("limit")?.toIntOrNull()?.coerceAtLeast(1) ?: 50
    val offset = requestUrl.getQueryParameter("offset")?.toIntOrNull()?.coerceAtLeast(0) ?: 0

    return try {
      val artistResponse = fetchArtistPayload(artistId)
      val hotSongs = artistResponse.optJSONArray("hotSongs") ?: JSONArray()
      buildJsonResponse(
        200,
        JSONObject()
          .put("code", artistResponse.optInt("code", 200))
          .put("songs", sliceJsonArray(hotSongs, offset, limit))
          .put("more", offset + limit < hotSongs.length())
          .put("total", hotSongs.length()),
      )
    } catch (error: Exception) {
      buildJsonResponse(
        200,
        JSONObject()
          .put("code", 500)
          .put("songs", JSONArray())
          .put("more", false)
          .put("total", 0)
          .put("message", error.message ?: "artist songs fetch failed"),
      )
    }
  }

  private fun fetchArtistPayload(artistId: String): JSONObject {
    val endpoint = "https://music.163.com/api/artist/" + URLEncoder.encode(artistId, StandardCharsets.UTF_8.name())
    return JSONObject(fetchText(endpoint))
  }

  private fun sliceJsonArray(source: JSONArray, offset: Int, limit: Int): JSONArray {
    val result = JSONArray()
    if (limit <= 0 || offset >= source.length()) return result
    val endExclusive = minOf(source.length(), offset + limit)
    for (index in offset until endExclusive) {
      result.put(source.opt(index))
    }
    return result
  }
  private fun handleNeteaseSongDetailRequest(request: JSONObject, requestUrl: URL): String {
    val songIds = parseSongIds(request, requestUrl)
    if (songIds.isEmpty()) {
      return buildJsonResponse(200, JSONObject().put("code", 400).put("songs", JSONArray()))
    }

    return try {
      val idsParam = songIds.joinToString(",")
      val endpoint =
        "https://music.163.com/api/song/detail?ids=" +
          URLEncoder.encode("[$idsParam]", StandardCharsets.UTF_8.name())
      val responseText = fetchText(endpoint)
      buildRawJsonResponse(200, responseText)
    } catch (error: Exception) {
      buildJsonResponse(
        200,
        JSONObject()
          .put("code", 500)
          .put("songs", JSONArray())
          .put("message", error.message ?: "song detail fetch failed"),
      )
    }
  }

  private fun handleNeteaseSongMusicDetailRequest(request: JSONObject, requestUrl: URL): String {
    val songId = parseSongIds(request, requestUrl).firstOrNull()
    if (songId.isNullOrBlank()) {
      return buildJsonResponse(200, JSONObject().put("code", 400).put("data", JSONObject()))
    }

    return try {
      val detailResponse = fetchSongDetail(songId)
      val songs = detailResponse.optJSONArray("songs") ?: JSONArray()
      val firstSong = songs.optJSONObject(0)
      val data = buildSongQualityPayload(firstSong)
      buildJsonResponse(200, JSONObject().put("code", 200).put("data", data))
    } catch (error: Exception) {
      buildJsonResponse(
        200,
        JSONObject()
          .put("code", 500)
          .put("data", JSONObject())
          .put("message", error.message ?: "song quality fetch failed"),
      )
    }
  }

  private fun handleNeteaseLyricRequest(requestUrl: URL): String {
    val songId = requestUrl.getQueryParameter("id")
    if (songId.isNullOrBlank()) {
      return buildJsonResponse(200, JSONObject().put("code", 400))
    }

    return try {
      val endpoint =
        "https://music.163.com/api/song/lyric?id=" +
          URLEncoder.encode(songId, StandardCharsets.UTF_8.name()) +
          "&cp=false&tv=0&lv=0&rv=0&kv=0&yv=0&ytv=0&yrv=0"
      val responseText = fetchText(endpoint)
      buildRawJsonResponse(200, responseText)
    } catch (error: Exception) {
      buildJsonResponse(
        200,
        JSONObject()
          .put("code", 500)
          .put("lrc", JSONObject().put("version", 0).put("lyric", ""))
          .put("klyric", JSONObject().put("version", 0).put("lyric", ""))
          .put("tlyric", JSONObject().put("version", 0).put("lyric", ""))
          .put("romalrc", JSONObject().put("version", 0).put("lyric", ""))
          .put("yrc", JSONObject().put("version", 0).put("lyric", ""))
          .put("message", error.message ?: "lyric fetch failed"),
      )
    }
  }

    private fun handleNeteaseSongUrlRequest(request: JSONObject, requestUrl: URL): String {
    val songId = requestUrl.getQueryParameter("id")
    if (songId.isNullOrBlank()) {
      return buildJsonResponse(
        200,
        JSONObject()
          .put("code", 400)
          .put("message", "missing song id")
          .put("data", JSONArray()),
      )
    }

    tryProxySongUrlRequest(request, requestUrl)?.let { return it }

    val level = requestUrl.getQueryParameter("level") ?: "standard"
    val bitrate = estimateSongBitrate(requestUrl)
    Log.d(TAG, "songUrl id=$songId level=$level bitrate=$bitrate path=${requestUrl.path}")

    return try {
      val songUrl = normalizeSongUrl(fetchMirrorSongUrl(songId))
      Log.d(TAG, "songUrlResolved id=$songId empty=${songUrl.isNullOrBlank()}")
      val body =
        JSONObject()
          .put("code", if (songUrl.isNullOrBlank()) 404 else 200)
          .put("message", if (songUrl.isNullOrBlank()) "song url unavailable" else "ok")
          .put(
            "data",
            JSONArray().put(
              JSONObject()
                .put("id", songId.toLongOrNull() ?: songId)
                .put("url", songUrl ?: JSONObject.NULL)
                .put("level", level)
                .put("br", bitrate)
                .put("type", guessSongType(songUrl))
                .put("freeTrialInfo", JSONObject.NULL)
                .put("md5", JSONObject.NULL),
            ),
          )
      buildJsonResponse(200, body)
    } catch (error: Exception) {
      buildJsonResponse(
        200,
        JSONObject()
          .put("code", 404)
          .put("message", error.message ?: "song url fetch failed")
          .put(
            "data",
            JSONArray().put(
              JSONObject()
                .put("id", songId.toLongOrNull() ?: songId)
                .put("url", JSONObject.NULL)
                .put("level", level)
                .put("br", bitrate)
                .put("type", "unknown")
                .put("freeTrialInfo", JSONObject.NULL)
                .put("md5", JSONObject.NULL),
            ),
          ),
      )
    }
  }

  private fun tryProxySongUrlRequest(request: JSONObject, requestUrl: URL): String? {
    return try {
      val responseJson = JSONObject(proxyRemoteRequest(request, requestUrl))
      val status = responseJson.optInt("status", 500)
      if (status !in 200..299) {
        return null
      }

      val bodyText = responseJson.optString("body", "")
      if (bodyText.isBlank()) {
        return null
      }

      val bodyJson = JSONObject(bodyText)
      val data = bodyJson.optJSONArray("data") ?: return null
      val firstItem = data.optJSONObject(0) ?: return null
      val proxiedUrl = normalizeSongUrl(firstItem.optString("url"))
      if (proxiedUrl.isNullOrBlank()) {
        return null
      }

      firstItem.put("url", proxiedUrl)
      if (!bodyJson.has("code")) {
        bodyJson.put("code", 200)
      }
      if (bodyJson.optString("message").isBlank()) {
        bodyJson.put("message", "ok")
      }
      buildJsonResponse(200, bodyJson)
    } catch (_: Exception) {
      null
    }
  }

  private fun fetchSongDetail(songId: String): JSONObject {
    val endpoint =
      "https://music.163.com/api/song/detail?ids=" +
        URLEncoder.encode("[$songId]", StandardCharsets.UTF_8.name())
    return JSONObject(fetchText(endpoint))
  }

  private fun parseSongIds(request: JSONObject, requestUrl: URL): List<String> {
    val fromQuery = requestUrl.getQueryParameter("ids")
      ?.split(",")
      ?.map { it.trim() }
      ?.filter { it.isNotBlank() }
      .orEmpty()
    if (fromQuery.isNotEmpty()) return fromQuery

    val singleId = requestUrl.getQueryParameter("id")?.trim()
    if (!singleId.isNullOrBlank()) return listOf(singleId)

    val requestBody = request.optString("body", "")
    if (requestBody.isBlank()) return emptyList()

    return try {
      val bodyJson = JSONObject(requestBody)
      val idsValue = bodyJson.optString("ids")
      if (idsValue.isBlank()) emptyList()
      else idsValue.split(",").map { it.trim() }.filter { it.isNotBlank() }
    } catch (_: Exception) {
      emptyList()
    }
  }

  private fun buildSongQualityPayload(song: JSONObject?): JSONObject {
    if (song == null) return JSONObject()
    return JSONObject().apply {
      mapQualityEntry(this, "l", song.optJSONObject("lMusic"))
      mapQualityEntry(this, "m", song.optJSONObject("mMusic"))
      mapQualityEntry(this, "h", song.optJSONObject("hMusic"))
      mapQualityEntry(this, "sq", song.optJSONObject("sqMusic"))
      mapQualityEntry(this, "hr", song.optJSONObject("hrMusic"))
      mapQualityEntry(this, "db", song.optJSONObject("dbMusic"))
      mapQualityEntry(this, "jm", song.optJSONObject("jmMusic"))
      mapQualityEntry(this, "je", song.optJSONObject("jyeffectMusic"))
      mapQualityEntry(this, "sk", song.optJSONObject("skyMusic"))
    }
  }

  private fun mapQualityEntry(target: JSONObject, key: String, source: JSONObject?) {
    if (source == null) return
    val br = source.optInt("bitrate", source.optInt("br", 0))
    val size = source.optLong("size", 0L)
    if (br <= 0 && size <= 0L) return
    target.put(
      key,
      JSONObject()
        .put("br", if (br > 0) br else JSONObject.NULL)
        .put("size", if (size > 0L) size else JSONObject.NULL),
    )
  }

  private fun normalizeSongUrl(songUrl: String?): String? {
    return songUrl
      ?.trim()
      ?.takeIf { it.isNotBlank() && it != "null" }
      ?.replace(Regex("^http:"), "https:")
      ?.replace(Regex("^//"), "https://")
  }

  private fun fetchMirrorSongUrl(songId: String): String? {

    val remoteUrl =
      "https://music-api.gdstudio.xyz/api.php?types=url&id=" +
        URLEncoder.encode(songId, StandardCharsets.UTF_8.name())
    val responseText = fetchText(remoteUrl)
    val responseJson = JSONObject(responseText)
    return responseJson.optString("url").takeIf { it.isNotBlank() && it != "null" }
  }

  private fun estimateSongBitrate(requestUrl: URL): Int {
    requestUrl.getQueryParameter("br")?.toIntOrNull()?.takeIf { it > 0 }?.let { return it }
    return when (requestUrl.getQueryParameter("level")?.lowercase(Locale.ROOT)) {
      "higher" -> 192000
      "exhigh" -> 320000
      "lossless", "hires", "sky", "dolby", "jymaster" -> 999000
      else -> 128000
    }
  }

  private fun guessSongType(songUrl: String?): String {
    if (songUrl.isNullOrBlank()) return "unknown"
    return songUrl
      .substringBefore("?")
      .substringAfterLast('.', "mp3")
      .lowercase(Locale.ROOT)
  }

  private fun handleQqMusicRequest(request: JSONObject, requestUrl: URL): String {
    return try {
      val response = AndroidQQMusicService.handle(requestUrl)
      if (shouldFallbackQqMusicResponse(requestUrl, response)) {
        proxyRemoteRequest(request, requestUrl)
      } else {
        buildJsonResponse(response.status, response.body)
      }
    } catch (_: Exception) {
      proxyRemoteRequest(request, requestUrl)
    }
  }

  private fun shouldFallbackQqMusicResponse(requestUrl: URL, response: AndroidApiResponse): Boolean {
    if (response.status !in 200..299) {
      return true
    }

    return when (requestUrl.path) {
      "/api/qqmusic/lyric", "/api/qqmusic/match" -> {
        val qrc = response.body.optString("qrc")
        val lrc = response.body.optString("lrc")
        (qrc.isBlank() && lrc.isBlank()) ||
          (qrc.isNotBlank() && !looksLikeLyricText(qrc)) ||
          (lrc.isNotBlank() && !looksLikeLyricText(lrc))
      }

      else -> false
    }
  }

  private fun looksLikeLyricText(value: String): Boolean {
    val text = value.trim()
    if (text.isBlank()) {
      return false
    }

    return text.startsWith("<?xml") ||
      text.startsWith("<QrcInfos") ||
      text.startsWith("[ti:") ||
      text.startsWith("[00:") ||
      text.contains("\n[") ||
      text.contains("<LyricInfo")
  }

  private fun handleControlRequest(path: String): String {
    return when (path) {
      "/api/control/status" -> {
        val body = JSONObject()
          .put("code", 200)
          .put("message", "status ok")
          .put(
            "data",
            JSONObject()
              .put("version", JSONObject().put("app", BuildConfig.VERSION_NAME).put("name", "SPlayer-ROM-Compat"))
              .put(
                "environment",
                JSONObject()
                  .put("platform", "android")
                  .put("versionName", BuildConfig.VERSION_NAME)
                  .put("versionCode", BuildConfig.VERSION_CODE)
                  .put("remoteApiRoot", BuildConfig.SPLAYER_REMOTE_API_ROOT),
              )
              .put("connected", true)
              .put("window", "available"),
          )
        buildJsonResponse(200, body)
      }
      "/api/control/song-info" -> {
        val body = JSONObject()
          .put("code", 200)
          .put("message", "song info ok")
          .put(
            "data",
            JSONObject()
              .put("src", AndroidNativeAudioPlayer.getSrc())
              .put("currentTime", AndroidNativeAudioPlayer.getCurrentTime())
              .put("duration", AndroidNativeAudioPlayer.getDuration())
              .put("paused", AndroidNativeAudioPlayer.isPaused())
              .put("volume", AndroidNativeAudioPlayer.getVolume()),
          )
        buildJsonResponse(200, body)
      }
      "/api/control/play" -> {
        val success = dispatchOrFallback("play") { AndroidNativeAudioPlayer.resume(null) }
        buildJsonResponse(if (success) 200 else 500, commandBody(success, "play sent", "play failed"))
      }
      "/api/control/pause" -> {
        val success = dispatchOrFallback("pause") { AndroidNativeAudioPlayer.pause(null) }
        buildJsonResponse(if (success) 200 else 500, commandBody(success, "pause sent", "pause failed"))
      }
      "/api/control/toggle" -> {
        val success = dispatchOrFallback("playOrPause") {
          if (AndroidNativeAudioPlayer.isPaused()) {
            AndroidNativeAudioPlayer.resume(null)
          } else {
            AndroidNativeAudioPlayer.pause(null)
          }
        }
        buildJsonResponse(if (success) 200 else 500, commandBody(success, "toggle sent", "toggle failed"))
      }
      "/api/control/next" -> {
        val success = AndroidWebActionDispatcher.dispatch("playNext")
        buildJsonResponse(if (success) 200 else 501, commandBody(success, "next sent", "next unsupported"))
      }
      "/api/control/prev" -> {
        val success = AndroidWebActionDispatcher.dispatch("playPrev")
        buildJsonResponse(if (success) 200 else 501, commandBody(success, "prev sent", "prev unsupported"))
      }
      else -> buildJsonResponse(404, errorBody("control api not found"))
    }
  }

  private fun proxyRemoteRequestWithFallback(
    request: JSONObject,
    requestUrl: URL,
    fallbackBuilder: (URL) -> String,
  ): String {
    return try {
      val responseText = proxyRemoteRequest(request, requestUrl)
      val responseJson = JSONObject(responseText)
      val status = responseJson.optInt("status", 500)
      if (status in 200..299) responseText else fallbackBuilder(requestUrl)
    } catch (_: Exception) {
      fallbackBuilder(requestUrl)
    }
  }

  private fun buildPersonalizedFallbackResponse(requestUrl: URL): String {
    val limit = requestUrl.getQueryParameter("limit")?.toIntOrNull() ?: 0
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("category", 0)
        .put("hasTaste", false)
        .put("result", JSONArray())
        .put("more", false)
        .put("limit", limit),
    )
  }

  private fun buildPlaylistDetailFallbackResponse(requestUrl: URL): String {
    val playlistId = requestUrl.getQueryParameter("id")?.toLongOrNull() ?: 0L
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("relatedVideos", JSONArray())
        .put("urls", JSONArray())
        .put(
          "playlist",
          JSONObject()
            .put("id", playlistId)
            .put("name", "")
            .put("description", "")
            .put("coverImgUrl", "")
            .put("tracks", JSONArray())
            .put("trackIds", JSONArray())
            .put("creator", JSONObject())
            .put("subscribers", JSONArray())
            .put("subscribed", false)
            .put("commentCount", 0)
            .put("playCount", 0)
            .put("trackCount", 0),
        ),
    )
  }

  private fun buildTopArtistsFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("more", false)
        .put("artists", JSONArray()),
    )
  }

  private fun buildDjRecommendFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("djRadios", JSONArray()),
    )
  }

  private fun buildAlbumNewFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("albums", JSONArray())
        .put("total", 0),
    )
  }

  private fun buildMvAllFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("count", 0)
        .put("hasMore", false)
        .put("data", JSONArray()),
    )
  }

  private fun buildSearchHotDetailFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("data", JSONArray()),
    )
  }

  private fun buildSearchDefaultFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put(
          "data",
          JSONObject()
            .put("showKeyword", "Search music / video")
            .put("realkeyword", "")
            .put("searchType", 1)
            .put("action", 0)
            .put("alg", "android-local-fallback")
            .put("gap", 0)
            .put("bizQueryInfo", ""),
        ),
    )
  }

  private fun buildLoginStatusFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put(
          "data",
          JSONObject()
            .put("account", JSONObject.NULL)
            .put("profile", JSONObject.NULL),
        ),
    )
  }

  private fun buildSearchSuggestFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("result", JSONObject().put("order", JSONArray())),
    )
  }

  private fun buildSearchMultimatchFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("result", JSONObject()),
    )
  }

  private fun buildToplistFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("list", JSONArray()),
    )
  }

  private fun buildUserAccountFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("account", JSONObject.NULL)
        .put("profile", JSONObject.NULL),
    )
  }

  private fun buildLoginRefreshFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("cookie", ""),
    )
  }

  private fun buildLogoutFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("message", "ok"),
    )
  }

  private fun buildCountryCodeListFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put(
          "data",
          JSONArray().put(
            JSONObject()
              .put("label", "Common")
              .put(
                "countryList",
                JSONArray().put(
                  JSONObject()
                    .put("zh", "China")
                    .put("en", "China")
                    .put("code", "86")
                    .put("locale", "zh-CN"),
                ),
              ),
          ),
        ),
    )
  }

  private fun buildDjToplistFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("toplist", JSONArray()),
    )
  }

  private fun buildDjCatlistFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("categories", JSONArray()),
    )
  }

  private fun buildDjCategoryRecommendFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("data", JSONArray()),
    )
  }

  private fun buildCloudSearchFallbackResponse(requestUrl: URL): String {
    val searchType = requestUrl.getQueryParameter("type")?.toIntOrNull() ?: 1018
    val result = JSONObject()
      .put("hasMore", false)
      .put("songCount", 0)
      .put("songs", JSONArray())
      .put("playlistCount", 0)
      .put("playlists", JSONArray())
      .put("artistCount", 0)
      .put("artists", JSONArray())
      .put("albumCount", 0)
      .put("albums", JSONArray())
      .put("mvCount", 0)
      .put("mvs", JSONArray())
      .put("djRadiosCount", 0)
      .put("djRadios", JSONArray())
      .put("videoCount", 0)
      .put("videos", JSONArray())
      .put("searchQcReminder", JSONObject.NULL)
      .put("queryCorrected", JSONArray())
      .put("semanticTags", JSONArray())
      .put("searchType", searchType)
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("result", result),
    )
  }

  private fun buildQrKeyFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("data", JSONObject().put("unikey", "android-local-offline")),
    )
  }

  private fun buildQrCreateFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put(
          "data",
          JSONObject()
            .put("qrurl", "https://music.163.com/login?codekey=android-local-offline")
            .put("qrimg", ""),
        ),
    )
  }

  private fun buildQrCheckFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 801)
        .put("message", "android local offline")
        .put("cookie", "")
        .put("nickname", "")
        .put("avatarUrl", ""),
    )
  }

  private fun buildCaptchaSentFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 500)
        .put("message", "android local offline")
        .put("data", false),
    )
  }

  private fun buildCaptchaVerifyFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 400)
        .put("message", "android local offline")
        .put("data", false),
    )
  }

  private fun buildLoginCellphoneFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 500)
        .put("message", "android local offline")
        .put("cookie", ""),
    )
  }

  private fun buildUserDetailFallbackResponse(requestUrl: URL): String {
    val userId = requestUrl.getQueryParameter("uid")?.toLongOrNull() ?: 0L
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 500)
        .put("message", "android local offline")
        .put(
          "profile",
          JSONObject()
            .put("userId", userId)
            .put("userType", 0)
            .put("vipType", 0)
            .put("nickname", "")
            .put("level", 0)
            .put("avatarUrl", "")
            .put("backgroundUrl", "")
            .put("createTime", 0)
            .put("createDays", 0),
        )
        .put("level", 0)
        .put("createDays", 0),
    )
  }

  private fun buildUserSubcountFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("artistCount", 0)
        .put("djRadioCount", 0)
        .put("mvCount", 0)
        .put("subPlaylistCount", 0)
        .put("createdPlaylistCount", 0),
    )
  }

  private fun buildLikelistFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("ids", JSONArray()),
    )
  }

  private fun buildUserPlaylistFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("more", false)
        .put("playlist", JSONArray()),
    )
  }

  private fun buildAlbumSublistFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("hasMore", false)
        .put("count", 0)
        .put("data", JSONArray()),
    )
  }

  private fun buildArtistSublistFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("hasMore", false)
        .put("count", 0)
        .put("data", JSONArray()),
    )
  }

  private fun buildMvSublistFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("hasMore", false)
        .put("count", 0)
        .put("data", JSONArray()),
    )
  }

  private fun buildDjSublistFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("code", 200)
        .put("hasMore", false)
        .put("count", 0)
        .put("djRadios", JSONArray()),
    )
  }

  private fun buildPlaylistSubscribeFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildBusinessFailureResponse("playlist subscribe unavailable on android fallback")
  }

  private fun buildAlbumSubFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildBusinessFailureResponse("album subscribe unavailable on android fallback")
  }

  private fun buildArtistSubFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildBusinessFailureResponse("artist subscribe unavailable on android fallback")
  }

  private fun buildMvSubFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildBusinessFailureResponse("mv subscribe unavailable on android fallback")
  }

  private fun buildDjSubFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildBusinessFailureResponse("dj subscribe unavailable on android fallback")
  }

  private fun buildLikeSongFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildJsonResponse(500, errorBody("song like unavailable on android fallback"))
  }

  private fun buildScrobbleFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildBusinessFailureResponse("scrobble unavailable on android fallback")
  }

  private fun buildDailySigninFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildBusinessFailureResponse("daily signin unavailable on android fallback")
  }

  private fun buildPlaylistTracksFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildEnvelopeBusinessFailureResponse("playlist tracks update unavailable on android fallback")
  }

  private fun buildPlaylistCreateFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildBusinessFailureResponse("playlist create unavailable on android fallback")
  }

  private fun buildPlaylistDeleteFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildBusinessFailureResponse("playlist delete unavailable on android fallback")
  }

  private fun buildPlaylistUpdateFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildBusinessFailureResponse("playlist update unavailable on android fallback")
  }

  private fun buildPlaylistPrivacyFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildBusinessFailureResponse("playlist privacy unavailable on android fallback")
  }

  private fun buildSongOrderUpdateFallbackResponse(@Suppress("UNUSED_PARAMETER") requestUrl: URL): String {
    return buildBusinessFailureResponse("song order update unavailable on android fallback")
  }

  private fun proxyRemoteRequest(request: JSONObject, requestUrl: URL): String {
    val remoteApiRoot = BuildConfig.SPLAYER_REMOTE_API_ROOT.trim().removeSuffix("/")
    if (remoteApiRoot.isBlank()) {
      return buildJsonResponse(
        503,
        errorBody("remote api root missing"),
      )
    }

    val httpMethod = request.optString("method", "GET").uppercase(Locale.ROOT)
    val timeout = request.optInt("timeout", 15000)
    val targetUrl = remoteApiRoot + requestUrl.file
    val requestBody = request.optString("body", "")
    val connection = (URL(targetUrl).openConnection() as HttpURLConnection).apply {
      instanceFollowRedirects = true
      requestMethod = httpMethod
      connectTimeout = timeout
      readTimeout = timeout
      doInput = true
    }

    try {
      copyRequestHeaders(connection, request.optJSONObject("headers"))

      if (httpMethod != "GET" && httpMethod != "HEAD" && requestBody.isNotEmpty()) {
        connection.doOutput = true
        if (connection.getRequestProperty("Content-Type").isNullOrBlank()) {
          connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
        }
        connection.outputStream.use { outputStream ->
          outputStream.write(requestBody.toByteArray(StandardCharsets.UTF_8))
        }
      }

      val status = connection.responseCode
      val statusText = connection.responseMessage ?: defaultStatusText(status)
      val responseBody = readResponseBody(connection, status)
      val responseHeaders = JSONObject().apply {
        connection.headerFields
          .filterKeys { it != null }
          .forEach { (key, values) ->
            put(key, values.joinToString("; "))
          }
        if (!has("Content-Type")) {
          put("Content-Type", connection.contentType ?: "application/json; charset=UTF-8")
        }
      }

      return JSONObject()
        .put("status", status)
        .put("statusText", statusText)
        .put("headers", responseHeaders)
        .put("body", responseBody)
        .toString()
    } catch (error: Exception) {
      return buildJsonResponse(502, errorBody(error.message ?: "remote api proxy failed"))
    } finally {
      connection.disconnect()
    }
  }

  private fun dispatchOrFallback(action: String, fallback: () -> Boolean): Boolean {
    return AndroidWebActionDispatcher.dispatch(action) || fallback()
  }

  private fun copyRequestHeaders(connection: HttpURLConnection, headers: JSONObject?) {
    if (headers == null) return

    headers.keys().forEach { key ->
      if (IGNORED_REQUEST_HEADERS.contains(key.lowercase(Locale.ROOT))) {
        return@forEach
      }

      val value = headers.optString(key)
      if (value.isNotBlank()) {
        connection.setRequestProperty(key, value)
      }
    }
  }

  private fun fetchText(url: String): String {
    Log.d(TAG, "fetch $url")
    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = 15000
      readTimeout = 15000
      requestMethod = "GET"
      doInput = true
      setRequestProperty("Accept", "application/json, text/plain, */*")
      setRequestProperty("Referer", "https://music.163.com/")
      setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36")
    }

    try {
      val status = connection.responseCode
      if (status >= 400) {
        throw IllegalStateException(readResponseBody(connection, status).ifBlank { defaultStatusText(status) })
      }
      return readResponseBody(connection, status)
    } finally {
      connection.disconnect()
    }
  }

  private fun readResponseBody(connection: HttpURLConnection, status: Int): String {
    val stream = if (status >= 400) connection.errorStream else connection.inputStream
    if (stream == null) return ""

    return BufferedReader(InputStreamReader(stream, StandardCharsets.UTF_8)).use { reader ->
      reader.readText()
    }
  }

  private fun buildJsonResponse(status: Int, body: JSONObject): String {
    return JSONObject()
      .put("status", status)
      .put("statusText", defaultStatusText(status))
      .put(
        "headers",
        JSONObject().put("Content-Type", "application/json; charset=UTF-8"),
      )
      .put("body", body.toString())
      .toString()
  }

  private fun buildRawJsonResponse(status: Int, body: String): String {
    return JSONObject()
      .put("status", status)
      .put("statusText", defaultStatusText(status))
      .put(
        "headers",
        JSONObject().put("Content-Type", "application/json; charset=UTF-8"),
      )
      .put("body", body)
      .toString()
  }

  private fun commandBody(success: Boolean, successMessage: String, failureMessage: String): JSONObject {
    return JSONObject()
      .put("code", if (success) 200 else 500)
      .put("message", if (success) successMessage else failureMessage)
      .put("data", JSONObject.NULL)
  }

  private fun businessFailureBody(message: String): JSONObject {
    return JSONObject()
      .put("code", 500)
      .put("message", message)
      .put("data", JSONObject.NULL)
  }

  private fun buildBusinessFailureResponse(message: String): String {
    return buildJsonResponse(200, businessFailureBody(message))
  }

  private fun buildEnvelopeBusinessFailureResponse(message: String): String {
    return buildJsonResponse(
      200,
      JSONObject()
        .put("status", 200)
        .put("statusText", "OK")
        .put("body", businessFailureBody(message)),
    )
  }

  private fun errorBody(message: String): JSONObject {
    return JSONObject()
      .put("code", 500)
      .put("message", message)
      .put("data", JSONObject.NULL)
  }

  private fun buildLocalUrl(path: String): URL {
    return URL("https://appassets.androidplatform.net$path")
  }

  private fun URL.getQueryParameter(key: String): String? {
    val queryString = query ?: return null
    return queryString
      .split("&")
      .mapNotNull { entry ->
        val parts = entry.split("=", limit = 2)
        if (parts.isEmpty()) return@mapNotNull null
        val currentKey = parts[0]
        val currentValue = parts.getOrElse(1) { "" }
        if (currentKey == key) currentValue else null
      }
      .firstOrNull()
      ?.let { java.net.URLDecoder.decode(it, StandardCharsets.UTF_8.name()) }
  }

  private fun defaultStatusText(status: Int): String {
    return when (status) {
      200 -> "OK"
      400 -> "Bad Request"
      401 -> "Unauthorized"
      403 -> "Forbidden"
      404 -> "Not Found"
      500 -> "Internal Server Error"
      501 -> "Not Implemented"
      502 -> "Bad Gateway"
      503 -> "Service Unavailable"
      else -> "OK"
    }
  }

}



