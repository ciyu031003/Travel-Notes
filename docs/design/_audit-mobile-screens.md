# 移动端 UI 面清单（事实审计 · 无改动建议）

范围：`F:\CodeFiles\Travel-Notes`（Next.js 15 App Router + Tailwind + Capacitor Android）。
方法：只读源码。计数由正则扫描各文件原始文本得出（`arb` = 任意值类 `xx-[...]`；`hex` = 类名里的 `#RRGGBB`；`grad` = `bg-gradient-to-*` / `linear-gradient(` / `radial-gradient(`；`sh[]` = `shadow-[`；`anim[]` = `animate-[`；`mvar` = `var(--m-`；`svar` = `var(--social-`）。数值为近似值，用于排序「最脏」文件，不作为精确 LOC 口径。

---

## 0. 全局壳层与移动端设计系统（所有页面共用）

| 项 | 位置 | 事实 |
|---|---|---|
| 根布局 | `app/layout.tsx`（45 行） | `<html lang="zh-CN">`；`theme-color #FAF6EE`；全局挂载 `LayoutContent` / `Onboarding` / `CommandPalette` / `AppUpdatePrompt` / `OfflineBootstrap` / `ToastHost` |
| 壳层路由分支 | `components/layout/LayoutContent.tsx`（112 行） | 三档分支：① `login` / `forgot-password` / `album*` → **只渲染 children**（无 Navbar、无 Footer、**无底部 tab**，行 35-37）；② `/travel*` 与 `/` → `hidden md:block` 的 Navbar + `main pt-0 md:pt-16` + `hidden md:block` Footer + `MobileBottomNav`（行 40-75）；③ `/circle*`、`/me*`、`/sync*`、`/admin*` → 只渲染 children + `MobileBottomNav`（行 77-86）；④ 其余（`/timeline`、`/moments`、`/dashboard`、`/search` 等）→ 落地到 fallback：`hidden md:block` Navbar + `main pt-0 md:pt-20 md:pb-12` + `hidden md:block` Footer + `MobileBottomNav`（行 90-110） |
| 底部导航 | `components/layout/MobileBottomNav.tsx`（105 行） | `nav.m-glass fixed inset-x-0 bottom-0 z-40 md:hidden`；`grid grid-cols-5`：首页 / 旅行 / **中央 FAB（`m-fab` 56px 圆形 `bg-[var(--m-accent)]`，点击先查 `/api/check-auth` 再跳 `/travel/new` 或 `/login`）** / 旅行圈 / 我的；TabItem 用 `m-pressable` + `m-tab-label` |
| 桌面导航 | `components/layout/Navbar.tsx`（333 行） | `fixed top-0 h-16`；桌面项：首页/旅行记录/画册/旅行圈/时间线 + 搜索 + 主题 + 后台 + 登出；**移动端仍渲染** `flex items-center gap-2 md:hidden` 的搜索/主题/后台/汉堡（行 208-259），汉堡开出 portal 抽屉（行 264-330，`fixed inset-0 z-50 md:hidden`，`animate-[menuDrop_…]` / `animate-[fadeIn_…]`）。注意：`LayoutContent` 在分支 ②/④ 用 `hidden md:block` 包住它，因此实际只在桌面可见；在 ③ 分支根本不渲染 |
| 页面转场 | `components/mobile/MobilePageTransition.tsx`（45 行） | `matchMedia('(max-width: 767px)')` 门控，路由变更加 `m-page-fade`（仅 opacity，0.28s） |
| 全局浮层 | `components/mobile/Onboarding.tsx`（138 行）、`Toast.tsx`（42 行） | 引导页 + Toast 宿主，移动 token |
| 移动 token / 工具类 | `app/mobile.css`（613 行）；由 `app/globals.css:1` `@import './mobile.css'` 引入 | `--m-*` 26+ 变量（亮 `:root` 行 7-86 / 暗 `html.dark` 行 88-128）；`@media (max-width: 767px)` 只改 `body` 背景与点击高亮（行 130-137）；`@media (max-width: 767.98px)` 限定 `.m-list-item` stagger（行 330-335）；工具类 `.m-card` / `.m-chip` / `.m-section-title` / `.m-press` / `.m-enter` / `.m-title(1/2)` / `.m-body` / `.m-caption` / `.m-label` / `.m-stat` / `.m-seg*` / `.m-sheet*` / `.m-toast` / `.m-empty` / `.m-ptr*` / `.m-fab` / `.m-glass` / `.m-safe-top` / `.m-gutter` |
| 部件约束 | `app/mobile.css:302-307` | 注释明确：`m-fab` 只允许静态投影，`m-fab-glow` 无限呼吸动画已删除 |
| 相册社交 token | `app/globals.css:130-172` | `--social-*` 亮/暗两套（`--social-bg` 亮 `#F7F4EE` / 暗 `#080808`）；`--danger-soft:#E06C6C` |
| 语义 token | `app/globals.css:961-989` | `--semantic-*` 亮/暗两套（`tailwind.config.js` 映射为 `semantic.*` 调色板） |
| 断点来源 | `tailwind.config.js:8-9` | `theme.extend` **未定义 `screens`** → Tailwind 默认断点（`md`=768px、`sm`=640px、`lg`=1024px、`xl`=1280px） |

**移动端断点约定（问 7）** — 存在三套并存写法，全部等价于「<768px 为移动」：

1. Tailwind 类：`md:hidden` / `hidden md:block` / `hidden md:flex` / `md:pb-0` —— 默认 `md` = `min-width:768px`（证据：`tailwind.config.js` 无 `screens`；`components/layout/LayoutContent.tsx:44,65,93,104`；`app/page.tsx:22,34,45,52`；`app/travel/page.tsx:54,66,77,80`）。
2. JS 判定：`window.matchMedia('(max-width: 767px)')` —— `app/travel/TravelClient.tsx:45`、`components/mobile/MobilePageTransition.tsx:31`。
3. 少数 `768px`：`components/mobile/CountUp.tsx:32` 用 `(min-width: 768px)` 关掉移动端动画；`app/globals.css:326,342` 用 `@media (max-width: 768px)`；`components/album/travel-book/BookReader.tsx:39` 用 `(min-width: DUAL_PAGE_MIN_WIDTH px)`。
4. 另有若干相册子组件用 `640/641/900/420px` 局部断点（`components/album/sketchbook/sketchbook.css:500,553`、`components/album/postcard.css:31,47,222`、`components/album/morphslider/MorphSlider.css:154`）。

**安全区写法不统一（事实）**：`m-safe-top`（`mobile.css` 定义 `max(20px, env(safe-area-inset-top))`）只用在 `components/HomeMobile.tsx:264`、`app/travel/TravelMobileClient.tsx:120`；其余页面各写内联 `pt-[max(Npx,env(safe-area-inset-top))]`，N 分别为 8 / 16 / 20 / 24 / 26 / 40 / 48（`components/travel/TravelComposerForm.tsx:94`、`app/me/settings/page.tsx:103`、`components/social/MeHome.tsx:287`、`app/login/page.tsx:178`、`components/social/TravelCircleFeed.tsx:166`、`components/HomeMobile.tsx:457,480`、`app/travel/TravelMobileClient.tsx:262,282`）。

**失效 token（事实，不是建议）**：`var(--m-shadow-lg)` 与 `var(--m-on-accent)` 在 `app/mobile.css` 中**未定义**（grep 全仓无 `--m-shadow-lg:` / `--m-on-accent:` 定义），但被 7 个文件引用：`components/travel/TravelComposerForm.tsx:409`、`components/travel/TravelTimeline.tsx:54,96`、`components/travel/TravelInfoEditor.tsx:111,250`、`components/travel/MemoryComposer.tsx:122,251`、`components/travel/ItineraryEditor.tsx:85,172`、`components/travel/DateRangePicker.tsx:118,176,200`、`components/offline/AppUpdatePrompt.tsx:50,75`。
（对比：`--social-on-accent` 与 `--semantic-on-accent` 均已定义，见 `globals.css:144,169,973,989`。）

