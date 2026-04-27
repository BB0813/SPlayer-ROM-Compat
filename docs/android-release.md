# Android 发布说明

## 构建基础

- Android 容器构建使用 `Gradle-8.14.3-all`
- 音频播放不再依赖 `HTMLAudioElement`
- Android 端统一使用 `AndroidNativeAudioPlayer`
- Web 资源会先通过 `pnpm android:prepareWeb` 生成到 Android 资源目录
- Android 构建前建议在 `.env` 中配置 `SPLAYER_REMOTE_API_ROOT=https://your-api-root.com`
- 若未配置 `SPLAYER_REMOTE_API_ROOT`，会回退到绝对地址形式的 `VITE_API_URL`

## 构建命令

在项目根目录执行以下命令：

```bash
pnpm android:assembleDebug
pnpm android:apk:arm64
pnpm android:apk:armeabi-v7a
pnpm android:apk:x86_64
pnpm android:apk:all
pnpm android:bundleRelease
```

## 产物位置

### APK

- `android/dist/apk/release/app-arm64-v8a-release-unsigned.apk`
- `android/dist/apk/release/app-armeabi-v7a-release-unsigned.apk`
- `android/dist/apk/debug/app-x86_64-debug.apk`

### AAB

- `android/dist/bundle/release/app-release.aab`

## 分架构策略

当前发布脚本会按 ABI 单独构建并归档，避免不同架构产物互相覆盖。

- `arm64-v8a`：面向绝大多数新机型
- `armeabi-v7a`：面向部分旧机型
- `x86_64`：面向模拟器和调试环境

如需批量构建，可直接执行：

```bash
pnpm android:apk:all
```

## 发布签名

`Release` 构建支持三种方式读取签名配置，优先级如下：

1. Gradle Property
2. 环境变量
3. `android/keystore.properties`

### 必填项

```properties
SPLAYER_SIGNING_STORE_FILE=keystore/splayer-release.jks
SPLAYER_SIGNING_STORE_PASSWORD=your_store_password
SPLAYER_SIGNING_KEY_ALIAS=your_key_alias
SPLAYER_SIGNING_KEY_PASSWORD=your_key_password
```

### 推荐方式

1. 复制 `android/keystore.properties.example`
2. 重命名为 `android/keystore.properties`
3. 按实际签名信息填写内容
4. 将 keystore 文件放到 `android/keystore/` 或使用绝对路径

> `android/keystore.properties` 已加入忽略规则，不会提交到仓库。

### 未配置签名时的行为

如果未提供完整签名参数，`release` 产物会保持未签名状态，构建日志会提示未配置发布签名。

## 上架建议

### 国内分发

建议优先投放以下产物：

- `arm64-v8a` APK：用于官网、内测群、厂商应用市场测试包
- `armeabi-v7a` APK：用于兼容旧设备

### Google Play

建议使用以下命令生成 AAB：

```bash
pnpm android:bundleRelease
```

发布前请确认：

- 已配置正式签名
- `versionCode` 已递增
- `versionName` 与本次版本一致
- 已在真机验证音频播放、后台播放、通知控制、耳机控制

## 故障排查

### 生成了未签名 APK

请检查以下四项是否全部存在：

- `SPLAYER_SIGNING_STORE_FILE`
- `SPLAYER_SIGNING_STORE_PASSWORD`
- `SPLAYER_SIGNING_KEY_ALIAS`
- `SPLAYER_SIGNING_KEY_PASSWORD`

### 找不到产物

优先检查以下目录：

- `android/dist/apk/release`
- `android/dist/apk/debug`
- `android/dist/bundle/release`

### 构建日志出现 `ffmpeg.wasm` 或 chunk warning

当前这类提示不会阻断 Android 构建。若命令最终退出码为 `0`，可视为构建成功。
