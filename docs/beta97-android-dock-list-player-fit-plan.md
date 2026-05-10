# Beta97 Android 底部 Dock 与播放页修复计划

## 目标

- 修复歌曲列表内容露到底部播放器后方的问题。
- 拉开底部播放器卡片和底部导航栏之间的距离。
- 修复手机竖屏播放页封面被低高度规则过度缩小。
- 保持播放页禁止上下拖动和歌词页横滑逻辑不变。

## 实现

- 主内容区底部在 `mobile-stable-dock-height` 外追加 `android-dock-clearance`。
- Android dock gap 提升到更舒适的触控间距。
- 虚拟歌曲列表底部 padding 提升到接近完整 dock 高度。
- 歌单浮动操作按钮根据 dock 高度上移。
- 竖屏播放页低高度兜底从 760px 下调到 700px，普通手机使用更大的封面预算。

## 验证

- `pnpm format`
- `pnpm lint`
- `pnpm build`
- `pnpm android:apk:all`
- 手机和平板虚拟机安装启动验证
