# Beta88 Android 播放中动态负载压缩方案

## 背景

测试用户反馈播放音乐后首页、歌单页、设置页仍存在明显卡顿。前几个版本已经把底部播放条、播放页和部分动画迁移或降频，但 WebView 内仍有装饰性动画、数字动画、跑马灯文本和高成本滤镜在播放中持续刷新。

## 目标

- 播放中降低 WebView 的非关键动态渲染负载。
- 不隐藏页面、不冻结路由、不改变主要布局结构。
- 保留点击、滚动、切页、播放控制等核心交互。
- 为后续原生化阶段继续收敛高频渲染点。

## 实施范围

1. 在 Android 性能策略中增加“暂停装饰动画”的语义状态。
2. 播放中暂停文本跑马灯，避免 `requestAnimationFrame` 持续刷新。
3. 播放中用户组件统计数字改为静态显示，避免数字动画。
4. 播放中统一关闭非关键过渡、滤镜、毛玻璃和骨架动画。
5. 更新 README 与版本号到 `3.0.0-rc.3-Beta88`。

## 风险控制

- 不恢复 `shouldFreezeRoutes`，避免出现“播放后主页消失”的回归。
- 不使用 `display: none` 隐藏主页面、列表或设置项。
- 仅处理装饰层动画，不改动播放 API 与列表数据请求逻辑。

## 验证项

- `pnpm format`
- `pnpm lint`
- `pnpm build`
- `pnpm android:prepareWeb`
- `pnpm android:gradle -- :app:compileReleaseKotlin`
