package top.imsyy.splayer.android.api

import android.util.Base64
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.spec.X509EncodedKeySpec
import java.util.Locale
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

object AndroidNeteaseApiService {
  private const val DOMAIN = "https://music.163.com"
  private const val API_DOMAIN = "https://interface.music.163.com"
  private const val IV = "0102030405060708"
  private const val PRESET_KEY = "0CoJUm6Qyw8W8jud"
  private const val EAPI_KEY = "e82ckenh8dichen8"
  private const val PUBLIC_KEY =
    "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB"
  private const val USER_AGENT_WEB =
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
  private const val USER_AGENT_API =
    "NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)"
  private val RANDOM = SecureRandom()
  private val BASE62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".toCharArray()
  private val COOKIE_ATTRIBUTE_NAMES = setOf("domain", "expires", "httponly", "max-age", "path", "samesite", "secure")
  private val HANDLED_PATHS = setOf(
    "/api/netease/login",
    "/api/netease/login/email",
    "/api/netease/login/qr/key",
    "/api/netease/login/qr/create",
    "/api/netease/login/qr/check",
    "/api/netease/captcha/sent",
    "/api/netease/captcha/verify",
    "/api/netease/login/cellphone",
    "/api/netease/login/status",
    "/api/netease/login/refresh",
    "/api/netease/logout",
    "/api/netease/register/anonimous",
    "/api/netease/register/anonymous",
    "/api/netease/user/account",
    "/api/netease/user/detail",
    "/api/netease/user/subcount",
    "/api/netease/user/playlist",
    "/api/netease/likelist",
  )

  private enum class CryptoMode {
    EAPI,
    WEAPI,
  }

  private data class NeteaseResponse(
    val httpStatus: Int,
    val body: String,
    val cookies: List<String>,
  )

  fun canHandle(path: String): Boolean = HANDLED_PATHS.contains(path)

  fun handle(request: JSONObject, requestUrl: URL): String {
    return try {
      when (requestUrl.path) {
        "/api/netease/login" -> handleLogin(request, requestUrl)
        "/api/netease/login/email" -> handleLoginEmail(request, requestUrl)
        "/api/netease/login/qr/key" -> handleQrKey(request, requestUrl)
        "/api/netease/login/qr/create" -> handleQrCreate(requestUrl)
        "/api/netease/login/qr/check" -> handleQrCheck(request, requestUrl)
        "/api/netease/captcha/sent" -> handleCaptchaSent(request, requestUrl)
        "/api/netease/captcha/verify" -> handleCaptchaVerify(request, requestUrl)
        "/api/netease/login/cellphone" -> handleLoginCellphone(request, requestUrl)
        "/api/netease/login/status" -> handleLoginStatus(request, requestUrl)
        "/api/netease/login/refresh" -> handleLoginRefresh(request, requestUrl)
        "/api/netease/logout" -> handleLogout(request, requestUrl)
        "/api/netease/register/anonimous", "/api/netease/register/anonymous" -> handleAnonymousRegister(request, requestUrl)
        "/api/netease/user/account" -> handleUserAccount(request, requestUrl)
        "/api/netease/user/detail" -> handleUserDetail(request, requestUrl)
        "/api/netease/user/subcount" -> handleUserSubcount(request, requestUrl)
        "/api/netease/user/playlist" -> handleUserPlaylist(request, requestUrl)
        "/api/netease/likelist" -> handleLikelist(request, requestUrl)
        else -> buildJsonResponse(404, errorBody("网易云内置接口未实现"))
      }
    } catch (error: Exception) {
      buildJsonResponse(502, errorBody("网易云内置接口请求失败：${error.message ?: "未知错误"}"))
    }
  }

  private fun handleQrKey(request: JSONObject, requestUrl: URL): String {
    val response = requestNetease(
      request,
      requestUrl,
      "/api/login/qrcode/unikey",
      JSONObject().put("type", 3),
      CryptoMode.EAPI,
    )
    val body = JSONObject()
      .put("code", 200)
      .put("data", parseJsonObject(response.body))
    return buildRawJsonResponse(200, body.toString(), response.cookies)
  }

