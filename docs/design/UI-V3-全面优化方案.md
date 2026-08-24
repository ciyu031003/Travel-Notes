# Travel-Notes 前端 UI 收敛续篇（UI-V3.1）

> 版本：v3.1 · 2026-08-25 · 基于当前 HEAD `c132a3c`
> 定位：**收敛续篇**，替代 v1.0《UI-V3 全面优化方案》。v1.0 按"全新完整审计"写，未区分已完成项，导致约四成建议会重复已做工作（UI Phase 1–6 + admin 品牌统一）。本版逐条对照代码核实，补「已完成 vs 待办」台账，并消解 v1.0 的自相矛盾与漏项。
> 结论前置：**设计基础（暖陶土 `travel.*` + 羊皮纸 + 旅行手账定位）健康，不需推翻。** 收敛未竟之工即可——重点是消灭最后残余的冷色/紫色残留、统一暗色、收口导航与组件库，并用可量化的验收标准闭环。

---

## 一、已完成 vs 待办 台账（delta）

### 1.1 已完成（前期 UI Phase 1–6 + admin 品牌统一，**勿重做**）

| 已完成项 | 依据 |
|---|---|
| 品牌「行迹」+ 全站去情侣化（我们的小家/甜途/两人 → 行迹） | Phase 1 |
| app 外壳/首页/登录/后台登录 `travel.*` token 收敛（含 29 文件等值替换、视觉零变化） | Phase 2–4 |
| 设计系统色温收敛为「行迹」暖陶土 + 数据看板日期健壮性 | Phase 5 |
| 首页 Hero 空间感收紧 + 足迹地图变视觉主体 + 旅行相册沉浸标识 + 前台 `AsyncState` 异步状态统一 | Phase 6 |
| 数据看板重定位为"旅行记忆空间"（护照式大数 / 足迹图前置 / 去报表感） | Phase 1（新版） |
| `ui/` 基础组件 Button/Badge/SectionHeader + Typography Scale（display-hero/1/2 + heading/body/caption/data）落地 | 新版 Phase 2 |
| 个人档案「我的记忆」4 格照片化（暖色计数底、防截断） | 新版 Phase 3 |
| 双主题统一：全局 body 暗色底对齐 `--social-bg` 极黑暖调 | 新版 Phase 4 |
| admin 后台品牌统一：AdminShell 去冷灰 token 化 + `admin/ui` 组件（Input/Textarea/Button/Card）替换碎碎念/纪念日/旅行规划重复手写 | `c132a3c` |

### 1.2 仍未完成（**本版聚焦的范围**）

| 待办项 | 核实结论 |
|---|---|
| 五套 Token → 统一语义层 `semantic.*`（含 `primary` **蓝**残留清除） | `tailwind.config.js` 仍无 `semantic.*`；仍并存 `travel/pixel/album/night/primary` + `--social-*` CSS 变量 |
| 四套导航 → 两层壳（标准/档案/沉浸） | `LayoutContent.tsx` L14–25：`/travel` 无标准壳（仅 children+MobileBottomNav）；`/me /circle /sync /album` 空壳**无底部导航**（仍成立） |
| `ui/` 依赖组件补齐（Input/TextArea/Card/Modal/Select/Tooltip/Skeleton/Dropdown/Tabs） | `components/ui/` 仍仅 3 个；`admin/ui.tsx` 已有 Input/Textarea/Button/Card，可上提复用 |
| 前台剩余 `gray-*` 硬编码（时间线/搜索/碎碎念/TravelPreviewModal/CommandPalette 等） | 搜索/时间线/碎碎念/弹幕/命令面板仍大量 `gray-*` |
| pink/rose/purple 残留审计 | 19 处，具体见 §3.1 |
| 暗色三套归一为 `night.*` + `--social-*` 迁移 | `night`/`album`/dark: 内联仍并存 |
| 动效/无障碍/性能/移动端打磨 | 未动，量化标准见 §4 |

