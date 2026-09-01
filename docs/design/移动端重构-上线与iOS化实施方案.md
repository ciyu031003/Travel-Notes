# 移动端重构 · 上线修复 + iOS 级体验实施方案

> **文档版本**: v1.0
> **日期**: 2026-09-01
> **范围**: 甜途移动端（Capacitor Android 壳 + 静态导出 www/）——「能正常上线显示内容」+「iOS 级丝滑/美观」重构
> **方法**: impeccable（既有视觉系统精修+扩展，Operate 模式）+ ui-ux-pro-max（移动端规则）
> **关联**: docs/design/移动端UI优化-实施计划.md（v1.1 已落地 M1~M9）、docs/design/UI-V3-全面优化方案.md、docs/PERFORMANCE_SCALING_REVIEW.md（阶段 A 已完成）
> **状态**: 待确认后实施

---

## 0. 结论速览

1. **移动端「显示不了内容」是三个真实阻断点，不是 UI 问题**：
   - ① API 返回的媒体 URL 是相对路径（`/uploads/...`），壳内源是 localhost → 图片/视频/封面**全部 404**（最核心）；
   - ② App 登录 Cookie 已设 `SameSite=None`，但**必须配 `Secure`**，生产 `COOKIE_SECURE` 若为 false，WebView 会拒收 Cookie → 登录态丢失；
   - ③ `www/` 是 8/23 的陈旧导出 + APK/OTA 构建号未更新 + Service Worker 可能缓存旧壳。
2. **先修阻断（M0，1~2 天内可完成并上线验证），再做 iOS 化重构（M1~M5）**。阻断不修，UI 做得再漂亮也看不到内容。
3. iOS 化核心不是「换肤」，而是建立**移动端设计系统**：语义 token + 组件库（BottomSheet/ActionSheet/Toast/Skeleton/PullToRefresh/SegmentedControl）+ **spring 动效 + 触觉反馈** + 安全区 + 骨架/空态/下拉刷新等原生心智。
4. 桌面端原则：**视觉零回归**（共享组件只加不改默认行为，移动端差异走 `md:` 断点或平台分支）。

---

## 1. 现状盘点（移动端真实链路）

```
Capacitor Android WebView（源 http(s)://localhost）
   │  加载 www/（next build output:export 静态壳，8/23 构建）
   ▼
页面 = 客户端组件 + useEffect/useApi 拉取
   │  NEXT_PUBLIC_API_BASE=https://travel-notes.yuanabd.cn（构建时注入）
   ▼
服务器 API（/api/*）→ 返回 JSON（媒体 URL 为相对路径 /uploads/...）
   │  CORS：middleware 放行 localhost + 站点域名；Cookie SameSite=None（app 登录）
   ▼
<Image src="/uploads/...">  →  解析为 http://localhost/uploads/...  → 404 ❌
```

---

## 2. 上线阻断点诊断（P0，必须修复）

### B1 · 媒体 URL 相对路径 → 壳内 404（最核心）

**证据**：
- 服务端 `mediaUrl()`（social.service）、`mediaPublicUrl()`（album.service）、`resolveImageUrl()`（profile.service）、`toImageUrl()/parseImages()`（post-repository）、travel-book 的 `mediaUrl()` 均返回 `/uploads/...` 相对路径；变体 URL `/api/uploads/...`（media-variants）同理。
- 客户端 22 处 `next/image` + 若干 `<img>` 直接用服务端返回的 src；壳内页面源是 localhost，相对路径全部解析到本地壳 → 404。
- 无 `<base>` 标签、无全局相对→绝对解析（离线 hook `useLocalMediaUrls` 只覆盖离线命中场景，不解决在线相对路径）。

**修复方案（服务端收敛，一处 helper 全局生效）**：
- 新增 `lib/media-url.ts`：`absoluteMediaUrl(url)` —— 以 `NEXT_PUBLIC_SITE_URL`（缺省 `NEXT_PUBLIC_API_BASE`）为基，把以 `/` 开头的相对 URL（`/uploads/**`、`/api/images/N`）补成绝对地址；已是绝对地址的（对象存储/CDN URL）原样返回。
- 替换上述 5 处 URL 构造函数的返回值出口（集中在 service/repository 层，客户端组件零改动；Web 同源绝对 URL 无副作用）。
- **验收**：真机 App 登录后，首页封面、旅行圈卡片、相册、画册、我的头像/封面、碎碎念图片全部可显示；Web 截图对比零回归。