  private fun handleQrCreate(requestUrl: URL): String {
    val key = requestUrl.queryValue("key") ?: ""
    val qrUrl = "https://music.163.com/login?codekey=$key"
    val body = JSONObject()
      .put("code", 200)
      .put(
        "data",
        JSONObject()
          .put("qrurl", qrUrl)
          .put("qrimg", ""),
      )
    return buildRawJsonResponse(200, body.toString(), emptyList())
  }

  private fun handleQrCheck(request: JSONObject, requestUrl: URL): String {
    val response = requestNetease(
      request,
      requestUrl,
      "/api/login/qrcode/client/login",
      JSONObject()
        .put("key", requestUrl.queryValue("key") ?: "")
        .put("type", 3),
      CryptoMode.EAPI,
    )
    val body = parseJsonObject(response.body)
    putCookieText(body, response.cookies)
    return buildRawJsonResponse(200, body.toString(), response.cookies)
  }

  private fun handleCaptchaSent(request: JSONObject, requestUrl: URL): String {
    return proxyBody(
      request,
      requestUrl,
      "/api/sms/captcha/sent",
      JSONObject()
        .put("ctcode", requestUrl.queryValue("ctcode") ?: "86")
        .put("secrete", "music_middleuser_pclogin")
        .put("cellphone", requestUrl.queryValue("phone") ?: ""),
      CryptoMode.WEAPI,
    )
  }

  private fun handleCaptchaVerify(request: JSONObject, requestUrl: URL): String {
    return proxyBody(
      request,
      requestUrl,
      "/api/sms/captcha/verify",
      JSONObject()
        .put("ctcode", requestUrl.queryValue("ctcode") ?: "86")
        .put("cellphone", requestUrl.queryValue("phone") ?: "")
        .put("captcha", requestUrl.queryValue("captcha") ?: ""),
      CryptoMode.WEAPI,
    )
  }

  private fun handleLogin(request: JSONObject, requestUrl: URL): String {
    val account = requestUrl.queryValue("email")
      ?: requestUrl.queryValue("username")
      ?: requestUrl.queryValue("phone")
      ?: ""
    return when {
      account.contains("@") -> handleLoginEmail(request, requestUrl)
      account.isNotBlank() -> handleLoginCellphone(request, requestUrl)
      else -> buildJsonResponse(400, errorBody("\u7f3a\u5c11\u767b\u5f55\u8d26\u53f7"))
    }
  }

  private fun handleLoginCellphone(request: JSONObject, requestUrl: URL): String {
    val loginData = JSONObject()
      .put("type", "1")
      .put("https", "true")
      .put("phone", requestUrl.queryValue("phone") ?: requestUrl.queryValue("username") ?: "")
      .put("countrycode", requestUrl.queryValue("countrycode") ?: requestUrl.queryValue("ctcode") ?: "86")
      .put("remember", "true")
    appendLoginCredential(loginData, requestUrl)

    val response = requestNetease(
      request,
      requestUrl,
      "/api/w/login/cellphone",
      loginData,
      CryptoMode.WEAPI,
    )
    val body = parseJsonObject(normalizeAvatarKey(response.body))
    putCookieText(body, response.cookies)
    return buildRawJsonResponse(200, body.toString(), response.cookies)
  }

  private fun handleLoginEmail(request: JSONObject, requestUrl: URL): String {
    val loginData = JSONObject()
      .put("username", requestUrl.queryValue("email") ?: requestUrl.queryValue("username") ?: "")
      .put("rememberLogin", "true")
    appendLoginCredential(loginData, requestUrl)

    val response = requestNetease(
      request,
      requestUrl,
      "/api/w/login",
      loginData,
      CryptoMode.WEAPI,
    )
    val body = parseJsonObject(normalizeAvatarKey(response.body))
    putCookieText(body, response.cookies)
    return buildRawJsonResponse(200, body.toString(), response.cookies)
  }