---

## 1. 首页 `/` — `app/page.tsx`（62 行）

- **用途**：旅行记忆入口首页（足迹地图 + 画册横滑 + 最近旅行 + 每日一言 + 重要日子）。
- **结构**：`app/page.tsx` 是纯取数壳（`useApi(apiUrl('/api/home'))`），按三态各自**双树渲染**：
  - 错误态：`hidden md:block` → `AsyncState variant="error"`；`md:hidden` → `HomeMobileError`（行 19-30）
  - 加载态：`hidden md:block` → `AsyncState variant="loading"`；`md:hidden` → `HomeMobileLoading`（行 31-42）
  - 正常：`hidden md:block` → `HomeClient`；`md:hidden` → `HomeMobile`（行 43-61）
- **移动树 `components/HomeMobile.tsx`（497 行）自上而下区域**：
  1. 根 `bg-[var(--m-bg)] pb-[calc(88px+env(safe-area-inset-bottom))]`（为底导预留）
  2. `PullToRefresh` 包裹全页
  3. Hero：`m-gutter m-safe-top` → 问候语（`greeting()`）→ `m-label` 品牌行 → `m-title-1`「我的旅行足迹」→ **足迹地图卡片**（`m-card`，`h-[200px]`，懒加载 `HeroFootprintMap`，底部渐变条承载「已点亮 N 省 · M 篇旅行」+ 看地图）→ 两枚胶囊 CTA「记录一次旅行」（`bg-[var(--m-accent)]`，h-12）/「旅行画册」（描边胶囊）
  4. 每日一言卡片（`m-card p-5 text-center`，`IconBadge` + `m-title-2` 引号句 + `m-label` DAILY WORDS）
  5. `MobileBooks()`：`m-section-title` + 横向 snap 滑动画册卡（`w-[46vw] max-w-[190px]`，取 `/api/travel-book` 前 6 本；无数据整段返回 null）
  6. 「最近旅行」`m-section-title` + `Stagger` 横滑大卡（`h-[230px] w-[82vw]`，封面 + 底部深色渐变压字）
  7. `MobileMoments()`：单行「碎碎念」入口卡（`m-card` 一行，无列表）
  8. 「重要日子」2 列网格（`m-card` + 左侧 3px 强调竖条 `--m-tone-*-fg` + `m-stat` 天数）
  9. `footer`（文字，`text-[var(--m-faint)]`）
  10. 外层无 FAB；底部导航来自壳层 `MobileBottomNav`
  - 加载骨架 `HomeMobileLoading`（行 454-475）：`pt-[max(40px,…)]` + 3 块 `Skeleton` + 2 × `SkeletonCard`
  - 错误态 `HomeMobileError`（行 478-497）：`EmptyState` + `m-chip m-chip-active` 重试
- **导入的 `components/mobile/*`**：`PullToRefresh`、`EmptyState`、`Skeleton`/`SkeletonCard`/`SkeletonLines`、`Stagger`、`CountUp`、`Icon`、`IconBadge`（`components/HomeMobile.tsx:21-27`）。无 `components/ui/*`。
- **原始内联样式计数**：`arb 48`、`mvar 39`、`grad 5`（全是 `bg-[linear-gradient(...)]`）、`rounded-[] 0`、`sh[] 0`、`anim[] 0`、类名 hex 0。
  代表引用：`components/HomeMobile.tsx:277` `h-[200px] bg-[linear-gradient(165deg,var(--m-bg-soft),var(--m-surface-2))]`；`:381` `bg-[linear-gradient(to_top,rgba(24,15,9,0.72),rgba(24,15,9,0)_62%)]`（手写 rgba 渐变遮罩，未被 token 化）；`:279` `bg-[linear-gradient(to_top,var(--m-surface-solid)_55%,transparent)]`；`:384` `m-chip !border-white/20 !bg-white/18 !text-white`（用 `!` 覆盖共享 chip 样式）。
- **一次性自定义**：整体已用 `m-*` 系统，但渐变遮罩与 `!` 覆盖是就地写的；桌面树 `components/HomeClient.tsx`（542 行）是完全独立的一套视觉（`arb 20`、`hex 10`、`grad 7`、`sh[] 7`、`anim[] 2`），例：`:277` `bg-gradient-to-b from-travel-cream via-travel-parchment to-travel-cream dark:from-[#12161C] dark:via-[#161B22] dark:to-[#12161C]`、`:347` `bg-[#FBF3E9]`、`:415` `bg-gradient-to-br from-[#FBF0E6] to-travel-sakura/70 dark:from-[#241C15] dark:to-[#292119]`、`:157-159` 内联 `radial-gradient(220px circle at ${spot.x}% ${spot.y}%, …)`（React state 跟随鼠标）。另注意 `:152` 类串已损坏：`shadow- lg:p-8[0_10px_28px_-12px_rgba(90,102,112,0.18)]`（本应是 `lg:p-8 shadow-[…]`）—— 桌面树内联漂移的一个实例。

---

## 2. 旅行列表 `/travel` — `app/travel/page.tsx`（85 行）+ 两棵树

- **用途**：旅行地图（省份/城市点选）+ 全部旅行记录列表。
- **结构**：`app/travel/page.tsx` 取数（在线优先 + 离线回退 + 本地待同步合并），三态各自双树：
  - 错误：`hidden md:block` `AsyncState` / `md:hidden` `TravelMobileLoading message`（行 51-62）
  - 加载：`hidden md:block` `AsyncState` / `md:hidden` `TravelMobileLoading`（行 63-74）
  - 正常：`hidden md:block` → `TravelClient`；`md:hidden` → `TravelMobileClient`（行 75-84）
- **移动树 `app/travel/TravelMobileClient.tsx`（305 行）区域**：
  1. 根 `bg-[var(--m-bg)] pb-[calc(88px+env(safe-area-inset-bottom))]` + `PullToRefresh`
  2. 离线提示条（`m-card` 样式但加了 `m-chip` 类 + `h-auto`，行 113-117）
  3. Header `m-gutter m-safe-top`：`m-label`「MY JOURNEYS」+ `m-title-1`「旅行记录」+ `StatRow`（篇/省/城市，`CountUp`）
  4. 地图区：`m-card` 内 `h-[310px]` + `ChinaMap`（**硬编码渐变底**，行 138）+ 底部条「足迹地图 / N / 34 省」
  5. 「最近旅途」`m-section-title` + `Stagger` 纵向海报流：`aspect-[4/3]` 封面 + 底部 rgba 渐变 + 标题，卡圆角**按索引奇偶切换** `rounded-[26px]` / `rounded-[30px]`（行 187-188）
  6. `footer` 文字
  7. `MobileProvinceDrawer`（`components/china-map/MobileProvinceDrawer.tsx`，205 行，底部抽屉）
  8. 底导来自壳层；**无页面级 FAB**
  - `TravelMobileLoading`（导出，行 259-296）：错误态 `EmptyState` + 重试；加载态自绘骨架（`Skeleton h-[310px]` + 2 × `SkeletonCard`）
- **导入的 `components/mobile/*`**：`PullToRefresh`、`Skeleton`/`SkeletonCard`、`EmptyState`、`Stagger`、`CountUp`、`Icon`、`StatRow`（`TravelMobileClient.tsx:14-20`）。无 `components/ui/*`。
- **原始内联计数**：`arb 31`、`mvar 25`、`rounded-[] 2`、`sh[] 1`、`grad 3`、hex 0。
  代表：`:138` `bg-[linear-gradient(165deg,#FFF8EF,#EAF2F4)]`（**两个硬编码 hex**）；`:202` `bg-[linear-gradient(to_top,rgba(26,16,9,0.62),rgba(26,16,9,0)_65%)]`；`:173` `m-chip m-chip-active mt-5 !h-11 !px-5 !text-sm`（`!` 覆盖）；`:187-188` 奇偶不同圆角。
