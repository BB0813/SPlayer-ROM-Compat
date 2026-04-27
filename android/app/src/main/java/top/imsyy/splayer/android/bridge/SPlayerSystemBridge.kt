package top.imsyy.splayer.android.bridge

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.webkit.JavascriptInterface
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.Locale

class SPlayerSystemBridge(private val activity: AppCompatActivity) {
  @JavascriptInterface
  fun getVersion(): String = Build.VERSION.RELEASE ?: "unknown"

  @JavascriptInterface
  fun getBrand(): String = Build.BRAND ?: "unknown"

  @JavascriptInterface
  fun getManufacturer(): String = Build.MANUFACTURER ?: "unknown"

  @JavascriptInterface
  fun getModel(): String = Build.MODEL ?: "unknown"

  @JavascriptInterface
  fun getRomName(): String {
    val hyperOs = readSystemProperty("ro.mi.os.version.name")
    if (hyperOs.isNotBlank()) {
      return "HyperOS $hyperOs"
    }

    val miui = readSystemProperty("ro.miui.ui.version.name")
    if (miui.isNotBlank()) {
      return "MIUI $miui"
    }

    val magicOs = readSystemProperty("ro.build.version.magic")
    if (magicOs.isNotBlank()) {
      return "MagicOS $magicOs"
    }

    val harmonyOs = readSystemProperty("hw_sc.build.platform.version")
    if (harmonyOs.isNotBlank()) {
      return "HarmonyOS $harmonyOs"
    }

    val emui = readSystemProperty("ro.build.version.emui")
    if (emui.isNotBlank()) {
      return emui
    }

    val oppo = readSystemProperty("ro.build.version.opporom")
    if (oppo.isNotBlank()) {
      return "ColorOS $oppo"
    }

    val vivo = readSystemProperty("ro.vivo.os.version")
    if (vivo.isNotBlank()) {
      return "OriginOS/FuntouchOS $vivo"
    }

    val oneUi = readSystemProperty("ro.build.version.oneui")
    if (oneUi.isNotBlank()) {
      return "One UI $oneUi"
    }

    val smartisan = readSystemProperty("ro.smartisan.version")
    if (smartisan.isNotBlank()) {
      return smartisan
    }

    val displayId = Build.DISPLAY.orEmpty()
    if (displayId.contains("flyme", ignoreCase = true)) {
      return displayId
    }

    val brand = Build.BRAND.orEmpty().replaceFirstChar {
      if (it.isLowerCase()) it.titlecase(Locale.ROOT) else it.toString()
    }
    return if (brand.isBlank()) "Android" else brand
  }

  @JavascriptInterface
  fun isIgnoringBatteryOptimizations(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      return true
    }