  private fun handleLoginStatus(request: JSONObject, requestUrl: URL): String {
    val response = requestNetease(
      request,
      requestUrl,
      "/api/w/nuser/account/get",
      JSONObject(),
      CryptoMode.WEAPI,
    )
    val body = parseJsonObject(response.body)
    val result = if (body.optInt("code") == 200) {
      JSONObject().put("data", body)
    } else {
      body
    }
    return buildRawJsonResponse(200, result.toString(), response.cookies)
  }

  private fun handleLoginRefresh(request: JSONObject, requestUrl: URL): String {
    val response = requestNetease(
      request,
      requestUrl,
      "/api/login/token/refresh",
      JSONObject(),
      CryptoMode.EAPI,
    )
    val body = parseJsonObject(response.body)
    putCookieText(body, response.cookies)
    return buildRawJsonResponse(200, body.toString(), response.cookies)
  }

  private fun handleLogout(request: JSONObject, requestUrl: URL): String {
    return proxyBody(request, requestUrl, "/api/logout", JSONObject(), CryptoMode.EAPI)
  }

  private fun handleAnonymousRegister(request: JSONObject, requestUrl: URL): String {
    return proxyBody(request, requestUrl, "/api/register/anonimous", JSONObject(), CryptoMode.WEAPI)
  }

  private fun handleUserAccount(request: JSONObject, requestUrl: URL): String {
    return proxyBody(request, requestUrl, "/api/nuser/account/get", JSONObject(), CryptoMode.WEAPI)
  }

  private fun handleUserDetail(request: JSONObject, requestUrl: URL): String {
    val uid = requestUrl.queryValue("uid") ?: "0"
    val response = requestNetease(
      request,
      requestUrl,
      "/api/v1/user/detail/$uid",
      JSONObject(),
      CryptoMode.WEAPI,
    )
    return buildRawJsonResponse(200, normalizeAvatarKey(response.body), response.cookies)
  }

  private fun handleUserSubcount(request: JSONObject, requestUrl: URL): String {
    return proxyBody(request, requestUrl, "/api/subcount", JSONObject(), CryptoMode.WEAPI)
  }

  private fun handleUserPlaylist(request: JSONObject, requestUrl: URL): String {
    return proxyBody(
      request,
      requestUrl,
      "/api/user/playlist",
      JSONObject()
        .put("uid", requestUrl.queryValue("uid") ?: "0")
        .put("limit", requestUrl.queryValue("limit") ?: "30")
        .put("offset", requestUrl.queryValue("offset") ?: "0")
        .put("includeVideo", true),
      CryptoMode.WEAPI,
    )
  }

  private fun handleLikelist(request: JSONObject, requestUrl: URL): String {
    return proxyBody(
      request,
      requestUrl,
      "/api/song/like/get",
      JSONObject().put("uid", requestUrl.queryValue("uid") ?: "0"),
      CryptoMode.EAPI,
    )
  }

  private fun appendLoginCredential(data: JSONObject, requestUrl: URL) {
    val captcha = requestUrl.queryValue("captcha") ?: ""
    val md5Password = requestUrl.queryValue("md5_password") ?: ""
    val password = requestUrl.queryValue("password") ?: ""

    when {
      captcha.isNotBlank() -> data.put("captcha", captcha)
      md5Password.isNotBlank() -> data.put("md5_password", md5Password)
      password.isNotBlank() -> data.put("password", password)
    }
  }

  private fun proxyBody(
    request: JSONObject,
    requestUrl: URL,
    uri: String,
    data: JSONObject,
    cryptoMode: CryptoMode,
  ): String {
    val response = requestNetease(request, requestUrl, uri, data, cryptoMode)
    return buildRawJsonResponse(200, response.body.ifBlank { "{}" }, response.cookies)
  }

