# Beta71 Android CI 平台文件审计计划

## 背景

GitHub Actions 在 `Build arm64-v8a / armeabi-v7a / x86_64 APKs` 步骤失败，日志显示 `src/App.vue` 引用了 `@/platform/android/scrollLock`，但提交目录中缺少 `src/platform/android/scrollLock.ts`。本地开发目录存在该文件，说明问题来自提交目录同步遗漏，而不是源码逻辑本身。

## 目标

- 补齐 Android 平台侧运行时文件，确保 CI 的 Linux 大小写敏感环境可以正常解析导入。
- 同步 `src/platform/android` 下的 Android 专用能力文件，避免后续继续出现本地存在、提交缺失的问题。
- 将版本推进到 `v3.0.0-rc.3-Beta71`，用于重新触发 GitHub Actions 分架构构建。
- 本地至少验证 `pnpm format`、`pnpm lint`、`pnpm build` 与 `pnpm android:prepareWeb`。

## 实现

- 同步缺失的 `src/platform/android/scrollLock.ts`。
- 同步 Android 平台目录中与当前 `App.vue` 导入相关的文件。
- 检查提交目录中是否存在 `src/platform/android/scrollLock.ts`。
- README 更新 Beta71 CI 修复说明。

## 验证

- 运行 `pnpm format`。
- 运行 `pnpm lint`。
- 运行 `pnpm build`。
- 运行 `pnpm android:prepareWeb`，复现 CI 的前端 Android Web 构建入口。
