# Beta74 Android 白屏与原生桥接同步修复计划

## 背景

测试反馈 Beta73 安装后进入全白屏。截图显示应用卡片仍存在但 WebView 内容为空，符合渲染进程启动期异常的表现。

排查发现提交目录中的 `src/platform/bridge/android.ts` 已调用 `getAndroidDisplayMetrics`，但提交目录的原生 `SPlayerSystemBridge.kt` 没有同步对应 `getDisplayMetrics()` 方法。Android WebView 注入的 bridge 对象存在，但方法不存在时，JS 启动期调用会抛出 TypeError，导致 Vue 应用未挂载并白屏。

## 目标

- 将版本推进到 `v3.0.0-rc.3-Beta74`。
- 同步 Android 原生桥接文件，确保 APK 壳和 Web 资源能力一致。
- 补强 Web 端 bridge 调用兜底，即使旧壳缺少新方法也不能白屏。
- 在提交目录验证 Android Web 构建和 Kotlin 编译链路。

## 实现

- 将 `getAndroidDisplayMetrics` 改为方法级可选调用并捕获 native bridge 异常。
- 将 `AndroidSystemBridge.getDisplayMetrics` 类型改为可选方法，匹配旧 APK 壳兼容场景。
- 同步 `SPlayerSystemBridge.kt` 与 `MainActivity.kt` 到提交目录。
- 更新 README 的 Beta74 白屏修复说明。

## 验证

- `pnpm format`
- `pnpm lint`
- `pnpm build`
- `pnpm android:prepareWeb`
- 提交目录运行 `pnpm android:prepareWeb`
- `pnpm android:gradle -- :app:compileReleaseKotlin`
