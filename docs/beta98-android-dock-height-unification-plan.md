# Beta98 Android 底部 Dock 高度统一计划

## 目标

- 统一底部播放器、底部导航、内容避让和列表浮动按钮的高度链路。
- 避免播放器卡片实际高度和内容避让估算高度不一致。
- 继续减少手机和平板端底部遮挡、露出列表项的问题。

## 实现

- 新增 `--mobile-tabbar-bottom`、`--mobile-player-bottom`、`--mobile-dock-content-height`。
- 明确定义 `--android-player-card-height` 与 `--android-player-card-compact-height`。
- `MobileTabBar`、`MainPlayer`、`AppLayout` 和 `SongList` 统一引用底部 dock 变量。
- 平板横屏、平板竖屏、手机列表继续使用分档底部 padding。

## 验证

- `pnpm format`
- `pnpm lint`
- `pnpm build`
- `pnpm android:apk:all`
- 手机和平板虚拟机安装启动验证