- **一次性自定义**：中度。共用 `m-*`，但渐变/圆角/`!` 覆盖就地写。
- **桌面树 `app/travel/TravelClient.tsx`（354 行）**：桌面地图 `h-[calc(100vh-64px)]` + 左右可收起面板（照片轮播 / 足迹信息）+ 记录网格（`md:grid-cols-2 lg:grid-cols-3`）+「查看全部」。**但该文件内含移动逻辑**：`matchMedia('(max-width: 767px)')` 时自动收起左右面板（行 44-57），并在 `md:hidden` 下渲染「照片 / 足迹」两枚浮动胶囊（行 150-167）；底部还有 `h-[40vh]` 手写雾气渐变（行 126-131）。计数：`arb 5`、`grad 2`、`sh[] 2`、hex 1（`:277` `via-[#E8D5E0]`）。

---

## 3. 新建旅行 `/travel/new` — `app/travel/new/page.tsx`（24 行）

- **用途**：移动端全屏新建旅行表单（从底导 FAB 进入）；创建成功后 `router.replace('/travel/<slug>')`。
- **结构**：页面本身只是壳，渲染 `components/travel/TravelComposerForm.tsx`（431 行）。
- **`TravelComposerForm` 区域自上而下**：
  1. 根 `min-h-screen bg-[var(--m-bg)]`
  2. **sticky 顶栏**：返回圆钮 + 居中「新建旅行」+ 右侧占位；`pt-[max(8px,env(safe-area-inset-top))]` + 内联 `background: color-mix(in srgb, var(--m-bg) 86%, transparent)`（行 93-107；**没有用 `m-safe-top`，也没有用 `LargeTitle`**）
  3. `<main>`（`pb-[calc(120px+env(safe-area-inset-bottom))]`）内 4 张 `m-card` 分节：①「去哪？」（输入框 + 联想下拉，行 115-165）②日期区间（`DateRangePicker`，行 167-194）③标题（行 196-226）④「更多（可选）」折叠（同行者 chips、关系 chips、备注 textarea、旅行类型 chips，行 227-395）
  4. **sticky 底部主按钮**：`sticky bottom-[calc(76px+env(safe-area-inset-bottom))]`，上覆 `linear-gradient(to top, var(--m-bg) 78%, transparent)`；按钮 `h-[52px] rounded-2xl bg-[var(--m-accent)] text-[var(--m-on-accent)] shadow-[var(--m-shadow-lg)]`（行 400-410；**两个未定义 token**）
- **导入的 `components/mobile/*`**：仅 `Icon`（行 5）。无 `components/ui/*`。
- **原始内联计数**：`arb 121`（**全仓移动界面最高**）、`mvar 84`、`sh[] 1`（失效 token）、`grad 1`、hex 0。
  代表：`:133,:207,:294,:358` 四处重复的 `rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] … focus:border-[var(--m-accent)]`；`:94` `pt-[max(8px,env(safe-area-inset-top))]`；`:409` `shadow-[var(--m-shadow-lg)]`。
- **一次性自定义**：**高**。这是唯一一个「完全不使用 `LargeTitle` / `ListSection` / `Pill` 等共享移动组件、全部手写输入框与 chips」的移动主流程页面。

---

## 4. 记录今日 `/travel/record` 与 `/travel/[slug]/record`

- `app/travel/record/page.tsx`（19 行）：静态导出用的查询参数壳，读 `?slug=` 后渲染同一组件。
- `app/travel/[slug]/record/page.tsx`（5 行）：直接渲染 `TravelRecordPage`。
- **`app/travel/[slug]/record/TravelRecordPage.tsx`（189 行）区域自上而下**：
  1. 根 `min-h-screen bg-travel-cream`（**用的是 Web `travel-*` 色，不是 `--m-*`**）
  2. **sticky header**：`sticky top-0 z-10 bg-travel-cream/90 backdrop-blur border-b border-[#E8E8E4]`，返回箭头 + `font-semibold` 标题「记录此刻 · {title}」（行 111-118；**硬编码边框 hex**）
  3. `<main class="max-w-xl mx-auto px-4 py-6">`
  4. 离线提示条（硬编码 `text-[#B07686]`，行 122）
  5. 成功态 `div.card`（Web `.card` 类）/ 待同步提示 `div.card`
  6. 表单：标题 input（`rounded-2xl border-travel-bloom/50 bg-white focus:ring-…`）、内容 textarea、**心情 chip 行**（`MOODS` 六个，选中 `bg-travel-sakura border-travel-bloom`）、错误框、提交按钮 `bg-gradient-to-r from-travel-bloom to-[#D4A5B0]`（行 180，**硬编码 hex 渐变**）
- **导入的 `components/mobile/*`**：仅 `Icon`（行 7）。无 `components/ui/*`。
- **原始内联计数**：`arb 3`、hex 4（含 `#E8E8E4` ×2、`#B07686`、`#D4A5B0`）、`grad 1`、`mvar 0`。
- **一次性自定义**：**高**。整页零 `m-*` usage：圆角/描边/白色输入框/渐变按钮全部是 Web 风格手写，与该 App 其它移动页明显不是同一套。

---

## 5. 旅行详情 `/travel/[slug]` — `app/travel/[slug]/page.tsx`（5 行）→ `TravelDetailShell.tsx`（254 行）

- **用途**：单本旅行的详情（全屏媒体序章 + 标题/日期/标签 + 正文 + 按天时间线 + 记录/编辑入口）。
- **结构（单树响应式，无移动专用分树）**：
  1. `app/travel/[slug]/page.tsx` → `TravelDetailShell`（取数 + 三态：`AsyncState` loading/error，**移动端也用 `AsyncState`，没有移动骨架**）
  2. 若有图片/视频：`TravelDetailClient` 全屏沉浸式（`fixed inset-0 bg-black z-50`）
  3. `container-custom` 内一行胶囊动作：「记录今日」（`bg-travel-sakura` 描边胶囊）+「编辑信息」（`canEdit` 才显示）
  4. `article max-w-3xl`：居中 header（`text-3xl md:text-4xl` 标题 / `TravelTypePill` / 同行者 chips / 日期·地点 / tags chips）
  5. `VideoPlayer`（有视频时）
  6. `div.prose prose-lg` 渲染 `contentHtml`
  7. 空态引导卡（虚线边框 + 主 CTA）
  8. `TravelTimeline`（按天叙事，行 227-231）
  9. `MermaidRenderer`
  10. `editing` 时 `TravelInfoEditor` 底部面板