---

## 二、v1.0 需要校准的问题（已逐条核实并修正）

1. **`primary` 蓝残留是漏项**：`app/admin/settings`、`app/admin/change-password`、`app/admin/setup` 仍用 `focus:ring-primary-500`；`components/AccountSettings.tsx:86` 用 `from-primary-500 to-purple-500`。它不属于 v1.0 列的"五套"，应并入清除清单。
2. **"455 处 gray-* 清零"与"admin 可保留冷灰"自相矛盾**：二者只能取其一。本版建议——把 admin 定义为**独立的"中性/后台"语义 tone**（后台用中性色本来合理），并**明确清零范围只限用户可见页**，否则"清零"永远无法闭环。
3. **`pixel.*` 定位不清**：v1.0"三档浓度"只提 album 作沉浸主题，未给 pixel 结论。本版建议：**保留 pixel 作为像素沉浸主题**（Stage 0/1 已投入，识别度高），但语义命名与 `album.*` 对齐，不再扩大面。
4. **旅行圈亮色已支持（无需存疑）**：`globals.css:114` `--social-bg:#F7F4EE`（亮）+ `:135` `--social-bg:#080808`（暗）双套齐全。v1.0 4.7"旅行圈是否支持亮色？需确认"应直接改为"已支持，只需走 `semantic.*` 适配"。
5. **`/sync` 是第 5 个空壳（漏项）**：`LayoutContent.tsx:20` 含 `/sync`，但 v1.0 壳层收敛未纳入。三层壳定义应含它。
6. **`Noto Serif SC` 未自托管、`katex/highlight.js` 全局 `@import`**：`app/globals.css:1-2` `@import 'highlight.js/...' + 'katex/...'`；无 `next/font`。对中文站是真性能杠杆（见 §4.4）。
7. **pink/rose/purple 不止 timeline 一处**：v1.0 只点 timeline「回忆」紫色。实际 19 处，含 admin 头像渐变（`via-pink-500 to-orange-300`）、`admin/social` accent（`from-pink-400 via-rose-400`）、`TravelPreviewModal:300`（`bg-pink-100`）、`AccountSettings`（`to-purple-500`）。

---

## 三、收敛路线图（只做剩余工作）

### P0（立即 · 1–2 周）—— 消最刺眼的不一致 + 壳层收口

1. **时间线/搜索页 `gray-*` token 化**：`app/timeline/page.tsx`、`app/search/page.tsx` 全页；时间线「回忆」标签 `bg-purple-50 text-purple-500` → `bg-travel-mist/50 text-travel-sky`（`page.tsx:110`）；时间线节点 `border-gray-900` → `border-travel-cream dark:border-night.bg`。
2. **`/me` `/circle` 接入 `MobileBottomNav`**：`LayoutContent.tsx` 中 `isMePage/isCirclePage` 分支加 `<MobileBottomNav />`（保留自绘 header，含主题/通知/空间）。
3. **`/travel` 改走标准壳**：移除 `TravelClient.tsx` 自绘 header，接入 Navbar；旅行页特有「相册/管理旅行」入口移至 Navbar 条件区或 SectionHeader action；`pt-14` → `pt-20`。
4. **Navbar 去"管理感"**：`Settings` 齿轮改 tooltip「设置与管理」或移入用户下拉菜单；顶栏只留搜索+主题+头像。
5. **搜索框**：`app/search/page.tsx` 改用 `ui/Input` variant="search"；关键词高亮 `bg-yellow-200` → `bg-travel-bloom/40 text-travel-accentStrong`。
6. **首页 H1**：`HomeClient.tsx:317` `text-[44px]...xl:text-7xl` → `display-hero` token。
7. **`/travel` 移动端地图**：`TravelClient.tsx:157` `h-[62vh]` → `h-[40vh]` + 快速滚动按钮；左右面板 `w-6 h-12` 收起条 → `w-10 h-10 rounded-full` 浮动圆钮。

