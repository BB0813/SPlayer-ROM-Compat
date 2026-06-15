# 更新日志

## [3.0.0-rc.3-Beta101] - 2026-06-15

### 🐛 修复

- **Android 歌单广场数据加载失败**：修复 Android bridge 响应包装导致 `playlists.vue`、`toplists.vue`、`new.vue`、`data.ts` 无法正确读取数据的问题，添加 `unwrapResponse` 解包逻辑
- **搜索页无关键词时跳转 403**：移除 `/search` 路由的 `beforeEnter` 守卫，允许无参数访问搜索页
- **设置/主题配置模态框无法打开**：添加安全超时机制防止 `isModalOpen` 标志卡住
- **设置下拉菜单图标对齐问题**：修复 `.n-dropdown-option-body` 布局为 flex，统一图标尺寸 20px，增加菜单项间距和左侧内边距

### ✨ 优化

- 播放器移动端全屏组件添加无障碍属性（`role="button"`、`aria-label`）
- 播放列表抽屉宽度改为响应式 `min(400px, 85vw)`
- 设置页面滑块组件尺寸优化
- 封面切换过渡动画由 0.1s 调整为 0.3s
- 移除多处调试用 `console.log`

### 🔧 其他

- MPV 播放器新增 seeking/seeked/waiting/volumechange/playing/emptied 事件支持
- MPV IPC 新增 `mpv-set-audio-delay` 音频延迟设置
- AudioManager 交叉淡入淡出旧引擎销毁定时器优化
- DownloadManager 下载取消功能完善
- FFmpegAudioPlayer 新增错误码追踪
- AudioElementPlayer seek 方法新增 `immediate` 参数
- `.gitignore` 更新：忽略测试报告产物和 TypeScript 构建缓存
