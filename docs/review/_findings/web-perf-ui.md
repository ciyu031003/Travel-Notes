# Web 性能（模块5）+ UI/UX（模块6）评审发现（web-perf-ui）

> 取证环境：仓库 HEAD `55f8c1b`（2026-10-17），构建产物 `.next` 为 2026-10-17 09:41 构建（BUILD_ID `C7PMRFQPwDN8qwAjUuGWa`），与 HEAD 同日；chunk 体积为 `gzip -9` 本地实测，非线上实测。
> 未运行本地服务（127.0.0.1:3000 未监听），首屏资源量取自 `.next/server/app/*.html` 中真实 `<script>/<link>` 引用。

## 结论速览

本模块的**视觉执行与无障碍基建高于同类项目**：弹层焦点管理、WebGL 资源释放、reduced-motion 设备档位、暗色首帧防闪白都做得相当细。但 App Router 的"服务端能力"基本没用：首页与全部详情页是客户端壳，48 个 `page.tsx` 中 34 个是 `'use client'`，全仓 0 个 `loading/error/not-found`、0 个 `generateMetadata`。最严重的是首屏：首页要付 **240KB gz JS + 43KB gz CSS** 才渲染出骨架，再发一次 `/api/home` 才有内容；`/album` 首屏静态吃进 **three.js（132KB gz）**、`/dashboard` 首屏静态吃进 **570KB 中国 GeoJSON（193KB gz）**——两处"按需加载"被静态 import 链绕过。其次是设计系统有 **11 组色板 + 183 个 CSS 变量**、token 欠债 399 处，admin 仍写死 hex。

## 首屏资源实测（`.next/server/app/*.html` 中真实 script/link，gzip -9 估算）

| 路由 | 首屏 JS（raw / gz） | 首屏 CSS（raw / gz） | script 数 | 主要问题 |
| --- | --- | --- | --- | --- |
| `/` | 753KB / **240KB** | 261KB / 43KB | 17 | 正文只有骨架，内容需再取 `/api/home`（P-01） |
| `/album` | 1446KB / **417KB** | 265KB / 45KB | 22 | 静态吃进 three.js 132KB gz（P-02） |
| `/dashboard` | 1426KB / **470KB** | 261KB / 43KB | 23 | 静态吃进 GeoJSON 193KB gz（P-03） |
| `/travel/[slug]` | 923KB / **289KB** | 287KB / 48KB | 23 | 客户端壳 + KaTeX/hljs CSS 常驻（P-11） |
| `/travel` | 854KB / 272KB | 261KB / 43KB | 22 | 中国地图已正确 dynamic |
| `/circle` | 787KB / 252KB | 261KB / 43KB | 20 | 公开页无 SSR 内容（P-01） |
| `/admin` | 786KB / 251KB | 261KB / 43KB | 20 | 壳层常驻 motion 38.7KB gz（P-06） |
| `/me` | 790KB / 251KB | 261KB / 43KB | 18 | 壳层常驻 motion（P-06） |

> 所有页面共同支付：全局 CSS 261KB raw / 43KB gz（`.next/static/css/9fedcfd0ceae5d3f.css` 239KB + `39d4d4244e5160e9.css` 27.5KB）、React/Next 运行时约 98KB gz、polyfills 38.6KB gz。

## 问题清单

### [🔴] P-01 首屏没有任何服务端内容：首页与公开旅行圈都是"空壳 + 骨架 + 客户端再取数"
- **位置**：`app/page.tsx:1`、`app/page.tsx:14-22`、`app/page.tsx:64-66`、`app/circle/page.tsx:1`；双树 `components/HomeClient.tsx`（648 行）/ `components/HomeMobile.tsx`（535 行）
- **问题描述**：首页整页 `'use client'`，桌面/移动两套页面都 `dynamic(..., { ssr: false })`，数据来自 `useApi(apiUrl('/api/home'))`；`useIsMobile()` 服务端返回 `null`，因此服务端与首帧只渲染 `HomeLoading`。实测 `.next/server/app/index.html` 正文只有 26 个 `m-skeleton` 占位，无任何数据；`circle.html` 可见文本仅 155 字（导航 + "正在翻阅旅行相册…"）。首屏需 753KB raw / **240KB gz JS** + 261KB raw / **43KB gz CSS**，水合后再发 `/api/home`。
- **风险影响**：弱网/低端机上用户先看数秒骨架；禁用 JS 或爬虫抓到的 `/circle`、`/circle/<id>`（`lib/public-paths.ts:71-75` 明确公开）**没有任何内容**，分享收录与首屏体验双输；每次回首页都重走一遍 JS→fetch 链路。
- **改进方案**：① `app/page.tsx` 改 Server Component，直接复用 `/api/home` 背后的 `lib/modules/*` service 取数，作为 props 传给 `HomeClient/HomeMobile`，`ssr:false` 只留给真正的 canvas 场景；② 移动/桌面双树收敛成 CSS 断点 + 少量客户端分支；③ 验证：`curl -s localhost:3000 | grep 省份` 能命中数据，Lighthouse LCP 前后对比。