### P1（2–4 周）—— 语义层 + 组件库 + 灰/紫残留清零

1. **建立 `semantic.*` 语义层**（tailwind config 新增，值经 CSS 变量映射；`bg/surface/surface2/text/muted/faint/border/accent/accentSoft`），并**并入 `primary` 蓝的清除**（替换 admin `focus:ring-primary-500`、`AccountSettings` 渐变）。
2. **`ui/` 组件库补全**：Input/TextArea/Card/Modal/Select/Tooltip/Skeleton/Dropdown/Tabs；`admin/ui.tsx` 组件上提复用，一切走 `semantic.*` 内置 `dark:`。
3. **前台剩余 `gray-*` 清零**（用户可见页）：时间线/搜索/碎碎念/TravelPreviewModal/CommandPalette/LikeButton/CommentsSection/MomentTimeline/StackedImageSlider。
4. **pink/rose/purple 残留审计清零**（19 处，含 admin 头像渐变/社交 accent/TravelPreviewModal/AccountSettings）。
5. **Typography 收敛**：内联 `text-[8-11px]` → `caption`；eyebrow 统一 `caption` + `uppercase tracking-[0.24em]` + `semantic.accent`。
6. **`--social-*` 变量迁移到 tailwind config**（与 `night.*` 合并），旅行圈/档案改走 `semantic.*` 暗色映射。
7. **admin 指定"中性/后台"语义 tone**（`semantic.*` 后台变体），明确其不清零、不混入前台暖色。

### P2（4–6 周）—— 页面精修 + 暗色归一

1. **暗色三套归一为 `night.*`**：`dark:bg-[#12161C]` → `dark:bg-night.surface`、`dark:text-[#9BA3AE]` → `dark:text-night.muted`、`dark:border-[#2C343E]` → `dark:border-night.line`；相册 `album.*` 保留为独立沉浸主题但语义对齐。
2. **对比度核查**：`night.faint`(46% 白)/`night.muted`(70% 白) 在 `night.bg #080808`，`accentSoft #C97E55` 在 `cream #FAF6EE`——逐项算 AA，不达标调整。
3. **数据看板「内容构成」视觉化**：改旅行记忆拼图（3 张缩略卡 + 计数）或下沉页底；省份打卡改「邮票打孔/路线轨迹」，前 3 名加奖牌。
4. **档案页**：顶部 5 个 icon 按钮分组（左返回、右通知/主题/更多）；无照片「我的记忆」用拍立得空白框；统计改「护照式大数」`ui/StatCard`（与看板共用）。
5. **相册导航**：`href="/login"` → `"/"`；像素模式移动端「返回+更多(...)」2 按钮；双视图切换统一 icon；补「重新锁定」入口。
6. **全站 Modal 替换 `ui/Modal`**（统一 sheet/scale-in + focus trap + ESC + `prefers-reduced-motion`）。

### P3（6–8 周）—— 动效/无障碍/性能/移动端量化达标

1. **PageTransition**（包裹 main）+ **RevealOnScroll**（Intersection Observer）。
2. **按钮 `active:` 按压反馈 + 卡片 hover 规范统一**。
3. **无障碍 audit**：icon 按钮补 `aria-label`；图片补 `alt`（装饰 `alt=""`）；`ui/Input` 支持 `label`；`<body>` 前加 skip link。
4. **性能**：`HomeClient` 拆 `DanmakuLayer/LeaveMessageModal/DailyQuote/FeatureCard`；`ChinaMap` 按需加载；**字体自托管**（Noto Serif SC 走 `next/font/google`）；katex/highlight 改 MDX 组件按需加载。
5. **移动端**：底部 padding 统一 `pb-20/pb-12`；相册双指捏合；下拉刷新（仅移动端）；表单 Modal 键盘遮挡适配。
6. **微交互彩蛋（克制，≤200ms，`prefers-reduced-motion` 禁用）**：罗盘 Logo hover 旋转、书脊微动、时间线节点波纹。