### B2 · App 登录 Cookie：SameSite=None 必须配 Secure

**证据**：`app/api/login/route.ts` 已对 `clientType:'app'` 设 `sameSite:'none'`；但 `secure: process.env.COOKIE_SECURE === 'true'`，compose 默认 `COOKIE_SECURE=false`。Chromium/WebView 对 `SameSite=None` 且无 `Secure` 的 Cookie **直接拒收** → 登录成功但无会话 → 所有带凭据请求 401/匿名。

**修复**：生产 `.env` 设 `COOKIE_SECURE=true`（域名已 HTTPS，安全）；同时在登录路由加一行注释/日志防止误配；可选在 `/api/version` 返回 `cookieSecure` 供 App 自检。

**验收**：App 登录 → 杀掉进程重开 → 仍保持登录态（API 返回个人信息）。

### B3 · 陈旧壳 + APK/OTA 版本

**证据**：`www/` 8/23 构建，落后当前代码约 8 个版本；`APP_BUILD_NUMBER` 服务端默认 5；`APP_DOWNLOAD_URL` 指向 `/downloads/tiantu.apk`。

**修复**：
1. 重跑 `NEXT_PUBLIC_API_BASE=https://travel-notes.yuanabd.cn node scripts/build-mobile.cjs`（含阶段 A 的缓存头/取数层代码）。
2. `npx cap sync android` 同步原生工程；`cd android && ./gradlew assembleRelease`（或现有打包脚本）产出 APK。
3. 上传 APK 到服务器 `/downloads/tiantu.apk`（需 nginx 静态目录 + 大小写一致），服务端 `APP_BUILD_NUMBER` 递增（5→6）并更新 `APP_VERSION`。
4. OTA 自检：旧 App 启动 → 拉到新版 → 弹「发现新版本」。

**验收**：旧 APK 提示更新；新 APK 安装后壳为最新代码。

### B4 · Service Worker 缓存旧壳

**证据**：`public/register-sw.js` 在安全上下文注册 `/sw.js`（网络优先+缓存回退）；壳内（localhost 为安全上下文）会注册，SW 缓存可能让新 APK 加载旧资源/旧页面。

**修复**：`register-sw.js` 增加「原生容器跳过注册」判断（`window.Capacitor?.isNativePlatform()` 时直接 return）；SW 版本常量 `tiantu-shell-v1` 随构建递增（可由构建脚本注入 hash）。

**验收**：App 内 `navigator.serviceWorker.controller` 为 null；Web 端 PWA 行为不变。

---

## 3. iOS 化设计系统（M1 · 先立标准再改页面）

### 3.1 移动端语义 token（在 tailwind 现有 travel/shell 体系上增补）

| 层 | 亮色 | 暗色 | 用途 |
|---|---|---|---|
| `--mob-bg` | #FAF6EE | #0E0C0A | 页面背景（延续暖陶土） |
| `--mob-surface` | #FFFFFF | #1A1613 | 卡片/抽屉 |
| `--mob-surface-2` | #F5EDE4 | #241E1A | 次级表面 |
| `--mob-sep` | rgba(90,74,58,0.10) | rgba(255,255,255,0.08) | 分隔线 |
| `--mob-text` / `--mob-text-2` | #3B3228 / #8B7355 | #F3EFE9 / #A89A8A | 主/次文字（对比度 ≥4.5:1） |
| `--mob-tint` | #A85F3A | #C97E55 | 选中 tint（底部 Tab、开关、强调） |
| `--mob-blur` | rgba(250,246,238,0.78) | rgba(14,12,10,0.78) | 毛玻璃表面 |

落地：`app/globals.css` :root 增补 + tailwind.config 扩展 `mob-*` 语义色；**组件内禁止再出现硬编码 hex**（ui-ux-pro-max：token-driven theming）。

### 3.2 移动端基础组件库（新增 `components/mobile/`）