  private fun requestNetease(
    request: JSONObject,
    requestUrl: URL,
    uri: String,
    data: JSONObject,
    cryptoMode: CryptoMode,
  ): NeteaseResponse {
    val cookies = collectCookies(request, requestUrl, uri)
    val timeout = request.optInt("timeout", 15000)
    val requestData = JSONObject(data.toString())
    val targetUrl: String
    val formData: Map<String, String>
    val headers = linkedMapOf<String, String>()

    when (cryptoMode) {
      CryptoMode.WEAPI -> {
        requestData.put("csrf_token", cookies["__csrf"] ?: "")
        formData = encryptWeapi(requestData.toString())
        targetUrl = DOMAIN + "/weapi/" + uri.removePrefix("/api/")
        headers["Referer"] = DOMAIN
        headers["User-Agent"] = USER_AGENT_WEB
        headers["Cookie"] = cookieMapToHeader(cookies)
      }
      CryptoMode.EAPI -> {
        val header = buildEapiHeader(cookies)
        requestData.put("header", header)
        requestData.put("e_r", false)
        formData = encryptEapi(uri, requestData.toString())
        targetUrl = API_DOMAIN + "/eapi/" + uri.removePrefix("/api/")
        headers["User-Agent"] = USER_AGENT_API
        headers["Cookie"] = cookieMapToHeader(jsonObjectToMap(header))
      }
    }

    val connection = (URL(targetUrl).openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = timeout
      readTimeout = timeout
      doInput = true
      doOutput = true
      instanceFollowRedirects = true
      setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
      headers.forEach { (key, value) ->
        if (value.isNotBlank()) setRequestProperty(key, value)
      }
    }

    try {
      val body = formData.entries.joinToString("&") { (key, value) ->
        "${formEncode(key)}=${formEncode(value)}"
      }
      connection.outputStream.use { output ->
        output.write(body.toByteArray(StandardCharsets.UTF_8))
      }

      val status = connection.responseCode
      val responseBody = readResponseBody(connection, status)
      val responseCookies = extractSetCookies(connection)
      if (status >= 500) {
        throw IllegalStateException(responseBody.ifBlank { defaultStatusText(status) })
      }
      return NeteaseResponse(status, responseBody, responseCookies)
    } finally {
      connection.disconnect()
    }
  }

  private fun collectCookies(
    request: JSONObject,
    requestUrl: URL,
    uri: String,
  ): MutableMap<String, String> {
    val cookies = linkedMapOf<String, String>()
    parseCookieText(requestUrl.queryValue("cookie"), cookies)
    val headers = request.optJSONObject("headers")
    val headerCookie = headers?.optString("Cookie")?.takeIf { it.isNotBlank() } ?: headers?.optString("cookie")
    parseCookieText(headerCookie, cookies)

    val nuid = cookies["_ntes_nuid"] ?: randomHex(64)
    val os = cookies["os"] ?: "pc"
    cookies["__remember_me"] = cookies["__remember_me"] ?: "true"
    cookies["ntes_kaola_ad"] = cookies["ntes_kaola_ad"] ?: "1"
    cookies["_ntes_nuid"] = nuid
    cookies["_ntes_nnid"] = cookies["_ntes_nnid"] ?: "$nuid,${System.currentTimeMillis()}"
    cookies["WNMCID"] = cookies["WNMCID"] ?: "${randomLowercase(6)}.${System.currentTimeMillis()}.01.0"
    cookies["WEVNSM"] = cookies["WEVNSM"] ?: "1.0.0"
    cookies["osver"] = cookies["osver"] ?: if (os == "android") "14" else "Microsoft-Windows-10-Professional-build-19045-64bit"
    cookies["deviceId"] = cookies["deviceId"] ?: randomHex(52).uppercase(Locale.ROOT)
    cookies["os"] = os
    cookies["channel"] = cookies["channel"] ?: if (os == "android") "xiaomi" else "netease"
    cookies["appver"] = cookies["appver"] ?: if (os == "android") "8.20.20.231215173437" else "3.1.17.204416"
    if (!uri.contains("login") && !cookies.containsKey("NMTID")) {
      cookies["NMTID"] = randomHex(32)
    }
    return cookies
  }