### [🔴] P-02 /album 首屏仍被 three.js 拖住（dynamic 被静态 import 链绕过）
- **位置**：`app/album/page.tsx:24` 静态 `import PhotoChatView` → `components/album/PhotoChatView.tsx:6` 静态 `import ParticlePhotoBackground` → `components/album/space/ParticlePhotoBackground.tsx:4` `import * as THREE from 'three'`。而 `app/album/page.tsx:34-38` 已对 `GalaxyAlbumScene/TravelStarMap/DriftWall` 做了 `dynamicImport(..., {ssr:false})`。
- **问题描述**：`.next/server/app/album.html` 首屏 22 个 script、1446KB raw / **417KB gz** JS，其中 `static/chunks/b536a0f1-4493c535fb7041a7.js`（340KB / 81.2KB gz，含 `THREE.WebGLRenderer`）与 `bd904a5c-2851bbd2966d84af.js`（192.8KB / 50.5KB gz）均在首屏；而 `PhotoChatView` 只在用户点开"照片留言"时才渲染。
- **风险影响**：相册是主入口，移动端首屏多下约 132KB gz 的 3D 引擎/shader 字符串，低端机解析与内存压力显著，直接推高可交互时间；"按需加载"的努力被一条静态链抵消。
- **改进方案**：`const PhotoChatView = dynamic(() => import('@/components/album/PhotoChatView'), { ssr:false })`，`ParticlePhotoBackground` 同样惰性化；把 `components/album/space/*` 的 three 依赖收口到单一懒加载边界。验证：重跑 `next build`，`album.html` 中不再出现含 `THREE.WebGLRenderer` 的 chunk。