- **移动端注意事项（事实）**：`LayoutContent` 对 `/travel*` 走分支 ②，移动端**不渲染 Navbar、不渲染 Footer**；本页也没有 `LargeTitle`/返回键 —— 移动端唯一的「返回」出现在 `TravelDetailClient` 的全屏 nav（`「返回旅行记录」`，`app/travel/[slug]/TravelDetailClient.tsx:242-248`）里，**没有图片/视频时该页移动端无返回控件**。文章容器用 `pt-[max(24px,env(safe-area-inset-top))] md:pt-24`、`pb-[calc(96px+env(safe-area-inset-bottom))] md:pb-16`（行 144）。
- **导入的 `components/mobile/*`**：`TravelTypePill`（`@/components/mobile/Pills`）、`Icon`（行 16-17）。无 `components/ui/*`。
- **原始内联计数（`TravelDetailShell.tsx`）**：`arb 0`、`mvar 0`、hex 0、grad 0 —— 全部走 `travel-*` token/类名，是**最「干净」但最「Web 风」**的一页。
- **`TravelDetailClient.tsx`（449 行，沉浸式媒体序章）**：区域 = 顶部半透明 nav（返回 + 地点/日期 + 「旅行相册」胶囊）+ 全屏 `snap-y snap-mandatory` 分屏（每屏视差图/视频 + 底部压字 + 页码胶囊 + 视频播放/静音按钮 + 向下滚动指示）+ 右侧竖直页码条（`w-2`，当前 `h-12 bg-white`）。
  - 计数：`arb 3`、hex 3（`:282` `dark:from-[#32261D] dark:via-[#3A2B21] dark:to-[#22303A]`）、`grad 3`、`sh[] 1`、`anim[] 2`（`:415`/`:422` `animate-[chevron-float_1.8s_ease-in-out_infinite]`）。
  - 内联 CSS 视觉：`:318` `radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,0.38) 100%)` 暗角；`:322-327` 内联 SVG `feTurbulence` 噪点层（`opacity-[0.07] mix-blend-overlay`）；`:369,:381` 内联 `fadeSlideUp` 关键帧 + `cubic-bezier(0.23,1,0.32,1)`（关键帧在 `tailwind.config.js:214-217`）。
  - 一次性自定义：**高**（整屏海报式视觉自成一套，仅复用 `Icon`）。

---

## 6. 旅行圈 `/circle` — `app/circle/page.tsx`（11 行）+ `components/social/TravelCircleFeed.tsx`（360 行）

- **用途**：社交信息流（推荐/最新/热门/关注 + 话题 chips + 卡片瀑布流）。
- **`app/circle/page.tsx`**：`min-h-screen bg-[var(--social-bg)]` 包 `<TravelCircleFeed />`。
- **`TravelCircleFeed` 自上而下区域**：
  1. 根：`min-h-screen bg-[var(--social-bg)] pb-[calc(88px+env(safe-area-inset-bottom))]`
  2. **fixed 顶部氛围层**：`h-[420px] bg-[radial-gradient(...),radial-gradient(...)]`（行 165）
  3. 内层 `max-w-6xl px-4 pt-[max(26px,env(safe-area-inset-top))] sm:px-6 sm:pt-8`
  4. `PullToRefresh` 包裹全部
  5. **桌面 header**（`hidden items-start justify-between gap-4 md:flex`，行 168-180）
  6. **移动 header**（`md:hidden` `LargeTitle`，trailing = `SocialThemeToggle`，行 183-189）
  7. 离线提示胶囊
  8. **移动分段控制器**（`md:hidden` `SegmentedControl`，行 198-204）／桌面 sticky chip 行（`hidden md:flex` + `[mask-image:linear-gradient(...)]`，行 206-214）
  9. 话题 chips 横滑行（两断点都显示，`# 海边` 等 6 个，行 223-243）
  10. 访客提示条（未登录才显示，行 246-259）
  11. 内容三态：移动 `Skeleton h-72` + 2 × `SkeletonCard`／桌面 spinner（行 261-269）；错误：移动 `EmptyState`／桌面文字；空：桌面大空态卡 + 移动 `EmptyState`
  12. 列表：「最新旅途 · 共 N 篇」段头 + **移动 hero 大卡**（`SocialFilmCard variant="hero"`，`md:hidden`）+ `Stagger` 瀑布流（`columns-1 sm:columns-2 lg:columns-3`，`SocialFilmCard` 循环 4 种画幅）
  13. 「加载更多」/「看到这里就是全部了」页脚按钮
  14. 底导来自壳层（分支 ③）
- **导入的 `components/mobile/*`**：`Icon`、`LargeTitle`、`SegmentedControl`、`PullToRefresh`、`EmptyState`、`Skeleton`/`SkeletonCard`、`Stagger`（行 7,15-20）。无 `components/ui/*`。
- **原始内联计数**：`svar 47`、`arb 50`、`rounded-[] 2`、`sh[] 1`、`grad 4`、hex 0。
  代表：`:165` 双层 `bg-[radial-gradient(60%_60%_at_50%_-10%,rgba(232,179,106,0.10),transparent_65%),radial-gradient(...)]`；`:206` `sticky top-[max(10px,env(safe-area-inset-top))]` + `[mask-image:linear-gradient(to_right,transparent,black_8px,black_calc(100%-8px),transparent)]`；`:210` `shadow-[0_8px_18px_-8px_var(--social-accent)]`；`:287` 又一层 `bg-[radial-gradient(40%_50%_at_50%_30%,…)]`；`:264` `Skeleton className="h-72 w-full !rounded-[26px]"`。
- **一次性自定义**：中度偏高。移动/桌面在同一棵树里用 `md:` 分支切换，但**同一语义有两套实现**（header、tabs、loading/error/empty 各写两遍），且 `m-chip` 与 `social-*` 两套 token 混用（如 `:279` `className="m-press m-chip m-chip-active !h-11 !px-6 !text-sm"`）。

### 6b. `components/social/SocialFilmCard.tsx`（127 行）
- **用途**：旅行故事卡（hero / card 两变体，4 种画幅）。
- **区域**：`hero` = 全宽 `rounded-[2rem]` 封面（`aspect-[16/10]`）+ 底部 `bg-gradient-to-t from-[#050505]/90 …` 压字（城市小标 / 标题 / 摘要 / 头像 + 三统计）；`card` = `rounded-[1.4rem]` 封面（画幅可变）+ `p-4` 文本区（城市 / 标题 / 摘要 / 关系·日期·天数·张数 / 分隔线 + 头像 + 三统计）。
- **导入的 `components/mobile/*`**：`Icon`（行 5）。无 `components/ui/*`。
- **计数**：`svar 20`、`arb 22`、`rounded-[] 2`、hex 2（`:91` `from-[#050505]/90 via-[#050505]/15`）、`grad 1`。
- **一次性自定义**：中度；完全走 `--social-*`，但圆角/渐变就地写死。

---

## 7. 我的 `/me` — `app/me/page.tsx`（34 行）+ `components/social/MeHome.tsx`（533 行）

- **用途**：账号与设置归属地 + 旅行档案摘要。
- **`app/me/page.tsx`**：`useApi('/api/me')` + `useSessionRedirect`；三态全部用 `AsyncState`（**无移动专用骨架**），正常 → `MeHome`。
- **`MeHome` 自上而下区域**：
  1. 根 `min-h-screen bg-[var(--social-bg)] pb-[calc(88px+env(safe-area-inset-bottom))]`
  2. **fixed 氛围层** `h-[420px] bg-[radial-gradient(...),radial-gradient(...)]`（行 285）
  3. 内层 `max-w-2xl` + `pt-[max(20px,env(safe-area-inset-top))]`
  4. `PullToRefresh`
  5. **移动 header**：`md:hidden` `LargeTitle title="我的" subtitle={displayName}`，trailing = `SocialThemeToggle` + 通知圆钮（带未读红点，`h-11 w-11`）
  6. **桌面 header**：`hidden items-center justify-between gap-3 md:flex`（行 312-330，同样内容手写一遍）
  7. ① 档案头图：`ProfileHero`（334 行，头像/名号/统计/封面）：`onEditProfile` / `onRecordTravel` / `onOpenAlbum` + 两个隐藏 file input
  8. ②（条件）下一趟未出发旅行卡（`m-press` + `rounded-[1.4rem]` + 图标方块 + 「准备中」）
  9. ③「我的空间」段头 + 空间入口大行（点击开 `SpacePanel`）
  10. ④「记录」`ListSection`（7 × `ListRow`：我的旅行 / 旅行画册 / 时间线 / 碎碎念 / 数据看板 / 我的收藏 / 旅行圈）
  11. ⑤（条件）「和 TA 们去过」chips 云
  12. ⑥「设置」`ListSection`（通知 / 数据与同步 / 导出记忆档案 / 账号设置 / `isOwner && !native` 时管理后台）
  13. 错误文案 + 「退出登录」大按钮（`rounded-[1.4rem]`）
  14. 品牌页脚小字
  15. `SpacePanel` 覆盖层 + 编辑资料 `Modal`（`components/ui/Modal`，内部手写 input/主按钮）
