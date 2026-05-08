# Beta73 Android CI 桥接文件审计计划

## 背景

GitHub Actions 在 `Build arm64-v8a / armeabi-v7a / x86_64 APKs` 步骤继续失败。新的日志显示 `src/App.vue` 从 `@/platform/bridge/android` 导入了 `getAndroidDisplayMetrics`，但提交目录中的 `src/platform/bridge/android.ts` 没有导出该函数。

本地开发目录可以通过构建，说明问题仍然是开发目录和 GitHub 提交目录之间存在平台文件同步漂移，不是业务代码逻辑本身失败。

## 目标

- 将版本推进到 `v3.0.0-rc.3-Beta73`。
- 同步 `src/platform/bridge/android.ts` 与 `src/platform/bridge/types.ts`。
- 继续确认 `src/platform/android/scrollLock.ts` 已存在并被 Git 追踪。
- 在提交目录直接运行 Android Web 构建准备，提前复现 CI 的 Vite 导入检查。

## 实现

- 补齐 `getAndroidDisplayMetrics` 相关导出和类型定义。
- 更新 README 的 Beta73 CI 修复说明。
- 同步开发目录与提交目录的 Android 平台桥接文件。

## 验证

- `pnpm format`
- `pnpm lint`
- `pnpm build`
- 在提交目录运行 `pnpm android:prepareWeb`
