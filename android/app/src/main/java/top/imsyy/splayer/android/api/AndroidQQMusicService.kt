package top.imsyy.splayer.android.api

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.Base64
import java.util.zip.GZIPInputStream
import java.util.zip.Inflater
import javax.crypto.Cipher
import javax.crypto.spec.SecretKeySpec

data class AndroidApiResponse(
  val status: Int,
  val body: JSONObject,
)

object AndroidQQMusicService {
  private const val qmApiUrl = "https://u.y.qq.com/cgi-bin/musicu.fcg"
  private val qmHeaders = mapOf(
    "Content-Type" to "application/json",
    "Accept-Encoding" to "gzip",
    "User-Agent" to "okhttp/3.14.9",
    "Cookie" to "tmeLoginType=-1;",
  )
  private val qrcKey = "!@#)(*$%123ZXC!@!@#)(NHL".toByteArray(StandardCharsets.UTF_8)

  @Volatile private var sessionUid: String? = null
  @Volatile private var sessionSid: String? = null
  @Volatile private var sessionUserIp: String? = null
  @Volatile private var sessionExpireTime: Long = 0L

  fun buildInfoBody(): JSONObject {
    return JSONObject()
      .put("name", "QQMusicAPI")
      .put("description", "QQMusic lyric and search adapter")
      .put("routes", JSONArray()
        .put("/api/qqmusic/lyric")
        .put("/api/qqmusic/search")
        .put("/api/qqmusic/match"))
  }

  fun handle(requestUrl: URL): AndroidApiResponse {
    return when (requestUrl.path) {
      "/api/qqmusic/lyric" -> handleLyricRequest(requestUrl)
      "/api/qqmusic/search" -> handleSearchRequest(requestUrl)
      "/api/qqmusic/match" -> handleMatchRequest(requestUrl)
      else -> AndroidApiResponse(404, JSONObject().put("code", 404).put("message", "qqmusic api not found"))
    }
  }

  private fun handleLyricRequest(requestUrl: URL): AndroidApiResponse {
    val songId = requestUrl.getQueryParameter("id")?.toIntOrNull()
      ?: return AndroidApiResponse(400, JSONObject().put("code", 400).put("message", "id is required"))

    val body = getQQMusicLyric(
      songId = songId,
      songName = requestUrl.getQueryParameter("name").orEmpty(),
      singerName = requestUrl.getQueryParameter("artist").orEmpty(),
      albumName = requestUrl.getQueryParameter("album").orEmpty(),
      duration = requestUrl.getQueryParameter("duration")?.toIntOrNull() ?: 0,
    )
    return AndroidApiResponse(if (body.optInt("code", 500) == 200) 200 else 500, body)
  }

  private fun handleSearchRequest(requestUrl: URL): AndroidApiResponse {
    val keyword = requestUrl.getQueryParameter("keyword").orEmpty()
    if (keyword.isBlank()) {
      return AndroidApiResponse(400, JSONObject().put("code", 400).put("message", "keyword is required"))
    }

    val page = requestUrl.getQueryParameter("page")?.toIntOrNull() ?: 1
    val pageSize = requestUrl.getQueryParameter("pageSize")?.toIntOrNull() ?: 20
    val body = searchQQMusic(keyword, page, pageSize)
    return AndroidApiResponse(if (body.optInt("code", 500) == 200) 200 else 500, body)
  }