- **导入的 `components/mobile/*`**：`LargeTitle`、`PullToRefresh`、`ListSection`/`ListRow`、`Icon`（行 32-35）；`components/ui/*`：`Modal`（行 29）。
- **计数**：`svar 50`、`arb 52`、`rounded-[] 3`、`grad 2`、hex 0、`sh[] 0`。
  代表：`:285` 双层 `bg-[radial-gradient(…)]`；`:371` `rounded-[1.4rem] bg-[var(--social-surface)] p-4 ring-1 ring-[var(--social-line)]`（同一套圆角/描边算式在行 399、485、526 重复手写）；`:300` `h-11 w-11 … rounded-full … ring-1 ring-[var(--social-line)]`；`:513,:521` 输入框 `rounded-xl bg-[var(--social-bg)] … ring-1 ring-[var(--social-line)]`。
- **一次性自定义**：**中高**。虽用了 `LargeTitle`/`ListRow`，但「档案头图 + 时间/空间/同行者」这些块全部是就地手写的同类算式；且桌面 header 与移动 header 是同内容双实现。

---

## 8. 账号设置 `/me/settings` — `app/me/settings/page.tsx`（214 行）

- **用途**：移动端可用的账号设置（资料 / 安全 / 内容与数据 / 退出）。
- **区域自上而下**：
  1. 根 `min-h-screen bg-[var(--social-bg)] pb-[calc(96px+env(safe-area-inset-bottom))]`
  2. fixed `h-[320px] bg-[radial-gradient(55%_60%_at_50%_-10%,…)]`（行 102）
  3. `max-w-2xl` + `px-4 pb-8 pt-[max(16px,env(safe-area-inset-top))] sm:px-6 sm:py-8`
  4. `LargeTitle title="账号设置" subtitle="资料、安全与账号" back="/me"`（**无 `md:` 门控 → 桌面也显示大标题**）
  5. 加载态：`Loader2` spinner + 文案（非骨架）
  6. 「资料」卡：`rounded-[1.4rem] bg-[var(--social-surface)] p-5 ring-1 ring-[var(--social-line)]`，含账号名只读行 / 昵称 input / 个性签名 input / 错误行 / 保存按钮（`h-11 rounded-full bg-[var(--social-accent)]`）
  7. 「安全」`ListSection`（修改密码 → `/admin/change-password`；邮箱 → `/admin/settings`）
  8. 「内容与数据」`ListSection`（通知 / 导出记忆档案 / `isOwner && !native` 管理后台）
  9. 退出登录按钮
  10. 页脚说明（链接回 `/me` 改头像）
- **导入的 `components/mobile/*`**：`Icon`、`LargeTitle`、`ListSection`/`ListRow`（行 17-19）。无 `components/ui/*`。
- **计数**：`svar 21`、`arb 21`、`rounded-[] 2`、`grad 1`、hex 0。
  代表：`:102` `bg-[radial-gradient(55%_60%_at_50%_-10%,rgba(232,179,106,0.09),transparent_65%)]`；`:114` `rounded-[1.4rem] … ring-1 ring-[var(--social-line)]`（与 `MeHome` 同算式手写）；`:134,:143` 两个输入框重复长类串。
- **一次性自定义**：中度。设置了移动组件，但「资料卡 + 输入框」是手写；`LargeTitle` 未做 `md:hidden`（与其它页不一致）。

---

## 9. 通知 `/me/notifications` — `app/me/notifications/page.tsx`（4 行）+ `components/social/NotificationsList.tsx`（77 行）

- **用途**：互动通知列表（赞/评论/回复/收藏/关注）。
- **区域自上而下**：
  1. `min-h-screen bg-[var(--social-bg)] pb-28`
  2. `max-w-2xl px-4 py-6`（**无 safe-area 内联、无 env()**）
  3. 自定义 header：返回圆钮（→ `/me`）+ `Inbox` 小标 + 「我的通知」+ 未读胶囊；右侧 `SocialThemeToggle` + 「全部已读」按钮（行 42-52）
  4. 加载：居中 `Loader2`；空：居中文字
  5. 列表：`space-y-1.5`，每行 = `SocialAvatar size={36}` + 文案 + 时间 + 未读小圆点，行间 `border-b border-[var(--social-line)]`
- **导入的 `components/mobile/*`**：仅 `Icon`（行 6）。无 `components/ui/*`。
- **计数**：`svar 20`、`arb 19`、`grad 0`、hex 0、`rounded-[] 0`。
  代表：`:44` `rounded-full p-2 text-[var(--social-muted)] ring-1 ring-[var(--social-line)]`（手写返回钮，与 `LargeTitle` 的自带返回键重复实现）；`:51` 一行超长类串（主题 + 全部已读）；`:62` 行长类串。
- **一次性自定义**：**高**。这一页完全不使用 `LargeTitle`/`ListSection`/`ListRow`/`EmptyState`/`Skeleton`，手写 header 与列表行 —— 是「我的 → 通知」链路里唯一没有 iOS 大标题的页面。

---

## 10. 时间线 `/timeline` — `app/timeline/page.tsx`（232 行）

- **用途**：按年份回顾旅行与回忆。
- **区域自上而下**：
  1. 根 `relative min-h-screen overflow-x-hidden`
  2. `absolute h-64 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(228,180,120,0.16),transparent_72%)]`（行 54）
  3. `container-custom py-10 md:py-14`
  4. `PullToRefresh` 包裹
  5. **桌面 header**（`mb-12 hidden text-center md:block`）：标题 + 分隔线副标题 + 计数行（loading 时 `motion-safe:animate-pulse` 占位，行 58-72）
  6. **移动 header**（`md:hidden` `LargeTitle`「走过的时光」+ 计数副标题 + `back="/me"`，行 75-81）
  7. 三态：loading → 桌面 `TimelineSkeleton`（`hidden md:block`）/ 移动 `TimelineMobileSkeleton`（`md:hidden`，用 `Skeleton`/`SkeletonCard`，行 150-165）；空 → 桌面白卡 / 移动 `m-card`（行 94-107）；正常 → 年份时间线
  8. 时间线主体：每年一节 `pl-8 md:pl-12` + 左侧竖向渐变轴线 + 年份圆点/渐变横线；`Stagger` 内条目卡（`rounded-[22px] … md:rounded-2xl`，旅行可点 / 回忆不可点）
  9. 条目内部：类型胶囊（旅行/回忆）+ 日期 + 标题 + 描述 + 地点/mood 胶囊；`sm` 以上显示 96×80 缩略图
- **导入的 `components/mobile/*`**：`Icon`、`LargeTitle`、`PullToRefresh`、`Skeleton`/`SkeletonCard`、`Stagger`（行 5,12-15）。无 `components/ui/*`。
- **计数**：`arb 13`、`rounded-[] 2`、`sh[] 4`、`grad 5`、`mvar 4`、hex 1。
  代表：`:94` `shadow-[0_18px_40px_-28px_rgba(90,102,112,0.4)]`；`:127` `rounded-[22px] … shadow-[0_14px_34px_-24px_rgba(90,102,112,0.5)] … hover:shadow-[0_20px_44px_-24px_rgba(168,95,58,0.4)] … md:rounded-2xl`；`:113` `bg-gradient-to-b from-travel-bloom via-travel-sakura to-transparent`；`:175` 骨架里 `ring-4 ring-white dark:ring-[#12161C]`。