| 组件 | 说明 | iOS 心智 |
|---|---|---|
| `BottomSheet` | 底部卡片抽屉：圆角 20、背景毛玻璃、拖拽把手、遮罩点击关闭、内容安全区 | iOS Sheet |
| `ActionSheet` | 底部操作菜单（取消/危险项红色） | iOS Action Sheet |
| `Toast` / `HUD` | 轻提示 / 加载 HUD（原生感） | iOS Toast/HUD |
| `Skeleton` | 骨架屏（shimmer，占位防 CLS） | 原生加载占位 |
| `PullToRefresh` | 下拉刷新（原生滚动触发 + 触觉反馈） | iOS 下拉刷新 |
| `SegmentedControl` | 分段选择器（tint 滑块） | iOS Segmented |
| `Switch` | 开关（已存在于 SyncCenter，抽公共组件 + 动效） | iOS Switch |
| `EmptyState` | 空态插画 + 文案 + 行动按钮 | 原生空态 |
| `LargeTitle` | 大标题 + 滚动压缩（sticky 小标题） | iOS Large Title |
| `Pressable` | 统一按压反馈（scale 0.97 + 触觉） | iOS 按压 |
| `SwipeRow`（可选） | 侧滑操作（删除/置顶） | iOS Swipe |

统一触达目标：**最小 44×44pt**；点击反馈：transform scale + opacity（0ms 无反馈是反模式）。

### 3.3 底部 Tab Bar 重构（`components/layout/MobileBottomNav.tsx`）

现状：5 项 grid + 高亮缩放，无按压/无毛玻璃分层。
目标（iOS 风格）：
- 毛玻璃背景（`backdrop-blur` + 半透明 token）+ 顶部 0.5px 分隔；
- 选中：tint 图标 + 标签，spring 弹跳（`motion` 的 layoutId 滑块或 scale spring）；
- 未选中：次级色；按压：scale(0.92) + Haptics.lightImpact()；
- 安全区：`pb-[env(safe-area-inset-bottom)]` + Home 指示条避让；
- 首启 Tab 渲染：保留各 Tab 本地状态（用 `display:none` 保持或简单方案先不做）。

### 3.4 动效规范（motion 库已装，统一封装）

- **缓动**：iOS 弹簧 ≈ `spring({ stiffness: 350, damping: 30 })`（入场/弹窗/图标）；`spring({ stiffness: 600, damping: 40 })`（按压回弹）。
- **时长**：微交互 120~200ms；转场 250~350ms；**不要全部用一个时长**（ui-ux-pro-max 反模式）。
- **页面转场**：移动端壳内切 Tab 用 fade+8px slide（轻量）；详情/二级页 push 用 slide-from-right（iOS push 心智）。
- **列表入场**：首屏卡片 stagger（每项 30~40ms 延迟，仅首帧，避免滚动时重复触发）。
- **图片过渡**：占位→实图 crossfade（现有 sketchbook/travel-book 已做，推广到 feed/相册卡片）。
- **降级**：`prefers-reduced-motion: reduce` 全部禁用动画（已部分具备，补全到新组件）。
- **性能**：只用 transform/opacity 合成；避免动 width/height。

### 3.5 触觉反馈（新增 `lib/mobile/haptics.ts`）

- 引入 `@capacitor/haptics`（需 npm 安装 + cap sync）；
- 封装 `hapticLight()/hapticMedium()/hapticSuccess()/hapticError()`，Web 端 no-op；
- 触点：Tab 切换 light、按压按钮 light、下拉刷新触发 medium、登录成功 success、失败 error、评论/点赞成功 light。

### 3.6 安全区与键盘

- 全局：`viewport-fit=cover` + 固定栏 `env(safe-area-inset-*)`；
- 底部 Tab 栏避让 Home 条；顶部大标题避让状态栏；键盘弹出时表单避让（`visualViewport` 或 CSS dvh）。

---

## 4. 页面级重构（M2~M3）

> 原则：70% 保留既有叙事（地图入口、卡片叙事、旅行故事感），30% 重构移动形态；不模仿小红书/SaaS。

### M2 · 五个 Tab 页（首页 / 旅行 / 旅行圈 / 时间线 / 我的）

