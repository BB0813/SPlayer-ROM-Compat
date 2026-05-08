# Beta72 Android 低分辨率窄屏排版修复计划

## 背景

测试反馈低分辨率设备宽度较窄时首页歌单卡片排布怪异。截图中两列卡片被拉到左右两侧，中间留白过大，卡片没有吃满列宽；顶部搜索区在窄屏下也容易被右侧用户、设置、菜单按钮挤压。

## 目标

- 将版本推进到 `v3.0.0-rc.3-Beta72`。
- 新增 Android 窄屏宽度标记，区分低宽度和低分辨率场景。
- 修复首页、发现页等封面网格在窄屏下的两列排布，让卡片占满列宽并收敛间距。
- 收紧顶部导航在窄屏下的按钮、搜索框和间距，避免视觉拥挤。
- 保持平板与常规手机布局不被本次窄屏修复影响。

## 实现

- 在 Android viewport 同步逻辑中新增 `android-narrow-width`、`android-tiny-width`、`android-low-resolution` class。
- 调整 `CoverList` 移动端网格：窄屏统一两列、取消 `space-between`、改为 `stretch` 填满列宽。
- 在 Android 全局样式中补充高优先级窄屏覆盖，防止旧的全局覆盖重新把网格拉开。
- 优化窄屏导航：降低左右挤压，搜索框使用剩余空间，右侧操作按钮保持 44px 触控目标。

## 验证

- `pnpm format`
- `pnpm lint`
- `pnpm build`
- `pnpm android:prepareWeb`