- **一次性自定义**：**高**。整页是 Web 杂志风（`travel-*` + 手写阴影/圆角/渐变），只在 header 与骨架挂了两个移动组件；`m-card` 只出现在空态（`:101`）与骨架（`:288`）。

---

## 11. 碎碎念 `/moments` — `app/moments/page.tsx`（73 行）+ `components/moments/MomentsContent.tsx`（57 行）

- **用途**：生活随记（发布器 + 时间线）。
- **`app/moments/page.tsx` 区域**：
  1. 根 `relative min-h-[calc(100vh-5rem)] overflow-hidden`
  2. 装饰光斑层：3 个 `bg-[radial-gradient(closest-side,…)]` 圆 + 3 个散点（行 17-24）
  3. `container-custom` → `max-w-2xl px-1 pb-16`
  4. **顶部右对齐 `ManageEntry`「管理碎碎念」**（`mb-5 flex justify-end`，**无 `md:` 限制 → 移动端也显示**，行 28-35）
  5. **桌面 header**（`mb-8 hidden text-center md:block`）：渐变胶囊标签 + 标题 + 副标题（行 37-49）
  6. **移动 header**（`md:hidden` `LargeTitle title="碎碎念" back="/me"`，trailing 又是 `ManageEntry`「管理」→ **移动端同时出现两处管理入口**，行 52-66）
  7. `<MomentsContent />`
- **`MomentsContent` 区域**：桌面 `hidden md:block` 内联 `MomentComposer`；`PullToRefresh` 包 `MomentTimeline`；移动 `md:hidden` **FAB**（`m-fab fixed bottom-[calc(80px+env(safe-area-inset-bottom))] right-4 h-14 w-14`，**内联 3 段硬编码渐变背景**，行 43-49）+ `BottomSheet` 内 `MomentComposer`
- **导入的 `components/mobile/*`**：页面 = `Icon`、`LargeTitle`；`MomentsContent` = `Icon`、`PullToRefresh`、`BottomSheet`。无 `components/ui/*`。
- **计数**：`app/moments/page.tsx` `arb 11`、`grad 4`、`mvar 3`；`MomentsContent.tsx` `arb 2`、`grad 1`（**硬编码 hex 渐变**）。
- **一次性自定义**：中度。页面壳与 `MomentTimeline` 走 Web token（`travel-*`、`.card`），仅标题/骨架/FAB 用移动件。

---

## 12. 数据看板 `/dashboard` — `app/dashboard/page.tsx`（19 行）+ `components/dashboard/DashboardClient.tsx`（190 行）

- **用途**：足迹与内容沉淀总览（大数 / 地图 / 省份打卡 / 内容构成）。
- **区域自上而下**（**单树，无移动专用分支；页面内 `md:` 只用于间距/列数**）：
  1. `app/dashboard/page.tsx`：`useApi('/api/dashboard')` → 三态全用 `AsyncState`（**无移动骨架**）→ `DashboardClient`
  2. 根 `bg-gradient-to-b from-travel-cream via-travel-parchment to-travel-cream dark:from-shell-bg dark:via-shell-surface2 dark:to-shell-bg`
  3. `container-custom py-10 md:py-14`
  4. 居中 header：`My Travel Space` 小标 + `font-display` 大标题 + 副标题（**无 `LargeTitle`、无返回**）
  5. 「核心大数」3 列卡（`grid-cols-3`，「点亮省份 / 旅行记录 / 照片」，每格 `h-12 w-12` 图标块 + `text-3xl` 数字）
  6. 「我的旅行足迹」标题 + `ChinaMap`（`h-[340px] sm:h-[440px] lg:h-[520px]`）包在 `rounded-[1.6rem]` 渐变卡里
  7. 两栏：左「省份打卡」进度条列表（`h-1.5` 轨道 + `bg-gradient-to-r from-travel-bloom to-travel-accent` 填充）；右「内容构成」圆点列表 + 「旅行类型」进度条 + 最近更新
- **导入的 `components/mobile/*`**：仅 `Icon`（行 13）。无 `components/ui/*`。
- **计数**：`arb 10`、`rounded-[] 4`、`sh[] 1`、`grad 4`、hex 2。
  代表：`:67` `bg-gradient-to-b from-travel-cream via-travel-parchment to-travel-cream dark:from-shell-bg …`；`:98-99` `rounded-[1.6rem] … bg-gradient-to-br from-travel-parchment via-travel-sakura/40 to-travel-mist/30 … shadow-[0_24px_50px_-24px_rgba(168,95,58,0.3)] dark:from-[#1F272E] dark:via-[#241B15]`；`:82` `rounded-[1.6rem] … bg-white/60 backdrop-blur-sm`。
- **一次性自定义**：**高**。零移动组件（仅 `Icon`），零 `m-*`/`--social-*`，零 safe-area，无返回控件 —— 移动端呈现的是完整桌面看板。

---

## 13. 搜索 `/search` — `app/search/page.tsx`（394 行）

- **用途**：关键词搜旅行记录（含高亮）。
- **结构**：`Suspense` 壳 + `SearchContent`；**同页两套独立 DOM 树**：
  - 桌面树 `container-custom hidden py-10 md:block md:py-14`（行 146-275）：杂志风 h1 + 副标题 + 大搜索框（`rounded-2xl` + 左侧放大镜 + 右侧清除）→ 加载卡 → 未搜索态（图标块 + 8 个热门标签胶囊）→ 无结果卡 → 结果卡列表（`card ribbon-hover`，`dangerouslySetInnerHTML` 高亮 `<mark class="bg-travel-bloom/40 …">`）
  - 移动树 `md:hidden`（行 278-391）：`bg-[var(--m-bg)] pb-[calc(88px+env(safe-area-inset-bottom))]` → `LargeTitle title="搜索" back="/"` → **iOS 搜索栏**（`rounded-2xl bg-[var(--m-surface-2)] px-3.5` + `focus-within:ring-2`，清除钮是 `h-7 w-7 rounded-full bg-[rgb(255,255,255,0.55)] dark:bg-[rgb(255,255,255,0.14)]`）→ 骨架 3 × `SkeletonCard` → 热门标签 `m-press m-chip` → `EmptyState` → `Stagger` + `m-card` 结果卡（`active:scale-[0.98]`）
- **导入的 `components/mobile/*`**：`Icon`、`LargeTitle`、`SkeletonCard`、`EmptyState`、`Stagger`（行 10-14）。无 `components/ui/*`。
- **计数**：`arb 20`、`rounded-[] 1`、`mvar 14`、`grad 0`、hex 0（`bg-[rgb(...)]` 属 rgba 函式任意值）。
  代表：`:302` `bg-[rgb(255,255,255,0.55)] … dark:bg-[rgb(255,255,255,0.14)]`；`:283` `rounded-2xl bg-[var(--m-surface-2)] … focus-within:ring-2 focus-within:ring-[var(--m-accent)]`；`:353` `m-card block p-4 transition-transform active:scale-[0.98]`。
- **一次性自定义**：**高**（双树 + 两套卡片/两套空态；且**两个 `<input>` 共用同一个 `inputRef`**，行 159 与 286 —— 移动分支在后挂载，`inputRef.current` 实际指向移动端输入框）。
- 底导来自壳层 fallback 分支（`/search` 不在任何特判里，行 90-110）。

---

## 14. 登录 `/login` — `app/login/page.tsx`（492 行）+ `components/login/LoginDoor.tsx`（219 行）