  private fun buildEapiHeader(cookies: Map<String, String>): JSONObject {
    val header = JSONObject()
      .put("osver", cookies["osver"] ?: "")
      .put("deviceId", cookies["deviceId"] ?: "")
      .put("os", cookies["os"] ?: "pc")
      .put("appver", cookies["appver"] ?: "3.1.17.204416")
      .put("versioncode", cookies["versioncode"] ?: "140")
      .put("mobilename", cookies["mobilename"] ?: "")
      .put("buildver", cookies["buildver"] ?: (System.currentTimeMillis() / 1000).toString())
      .put("resolution", cookies["resolution"] ?: "1920x1080")
      .put("__csrf", cookies["__csrf"] ?: "")
      .put("channel", cookies["channel"] ?: "netease")
      .put("requestId", "${System.currentTimeMillis()}_${RANDOM.nextInt(1000).toString().padStart(4, '0')}")

    cookies["MUSIC_U"]?.let { header.put("MUSIC_U", it) }
    cookies["MUSIC_A"]?.let { header.put("MUSIC_A", it) }
    return header
  }

  private fun encryptWeapi(text: String): Map<String, String> {
    val secretKey = randomBase62(16)
    return mapOf(
      "params" to aesCbcBase64(aesCbcBase64(text, PRESET_KEY, IV), secretKey, IV),
      "encSecKey" to rsaEncrypt(secretKey.reversed()),
    )
  }

  private fun encryptEapi(uri: String, text: String): Map<String, String> {
    val digest = md5("nobody${uri}use${text}md5forencrypt")
    val data = "${uri}-36cd479b6b5-${text}-36cd479b6b5-${digest}"
    return mapOf("params" to aesEcbHex(data, EAPI_KEY))
  }

  private fun aesCbcBase64(text: String, key: String, iv: String): String {
    val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
    cipher.init(
      Cipher.ENCRYPT_MODE,
      SecretKeySpec(key.toByteArray(StandardCharsets.UTF_8), "AES"),
      IvParameterSpec(iv.toByteArray(StandardCharsets.UTF_8)),
    )
    return Base64.encodeToString(cipher.doFinal(text.toByteArray(StandardCharsets.UTF_8)), Base64.NO_WRAP)
  }