### [🔴] P-03 /dashboard 首屏加载 570KB 中国地图 GeoJSON
- **位置**：`components/dashboard/DashboardClient.tsx:15` 静态 `import ChinaMap`；同一组件在 `app/travel/TravelClient.tsx:19` 却是 `dynamicImport(..., {ssr:false})`
- **问题描述**：`.next/server/app/dashboard.html` 首屏 23 个 script、1426KB raw / **470KB gz**，其中 `static/chunks/9784-ad8e53b0c77cc7b5.js` 570KB raw / **193.2KB gz**，内容是省级 GeoJSON（`Feature/MultiPolygon/coordinates/centroid` 等序列）。
- **风险影响**：看板只显示"点亮省份数"，却让用户先下载近 200KB gz 几何数据；同一组件两种加载策略，说明分包策略没有统一约束，后续仍会回归。
- **改进方案**：DashboardClient 改 `dynamic(() => import('@/components/ChinaMap'), { ssr:false })` 并用骨架占位保 CLS；中期把 GeoJSON 换成 topojson/量化简化或按省懒加载。验证：`dashboard.html` 不再引用 `9784-*'。

### [🟡] P-04 App Router 三态基建全缺：0 个 loading / error / not-found，0 个 generateMetadata
- **位置**：`app/**`（`app/layout.tsx:13-16` 是唯一 metadata）；`Suspense` 仅 `app/login/page.tsx`、`app/search/page.tsx` 两处
- **问题描述**：48 个 `page.tsx` 没有配套 `loading.tsx`/`error.tsx`/`not-found.tsx`（glob 与目录扫描均为 0）。路由级异常会落到 Next 内置错误页；不存在的 URL 没有品牌化 404；页面切换没有 Suspense/流式骨架。
- **风险影响**：线上一次服务端异常就把用户甩到黑白 "Application error"；`/circle/999` 这类不存在的详情没有引导；这属于"体验断崖"而不是渐进降级。
- **改进方案**：补 `app/not-found.tsx`、`app/error.tsx`（`'use client'` + `reset`）、`app/global-error.tsx`；详情路由加 `loading.tsx` 骨架并在 `page.tsx` 内 `notFound()`；验证：访问不存在路由截图对齐设计稿。

### [🟡] P-05 全站无 metadata / OG / canonical，分享与 SEO 空转
- **位置**：全仓 grep：`generateMetadata` 0 处、`openGraph|og:image|twitter:card` 0 处、`document.title` 0 处、`canonical` 0 处、JSON-LD 0 处；仅有 `app/layout.tsx:13-16` 的全局 title/description
- **问题描述**：`/circle/<id>`（公开可读、且后台有 `app/api/admin/posts/[id]/share/route.ts` 专门产出分享链接）与 `/travel/<slug>` 全部共用同一标题"行迹 | 旅行记忆空间"，没有任何 OG 图/摘要。
- **风险影响**：分享到微信/Telegram 是一条无标题无图的裸链接，分享功能价值大打折扣；搜索引擎抓到的公开页只有导航壳（见 P-01）。
- **改进方案**：`app/circle/[postId]/page.tsx`、`app/travel/[slug]/...` 加 `generateMetadata`（服务端取标题/封面，失败兜底全局）；根 layout 加 `openGraph.images`（1200×630 品牌图）与 `metadataBase`；验证 `curl -s /circle/1 | grep 'og:'`。

### [🟡] P-06 根布局常驻 9 个全局客户端组件，motion 运行时因 AppUpdatePrompt 全站加载
- **位置**：`app/layout.tsx:56-65`（LayoutContent / NativeBackHandler / ThemeColorSync / Onboarding / PreferenceSurvey / CommandPalette / AppUpdatePrompt / OfflineBootstrap / ToastHost 共 9 个，均无懒加载）；`components/offline/AppUpdatePrompt.tsx:8` 静态 `import { BottomSheet }` → `components/mobile/BottomSheet.tsx:11` 引入 `motion/react`
- **问题描述**：`.next/server/app/index.html` 首屏含 `2421-01e57c7769ff51aa.js`（119.4KB raw / **38.7KB gz**，实测含 `MotionConfig`/`transformPerspective` 等 motion 运行时），布局自身 chunk 54.5KB / 16.4KB gz；而 AppUpdatePrompt 在没有更新时直接 `return null`（`AppUpdatePrompt.tsx:39`）。
- **风险影响**：每个页面（含从不弹更新提示的 Web 端）都固定多付约 55KB gz 与一棵永不渲染的组件树；首页 240KB gz 首屏 JS 中壳层占比过半。
- **改进方案**：AppUpdatePrompt 改 `dynamic(...,{ssr:false})`，且 BottomSheet 在 `hasUpdate` 后再 dynamic；Onboarding/PreferenceSurvey/CommandPalette 同样惰性挂载（首次触发再下载）。验证：`index.html` 不再引用 motion chunk。

### [🟡] P-07 字体：7MB zpix.ttf 作相册标题字 + CJK 标题字未自托管 + 首屏字体无 preload
- **位置**：`app/globals.css:553-562`（`@font-face Zpix { src:url('/zpix.ttf') format('truetype') }`，无 woff2、无子集、无 `font-display`）；`app/album/page.tsx:361/460/588/610/677` 使用 `font-zpix`；`tailwind.config.js:175` display 链路为 `Noto Serif SC/Songti SC/STSong/SimSun/serif`，但 `public/fonts/` 只有 Source Serif 4 / Inter / Playfair 共 298KB，**没有任何中文字体**
- **问题描述**：相册首屏标题会触发 7MB 单文件 TTF 下载；`.next/server/app/index.html` 里只有 logo 与 webpack 两条 `preload`，woff2 字体没有被预加载。
- **风险影响**：移动端首屏为像素标题付出 7MB 流量与 FOIT（默认 `font-display:auto` 会阻塞文字）；中文标题在 Windows=SimSun、macOS=Songti、Android=通用 serif，跨端观感漂移，与"设计稿一致性"目标冲突。
- **改进方案**：用 `pyftsubset public/zpix.ttf --flavor=woff2 --text-file=<相册字符集>` 生成 50–200KB 子集，补 `font-display:swap`；中文 display 字体走 `next/font/local` 或统一系统栈；主字体加 `<link rel="preload" as="font" crossorigin>`。

### [🟡] P-08 图片链路：remotePatterns 全开 + 40 个裸 img + 大图原图进 public
- **位置**：`next.config.js:9-18`（`remotePatterns: [{ hostname: '**' }]`，未设 deviceSizes/imageSizes/formats/qualities）；`components/social/ProfileHero.tsx:96/158/320`（封面、头像裸 `<img>`，无宽高；240+ 行还有 role=dialog 用户弹层）；`public/` 77.1MB / 431 文件（`uploads/media/17.jpg` 10.2MB、`zpix.ttf` 7.0MB、`brand/logo.png` 2.0MB、`videos/clover.mp4` 2.9MB）；`app/icon.png` 258KB 作 favicon
- **问题描述**：全仓 `<img>` 40 处（20 处无 `loading`、36 处无 `decoding`、仅 1 处 `fetchpriority`），`next/image` 39 处（仅 5 处 `priority`）。`hostname:'**'` 意味着任意 https 图片都进 `/_next/image` 交给 sharp 解码。
- **风险影响**：无尺寸图片造成 CLS；任意远端大图可被当作免费图床/CPU 放大器（性能与安全双面）；77MB 静态资源随镜像与 CDN 分发，部署体积和回源成本翻倍。
- **改进方案**：remotePatterns 收窄到 COS/CDN 域名 + `images.formats:['image/avif','image/webp']`；裸 img 统一改 `Image` 或补 `width/height + loading="lazy" + decoding="async"`；大图移出 public 走对象存储；`app/icon.png` 压到 <10KB。

### [🟡] P-09 设计 token 多套并存，admin 游离在系统之外
- **位置**：`tailwind.config.js:46/63/69/89/107/125/140/157`（semantic / primary / travel / pixel / album / night / shell / success / warning / danger / warm 共 11 组）；`app/admin/page.tsx:211/226/236/328/337/396/403/437/472` 直接写 `text-[#2D3842]`/`text-[#9A958F]`；`app/globals.css` 183 个 CSS 变量分 13 个前缀（`--m-*` 84、`--social-*` 17、`--album-*` 30、`--space-*` 8、`--semantic-*` 13）
- **问题描述**：实跑 `node scripts/check-design-tokens.mjs`：待处理 **399 处**（原有 7 条规则 308 + 新增规则 91）；代码类名用量 travel 1725 / warm 714 / shell 502 / album 223 / primary 84 / **semantic 仅 43**（而 `tailwind.config.js:42-45` 注释声称"新页面一律用 semantic"）；硬编码 hex 163 处 / 53 文件。
- **风险影响**：改主题要同步 5+ 套变量，漏改即视觉不一致（admin 与前台色温、圆角、字号均不完全对齐）；新组件不知道该用哪套，欠债持续增长。
- **改进方案**：以 `semantic` + `--m-*` + `--social-*` 为唯一目标层，travel/shell/warm/primary 映射为 CSS 变量别名保留类名做兼容；admin 强制走 `warm-*`/`semantic-*`；把 `npm run tokens:check` 从"报告"改为阻断新增；先批量替换脚本已列出的 29 处"与 token 同值"的 hex。

### [🟡] P-10 可访问性：对比度实测低于 AA + 23 个弹层中 21 个没有焦点陷阱
- **位置/证据**：`text-travel-ink/70`（合成后 **3.40:1**，57 处）、`/60`（≈2.9，47 处）、`/50`（≈2.5，44 处）、`text-travel-sand` #8B7355 on #FAF6EE = **4.16:1**（120 处）、`--semantic-faint` #C2AF9A = **1.97:1**、暗色 `shell-faint` #6E6A64 on #12161C = **3.38:1**（35 处），均低于 WCAG AA 4.5:1。弹层：仅 `components/mobile/BottomSheet.tsx`、`SideDrawer.tsx` 使用 `hooks/use-modal-layer.ts:104-202`（焦点圈定 + 焦点恢复 + inert 引用计数）；`components/ui/Modal.tsx:46-56` 注释称"焦点收拢"但只做 `panel.focus()`，**没有 Tab 循环**；其余 21 处 `role="dialog"`（`CommandPalette`、`TravelInfoEditor`、`CommentPanel`、`ExportArchiveDialog`、`PhotoViewer`…）无焦点陷阱、背景不 inert。
- **风险影响**：本项目大量文字是"旅行随笔/说明"，3.4:1 在户外光线下基本读不清；键盘用户 Tab 会跑到被遮罩盖住的背景控件，读屏用户能遍历弹层外内容（WCAG 2.4.3 / 2.1.2）。
- **改进方案**：`ink/70→ink/80`、`sand→#7D6754`、`--semantic-faint` 提亮到 ≥4.5；所有弹层统一接到 `useModalLayer`（Modal 内部也接）；`tests/e2e/a11y.spec.ts:34-43` 目前只拦 critical/serious 且只扫 10 页，把 color-contrast 纳入失败项，并补 `/album`、`/dashboard`、`/admin`、`/circle/<id>`。

### [🟡] P-11 路由表冗余与文档/截图基线漂移
- **位置**：`lib/routes.ts:17-40`（同一实体两套入口）+ `app/travel/detail/page.tsx`、`app/space/detail/page.tsx`、`app/circle/detail/page.tsx`、`app/circle/user-detail/page.tsx`、`app/travel/record/page.tsx`、`app/albums/page.tsx`（redirect）；`.next/prerender-manifest.json` 的 50 个预渲染路由里含 `/dev/ui`、`/dev/ui/v4`、`/dev/ui/space`、`/travel/placeholder`、`/space/placeholder`、`/circle/0`、`/travel/placeholder/record`
- **问题描述**：① 同一内容两个 URL（`/travel/<slug>` 与 `/travel/detail?slug=`）无 canonical；② `app/travel/detail/page.tsx:8` 注释称"Web 端仍走 /travel/[slug]（SSR）"、`app/space/[slug]/page.tsx:12-17` 称"服务端渲染"，实际都是纯客户端壳（`app/travel/[slug]/TravelDetailShell.tsx:1` `'use client'`），注释与实现相反；③ dev 预览页进了生产构建；④ 截图基线过期：`.review-shots/*` mtime 2026-09-06、`docs/design/screenshots/*` 2026-08-18，均早于 HEAD 2026-10-17；`.review-shots/home.png` 的底部导航是 5 项（首页/旅行/时间线/相册/搜索），现行 `components/layout/MobileBottomNav.tsx:21-26` 已是 4 Tab + FAB；⑤ `/videos/clover.mp4`（2.9MB，2026-08-15 至今未改）在 `.review-shots/login.png` 中可见 **"AlanGallery" 水印**。
- **风险影响**：双入口让分享/埋点/E2E 都要维护两遍（`tests/e2e` 已出现两套路径）；注释误导后续维护者继续"以为有 SSR"；截图过期会让按图评审的结论失真（本次评审即遇到）；带水印素材用于商用登录页有版权风险。
- **改进方案**：明确 query-param 入口只服务 Capacitor（按 `NEXT_PUBLIC_APP_PLATFORM` 条件生成），Web 端加 canonical 或 middleware 302 归一；`dev/ui*` 用 `NODE_ENV` 或独立 preview 构建排除；把截图脚本纳入 CI 并在文档写生成日期；替换带水印视频为授权/自拍素材（加 poster，见 P-12）。

### [🟢] P-12 登录页视频背景：延迟加载方向对，但缺 poster 与省流降级
- **位置**：`components/login/LoginDoor.tsx:110-125`（门打开后才挂 `<video preload="none" muted loop playsInline>`，有可读性遮罩）
- **问题描述**：登录页是全站第一屏，视频 2.9MB 且无 `poster`；没有 `prefers-reduced-motion`/`saveData` 降级分支。
- **风险影响**：蜂窝网络下首帧常常直接是遮罩黑底；低端机解码占内存，首屏可交互时间被拉长。
- **改进方案**：加压缩海报（<80KB）作 `poster`；`matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData` 时不挂载视频；重编码到 720p AV1/H.265 可降到 <800KB。

### [🟢] P-13 reduced-motion：组件层覆盖好，CSS 层没有兜底
- **位置**：17 个组件手写 `matchMedia('(prefers-reduced-motion: reduce)')`（`components/album/space/galaxyEngine.ts:89`、`album/book/themes/catalog.ts:79`、`runtime.tsx:93-106`、`driftwall/DriftWall.tsx:106`…），但 `app/globals.css` + `app/mobile.css` 共 30 个 `animation:`、48 个 `transition:` 声明，只有 4 个 `@media (prefers-reduced-motion: reduce)` 块（`globals.css:1122/2057/2616`、`mobile.css:1611`）
- **问题描述**：纯 CSS 动画（滚动显现、呼吸、渐变位移等）没有统一的"减少动态"开关，只有零星组件自己处理。
- **改进方案**：加全局兜底 `@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}`；在 reduced 模式下跑一次 Playwright 断言无长动画。

### [🟢] P-14 轮播竞态与可减少的首屏请求
- **位置**：`components/TravelImageCarousel.tsx:87-97`（`load`/`error` 回调 + 1500ms `setTimeout` 兜底都可能触发 `startTransition`，且监听未移除、定时器未在卸载时清理；`goTo` 内 `requestAnimationFrame`+`setTimeout` 同样无清理）
- **问题描述**：同一张图可能 `setCurrentIndex` 两次、交叉淡入动画重放；组件快速卸载后仍有 `setTimeout` 触发 setState。另外 `.next/server/app/index.html` 首屏含 `polyfills-*.js` 110KB raw / 38.6KB gz。
- **改进方案**：加 `startedRef` 幂等守卫 + 清理定时器；用 `browserslist` 对齐目标浏览器以精简 polyfills（可选）。

## 优势（有证据）

1. **弹层无障碍基座是"教科书级"**：`hooks/use-modal-layer.ts:104-202` 做了焦点圈定（Tab/Shift+Tab）、关闭后焦点恢复、`inert` 引用计数（不会摘掉元素原有 inert）、滚动锁、ESC 与 Android 返回；`components/layout/LayoutContent.tsx:26-31` 还额外做 `clearStrayInert()` 路由切换自愈。
2. **WebGL 资源生命周期管理到位**：`components/album/space/galaxyEngine.ts:569-590` 完整 dispose（rAF、事件、ResizeObserver、geometry、material、texture、renderer、canvas）；`ParticlePhotoBackground.tsx:294-308`、`StarfieldBackground.tsx:240-244` 都取消 rAF 并移除监听，`document.hidden` 时停帧。未发现典型的"路由切换后 WebGL 泄漏"。
3. **动画降级的"设备档位"设计很细**：`components/album/book/themes/runtime.tsx:24-106` 把 `prefers-reduced-motion` 设为强制档、用户偏好只能在其下退让，并区分视觉档位；相册 3D 组件逐处读取 reduced-motion。
4. **暗色冷启动闪白已系统性解决**：`app/layout.tsx:39-43` 在 `<head>` 用同步脚本先加 `dark` class 阻塞首帧，再由 `ThemeColorSync` 同步 `theme-color`，`suppressHydrationWarning` 兜住差异——这正是"暗色闪白"的标准解法。
5. **CLS 意识强**：首页用"复刻真实版面的骨架"（`app/page.tsx:12-17`，`m-skeleton`），`AsyncState` 统一 loading/error/empty 三态并带 `role=status/alert`；`next/image` 39 处中 34 处带 `sizes`。
6. **a11y 有可执行的自动化基线**：`tests/e2e/a11y.spec.ts` 用 axe + WCAG 2.2 AA（`wcag2a/aa/21a/21aa/22aa`），区分匿名态与登录态，并有"图标按钮必须有可读名"的自定义断言。

## 未覆盖/待确认

- 本地无运行实例，**未跑 Lighthouse/WebPageTest**；LCP/INP/CLS/TBT 均为构建产物静态推断，不是实测值。
- nginx 压缩配置未知：本文 gz 为本地 `gzip -9` 估算；若线上只开 gzip 未开 brotli，真实传输量更高（尤其 234KB CSS / 570KB GeoJSON）。
- 未在低端 Android 真机/WebView 上测 WebGL 帧率、内存峰值与 Capacitor 壳（`www/`）首屏加载。
- 打包证据基于 2026-10-17 09:41 的 `.next`；若之后有构建变更需复核 chunk 体积。
- 视觉核对只读了 8 张图（`.review-shots/home、travel、circle、timeline、login、dashboard、album-pixel` 与 `docs/design/screenshots/home-mobile-390`，均 390 宽为主），未逐张核对深色模式与 1440 桌面截图；截图基线本身过期（见 P-11），据图结论只作线索。
- 48 个页面只抽查了首页/旅行/旅行圈/详情/画册的三态覆盖；表单校验反馈、i18n 硬编码中文只做抽样（未计入问题清单），建议由其他模块补充。