- **用途**：登录 / 注册 + 相册解锁（沉浸式全屏，**壳层不挂底导与 Navbar**，见 `LayoutContent.tsx:35-37`）。
- **`LoginDoor` 区域**：`min-h-screen overflow-hidden` → 全屏 `<video src="/videos/clover.mp4">` 背景（门开后才加载）→ `bg-gradient-to-b from-black/40 via-black/30 to-black/50` 遮罩 → **地图双开门**（左右各半 `rotateY(±108deg)`，`duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)]`，各挂 `DoorMap`；右上/左下品牌与文案；右下邮戳章；中央「封条」圆章显示最早纪念日；门缝漏光 `bg-gradient-to-r from-white/0 via-white/30 to-white/0`；底部「点击开门」提示）→ 内容卡入场 `animate-[card-pop_…]`
- **`app/login/page.tsx` 内容区区域**：`min-h-dvh` 居中容器 → `max-w-md` 毛玻璃卡（`rounded-3xl border-white/70 bg-white/90 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl`）：品牌行（`BrandLogo` + 「行迹」+ 已登录胶囊）→ h1（登录/注册切换文案）→ 表单（账号 / 密码 / [确认密码] / 错误块 / 「记住我」勾选 / 主按钮「解锁/注册并进入」）→ 「没有账号？注册一个」切换按钮 → 「相册解锁」按钮 → 分隔线 + **城市邮戳横滑**（9 个虚线圆章）+ 文案 → 「Made with ♥ by 行迹」
- **相册解锁两套实现**：桌面 `fixed inset-0 z-50 hidden … md:flex` 模态（行 357-420，`bg-gradient-to-br from-travel-parchment to-travel-parchmentDim` + `from-travel-sakura to-travel-bloom` 图标块）；移动 `md:hidden` → `BottomSheet`（行 423-475，`m-chip m-chip-active !mt-4 … !rounded-2xl !text-[15px]`）
- **导入的 `components/mobile/*`**：`Icon`、`BottomSheet`（行 9-10）。`LoginDoor`：`Icon`。无 `components/ui/*`。
- **计数**：`app/login/page.tsx` `arb 24`、hex 6、`grad 2`、`sh[] 1`、`anim[] 1`、`mvar 10`；`LoginDoor.tsx` `arb 8`、hex 2、`grad 2`、`sh[] 1`、`anim[] 1`、`duration-[]/ease-[] 4`。
  代表：`app/login/page.tsx:173` `inputCls` 长串含 `text-[#3D4852]`；`:196` `text-[#2D3842]`；`:360` `dark:from-[#1E1A1C] dark:to-[#241E22]`；`:484` `bg-[#1A1F26]`；`LoginDoor.tsx:193` `shadow-[0_10px_30px_rgba(168,95,58,0.25)]`、`:130` `animate-[card-pop_0.65s_cubic-bezier(0.22,1,0.36,1)_both]`。
- **一次性自定义**：**高**（整页自成一套暖纸 + 毛玻璃语言，仅 2 个移动组件；移动与桌面各一份解锁弹层，且输入框样式在页面内以 `inputCls` 变量手写）。

---

## 15. 画册 `/album`（904 行）与 `/albums`

- `app/albums/page.tsx`（5 行）：`redirect('/album')` —— 无 UI。
- **`app/album/page.tsx`（904 行；其中 65 行为空行，`Measure-Object -Line` 因此报 839）核心事实**：**多模式整页切换**（三套互斥视觉，均由同一路由渲染）：
  - `viewMode === 'book'`（**默认**）→ 直接 return `<TravelBook onModeChange …>`（`components/album/travel-book/TravelBook.tsx`，413 行）
  - `viewMode === 'space'`（未解锁 / 已解锁两态）→ `GalaxyAlbumScene`（WebGL 360°，失败回退 pixel）
  - `viewMode === 'pixel'`（默认兜底）→ 像素木屋桌面上锁页 / 书架 + 拍立得墙
  - 另有 `view === 'chat'` 全页留言视图（`PixelPhotoChat` / `PhotoChatView`）
- **像素模式区域自上而下**：根 `album-pixel-root bg-album-bg1` + `PixelDeskBackground`（48 行）→ 原生壳专用右上角 `AlbumComposer`（`fixed right-3 top-16 z-[120]`）→ **sticky 顶栏** `h-14 border-b-4 border-black bg-black/45`（返回 / 标题 / 切「旅行画册」/ 切「银河」/ 桌面操作组 `hidden md:flex`(管理·星图·进入地图) / 移动「更多」`md:hidden` 下拉菜单）→ 封面横幅 `book-cover-3d` + 四角 `pixel-corner-gold-*` → 两栏 `lg:grid-cols-[280px_1fr]`：左「旅行书架」书脊横滑（`w-14 h-36` + `book-spine-*` 6 色 + `wood-shelf`）、右「拍立得记忆」（`TravelLocationBadge` + `TravelTimeline` + `DriftWall` WebGL 照片墙，移动 `h-[440px]`、桌面 `h-[calc(100vh-230px)]`）→ 「纪念相册」区（旅行类型 chips + 同行者 chips + `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` 的 `TravelFilmCard` + `AddPhotoButton`）→ 覆盖层：`TravelArchiveView` / `showStarMap` 全屏（`fixed inset-0 z-[110] bg-album-bg0`，自带 sticky 顶栏 + `TravelStarMap`）/ `PhotoMorphViewer`
- **`TravelBook`（默认模式）区域**：`sticky top-0 z-40 h-14` 顶栏（返回 / 标题 / 视图切换胶囊）→ 章节目录 `album-scatter grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` 或列表视图（`rounded-2xl … shadow-[0_30px_50px_-34px_rgba(41,39,35,0.45)]`）→ 加载覆盖层（`fixed inset-0 z-[90] backdrop-blur-[2px]`）
- **导入的 `components/mobile/*`**：仅 `Icon`（`app/album/page.tsx:8`；`TravelBook.tsx:17` 等子组件同样只引 `Icon`）。无 `components/ui/*`。
- **计数**：`app/album/page.tsx` `arb 18`、`sh[] 9`、`anim[] 3`、`grad 0`、`rounded-[] 0`；`TravelBook.tsx` 见 `shadow-[…]`、`bg-[#FFFCF7]`、`sm:/md:/xl:` 分支。
  代表：`app/album/page.tsx:303` `shadow-[0_0_40px_var(--album-accent-dim)]`；`:523` `shadow-[0_10px_24px_rgba(0,0,0,0.6)]`；`:637` `shadow-[3px_6px_8px_rgba(0,0,0,0.6)]`；`:360` `drop-shadow-[0_4px_0_rgba(0,0,0,0.7)]`；内部 `star` 元素用内联 `style` 写 `animation: space-twinkle …`（行 295）。
- **一次性自定义**：**极高**。画册是三套平行视觉体系（像素 / 银河 / 书），全部 `album-*` + `pixel-*` 色板与 `.pixel-*` / `.book-*` / `.space-*` 自定义 CSS 类（`globals.css` 行 349 起 + `components/album/*.css`），移动端只共用 `Icon` 与 `MobileBottomNav`；`LayoutContent` 还把 `/album*` 排除在底导之外。

---

## 16. 壳层三件套（逐项）

### 16a. `components/layout/MobileBottomNav.tsx`（105 行）
- **用途**：全局底部 Tab（5 格，中间 FAB）。
- **区域**：`nav.m-glass fixed inset-x-0 bottom-0 z-40 pt-[6px] pb-[max(6px,env(safe-area-inset-bottom))] md:hidden`（内联 `borderTop: '0.5px solid var(--m-line-strong)'` 与 `background: 'var(--m-surface)'`）→ `grid max-w-md grid-cols-5`：首页 / 旅行 / 中央 `h-[52px]` 占位内的 `m-fab m-press h-14 w-14 -translate-x-1/2 rounded-full bg-[var(--m-accent)]` / 旅行圈 / 我的；TabItem = `m-pressable m-tab-label min-h-[52px] flex-col gap-1` + `Icon size="md"`，激活态只换文字/图标颜色（`text-[var(--m-accent-strong)]`），带 `hapticLight()`。
- **导入的 `components/mobile/*`**：`Icon`（行 9）。无 `ui/*`。
- **计数**：`arb 5`、`mvar 5`、`grad 0`、`sh[] 0`（FAB 靠 `.m-fab` 类）。
- **一次性自定义**：低（内联 border/background 是唯一手写处）。