  private fun aesEcbHex(text: String, key: String): String {
    val cipher = Cipher.getInstance("AES/ECB/PKCS5Padding")
    cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key.toByteArray(StandardCharsets.UTF_8), "AES"))
    return cipher.doFinal(text.toByteArray(StandardCharsets.UTF_8)).toHex().uppercase(Locale.ROOT)
  }

  private fun rsaEncrypt(text: String): String {
    val keySpec = X509EncodedKeySpec(Base64.decode(PUBLIC_KEY, Base64.NO_WRAP))
    val publicKey = KeyFactory.getInstance("RSA").generatePublic(keySpec)
    val cipher = Cipher.getInstance("RSA/ECB/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, publicKey)
    return cipher.doFinal(text.toByteArray(StandardCharsets.UTF_8)).toHex()
  }

  private fun md5(text: String): String {
    return MessageDigest.getInstance("MD5")
      .digest(text.toByteArray(StandardCharsets.UTF_8))
      .toHex()
  }

  private fun readResponseBody(connection: HttpURLConnection, status: Int): String {
    val stream = if (status >= 400) connection.errorStream else connection.inputStream
    if (stream == null) return ""
    return BufferedReader(InputStreamReader(stream, StandardCharsets.UTF_8)).use { reader ->
      reader.readText()
    }
  }

  private fun extractSetCookies(connection: HttpURLConnection): List<String> {
    return connection.headerFields.entries
      .filter { (key, _) -> key?.equals("Set-Cookie", ignoreCase = true) == true }
      .flatMap { (_, values) -> values ?: emptyList() }
      .map { cookie -> cookie.replace(Regex("\\s*Domain=[^;]+;?", RegexOption.IGNORE_CASE), "").trim() }
      .filter { it.isNotBlank() }
  }

  private fun putCookieText(body: JSONObject, cookies: List<String>) {
    if (cookies.isNotEmpty()) {
      body.put("cookie", cookies.joinToString("; ") { cookie -> cookie.trim().trimEnd(';') })
    }
  }

  private fun parseJsonObject(text: String): JSONObject {
    return if (text.isBlank()) JSONObject() else JSONObject(text)
  }

  private fun normalizeAvatarKey(text: String): String {
    return text.replace("avatarImgId_str", "avatarImgIdStr")
  }

  private fun parseCookieText(cookieText: String?, target: MutableMap<String, String>) {
    if (cookieText.isNullOrBlank()) return
    cookieText.split(";").forEach { item ->
      val separatorIndex = item.indexOf('=')
      if (separatorIndex <= 0) return@forEach
      val key = item.substring(0, separatorIndex).trim()
      val value = item.substring(separatorIndex + 1).trim()
      if (key.isNotBlank() && value.isNotBlank() && !COOKIE_ATTRIBUTE_NAMES.contains(key.lowercase(Locale.ROOT))) {
        target[key] = value
      }
    }
  }

  private fun jsonObjectToMap(source: JSONObject): Map<String, String> {
    val result = linkedMapOf<String, String>()
    source.keys().forEach { key ->
      val value = source.optString(key)
      if (value.isNotBlank()) result[key] = value
    }
    return result
  }

  private fun cookieMapToHeader(cookies: Map<String, String>): String {
    return cookies.entries
      .filter { (key, value) -> key.isNotBlank() && value.isNotBlank() }
      .filter { (key, _) -> !COOKIE_ATTRIBUTE_NAMES.contains(key.lowercase(Locale.ROOT)) }
      .joinToString("; ") { (key, value) -> "${key.trim()}=${value.trim()}" }
  }

  private fun formEncode(value: String): String {
    return URLEncoder.encode(value, StandardCharsets.UTF_8.name())
  }

  private fun URL.queryValue(key: String): String? {
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
      ?.let { URLDecoder.decode(it, StandardCharsets.UTF_8.name()) }
  }

  private fun randomBase62(length: Int): String {
    return buildString(length) {
      repeat(length) {
        append(BASE62[RANDOM.nextInt(BASE62.size)])
      }
    }
  }

  private fun randomHex(length: Int): String {
    val chars = "0123456789abcdef"
    return buildString(length) {
      repeat(length) {
        append(chars[RANDOM.nextInt(chars.length)])
      }
    }
  }

  private fun randomLowercase(length: Int): String {
    val chars = "abcdefghijklmnopqrstuvwxyz"
    return buildString(length) {
      repeat(length) {
        append(chars[RANDOM.nextInt(chars.length)])
      }
    }
  }

  private fun ByteArray.toHex(): String {
    return joinToString("") { byte -> "%02x".format(byte) }
  }

  private fun buildJsonResponse(status: Int, body: JSONObject): String {
    return buildRawJsonResponse(status, body.toString(), emptyList())
  }

  private fun buildRawJsonResponse(status: Int, body: String, cookies: List<String>): String {
    val headers = JSONObject().put("Content-Type", "application/json; charset=UTF-8")
    if (cookies.isNotEmpty()) headers.put("Set-Cookie", cookies.joinToString("\n"))
    return JSONObject()
      .put("status", status)
      .put("statusText", defaultStatusText(status))
      .put("headers", headers)
      .put("body", body)
      .toString()
  }

  private fun errorBody(message: String): JSONObject {
    return JSONObject()
      .put("code", 500)
      .put("message", message)
      .put("data", JSONObject.NULL)
  }

  private fun defaultStatusText(status: Int): String {
    return when (status) {
      200 -> "OK"
      400 -> "Bad Request"
      401 -> "Unauthorized"
      403 -> "Forbidden"
      404 -> "Not Found"
      500 -> "Internal Server Error"
      502 -> "Bad Gateway"
      503 -> "Service Unavailable"
      else -> "OK"
    }
  }
}