    val powerManager = activity.getSystemService(PowerManager::class.java)
    return powerManager?.isIgnoringBatteryOptimizations(activity.packageName) ?: false
  }

  @JavascriptInterface
  fun areNotificationsEnabled(): Boolean {
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) !=
          PackageManager.PERMISSION_GRANTED
    ) {
      return false
    }

    return NotificationManagerCompat.from(activity).areNotificationsEnabled()
  }

  @JavascriptInterface
  fun requestNotificationPermission(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      return areNotificationsEnabled()
    }

    if (
      ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED
    ) {
      return true
    }

    activity.runOnUiThread {
      ActivityCompat.requestPermissions(
        activity,
        arrayOf(Manifest.permission.POST_NOTIFICATIONS),
        REQUEST_NOTIFICATION_PERMISSION,
      )
    }
    return false
  }

  @JavascriptInterface
  fun requestIgnoreBatteryOptimizations(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      return true
    }

    if (isIgnoringBatteryOptimizations()) {
      return true
    }

    val requestIntent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
      data = Uri.parse("package:${activity.packageName}")
    }

    return launchFirstAvailable(
      requestIntent,
      *buildBatteryOptimizationIntents().toTypedArray(),
    )
  }

  @JavascriptInterface
  fun openBatteryOptimizationSettings(): Boolean {
    return launchFirstAvailable(*buildBatteryOptimizationIntents().toTypedArray())
  }

  @JavascriptInterface
  fun openAutoStartSettings(): Boolean {
    return launchFirstAvailable(*buildAutoStartIntents().toTypedArray())
  }

  @JavascriptInterface
  fun openNotificationSettings(): Boolean {
    return launchFirstAvailable(*buildNotificationIntents().toTypedArray())
  }

  @JavascriptInterface
  fun openBackgroundActivitySettings(): Boolean {
    return launchFirstAvailable(*buildBackgroundActivityIntents().toTypedArray())
  }

  @JavascriptInterface
  fun openBackgroundPopupSettings(): Boolean {
    return launchFirstAvailable(*buildBackgroundPopupIntents().toTypedArray())
  }

  @JavascriptInterface
  fun openPowerManagerSettings(): Boolean {
    return launchFirstAvailable(*buildPowerManagerIntents().toTypedArray())
  }

  @JavascriptInterface
  fun openAppDetailSettings(): Boolean = launchFirstAvailable(createAppDetailIntent())

  @JavascriptInterface
  fun openRomSecurityCenterSettings(): Boolean {
    return launchFirstAvailable(*buildRomSecurityCenterIntents().toTypedArray())
  }

  @JavascriptInterface
  fun getRomCompatReport(): String {
    val actions =
      JSONObject()
        .put("autoStart", hasResolvableIntent(*buildAutoStartIntents().toTypedArray()))
        .put("notification", hasResolvableIntent(*buildNotificationIntents().toTypedArray()))
        .put("backgroundActivity", hasResolvableIntent(*buildBackgroundActivityIntents().toTypedArray()))
        .put("backgroundPopup", hasResolvableIntent(*buildBackgroundPopupIntents().toTypedArray()))
        .put("powerManager", hasResolvableIntent(*buildPowerManagerIntents().toTypedArray()))
        .put("securityCenter", hasResolvableIntent(*buildRomSecurityCenterIntents().toTypedArray()))
        .put("appDetail", hasResolvableIntent(createAppDetailIntent()))

    return JSONObject()
      .put("version", getVersion())
      .put("sdkInt", Build.VERSION.SDK_INT)
      .put("brand", getBrand())
      .put("manufacturer", getManufacturer())
      .put("model", getModel())
      .put("romName", getRomName())
      .put("ignoringBatteryOptimizations", isIgnoringBatteryOptimizations())
      .put("notificationsEnabled", areNotificationsEnabled())
      .put("actions", actions)
      .toString()
  }


  private fun buildAutoStartIntents(): List<Intent> {
    val manufacturer = normalizedManufacturer()
    val intents = mutableListOf<Intent>()

    when {
      manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco") -> {
        intents +=
          createComponentIntent(
            "com.miui.securitycenter",
            "com.miui.permcenter.autostart.AutoStartManagementActivity",
          )
      }
      manufacturer.contains("huawei") -> {
        intents +=
          createComponentIntent(
            "com.huawei.systemmanager",
            "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
          )
        intents +=
          createComponentIntent(
            "com.huawei.systemmanager",
            "com.huawei.systemmanager.optimize.process.ProtectActivity",
          )
      }
      manufacturer.contains("honor") -> {
        intents +=
          createComponentIntent(
            "com.hihonor.systemmanager",
            "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
          )
        intents +=
          createComponentIntent(
            "com.hihonor.systemmanager",
            "com.hihonor.systemmanager.optimize.process.ProtectActivity",
          )
      }
      manufacturer.contains("oppo") || manufacturer.contains("oneplus") || manufacturer.contains("realme") -> {
        intents +=
          createComponentIntent(
            "com.coloros.safecenter",
            "com.coloros.safecenter.startupapp.StartupAppListActivity",
          )
        intents +=
          createComponentIntent(
            "com.oplus.safecenter",
            "com.oplus.safecenter.startupapp.StartupAppListActivity",
          )
      }
      manufacturer.contains("vivo") || manufacturer.contains("iqoo") -> {
        intents +=
          createComponentIntent(
            "com.vivo.permissionmanager",
            "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
          )
        intents +=
          createComponentIntent(
            "com.iqoo.secure",
            "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity",
          )
      }
      manufacturer.contains("meizu") -> {
        intents +=
          createComponentIntent(
            "com.meizu.safe",
            "com.meizu.safe.permission.SmartBGActivity",
          )
      }
    }

    intents += createAppDetailIntent()
    return intents
  }

  private fun buildNotificationIntents(): List<Intent> {
    val intents = mutableListOf<Intent>()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      intents +=
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
          putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
        }
    }

    intents += createAppDetailIntent()
    return intents
  }

  private fun buildBackgroundActivityIntents(): List<Intent> {
    val manufacturer = normalizedManufacturer()
    val intents = mutableListOf<Intent>()

    when {
      manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco") -> {
        intents +=
          createComponentIntent(
            "com.miui.securitycenter",
            "com.miui.permcenter.autostart.AutoStartManagementActivity",
          )
        intents +=
          createComponentIntent(
            "com.miui.powerkeeper",
            "com.miui.powerkeeper.ui.HiddenAppsConfigActivity",
            mapOf(
              "package_name" to activity.packageName,
              "packageName" to activity.packageName,
            ),
          )
      }
      manufacturer.contains("huawei") -> {
        intents +=
          createComponentIntent(
            "com.huawei.systemmanager",
            "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
          )
        intents +=
          createComponentIntent(
            "com.huawei.systemmanager",
            "com.huawei.systemmanager.optimize.process.ProtectActivity",
          )
      }
      manufacturer.contains("honor") -> {
        intents +=
          createComponentIntent(
            "com.hihonor.systemmanager",
            "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
          )
        intents +=
          createComponentIntent(
            "com.hihonor.systemmanager",
            "com.hihonor.systemmanager.optimize.process.ProtectActivity",
          )
      }
      manufacturer.contains("oppo") || manufacturer.contains("oneplus") || manufacturer.contains("realme") -> {
        intents +=
          createComponentIntent(
            "com.coloros.safecenter",
            "com.coloros.safecenter.startupapp.StartupAppListActivity",
          )
        intents +=
          createComponentIntent(
            "com.oplus.safecenter",
            "com.oplus.safecenter.startupapp.StartupAppListActivity",
          )
      }
      manufacturer.contains("vivo") || manufacturer.contains("iqoo") -> {
        intents +=
          createComponentIntent(
            "com.vivo.permissionmanager",
            "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
          )
        intents +=
          createComponentIntent(
            "com.iqoo.secure",
            "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity",
          )
      }
      manufacturer.contains("samsung") -> {
        intents +=
          Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
      }
    }

    intents += createAppDetailIntent()
    return intents
  }

  private fun buildBackgroundPopupIntents(): List<Intent> {
    val manufacturer = normalizedManufacturer()
    val intents = mutableListOf<Intent>()

    when {
      manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco") -> {
        intents +=
          createComponentIntent(
            "com.miui.securitycenter",
            "com.miui.permcenter.permissions.PermissionsEditorActivity",
            mapOf(
              "extra_pkgname" to activity.packageName,
              "packageName" to activity.packageName,
            ),
          )
      }
      manufacturer.contains("huawei") -> {
        intents +=
          createComponentIntent(
            "com.huawei.systemmanager",
            "com.huawei.systemmanager.addviewmonitor.AddViewMonitorActivity",
          )
      }
      manufacturer.contains("honor") -> {
        intents +=
          createComponentIntent(
            "com.hihonor.systemmanager",
            "com.hihonor.systemmanager.addviewmonitor.AddViewMonitorActivity",
          )
      }
      manufacturer.contains("oppo") || manufacturer.contains("oneplus") || manufacturer.contains("realme") -> {
        intents +=
          createComponentIntent(
            "com.coloros.safecenter",
            "com.coloros.safecenter.permission.floatwindow.FloatWindowListActivity",
          )
        intents +=
          createComponentIntent(
            "com.oplus.safecenter",
            "com.oplus.safecenter.permission.floatwindow.FloatWindowListActivity",
          )
      }
      manufacturer.contains("vivo") || manufacturer.contains("iqoo") -> {
        intents +=
          createComponentIntent(
            "com.iqoo.secure",
            "com.iqoo.secure.ui.phoneoptimize.FloatWindowManager",
          )
        intents +=
          createComponentIntent(
            "com.vivo.permissionmanager",
            "com.vivo.permissionmanager.activity.FloatWindowManagerActivity",
          )
      }
      manufacturer.contains("meizu") -> {
        intents +=
          createComponentIntent(
            "com.meizu.safe",
            "com.meizu.safe.security.AppSecActivity",
          )
      }
    }

    intents += createAppDetailIntent()
    return intents
  }


  private fun buildRomSecurityCenterIntents(): List<Intent> {
    val manufacturer = normalizedManufacturer()
    val intents = mutableListOf<Intent>()

    when {
      manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco") -> {
        addPackageLaunchIntent(intents, "com.miui.securitycenter")
        intents +=
          createComponentIntent(
            "com.miui.securitycenter",
            "com.miui.securitycenter.MainActivity",
          )
        intents +=
          createComponentIntent(
            "com.miui.securitycenter",
            "com.miui.securityscan.MainActivity",
          )
      }
      manufacturer.contains("huawei") -> {
        addPackageLaunchIntent(intents, "com.huawei.systemmanager")
        intents +=
          createComponentIntent(
            "com.huawei.systemmanager",
            "com.huawei.systemmanager.MainActivity",
          )
      }
      manufacturer.contains("honor") -> {
        addPackageLaunchIntent(intents, "com.hihonor.systemmanager")
        intents +=
          createComponentIntent(
            "com.hihonor.systemmanager",
            "com.hihonor.systemmanager.MainActivity",
          )
      }
      manufacturer.contains("oppo") || manufacturer.contains("oneplus") || manufacturer.contains("realme") -> {
        addPackageLaunchIntent(intents, "com.oplus.safecenter")
        addPackageLaunchIntent(intents, "com.coloros.safecenter")
        addPackageLaunchIntent(intents, "com.coloros.oppoguardelf")
      }
      manufacturer.contains("vivo") || manufacturer.contains("iqoo") -> {
        addPackageLaunchIntent(intents, "com.iqoo.secure")
        addPackageLaunchIntent(intents, "com.vivo.permissionmanager")
        addPackageLaunchIntent(intents, "com.vivo.abe")
      }
      manufacturer.contains("samsung") -> {
        addPackageLaunchIntent(intents, "com.samsung.android.lool")
        addPackageLaunchIntent(intents, "com.samsung.android.sm_cn")
        addPackageLaunchIntent(intents, "com.samsung.android.sm")
      }
      manufacturer.contains("meizu") -> {
        addPackageLaunchIntent(intents, "com.meizu.safe")
        intents +=
          createComponentIntent(
            "com.meizu.safe",
            "com.meizu.safe.security.HomeActivity",
          )
      }
      manufacturer.contains("smartisan") -> {
        addPackageLaunchIntent(intents, "com.smartisanos.security")
      }
    }

    intents += Intent(Settings.ACTION_SETTINGS)
    intents += createAppDetailIntent()
    return intents
  }

  private fun buildPowerManagerIntents(): List<Intent> {
    val manufacturer = normalizedManufacturer()
    val intents = mutableListOf<Intent>()

    when {
      manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco") -> {
        intents +=
          createComponentIntent(
            "com.miui.powerkeeper",
            "com.miui.powerkeeper.ui.HiddenAppsConfigActivity",
            mapOf(
              "package_name" to activity.packageName,
              "packageName" to activity.packageName,
            ),
          )
        intents +=
          createComponentIntent(
            "com.miui.powerkeeper",
            "com.miui.powerkeeper.ui.PowerHideModeActivity",
          )
      }
      manufacturer.contains("huawei") -> {
        intents +=
          createComponentIntent(
            "com.huawei.systemmanager",
            "com.huawei.systemmanager.optimize.process.ProtectActivity",
          )
        intents +=
          createComponentIntent(
            "com.huawei.systemmanager",
            "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
          )
      }
      manufacturer.contains("honor") -> {
        intents +=
          createComponentIntent(
            "com.hihonor.systemmanager",
            "com.hihonor.systemmanager.optimize.process.ProtectActivity",
          )
        intents +=
          createComponentIntent(
            "com.hihonor.systemmanager",
            "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
          )
      }
      manufacturer.contains("oppo") || manufacturer.contains("oneplus") || manufacturer.contains("realme") -> {
        intents +=
          createComponentIntent(
            "com.coloros.oppoguardelf",
            "com.coloros.powermanager.fuelgaue.PowerUsageModelActivity",
          )
        intents +=
          createComponentIntent(
            "com.oplus.battery",
            "com.oplus.powermanager.fuelgaue.PowerUsageModelActivity",
          )
      }
      manufacturer.contains("vivo") || manufacturer.contains("iqoo") -> {
        intents +=
          createComponentIntent(
            "com.vivo.abe",
            "com.vivo.applicationbehaviorengine.ui.ExcessivePowerManagerActivity",
          )
      }
      manufacturer.contains("samsung") -> {
        intents += Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
      }
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      intents += Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
    }
    intents += createAppDetailIntent()
    return intents
  }

  private fun buildBatteryOptimizationIntents(): List<Intent> {
    return buildPowerManagerIntents()
  }

  private fun createAppDetailIntent(): Intent {
    return Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
      data = Uri.parse("package:${activity.packageName}")
    }
  }

  private fun createComponentIntent(
    packageName: String,
    className: String,
    extras: Map<String, String> = emptyMap(),
  ): Intent {
    return Intent().apply {
      setClassName(packageName, className)
      extras.forEach { (key, value) ->
        putExtra(key, value)
      }
    }
  }


  private fun addPackageLaunchIntent(
    intents: MutableList<Intent>,
    packageName: String,
  ) {
    activity.packageManager.getLaunchIntentForPackage(packageName)?.let { intent ->
      intents += intent
    }
  }

  private fun hasResolvableIntent(vararg intents: Intent): Boolean {
    return intents.any { intent ->
      intent.resolveActivity(activity.packageManager) != null
    }
  }

  private fun launchFirstAvailable(vararg intents: Intent): Boolean {
    intents.forEach { intent ->
      if (launch(intent)) {
        return true
      }
    }
    return false
  }

  private fun launch(intent: Intent): Boolean {
    return try {
      val launchIntent = Intent(intent).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      activity.startActivity(launchIntent)
      true
    } catch (_: ActivityNotFoundException) {
      false
    } catch (_: SecurityException) {
      false
    } catch (_: Exception) {
      false
    }
  }

  private fun normalizedManufacturer(): String {
    return listOf(Build.MANUFACTURER, Build.BRAND, Build.DISPLAY)
      .joinToString(" ") { it.orEmpty() }
      .lowercase(Locale.ROOT)
  }

  private fun readSystemProperty(key: String): String {
    return try {
      val process = Runtime.getRuntime().exec(arrayOf("getprop", key))
      BufferedReader(InputStreamReader(process.inputStream)).use { reader ->
        reader.readLine().orEmpty().trim()
      }
    } catch (_: Exception) {
      ""
    }
  }

  companion object {
    private const val REQUEST_NOTIFICATION_PERMISSION = 2002
  }
}