### 16b. `components/layout/Navbar.tsx`（333 行）
- **用途**：桌面顶部导航（移动端抽屉）。
- **区域**：`fixed top-0 h-16`（`bg-white/80 backdrop-blur-md border-b`，`transparent` 变体滚动后才上底色）→ 品牌 `BrandLogo` + 「行迹」→ `hidden md:flex` 主导航（5 项 + 搜索 + 主题 + 后台 + 用户名/登出）→ `flex md:hidden` 移动动作组（搜索 / 主题 / 后台 / 汉堡）→ portal 全屏抽屉（`fixed inset-0 z-50 md:hidden`，遮罩 `top-16 bg-black/45` + 下拉面板 `rounded-b-2xl shadow-[0_24px_48px_rgba(0,0,0,0.25)]` + 6 行条目 + 登出）。
- **导入的 `components/mobile/*`**：`Icon`（行 6）。无 `ui/*`。
- **计数**：`arb 2`、`sh[] 1`、`anim[] 2`（`motion-safe:animate-[fadeIn_.18s_ease-out]` / `animate-[menuDrop_.22s_cubic-bezier(0.22,1,0.36,1)]`）、`mvar 0`。
- **一次性自定义**：高（整页 Web `travel-*`/`shell-*` 双主题类串，与移动 `m-*` 体系并存；抽屉面板是手写，未用 `BottomSheet`）。

### 16c. `components/layout/LayoutContent.tsx`（112 行）
- **用途**：按路由决定壳层组合（详见 §0 表）。
- **导入的 `components/mobile/*`**：`MobilePageTransition`（行 7）。无 `ui/*`。
- **计数**：`arb 0`、`grad 0`、`sh[] 0`。
- **事实**：`/timeline`、`/moments`、`/dashboard`、`/search`、`/me/favorites`、`/sync` 等全部落到同一 fallback（行 90-110）；移动端 `main` 为 `pt-0`，因此**页面必须自带顶部安全区与返回控件**，而 `dashboard` / `notifications` / `travel/[slug]` 并没有。

---

## 17. 「自定义 vs 共享移动组件」总表（问题 6 汇总）

| 页面 / 文件 | 移动组件使用度 | 判定 |
|---|---|---|
| `components/HomeMobile.tsx` | PullToRefresh, Skeleton×3, EmptyState, Stagger, CountUp, Icon, IconBadge | **高（体系内）**，仅渐变遮罩与 `!` 覆盖手写 |
| `app/travel/TravelMobileClient.tsx` | PullToRefresh, Skeleton×2, EmptyState, Stagger, CountUp, Icon, StatRow | **高（体系内）**，硬编码 hex 渐变 1 处、奇偶圆角手写 |
| `components/travel/TravelComposerForm.tsx` | 仅 Icon | **低**：全手写输入/分节/chips/底部 CTA（`arb 121`） |
| `app/travel/[slug]/record/TravelRecordPage.tsx` | 仅 Icon | **极低**：整页 Web `travel-*` 风格，0 个 `--m-*` |
| `app/travel/[slug]/TravelDetailShell.tsx` | TravelTypePill, Icon | **极低**：Web `prose`/`container-custom`，0 个 `--m-*`，移动端无返回 |
| `app/travel/[slug]/TravelDetailClient.tsx` | 仅 Icon | **极低**：自成全屏海报体系 |
| `components/social/TravelCircleFeed.tsx` | LargeTitle, SegmentedControl, PullToRefresh, EmptyState, Skeleton×2, Stagger, Icon | **高**，但移动/桌面同页双实现 |
| `components/social/SocialFilmCard.tsx` | 仅 Icon | **低**：自带圆角/渐变算式 |
| `components/social/MeHome.tsx` | LargeTitle, PullToRefresh, ListSection/ListRow, Icon (+ui/Modal) | **中高**，档案/空间/统计块手写；桌面 header 双实现 |
| `app/me/settings/page.tsx` | LargeTitle, ListSection/ListRow, Icon | **中高**，资料卡与输入框手写；`LargeTitle` 未做 `md:hidden` |
| `components/social/NotificationsList.tsx` | 仅 Icon | **低**：手写 header + 手写列表行 |
| `app/timeline/page.tsx` | LargeTitle, PullToRefresh, Skeleton×2, Stagger, Icon | **中**：主体为 Web 时间线（`sh[] 4`、`grad 5`） |
| `app/moments/page.tsx` + `MomentsContent.tsx` | LargeTitle, Icon / PullToRefresh, BottomSheet, Icon | **中**：装饰光斑、FAB 硬编码渐变手写 |
| `components/dashboard/DashboardClient.tsx` | 仅 Icon | **极低**：桌面看板原样，无 safe-area / 无返回 |
| `app/search/page.tsx` | LargeTitle, SkeletonCard, EmptyState, Stagger, Icon | **高**（移动树）但整页双树重复 |
| `app/login/page.tsx` (+`LoginDoor`) | BottomSheet, Icon | **低**：自成一套；解锁弹层双实现 |
| `app/album/page.tsx` (+`TravelBook` 等) | 仅 Icon | **极低**：三套平行视觉（像素/银河/书），靠自定义 CSS 类 |
| `MobileBottomNav` / `Navbar` / `LayoutContent` | Icon / Icon / MobilePageTransition | 底导在体系内；Navbar 是 Web 体系 |

---

## 18. 移动端 vs 桌面：同树 / 分树（问题 8）

**分树（移动与桌面是两份独立组件，都在 DOM 里，用 `hidden md:block` / `md:hidden` 切换）**
- `/`（`app/page.tsx:22-59` → `HomeClient` 桌面 vs `HomeMobile` 移动；错误/加载态也各两套）
- `/travel`（`app/travel/page.tsx:54-83` → `TravelClient` 桌面 vs `TravelMobileClient` 移动）
- `/search`（`app/search/page.tsx:146-275` 桌面 div vs `:278-391` 移动 div；同一个 `inputRef` 被两棵树的 input 共用）
- `/login` 的相册解锁层（桌面模态 `:357-420` vs 移动 `BottomSheet` `:423-475`）——**但页面主体是同一棵树**
- `/moments` 的发布器（`MomentsContent.tsx:28` 桌面内联 vs `:38-53` 移动 FAB+BottomSheet）——**页面主体同树**

**同树响应式（一份 DOM，靠 `md:` 分支切换局部）**
- `/circle`（`TravelCircleFeed`：header 双实现 `:168`/`:183`、tabs 双实现 `:198`/`:206`，其余共享）
- `/me`（`MeHome`：header 双实现 `:290`/`:312`，其余共享）
- `/me/settings`、`/travel/new`、`/travel/record`、`/travel/[slug]`、`/travel/[slug]/record`、`/timeline`（头部双实现 `:58`/`:75`，骨架双实现）、`/moments`、`/dashboard`、`/album`（`/album` 是模式级切换，不是断点级）、壳层 `LayoutContent` / `MobileBottomNav` / `Navbar`

**事实性结论**：分树只用于 3 个主页面（首页、旅行列表、搜索）+ 2 个局部弹层；其余全部是「同一棵树 + 若干 `md:hidden` / `hidden md:flex` 的头部双实现」。移动端专属视觉体系由 `app/mobile.css` 的 `--m-*` 与 `m-*` 工具类承载，社交线页面另有 `--social-*` 体系，画册线另有 `album-*` / `pixel-*` 体系，Web 线仍有 `travel-*` / `shell-*` / `semantic-*` —— 五套色板在同一 App 内并存。
