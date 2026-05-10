# SPlayer-ROM-Compat

<p align="center">
  <img alt="logo" height="100" width="100" src="public/icons/logo-icon.png" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v3.0.0--rc.3--Beta100-blue?style=flat-square" alt="version">
  <img src="https://img.shields.io/badge/platform-Android%20%2F%20HarmonyOS-3DDC84?style=flat-square&logo=android&logoColor=white" alt="platform">
  <img src="https://img.shields.io/badge/ROM-Compat-8A2BE2?style=flat-square" alt="rom compat">
  <img src="https://img.shields.io/badge/Gradle-8.14.3-02303A?style=flat-square&logo=gradle&logoColor=white" alt="gradle">
  <img src="https://img.shields.io/badge/license-AGPL--3.0-red?style=flat-square" alt="license">
</p>

SPlayer-ROM-Compat 是基于 SPlayer Android 化迁移的 ROM 兼容版。Compat 是“兼容”的缩写，项目目标是在 Android、HarmonyOS 以及国内各类定制 ROM 中稳定运行，并与系统音频、通知、后台和界面安全区策略和谐共生。

---

## 界面预览

> 这里用于放置项目截图，建议提交前替换为最新手机端和平板端截图。

<table>
<tr>
  <td align="center"><b>手机主页</b></td>
  <td align="center"><b>播放页面</b></td>
  <td align="center"><b>歌词页面</b></td>
  <td align="center"><b>系统音频卡片</b></td>
</tr>
<tr>
  <td><img src="./screenshots/手机主页.jpg" width="260" alt="手机主页"></td>
  <td><img src="./screenshots/手机播放页面.jpg" width="260" alt="播放页面"></td>
  <td><img src="./screenshots/手机歌词页面.jpg" width="260" alt="歌词页面"></td>
  <td><img src="./screenshots/手机播放卡片.jpg" width="260" alt="系统音频卡片"></td>
</tr>
</table>

---

## 特性

| 分类       | 说明                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------- |
| 原生播放   | Android 端使用 `AndroidNativeAudioPlayer`，不依赖 `HTMLAudioElement` 播放音频。           |
| 系统控制   | 接入 Android `MediaSession`，支持 ROM 原生音频控制卡片。                                  |
| ROM 兼容   | 面向 HyperOS / MIUI / HarmonyOS / EMUI / MagicOS / ColorOS / OriginOS 等系统持续适配。    |
| 本地 API   | Android 端集成本地 API 服务，减少对宿主机环境的依赖。                                     |
| 自适应 UI  | 针对手机、平板、横竖屏、高 DPI 和虚拟机分辨率持续优化。                                   |
| 分架构构建 | 支持 `arm64-v8a`、`armeabi-v7a`、`x86_64` 独立 APK。                                      |
| 独立包名   | Android `applicationId` 为 `top.imsyy.splayer.romcompat`，可与其他 SPlayer 二开版本共存。 |

---

## 下载与安装

优先选择 `arm64-v8a`，大多数现代 Android / HarmonyOS 手机和平板都适用。

|      ABI      | 适用设备                               | 推荐度 |
| :-----------: | -------------------------------------- | :----: |
|  `arm64-v8a`  | 现代 Android / HarmonyOS 手机、平板    |   高   |
| `armeabi-v7a` | 旧款 32 位 ARM 设备                    |   中   |
|   `x86_64`    | Android Studio 模拟器、部分 Intel 设备 | 测试用 |

本地构建后的 Release APK 位于：

- `android/dist/apk/release/SPlayer-ROM-Compat-v3.0.0-rc.3-Beta100-arm64-v8a-release.apk`
- `android/dist/apk/release/SPlayer-ROM-Compat-v3.0.0-rc.3-Beta100-armeabi-v7a-release.apk`
- `android/dist/apk/release/SPlayer-ROM-Compat-v3.0.0-rc.3-Beta100-x86_64-release.apk`

---

## v3.0.0-rc.3-Beta100 更新

- 底部播放状态条改为无轨道背景，只保留已播放进度线，减少“条子带背景”的违和感。
- 进度线移动到底部播放器卡片内侧底边，避免横穿卡片顶部造成视觉割裂。
- 首页在线推荐增加分区配置兜底，避免旧配置或空配置导致返回主页后内容区全黑。
- Android 播放轻量模式下加固首页根容器高度和可见性，降低播放中切回主页黑屏概率。

---

## 本地开发

项目使用 `pnpm`，不要混用 `npm` 或 `yarn`。

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm build
pnpm android:apk:all
```

Android 构建使用 Gradle `8.14.3-all`。构建脚本会先从 `public/icons/favicon.png` 同步最新 Android 图标，再生成 Web 资源和分架构 APK。

---

## GitHub Actions

Tag 发布时会触发 Android Release，并生成三种 ABI 的 APK：

- `SPlayer-ROM-Compat-v3.0.0-rc.3-Beta100-arm64-v8a-release.apk`
- `SPlayer-ROM-Compat-v3.0.0-rc.3-Beta100-armeabi-v7a-release.apk`
- `SPlayer-ROM-Compat-v3.0.0-rc.3-Beta100-x86_64-release.apk`

签名所需 Secrets：

| Secret                      | 说明                    |
| --------------------------- | ----------------------- |
| `ANDROID_KEYSTORE_BASE64`   | Keystore 的 Base64 编码 |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore 密码           |
| `ANDROID_KEY_ALIAS`         | Key 别名                |
| `ANDROID_KEY_PASSWORD`      | Key 密码                |

Windows PowerShell 生成 `ANDROID_KEYSTORE_BASE64`：

```powershell
$base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("android\keystore\release.jks"))
Set-Content -Path android\keystore\ANDROID_KEYSTORE_BASE64.txt -Value $base64 -Encoding ascii -NoNewline
```

只复制生成文件中的单行内容，不要复制文件名、引号、空格或命令输出说明。

---

## 交流 & 反馈

反馈问题时建议提供以下信息：

- App 版本号，例如 `v3.0.0-rc.3-Beta100`
- 设备型号、系统版本、ROM 名称
- 使用的 APK 架构，例如 `arm64-v8a`
- 问题截图或录屏
- 是否开启第三方 ROM 增强通知卡片
- 是否正在播放音乐、是否处于歌词页或播放页

如果出现闪退，请在 App 内导出诊断日志，或通过 ADB 抓取 `logcat` 后一并提交。

---

## 许可

本项目遵循上游项目许可协议。二次分发时请保留原项目与本项目的许可说明。