  private fun handleMatchRequest(requestUrl: URL): AndroidApiResponse {
    val keyword = requestUrl.getQueryParameter("keyword").orEmpty()
    if (keyword.isBlank()) {
      return AndroidApiResponse(400, JSONObject().put("code", 400).put("message", "keyword is required"))
    }

    val searchBody = searchQQMusic(keyword, 1, 1)
    if (searchBody.optInt("code", 500) != 200) {
      return AndroidApiResponse(500, searchBody)
    }

    val songs = searchBody.optJSONArray("songs") ?: JSONArray()
    if (songs.length() == 0) {
      return AndroidApiResponse(404, JSONObject().put("code", 404).put("message", "song not found"))
    }

    val song = songs.optJSONObject(0) ?: JSONObject()
    val lyricBody = getQQMusicLyric(
      songId = song.optString("id").toIntOrNull() ?: 0,
      songName = song.optString("name"),
      singerName = song.optString("artist"),
      albumName = song.optString("album"),
      duration = song.optInt("duration", 0) / 1000,
    )

    val result = JSONObject()
      .put("code", 200)
      .put("song", song)

    lyricBody.keys().forEach { key ->
      if (key != "code") {
        result.put(key, lyricBody.opt(key))
      }
    }

    return AndroidApiResponse(200, result)
  }

  private fun getQQMusicLyric(
    songId: Int,
    songName: String,
    singerName: String,
    albumName: String,
    duration: Int,
  ): JSONObject {
    return try {
      val lyricParam = JSONObject()
        .put("albumName", encodeBase64(albumName))
        .put("crypt", 1)
        .put("ct", 19)
        .put("cv", 2111)
        .put("interval", duration)
        .put("lrc_t", 0)
        .put("qrc", 1)
        .put("qrc_t", 0)
        .put("roma", 1)
        .put("roma_t", 0)
        .put("singerName", encodeBase64(singerName))
        .put("songID", songId)
        .put("songName", encodeBase64(songName))
        .put("trans", 1)
        .put("trans_t", 0)
        .put("type", 0)

      val response = qqRequest("GetPlayLyricInfo", "music.musichallSong.PlayLyricInfo", lyricParam)
      val result = JSONObject().put("code", 200)
      val lyric = response.optString("lyric")

      if (lyric.isNotBlank()) {
        runCatching { decryptQrcText(lyric) }.onSuccess { result.put("qrc", it) }
      }

      if (response.optInt("qrc_t", 1) == 0 && lyric.isNotBlank()) {
        runCatching { decryptQrcText(lyric) }.onSuccess { result.put("lrc", it) }
      } else {
        runCatching {
          qqRequest(
            "GetPlayLyricInfo",
            "music.musichallSong.PlayLyricInfo",
            JSONObject(lyricParam.toString()).put("qrc", 0).put("qrc_t", 0),
          )
        }.onSuccess { lrcResponse ->
          val lrc = lrcResponse.optString("lyric")
          if (lrc.isNotBlank()) {
            runCatching { decryptQrcText(lrc) }.onSuccess { result.put("lrc", it) }
          }
        }
      }

      val trans = response.optString("trans")
      if (trans.isNotBlank()) {
        runCatching { decryptQrcText(trans) }.onSuccess { result.put("trans", it) }
      }

      val roma = response.optString("roma")
      if (roma.isNotBlank()) {
        runCatching { decryptQrcText(roma) }.onSuccess { result.put("roma", it) }
      }

      result
    } catch (error: Exception) {
      JSONObject()
        .put("code", 500)
        .put("message", error.message ?: "qqmusic lyric failed")
    }
  }

