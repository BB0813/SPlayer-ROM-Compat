package top.imsyy.splayer.android.bridge

import android.Manifest
import android.content.ContentUris
import android.content.pm.PackageManager
import android.os.Build
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject

class SPlayerMediaBridge(private val activity: AppCompatActivity) {
  @JavascriptInterface
  fun checkAudioPermission(): Boolean {
    return getRequiredPermissions().all { permission ->
      ContextCompat.checkSelfPermission(activity, permission) == PackageManager.PERMISSION_GRANTED
    }
  }

  @JavascriptInterface
  fun requestAudioPermission(): Boolean {
    if (checkAudioPermission()) return true

    activity.runOnUiThread {
      ActivityCompat.requestPermissions(activity, getRequiredPermissions(), REQUEST_AUDIO_PERMISSION)
    }
    return false
  }

  @JavascriptInterface
  fun scanMediaStore(): String {
    if (!checkAudioPermission()) {
      return "[]"
    }

    val projection = mutableListOf(
      MediaStore.Audio.Media._ID,
      MediaStore.Audio.Media.TITLE,
      MediaStore.Audio.Media.ARTIST,
      MediaStore.Audio.Media.ALBUM,
      MediaStore.Audio.Media.DURATION,
      MediaStore.Audio.Media.SIZE,
      MediaStore.Audio.Media.DATE_ADDED,
      MediaStore.Audio.Media.DATE_MODIFIED,
      MediaStore.Audio.Media.MIME_TYPE,
      MediaStore.Audio.Media.ALBUM_ID,
    ).apply {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        add(MediaStore.Audio.Media.RELATIVE_PATH)
      }
    }.toTypedArray()

    val selection = "${MediaStore.Audio.Media.IS_MUSIC} != 0 AND ${MediaStore.Audio.Media.DURATION} > 0"
    val sortOrder = "${MediaStore.Audio.Media.DATE_ADDED} DESC"
    val contentUri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
    val result = JSONArray()

    activity.contentResolver.query(contentUri, projection, selection, null, sortOrder)?.use { cursor ->
      val idIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
      val titleIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
      val artistIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
      val albumIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
      val durationIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
      val sizeIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
      val dateAddedIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_ADDED)
      val dateModifiedIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_MODIFIED)
      val mimeTypeIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.MIME_TYPE)
      val albumIdIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID)
      val relativePathIndex =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          cursor.getColumnIndex(MediaStore.Audio.Media.RELATIVE_PATH)
        } else {
          -1
        }

      while (cursor.moveToNext()) {
        val id = cursor.getLong(idIndex)
        val albumId = cursor.getLong(albumIdIndex)
        val itemUri = ContentUris.withAppendedId(contentUri, id)
        val artworkUri =
          if (albumId > 0) {
            ContentUris.withAppendedId(ALBUM_ART_URI, albumId).toString()
          } else {
            ""
          }

        result.put(
          JSONObject()
            .put("id", id)
            .put("title", cursor.getString(titleIndex).orEmpty())
            .put("artist", cursor.getString(artistIndex).orEmpty())
            .put("album", cursor.getString(albumIndex).orEmpty())
            .put("duration", cursor.getLong(durationIndex))
            .put("size", cursor.getLong(sizeIndex))
            .put("dateAdded", cursor.getLong(dateAddedIndex) * 1000)
            .put("dateModified", cursor.getLong(dateModifiedIndex) * 1000)
            .put("mimeType", cursor.getString(mimeTypeIndex).orEmpty())
            .put("contentUri", itemUri.toString())
            .put("artworkUri", artworkUri)
            .put(
              "relativePath",
              if (relativePathIndex >= 0) cursor.getString(relativePathIndex).orEmpty() else "",
            ),
        )
      }
    }

    return result.toString()
  }

  private fun getRequiredPermissions(): Array<String> {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      arrayOf(Manifest.permission.READ_MEDIA_AUDIO)
    } else {
      arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    }
  }

  companion object {
    private const val REQUEST_AUDIO_PERMISSION = 2001
    private val ALBUM_ART_URI = android.net.Uri.parse("content://media/external/audio/albumart")
  }
}