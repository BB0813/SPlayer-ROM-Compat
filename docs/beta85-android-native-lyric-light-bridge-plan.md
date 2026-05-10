# Beta85 Android 原生歌词轻量 Bridge 计划

## 目标

- 降低原生全屏播放页打开时的 Web Bridge 同步压力。
- 歌词行变化时只同步歌词片段，不再重复发送歌曲、封面、主题色和播放状态。
- 保持播放进度仍由原生 `progressTicker` 读取 `AndroidNativeAudioPlayer`。
- 为后续歌词页进一步原生化留下独立接口。

## 本阶段改动

- 新增 `AndroidNativePlayerPageLyricState` 类型，单独描述原生歌词片段。
- Android Bridge 新增 `updateNativePlayerLyricState` 方法。
- Kotlin 原生全屏播放页新增 `updateLyricState`，只刷新上一行、当前行和下一行歌词。
- Web 侧新增 `syncAndroidNativePlayerPageLyricFromStores`，只构建歌词上下文并同步到原生层。
- `App.vue` 中歌词索引单独变化时走轻量歌词同步，性能模式下继续保留节流。

## 验证重点

- 打开原生播放页后，歌词切换仍能刷新上一行、当前行、下一行。
- 歌词变化时不再触发完整原生播放页状态同步。
- 播放进度仍由原生层自动刷新。
- 切歌、暂停、播放和封面变化仍会触发完整状态同步。
- Android Kotlin 编译通过。

## 后续计划

- Beta86 继续处理国内 ROM 媒体控制状态一致性。
- Beta87 评估播放队列的原生轻量列表入口。
- Beta88 继续压缩 WebView 播放中页面动态组件负载。
