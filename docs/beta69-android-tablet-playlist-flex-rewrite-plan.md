# Beta69 Android 平板歌单页 Flex 重写计划

## 背景

Beta68 在平板横屏下仍出现歌单详情头部压扁、歌曲列表下沉、底部导航遮挡列表项的问题。截图显示旧方案仍依赖 JS 像素高度与组件自身 `height: 100%` 混算，横屏平板容易出现父级高度不确定。

## 目标

- 歌单详情页根节点固定为 `height: 100%` 的纵向 flex 容器。
- 详情头部只占用明确的固定高度，封面、标题、按钮在同一高度内稳定排布。
- 歌曲列表区域改为 flex 填充剩余空间，不再让外层 wrapper 写死 JS 高度。
- 保留 Android UI 缩放能力，横屏和竖屏使用不同的封面与头部高度变量。

## 实现

- `useListDetail` 的平板识别阈值统一到 `600dp`，与根节点 `android-tablet-layout` 保持一致。
- `SongList` 在 Android 平板模式下把外层虚拟列表 wrapper 改为 `auto + flex`，由父级 flex 负责分配真实剩余空间。
- `main.scss` 新增 Beta69 覆盖规则，重写 `.router-view.playlist-list`、`.list-detail`、`.song-list` 的高度链路，并清掉旧的 `240px` 顶部挤压。
- 详情封面新增独立变量，强制 `n-image` 和内部 `img` 填满封面容器，避免再次被压成横条。

## 验证

- 运行 `pnpm format`。
- 运行 `pnpm lint`。
- 运行 `pnpm build`。
- 构建 `x86_64` APK 并安装到手机、平板虚拟机。
- 重点检查平板横屏歌单页：详情头部、列表顶部、底部导航避让、横向溢出。
