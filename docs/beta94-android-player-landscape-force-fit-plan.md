# Beta94 Android 播放页横屏强制适配方案

## 问题

- Beta93 只依赖全局 `android-landscape` 类和 CSS 媒体查询兜底。
- 用户实测横屏仍然显示竖屏纵向排版，说明运行态样式没有稳定命中。
- 播放页已禁止上下拖动，因此竖屏排版在横屏高度下会直接裁掉控制区。

## 实现

- 在 `FullPlayerMobile.vue` 内读取 `visualViewport`、`innerWidth` 和 `innerHeight`。
- 根据实时视口宽高计算 `isLandscapeFit`。
- 横屏时给播放页根节点添加 `landscape-fit` 本地类。
- 使用本地 scoped 样式强制播放页切换为双栏布局，绕开全局类失效问题。

## 验证

- 横屏播放页必须强制显示为左封面、右信息与控制区。
- 横屏下封面、歌曲信息、进度条和播放控制区必须完整可见。
- 播放页仍不能上下拖动。
- 左右滑动歌词页仍可用。
