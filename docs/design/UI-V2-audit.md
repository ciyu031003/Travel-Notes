# Travel-Notes 前端 UI 审计报告（V2）

> 阶段：第一阶段 · 只分析、不修改代码
> 依据：完整阅读 app/（36 页面路由）、components/（约 90 组件）、tailwind.config.js、app/globals.css、layout/导航/首页/旅行/相册/档案/看板/社交/登录等关键实现
> 结论前置：**现有视觉基础（品牌「行迹」+ 暖陶土 travel.* token + 去情侣化 + 双主题）是健康、有识别度的，不需要推翻重来。** 本审计聚焦「一致性、信息层级、系统化 token、组件复用、页面差异化」五个维度。

---

## 一、当前设计风格总评

### 1.1 整体视觉
- **主色语言成立**：旅行暖陶土（`accent #A85F3A`）+ 羊皮纸/暖米背景（`cream #FAF6EE`/`parchment #FDF5ED`），已彻底摆脱「情侣粉」和「科技紫」两套旧方向。这是本项目**最有价值的资产**。
- **双主题完整**：亮色（暖米/陶土）+ 暗色（旅行档案/旅行圈用 `night` 极黑 + 暖金），且通过 `--social-*` CSS 变量统一切换，成熟度高。
- **品牌识别度**：品牌名「行迹」、罗盘 Logo、字体 `Noto Serif SC`（display）+ PingFang（sans）构成基本识别。登录页「地图门」交互是**独有签名元素**。

### 1.2 存在的问题

| # | 问题 | 严重度 | 证据 |
|---|------|--------|------|
| 1 | **三套并存的"设计语言"**，页面间风格割裂 | 高 | ①标准壳（首页/时间线/搜索/Forgot）× ②沉浸壳（相册/旅行详情全屏）× ③档案壳（/me /circle 走 `--social-*` 变量 + `night` 暗色）。三者圆角/卡片/导航/标题样式各不相同。 |
| 2 | **数据看板化** /page 走 Dashboard 布局，背离"旅行记忆"定位 | 高 | `DashboardClient.tsx`：6 张彩色渐变 StatCard + 排行条 + 内容构成，是最"管理后台"的一页。 |
| 3 | **系统级 token 未统一**，硬编码残留 | 中高 | `Navbar/Footer/DashboardClient` 大量 `bg-white/80`、`text-gray-900/dark:text-gray-100`、`border-gray-200`，与 travel.* / social.* token 并存。 |
| 4 | **Component 复用度低，重复实现多** | 中高 | 登录/找回/设置各写一套表单；状态占位在 6+ 页面重复（我们已抽 AsyncState 但未全量替换）；卡片/输入框/胶囊各有 2-3 种写法。 |
| 5 | **圆角与卡片过度统一** | 中 | 大量 `rounded-2xl card` + `rounded-full` 胶囊，存在"所有元素同 Card"倾向，缺层次。 |
| 6 | **信息层级权重失衡** | 中 | 首页「最近旅行」「碎碎念」「纪念日」「每日一言」「功能入口」五段平铺；旅行档案「核心统计(3个数)」权重过了、「我的旅行故事」被推后。 |
| 7 | **功能入口的"管理感"** | 低 | admin 入口（Settings 图标）出现在主 Navbar 和首页功能卡，面向终端用户的产品里偏后台。 |

---

## 二、页面层级问题

### 2.1 各页面「用户最该看到什么」对照

| 页面 | 现状信息顺序 | 用户最该先看到 | 权重问题 |
|------|------------|---------------|---------|
| 首页 `/` | Hero足迹地图 → 最近旅行 → 碎碎念 → 纪念日 → 每日一言 → 功能入口 | **最近一次去哪了 + 最近发生了什么** | Hero 地图占比大但信息密度低；「功能入口」（旅行相册/留言板/时间线）在首屏之后，移动端要到第 4 屏。 |
| 旅行 `/travel` | 顶部地图(可收起左右面板) → 全部旅行记录列表 | **足迹地图 + 记录列表** | 地图下方才是列表，移动端首屏被地图占满。 |
| 个人档案 `/me` | 身份区 → 最近一次旅行(大图) → 核心统计(3数) → 我的记忆(4格) → 我的旅行故事(瀑布流) | **我是谁 + 我走过的人生** | 结构其实很好，但「我的记忆」用 4 个数据格子（相册/旅行/碎碎念/收藏）偏"入口面板"，缺照片氛围。 |
| 数据看板 `/dashboard` | 6 统计卡 → 中国地图 → 省份排行 → 内容构成 | **足迹图 + 关键数字** | 最"Dashboard"化的一页，需要重定位。 |
| 旅行详情 `/travel/[slug]` | 全屏沉浸相册(滚动) → 返回旅行记录 → 正文+时间线 | **打开一本相册的感觉** | 已是产品内最好的沉浸体验，保留。 |
| 相册 `/album` | 暗色锁屏 → 相册 | 图片 | 沉浸感强，保留。 |