---

## 四、量化验收标准（KPI 附录）

> 每项"定义完成"，避免"看起来像"的模糊验收。改一段便对着验收。

### 4.1 颜色一致性
| 指标 | 达标线 |
|---|---|
| 用户可见页 `gray-*` | **0 处**（`grep -rn "gray-" app 与部分 components` 对用户页为 0） |
| 用户可见页 `pink/rose/purple` | **0 处** |
| `primary.blue` | **0 处**（admin 中性 tone 用 `semantic.*` 后台变体） |
| `semantic.*` 覆盖率 | 新页面/新组件 **100%** 用 `semantic.*`；存量页迁移后无裸 `#xxxxxx` 任意值（`text-[#..]` 清零） |
| 暗色色板 | 标准壳一律 `night.*`；相册 `album.*`；无散落 `dark:bg-[#..]`（回退 `semantic.*` 后应接近 0） |

### 4.2 导航/壳层
| 指标 | 达标线 |
|---|---|
| 壳层数 | 3 层（标准/档案/沉浸）；`/travel /me /circle /sync` 均有底部导航或明确沉浸 |
| 全站任意页可切换 | 进入底部导航的页，5 个 tab 均可来回切换 |
| 旅行页 | 使用标准壳，无自绘 `<header>` |

### 4.3 可访问性
| 指标 | 达标线 |
|---|---|
| icon-only 按钮 | 均有 `aria-label`（全量 audit） |
| 图片 | 均有 `alt`（装饰 `alt=""`） |
| 键盘 | Modal 焦点 trapped + ESC 关闭 + 关闭后焦点回触发元素 |
| 表单 <label> | `ui/Input` 支持 label；登录/找回/档案编辑无仅 placeholder 的输入框 |
| Skip link | `<body>` 最前有「跳到主内容」（`sr-only focus:not-sr-only`） |
| 对比度 | 用户可见正文在明/暗两主题下均过 WCAG AA（≥4.5:1 正文 / ≥3:1 大字） |

### 4.4 性能
| 指标 | 达标线 |
|---|---|
| 首屏 LCP | 本机开发环境 ≤ 2.5s；登录页 Lighthouse P ≥ 70（当前 69） |
| 字体 | Noto Serif SC 自托管（无 Google Fonts 远程请求）；`katex/highlight.js` **不**全局 `@import`（按需） |
| 重组件 | `GalaxyAlbumScene/ChinaMap/PolaroidWall/TravelStarMap` `dynamic import` + `ssr:false`（已做，核查看板页 ChinaMap） |
| Bundle | `next build` 后无 > 300KB 页面级 chunk 阻塞 LCP（`/login` 当前 321KB，需拆首屏） |
| 图片 | 首屏 `priority`、非首屏 `lazy`；`sizes`/`quality` 配置齐全 |

### 4.5 移动端
| 指标 | 达标线 |
|---|---|
| 横向滚动 | 320/375/390px 核心页 `scrollW==0`（无横向溢出） |
| 底部 padding | 有导航页 `pb-20`、桌面 `pb-12`，无内容被导航遮挡 |
| 目录/首屏 | `/travel` 移动端地图 ≤ 40vh，首屏可见列表入口 |
| 点击目标 | 最小 44×44px（Lighthouse target-size 达标） |
| 手势 | 相册双指捏合缩放可用 |

---

> 完成标准：§4 各表逐项勾选，`git` 内无「已完成/待办」未闭环项；剩余工作全部收敛到本版 P0–P3。
> 版本说明：v3.1 替代 v1.0（已按当前 HEAD `c132a3c` 逐条核对；v1.0 中被本版标记为"已完成/勿重做"的项，见 §1.1 台账与 `改动记录.md`）。
