# Android Release Secrets

CI 自动打包使用 `.github/workflows/android-release.yml`。发布 `v*` / `android-v*` 标签时会在单个 Ubuntu Job 中执行 `pnpm android:apk:all`，一次性构建 `arm64-v8a`、`armeabi-v7a`、`x86_64` 三个签名 APK，并在 tag 构建完成后上传到 GitHub Release。

桌面端 macOS / Windows / Linux 的历史 workflow 已改为仅手动触发；如果看到 `Build on macos-latest`、`Build on windows-latest`、`Build on ubuntu-latest`，说明点进了桌面端 workflow。

## 必填 Secrets

在 GitHub 仓库的 `Settings` → `Secrets and variables` → `Actions` → `New repository secret` 中配置以下 Secrets。

| Secret                      | 说明                    |
| --------------------------- | ----------------------- |
| `ANDROID_KEYSTORE_BASE64`   | Keystore 的 Base64 编码 |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore 密码           |
| `ANDROID_KEY_ALIAS`         | Key 别名                |
| `ANDROID_KEY_PASSWORD`      | Key 密码                |

本地生成结果保存在 `android/keystore/android-release-secrets.txt`。该文件只用于复制到 GitHub Actions Secrets，禁止提交到仓库。

## Base64 生成

Windows PowerShell：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("android\keystore\release.jks")) | Set-Content -Encoding ascii android\keystore\ANDROID_KEYSTORE_BASE64.txt
```

把 `ANDROID_KEYSTORE_BASE64.txt` 的完整内容填入 `ANDROID_KEYSTORE_BASE64`，其余三项按 `android-release-secrets.txt` 或本地 `android/keystore.properties` 中的密码和别名填写。

## 触发方式

- 自动发布：推送 `v3.0.0-rc.1`、`v3.0.1` 或 `android-v3.0.1` 标签。
- 手动构建：进入 `Actions` → `Android Release` → `Run workflow`。
- 桌面端构建：只有手动运行 `Desktop Release (Manual Only)` 才会构建 macOS / Windows / Linux。

## 本地验证

生成 `android/keystore.properties` 后，可直接执行：

```bash
pnpm format
pnpm lint
pnpm build
pnpm android:apk:all
```

构建完成后，签名 APK 会输出到 `android/dist/apk/release/`。

## 常见失败

- `缺少 GitHub Actions Secret`：补齐提示中对应的 Secret。
- `Keystore was tampered with, or password was incorrect`：检查 keystore 密码或 Base64 内容是否复制完整。
- `Cannot recover key`：检查 `ANDROID_KEY_PASSWORD` 和 `ANDROID_KEY_ALIAS`。
- 没有分架构 APK：确认运行的是 `Android Release`，并查看 `Build Android split APKs` Job 下的三个上传步骤。
