# Beta99 Android 底部 Dock 视觉间距修复计划

## 目标

- 修复手机和平板底部框选区域视觉高度过大的问题。
- 保持列表不会被播放器和导航遮挡。
- 调整手机播放页上下间隔，让封面、信息、进度条和控制区更均衡。

## 实现

- 降低 `--android-dock-gap` 和 `--android-dock-clearance`。
- 降低 Android 播放器卡片高度和紧凑卡片高度。
- 列表滚动 padding 只小幅收敛，避免重新遮挡最后几行。
- 播放页竖屏压缩顶部和底部留白，并适度放大封面预算。

## 验证

- `pnpm format`
- `pnpm lint`
- `pnpm build`
- `pnpm android:apk:all`
- 手机和平板虚拟机安装启动验证
