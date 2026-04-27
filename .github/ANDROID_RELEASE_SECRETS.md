# Android Release Secrets

CI 自动打包需要在 GitHub 仓库的 `Settings` → `Secrets and variables` → `Actions` → `New repository secret` 中配置以下 Secrets。

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

把 `ANDROID_KEYSTORE_BASE64.txt` 的完整内容填入 `ANDROID_KEYSTORE_BASE64`，其余三项按 `android-release-secrets.txt` 中的密码和别名填写。

## 本地验证

生成 `android/keystore.properties` 后，可直接执行：

```bash
pnpm android:apk:all
```

构建完成后，签名 APK 会输出到 `android/dist/apk/release/`。