| 页 | 现状要点 | 移动端改造 |
|---|---|---|
| 首页 / | HomeClient + Danmaku + 足迹地图 | 大标题「行迹」+ 顶部问候；卡片化旅行故事流；骨架屏；下拉刷新；Danmaku 改底部小浮层 |
| 旅行 /travel | 地图+列表（移动端 40vh 地图前置，已 M1~M9 优化） | 保持地图入口决策；列表卡片 iOS 化（圆角/阴影/间距 8dp）；按压反馈；骨架 |
| 旅行圈 /circle | TravelCircleFeed 卡片流 | 大标题 + Segmented（推荐/最新/热门/关注）；hero 紧凑化；标签 chip 可点；下拉刷新 + 骨架 |
| 时间线 /timeline | 年份时间线 | 年份 section 大标题；条目 iOS 卡片化；骨架 |
| 我的 /me | MeHome 统计卡 | 大标题 + 个人卡片（头像/昵称/签名）；统计宫格；列表入口（相册/收藏/通知/同步/设置）圆角分组 |

### M3 · 二级页与模块

- **登录门 /login**：已是电影化开门动画，保留；表单 iOS 化（圆角/聚焦高亮/键盘避让/错误内联）。
- **相册 /album、画册 /travel-book**：相册锁 BottomSheet 化；照片墙/翻页已打磨，补安全区与按压。
- **搜索 /search**：iOS 搜索栏（大标题内嵌）+ 结果骨架。
- **碎碎念 /moments**：时间线卡片 + 下拉刷新 + 发布浮层 BottomSheet。
- **同步中心 /sync**：现有实现已较完整，统一到新组件库（Switch/Segmented/卡片圆角）。
- **详情页 /circle/[postId]、旅行详情 /travel/[slug]**：push 转场 + 图片跨页过渡。

---

## 5. 里程碑与验收

| 里程碑 | 内容 | 验收标准 |
|---|---|---|
| **M0 上线修复** | B1~B4：绝对媒体 URL、COOKIE_SECURE、重建壳/APK/OTA、SW 跳过 | 真机：登录→首页/旅行圈/相册/画册/我的图片视频全部显示；杀进程重开保持登录；旧 APK 收到更新提示；Web 零回归 |
| **M1 设计系统** | token + 组件库（BottomSheet/ActionSheet/Toast/Skeleton/PullToRefresh/Segmented/Switch/EmptyState/LargeTitle/Pressable）+ Tab Bar 重构 + 安全区 + haptics | 组件在 360/390/412 三档可用；触达 ≥44px；对比度 ≥4.5:1 双主题；无硬编码 hex |
| **M2 五 Tab 页** | 首页/旅行/旅行圈/时间线/我的重构 | 每页：大标题 + 骨架 + 空态 + 下拉刷新 + 按压反馈；首屏 1.5s 内可交互（弱网 3s） |
| **M3 二级页** | 登录/相册/搜索/碎碎念/同步/详情 | iOS 化交互；锁/抽屉/弹层均含安全区与动效 |
| **M4 动效触觉** | 页面转场、stagger、弹簧、Haptics、数字动画、reduce-motion | 60fps（DevTools/真机无卡顿）；reduce-motion 下零动画 |
| **M5 发布** | 重建 www + cap sync + APK + OTA 版本递增 + 部署 | 新 APK 安装可更新；OTA 提示正常；health ok |

**工程验收**：`tsc --noEmit` 0 错误；`npm test` 全绿；`npm run lint` 无新增告警；`SKIP_DB_ON_BUILD=1 next build` 通过；移动端 `build-mobile.cjs` 产出 www/ 且 `cap sync` 无 diff 异常。

---

## 6. 涉及文件清单（首轮 M0 预估）

- **B1 媒体绝对 URL**：新增 `lib/media-url.ts`；修改 `lib/modules/social/social.service.ts`、`lib/modules/social/profile.service.ts`、`lib/modules/album/album.service.ts`、`lib/modules/album/travel-book.service.ts`、`lib/repositories/post-repository.ts`、`lib/infrastructure/media-variants.ts`（变体 URL 出口）。
- **B2 Cookie**：`docker-compose.yml`/部署文档说明 + `app/api/login/route.ts` 注释（生产 .env 由运维改）。
- **B3 构建发布**：`scripts/build-mobile.cjs`、`lib/app-version.ts`（版本递增）、部署脚本/nginx（/downloads 静态目录）。
- **B4 SW**：`public/register-sw.js`、`public/sw.js`（版本 hash）。
- **设计系统**：`app/globals.css`、`tailwind.config.js`、新增 `components/mobile/*`、`components/layout/MobileBottomNav.tsx`、`lib/mobile/haptics.ts`、`package.json`（@capacitor/haptics）。