---

## 三、Typography

### 3.1 现状
- **字体族**：`display: Noto Serif SC`（标题/数字）、`sans: PingFang SC`（正文）、`mono: JetBrains Mono`、`zpix`（像素符号）。拉丁子集用自托管 `Inter` / `Playfair Display`（消除 Google Fonts 阻塞，D3 已做）。
- **字号**：Tailwind 默认 scale，但从 `xs(12px)` 到 `4xl(36px)`，**缺少 5xl/6xl 级别的英雄标题**（首页 H1 用 `text-[44px]`、`md:text-6xl` 内联，未进 token）。

### 3.2 问题
1. **字号不在一套 scale 上**：首页 H1 `text-[44px]/6xl/7xl`、个人档案 H1 `text-2xl`、数据看板 H1 `text-3xl` —— 各页标题大小没有统一节奏。
2. **小字号滥用**：设计规范已要求 `text-[9-11px]` 上调到 `text-xs`，但部分 meta 仍见 `text-[11px]`（档案的 eyebrow、胶囊）。
3. **字重层级**：主要用 `font-bold/font-semibold`，缺 `font-medium` 到顶的梯度，正文与标题对比不够靠字重拉开，更多靠字号。

### 3.3 目标：一套 Typography Scale
```
display hero   : display, 44-72px, weight 700, tracking -0.02em   （首页/档案大标题）
display h1     : display, 30-36px, weight 600
h2 section     : display, 22-26px, weight 600
h3 card        : sans,     16-18px, weight 600
body           : sans,     15-16px, weight 400, lineHeight 1.7
caption/meta   : sans,     12-13px, weight 400, color muted
data/big-num   : display,  28-40px, weight 700, tabular-nums
```
（不改全局字体，只建立从 12→72 的统一 step，收敛内联 `text-[xx]`。）

---

## 四、Color System

### 4.1 现状（Asset）
- **主色板 `travel.*`**（19 色）已完整覆盖 primary/secondary/background/surface/border/text/muted 需求。
- **语义色**：`success/warning/danger` + `album.error` + `night.gold`。
- **双主题**：`--social-*` 变量贯穿档案/旅行圈，`--album-*` 贯穿相册。

### 4.2 问题
1. **语义色未进 travel 命名空间**：`success/warning/danger` 仍是无前缀的 50/500/600/700，与 `travel-accent` 等命名不协调。
2. **硬编码 slate/gray 残留**：`Navbar（bg-white/80、text-gray-300/dark:）、Footer（border-gray-200）、DashboardClient（text-gray-900/500/400）` 等未用 token。这些是页面间不一致的主因。
3. **对比度**：`accentSoft #C97E55` 在暗色背景上作正文/次级文字时对比偏弱；`cream/white` 文字方案需注意。

### 4.3 目标
- 统一走 `travel.*`（亮）+ `social.*`（档案/圈）双命名，消灭 `gray-*` 前台硬编码。
- 语义色收敛为 `travel-success/warning/danger`（保持色值不变，仅命名对齐）。
- 明确「content / surface / raised / border / muted / faint」层级，而非零散 hex。

---

## 五、Spacing System

### 5.1 现状
- 基本用 Tailwind 默认（`px-4 py-6`, `gap-4/6`, `p-6/8`），容器统一 `container-custom max-w-6xl`。
- **无 Section Gap token**：页面纵向间距靠各 page 手写 `py-10/mb-10/mt-16`，不统一。

### 5.2 问题
- 段落间距不规律（`mt-16`、`mb-10`、`py-14` 混用）。
- hero 区 padding 已收过一轮（Phase6），但整体 section 节奏未沉淀成约定。

### 5.3 目标
```
space-section   : 64px (py-16)  页面主段间距
space-block     : 40px (mb-10)  段内块间距
space-card      : 24px (p-6)    卡片内边距
space-gap       : 16px (gap-4)  元素间
```
用 `@layer components` 定义为少量工具类或统一约定。

---

## 六、Components