  private fun searchQQMusic(keyword: String, page: Int, pageSize: Int): JSONObject {
    return try {
      val response = qqRequest(
        "DoSearchForQQMusicLite",
        "music.search.SearchCgiService",
        JSONObject()
          .put("search_id", buildSearchId())
          .put("remoteplace", "search.android.keyboard")
          .put("query", keyword)
          .put("search_type", 0)
          .put("num_per_page", pageSize)
          .put("page_num", page)
          .put("highlight", 0)
          .put("nqc_flag", 0)
          .put("page_id", 1)
          .put("grp", 1),
      )

      val songList = response.optJSONObject("body")?.optJSONArray("item_song") ?: JSONArray()
      val songs = JSONArray()
      repeat(songList.length()) { index ->
        val song = songList.optJSONObject(index) ?: return@repeat
        val artists = song.optJSONArray("singer") ?: JSONArray()
        val artistNames = mutableListOf<String>()
        repeat(artists.length()) { artistIndex ->
          val artist = artists.optJSONObject(artistIndex)
          val name = artist?.optString("name").orEmpty()
          if (name.isNotBlank()) {
            artistNames += name
          }
        }

        songs.put(
          JSONObject()
            .put("id", song.optString("id"))
            .put("mid", song.optString("mid"))
            .put("name", song.optString("title"))
            .put("artist", if (artistNames.isEmpty()) "Unknown artist" else artistNames.joinToString(" / "))
            .put("album", song.optJSONObject("album")?.optString("name").orEmpty())
            .put("duration", song.optInt("interval", 0) * 1000),
        )
      }

      JSONObject()
        .put("code", 200)
        .put("songs", songs)
        .put("total", response.optJSONObject("meta")?.optInt("sum", songs.length()) ?: songs.length())
    } catch (error: Exception) {
      JSONObject()
        .put("code", 500)
        .put("message", error.message ?: "qqmusic search failed")
    }
  }

  private fun qqRequest(method: String, module: String, param: JSONObject): JSONObject {
    ensureSession()

    val comm = JSONObject()
      .put("ct", 11)
      .put("cv", "1003006")
      .put("v", "1003006")
      .put("os_ver", "15")
      .put("phonetype", "24122RKC7C")
      .put("tmeAppID", "qqmusiclight")
      .put("nettype", "NETWORK_WIFI")
      .put("udid", "0")

    sessionUid?.takeIf { it.isNotBlank() }?.let { comm.put("uid", it) }
    sessionSid?.takeIf { it.isNotBlank() }?.let { comm.put("sid", it) }
    sessionUserIp?.takeIf { it.isNotBlank() }?.let { comm.put("userip", it) }

    val response = postJson(
      qmApiUrl,
      JSONObject()
        .put("comm", comm)
        .put("request", JSONObject().put("method", method).put("module", module).put("param", param)),
      qmHeaders,
    )

    if (response.optInt("code", -1) != 0 || response.optJSONObject("request")?.optInt("code", -1) != 0) {
      throw IllegalStateException("QM API error")
    }

    return response.optJSONObject("request")?.optJSONObject("data") ?: JSONObject()
  }

  @Synchronized
  private fun ensureSession() {
    if (!sessionUid.isNullOrBlank() && System.currentTimeMillis() < sessionExpireTime) {
      return
    }

    runCatching {
      postJson(
        qmApiUrl,
        JSONObject()
          .put(
            "comm",
            JSONObject()
              .put("ct", 11)
              .put("cv", "1003006")
              .put("v", "1003006")
              .put("os_ver", "15")
              .put("phonetype", "24122RKC7C")
              .put("tmeAppID", "qqmusiclight")
              .put("nettype", "NETWORK_WIFI")
              .put("udid", "0"),
          )
          .put(
            "request",
            JSONObject()
              .put("method", "GetSession")
              .put("module", "music.getSession.session")
              .put("param", JSONObject().put("caller", 0).put("uid", "0").put("vkey", 0)),
          ),
        qmHeaders,
      )
    }.onSuccess { response ->
      if (response.optInt("code", -1) == 0 && response.optJSONObject("request")?.optInt("code", -1) == 0) {
        val session = response.optJSONObject("request")?.optJSONObject("data")?.optJSONObject("session")
        sessionUid = session?.optString("uid")
        sessionSid = session?.optString("sid")
        sessionUserIp = session?.optString("userip")
        sessionExpireTime = System.currentTimeMillis() + 3600000L
      }
    }
  }

  private fun postJson(url: String, body: JSONObject, headers: Map<String, String>): JSONObject {
    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 15000
      readTimeout = 15000
      doInput = true
      doOutput = true
      instanceFollowRedirects = true
      headers.forEach { (key, value) -> setRequestProperty(key, value) }
    }