---

## 7. 风险与待确认

1. **媒体绝对 URL 改动影响 Web 端**：Web 同源绝对 URL 无副作用，但需回归对比（screenshot diff）。
2. **COOKIE_SECURE=true 后 Web 端**：Web 同源 HTTPS 不受影响；HTTP 直连（IP:8443 已 HTTPS）也不受影响；纯 HTTP 内网调试需临时 false（记录在部署文档）。
3. **移动端「游客可浏览公开内容」还是「强制登录」**：建议保留现状（游客看公开内容，登录看全部），仅优化登录引导。
4. **SW 在壳内禁用后**：PWA 能力（Web 端）不受影响；移动端离线靠原生 SQLite 缓存（非 SW），无功能损失。
5. **APK 分发**：`/downloads/tiantu.apk` 需 nginx 可访问 + 文件大小（几十 MB）注意带宽；可后续换应用市场/私有分发。
6. **impeccable 版本**：检测到更新可用（v4.0.4 → v4.1.2），是否现在更新？（仅影响后续会话，不阻塞本方案）

---

*— 方案待确认，确认后按 M0 → M5 顺序实施 —*


---

## 8. M0 实施记录（2026-09-01）

> M0 上线修复已实施并通过 `tsc --noEmit`（0 错误）、`vitest run`（137 用例全绿）、`next lint`（无新增告警）、`build-mobile.cjs`（www/ 重建成功）。

| 项 | 状态 | 落地内容 |
|---|---|---|
| B1 媒体绝对 URL | ✅ | 新增 `lib/media-url.ts`（`siteBaseUrl`/`absoluteMediaUrl`）；接入 5 处出口：social.service（mediaUrl/avatarUrl/postImages/coverUrl）、profile.service（resolveImageUrl/avatarUrl）、album.service（mediaPublicUrl）、travel-book.service（mediaUrl/变体 URL/cover）、post-repository（toImageUrl/parseImages）；新增 `tests/unit/media-url.test.ts`（7 用例） |
| B2 Cookie Secure | ✅ | `app/api/login/route.ts`：`clientType==='app'` 时强制 `secure:true`（SameSite=None 必须配 Secure）；Web 端仍由 `COOKIE_SECURE` 控制；compose/部署文档补充说明 |
| B3 重建壳/版本 | ✅ | `build-mobile.cjs` 以 `NEXT_PUBLIC_API_BASE=https://travel-notes.yuanabd.cn` 重建 `www/`（含阶段 A + M0 全部代码）；`APP_BUILD_NUMBER` 默认 5→6（`lib/app-version.ts` + 构建脚本透传）；docker-compose 增加 `APP_VERSION/APP_BUILD_NUMBER/APP_DOWNLOAD_URL` 透传；部署文档补充 OTA 说明 |
| B4 SW 跳过 | ✅ | `public/register-sw.js`：原生容器（`window.Capacitor.isNativePlatform()`）跳过 SW 注册；`public/sw.js` 缓存名 v1→v2（清旧缓存）；`www/` 已同步新文件 |
| 产品规则（记录需登录） | ✅ | `components/travel/TravelComposer.tsx`：点击「新建旅行」先查 `/api/check-auth`，未登录跳 `/login?redirect=/travel`；游客仍可浏览公开内容 |

### 8.1 仍需在服务器侧完成的手动步骤（本机无法执行）

1. **部署代码**：`docker compose up -d --build app`（含 B1/B2/B3/B4 代码 + compose 新变量）。
2. **确认生产 `.env`**：建议设 `COOKIE_SECURE=true`（B2 代码已对 App 端强制 Secure，Web 端按此配置）；`APP_VERSION=3.0.1`、`APP_BUILD_NUMBER=6`、`APP_DOWNLOAD_URL` 指向可访问的 APK。
3. **打 APK 并上传**：`npx cap sync android && cd android && ./gradlew assembleRelease` → 产出 APK → 上传到服务器 `/downloads/tiantu.apk`（需 nginx 静态目录）。
4. **验收**：真机安装新 APK → 游客浏览公开内容（图片正常）→ 登录 → 杀进程重开保持登录态 → 点「新建旅行」无需重复登录；旧 APK 启动收到 OTA 更新提示。
