# Beta96 Android 播放页与底部组件修复计划

## 目标

- 修复手机端竖屏播放页控制区显示不全。
- 修复底部播放器卡片与底部导航栏过挤。
- 保留播放页禁止上下拖动和横向切换歌词页能力。

## 实现

- 播放页根节点绑定 `visualViewport` 实际高度，生成 `--player-mobile-viewport-height`。
- 竖屏播放页统一使用高度预算变量控制顶部、封面、间距和底部安全区。
- 低高度竖屏增加二级兜底，避免控制按钮被裁切。
- Android dock gap 提升到更舒适的触控间距。

## 验证

- `pnpm format`
- `pnpm lint`
- `pnpm build`
- `pnpm android:apk:all`
- 手机和平板虚拟机安装启动验证