### 6.1 现状与重复
| 组件 | 现有实现 | 重复度 |
|------|---------|--------|
| 卡片 `card` | `@apply` 全局 `.card` | 已统一，但内部 padding/圆角各页再覆盖 |
| StatCard | DashboardClient 内联 | 只有一处，但风格偏后台 |
| Empty/Loading/Error | 已抽 `AsyncState`（P3） | **已解决**，但 admin/部分页未替换 |
| 输入框 | 登录/找回/设置/档案 各自手写 `rounded-xl ... focus:ring` | 高，需抽 `Input`/`TextArea` |
| 按钮 | 主按钮 `bg-travel-accent rounded-xl px-5 py-3` | 3-4 种变体，需抽 `Button`(primary/secondary/ghost) |
| 胶囊/标签 | `rounded-full px-3 py-1` | 散落，可抽 `Badge` |
| 头部导航 | Navbar(桌面) + MobileBottomNav(移动) + travel 页独立 header + 档案页独立 header | **4 套导航并存**，需统一层级 |

### 6.2 关键：导航系统割裂
`Navbar`（标准壳，桌面+汉堡菜单）、`MobileBottomNav`（标准壳移动端 5 项）、`travel` 页自绘 header、`me/circle` 页自绘 header、`album` 沉浸无导航。这是"页面风格割裂"最直观的来源。

### 6.3 目标
- 抽 `Button / Badge / Input / TextArea / Card / SectionHeader / EmptyState` 到 `components/ui/`。
- 明确「标准壳（Navbar+BottomNav+Footer）」vs「沉浸壳（相册/旅行详情，全屏无标准导航）」两层，**去掉 travel 页自定义 header** 让 `/travel` 也走标准壳。

---

## 七、Responsive

### 7.1 现状
- 移动端已有扎实基础：`MobileBottomNav` 5 项、`safe-area-inset-bottom`、`min-h-[52px]` 点击区、登录/首页/档案移动端已验证无横向滚动（QA 实测）。
- 断点：`sm(640)/md(768)/lg(1024)/xl(1280)`。

### 7.2 问题
1. **首页/旅行页移动端首屏被地图占满**，核心内容（最近旅行/行程列表）下单屏之后（Phase6 已收 hero 高度但移动端列表仍需上移）。
2. **旅行详情/相册**是全屏沉浸，移动端 OK。
3. **数据看板移动端**：6 张 StatCard 叠成 2 列 3 行，仍偏"报表"。

### 7.3 目标
- 375/390/414/768/1024/1440 六档验证，重点移动端首屏信息前置。
- `/travel` 移动端让「记录列表」上移，地图作为可收起/可下滑的视觉主体（而非占据整屏）。

---

## 八、视觉审美

- **优点**：暖陶土主色 + 羊皮纸背景 + 罗盘/地图/邮戳图标体系，有「旅行故事」氛围；登录"地图门"、旅行详情"滚动画册"是强签名。
- **风险**：dark 模式 `night` 极黑 + 暖金，和亮色 `travel` 暖米是**两套独立的色彩语言**，切换时"像两个产品"；个别页面朝「SaaS Dashboard」滑落（尤其 `/dashboard`）。

---

## 九、Mobile UX

- 单手操作：BottomNav 集中在底部，✓；但首页/旅行页首屏信息重心在顶部地图，移动端需下滑才能看到内容。
- 点击区域：`min-h-[52px]` 达标；部分 icon-only（搜索/主题/设置）无文字标签，可加 aria/label（已基本具备）。
- 滚动：旅行详情 snap-scroll 体验优秀；普通页面滚动正常。

---

## 十、优化优先级建议

```
P0（立即）:
  - 统一导航：travell 页自绘 header 改走标准壳；4 套导航收敛为 2 层（标准壳 + 沉浸壳）
  - /dashboard 重定位为「旅行记忆空间」而非数据看板（Stats 弱化、足迹图+最近记忆前置）
  - travel 页移动端记录列表前置

P1（Design System）:
  - 建立 ui/ 基础组件（Button/Badge/Input/Card/SectionHeader）
  - 统一 Typography Scale + Color 语义化（travel-success/warning/danger）
  - 消灭前台 hardcoded gray-*

P2（体验）:
  - 首页/档案 mobile 信息层级优化
  - Empty/Loading/Error 全量铺开到 admin
  - 双主题(feature)视觉统一

P3（高级）:
  - 系统级动画 Motion System 统一（已有 prefers-reduced-motion + 0.2-0.8s 基础）
  - 沉浸页（相册/详情）微交互打磨
  - 视觉彩蛋/个性化（克制）
```

---

## 十一、推荐新视觉方向（一句话）

**「一本可以一直翻下去的个人旅行手账」**：以暖陶土/羊皮纸为纸面，足迹地图、时间线、旅行档案三段叙事；标准壳承载信息效率，沉浸壳承载故事浓度；拒绝 Dashboard 与平台感，让每个页面回答「我在这里留下了一段怎样的旅程」。

（签名元素保留：登录"地图门"、旅行详情"滚动画册"。新增建议：旅行档案的"护照式"核心统计 + 一次性给"我的记忆"照片化入口。）