    return try {
      connection.outputStream.use { outputStream ->
        outputStream.write(body.toString().toByteArray(StandardCharsets.UTF_8))
      }

      val status = connection.responseCode
      val responseText = readResponseBody(connection, status)
      if (status >= 400) {
        throw IllegalStateException(responseText.ifBlank { connection.responseMessage ?: "request failed" })
      }
      JSONObject(responseText)
    } finally {
      connection.disconnect()
    }
  }

  private fun decryptQrcText(encryptedQrc: String): String {
    if (encryptedQrc.isBlank()) {
      throw IllegalArgumentException("empty qrc")
    }

    val encryptedBytes = hexToBytes(encryptedQrc)
    val cipher = Cipher.getInstance("DESede/ECB/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(qrcKey, "DESede"))
    val decrypted = cipher.doFinal(encryptedBytes)

    return decodeCompressedText(decrypted)
  }

  private fun decodeCompressedText(decrypted: ByteArray): String {
    runCatching { inflateBytes(decrypted, false) }.getOrNull()?.let { data ->
      if (data.isNotEmpty()) {
        return data.toString(StandardCharsets.UTF_8)
      }
    }

    runCatching { inflateBytes(decrypted, true) }.getOrNull()?.let { data ->
      if (data.isNotEmpty()) {
        return data.toString(StandardCharsets.UTF_8)
      }
    }

    runCatching {
      GZIPInputStream(ByteArrayInputStream(decrypted)).use { inputStream ->
        inputStream.readBytes().toString(StandardCharsets.UTF_8)
      }
    }.getOrNull()?.let { text ->
      if (text.isNotBlank()) {
        return text
      }
    }

    val text = decrypted.toString(StandardCharsets.UTF_8)
    if (text.contains("[") || text.contains("<")) {
      return text
    }
    throw IllegalStateException("unable to decode qrc")
  }

  private fun inflateBytes(data: ByteArray, raw: Boolean): ByteArray {
    val inflater = Inflater(raw)
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(4096)
    try {
      inflater.setInput(data)
      while (!inflater.finished()) {
        val count = inflater.inflate(buffer)
        if (count > 0) {
          output.write(buffer, 0, count)
          continue
        }
        if (inflater.needsInput() || inflater.needsDictionary()) {
          break
        }
      }
      return output.toByteArray()
    } finally {
      inflater.end()
    }
  }

  private fun hexToBytes(value: String): ByteArray {
    return value.chunked(2)
      .filter { it.length == 2 }
      .map { it.toInt(16).toByte() }
      .toByteArray()
  }

  private fun encodeBase64(value: String): String {
    return Base64.getEncoder().encodeToString(value.toByteArray(StandardCharsets.UTF_8))
  }

  private fun buildSearchId(): String {
    val left = (Math.random() * 20).toLong() * 18014398509481984L
    val middle = (Math.random() * 4194304).toLong() * 4294967296L
    val right = System.currentTimeMillis() % 86400000L
    return (left + middle + right).toString()
  }

  private fun readResponseBody(connection: HttpURLConnection, status: Int): String {
    val rawStream = if (status >= 400) connection.errorStream else connection.inputStream ?: return ""
    val inputStream =
      if (connection.contentEncoding?.contains("gzip", ignoreCase = true) == true) {
        GZIPInputStream(rawStream)
      } else {
        rawStream
      }

    return BufferedReader(InputStreamReader(inputStream, StandardCharsets.UTF_8)).use { reader ->
      reader.readText()
    }
  }

  private fun URL.getQueryParameter(key: String): String? {
    val queryString = query ?: return null
    return queryString
      .split("&")
      .mapNotNull { entry ->
        val parts = entry.split("=", limit = 2)
        if (parts.isEmpty()) {
          null
        } else if (parts[0] == key) {
          parts.getOrElse(1) { "" }
        } else {
          null
        }
      }
      .firstOrNull()
      ?.let { java.net.URLDecoder.decode(it, StandardCharsets.UTF_8.name()) }
  }
}