# 甜途《行迹》移动端 UI 重构优化方案（初稿 v0.1）

> 目标：把移动端从「功能堆叠的 Web 缩小版」重构为「**一眼知道这是什么 App、一眼看到今天该看什么**」的成熟移动产品。
> 参考标的：Orbix Studio 的设计方法与审美取向 + 主流开源设计系统。
> 状态：**初稿，待评审**。所有结论均基于对本仓库代码的逐文件审计（非猜测），行号可复查。

---

## 0. 本稿定位

本稿回答四件事：

1. **现在差在哪** —— 基于代码审计的客观问题清单（不是"感觉丑"，而是"哪里不统一、为什么看起来不专业"）。
2. **该学什么** —— Orbix Studio 的审美与方法论蒸馏，以及可直接拿来用的开源设计系统。
3. **改成什么样** —— 从设计地基（色彩/字阶/间距/材质）→ 图标系统 → 组件库 → 关键页面，逐层给出规范与替换方案。
4. **怎么落地** —— P0/P1/P2 分期、验收标准、风险与回滚。

---

## 1. 现状诊断

### 1.1 已有基础（不是从零开始）

项目在 2026-09 已经做过一轮移动端重构（M1 设计系统 → M2 五大 Tab → M3 二级页 → M4 动效触觉 → M5 发版），当前基础其实**不差**：

| 已有资产 | 位置 | 评价 |
|---|---|---|
| 移动端设计 token | `app/mobile.css:7-54` `--m-*` 26 个变量 + 暗色两套 | 结构正确，但**色彩偏杂** |
| 组件库 13 个 | `components/mobile/*.tsx` | 覆盖面够（Sheet/Skeleton/Segment/Switch/Toast/PTR/Stagger/CountUp…），但**视觉语言未统一** |
| 动效 token | `app/mobile.css:113-210`（spring/enter/pop/tab-pop/fab-glow/shimmer） | 有体系，但**动效过多且装饰性强** |
| 图标库 | `lucide-react` 全局使用 | 单一库是优点，但**用法毫无约束** |
| 页面级移动分支 | `HomeMobile` / `TravelMobileClient` / `MobileBottomNav` 等 | 已按 `md:` 断点隔离桌面，重构**不会回归 Web 端** |

所以本轮不是"重做"，而是**收敛与提纯**：把已有的 13 个组件、26 个 token、85+ 个图标用法，收进一套**有纪律的规范**里。

### 1.2 五个结构性问题（核心）

#### 问题 1：装饰过量 —— "一眼看不到重点"的直接原因

`components/HomeMobile.tsx` 的 Hero 区（293-365 行）在**首屏 400px 内**堆了：

- 2 个 `radial-gradient` 装饰光斑（294-295 行）
- 问候语 + 11px 字距 0.24em 的英文眉标「TRAVEL DIARY · 行迹」（298-299 行）
- 34px 两行大标题「把走过的路 / 变成自己的故事」+ **标题内嵌一个 76px 宽的渐变胶囊**（300-306 行）
- 15px 三行副文案（307-309 行）
- 2 个 CTA 按钮（其中一个带渐变 + 阴影）（311-327 行）
- 省份 pill 组（329-341 行）
- 2 宫格统计卡（343-363 行）

→ 结果是**7 类信息、3 种视觉重量、2 层装饰**争抢同一屏。用户看到的不是"这是个记录旅行的 App"，而是"一个很热闹的页面"。

Orbix Studio 在医疗 App 案例里的做法正相反：*"clean layout, soft shadows, and clear typography to improve readability and reduce cognitive load"* —— **用留白和字阶做层级，不用装饰**。

#### 问题 2：图标用法无纪律 —— 用户说的"图标很丑"的真因

审计全部 75 处 `lucide-react` 引用后，问题有四类：

| 类型 | 具体证据 | 观感问题 |
|---|---|---|
| **描边粗细不统一** | `EmptyState.tsx:23` strokeWidth=1.6；默认 2；`MobileBottomNav.tsx:99` 激活态 2.4；FAB `:63` 2.4 | 同屏内 4 种粗细，图标"浮"在版面上 |
| **尺寸无体系** | h-3 / h-3.5 / h-4 / h-5 / h-6 / h-7 / h-8 / h-9 / h-12 共 9 档混用 | 视觉节奏散乱，对齐困难 |
| **图标承载色硬编码** | `HomeMobile.tsx:498` `bg-[#F7E6D9]`、`:508` `bg-[#E7F1F5] text-[#6C8EA6]`、`:518` `bg-[#EAF0E9] text-[#6E9070]` | 3 个功能入口 3 套"脏粉色"，与 `--m-*` token 无关，暗色模式下无法适配 |
| **用字符冒充图标** | `AlbumDayDivider.tsx:24-25` `✦ DAY 01 ✦`；`MeHome.tsx:232,259` `✦`；`PhotoChatView.tsx:163` `✨`；`PixelPhotoChat.tsx:215` `✍` | **这是最"廉价"的一处** —— 字符字形依赖系统字体，跨端不一致、无法对齐、无法控制粗细 |

另外，**旅行类型（独旅/情侣/家庭/朋友/闺蜜/结伴）目前完全没有图标**——只有纯文字 pill（`TravelDetailShell.tsx:26-31` 仅给背景色）。如果用户说的"运动什么的图标"指的是这类**活动/关系标识**，这就是明确的缺口。

#### 问题 3：色彩系统过载

`app/mobile.css:7-32` 定义了 5 个彩色 token（`--m-accent` 陶土 / `--m-sun` 暖黄 / `--m-blush` 腮红 / `--m-sky` 天蓝 / `--m-mint` 薄荷），加上组件里散落的硬编码渐变：

- 纪念日卡 3 套渐变硬编码（`HomeMobile.tsx:461-465`）
- FAB 渐变硬编码（`MobileBottomNav.tsx:60`）
- CTA 渐变硬编码（`HomeMobile.tsx:314`）
- 画册占位渐变（`HomeMobile.tsx:172,425`）

→ **同一个 App 里出现 3 个以上强调色 + 6 处硬编码渐变**，是"粗糙感"的主要来源。成熟产品的做法是：**一个强调色 + 中性色阶 + 语义色（成功/警告/错误）**，彩色只用在"内容本身"（照片、地图），不用于"界面框架"。

#### 问题 4：字阶跨度大、缺中间层

当前实际用到的字号：11 / 13 / 14 / 15 / 17 / 18 / 22 / 28 / 32 / 34 px（10 档），且 28px（`LargeTitle`）与 34px（HomeMobile 标题）**两个"大标题"并存**，没有明确的层级语义。

缺两级：**标题与正文之间的 20px 层**、**数字展示专用的 tabular 层**（统计数字目前用 3xl/34px 混排）。

#### 问题 5：组件状态不齐

`components/mobile/*` 有 13 个组件，但缺：
- **IconButton**（当前"图标按钮"散落各处，触达尺寸靠手写 `h-9 w-9` / `w-10 h-10` 打补丁，如 `TravelClient.tsx:185,198,226,239`）
- **ListRow / ListSection**（功能入口 3 处手写 `m-card flex items-center gap-4 p-4`，样式重复）
- **StatBlock**（统计块在首页、旅行页、看板各写一遍）
- **IconBadge**（图标+底色容器，正是问题 2 里硬编码色彩的地方）
- **Tag / Badge**（旅行类型/标签 pill 各处手写）

---

## 2. 参考研究

### 2.1 Orbix Studio：他们的方法（蒸馏）

Orbix Studio 是一家纽约 + 迪拜 + 利雅得 + 达卡的产品设计工作室，自我定位是 *"We design and build scalable digital products that support complex workflows and business-critical systems."*（[官网](https://www.orbix.studio/)）

从他们的服务命名就能读出审美取向 —— 每项服务都配了一句"人话目标"：

| 服务 | 他们自己的注解 |
|---|---|
| UI/UX Design | **Simple and clear screen layouts** |
| SaaS Design | **Software tools that make sense** |
| Mobile App Dev | **Perfect apps for any phone** |
| Motion Design | **Graphics that move smoothly** |
| Dashboard Design | **Built around your users** |
| Branding | **A standout style for your business** |

**从真实案例提炼的四条可执行原则：**

1. **Clean minimalism + high-impact visuals**（[Modea 时尚站案例](https://me.muz.li/orbix-studio/unveil-your-fashion-modern-fashion-website-ui-ux)）
   → 原话：*"The layout blends clean minimalism with high-impact visuals… every element is crafted to feel stylish, modern, and user-centered."*
   → 对我们的意义：**界面框架极简（灰白/纸感 + 细描边），把"高冲击力"留给内容（旅行照片、地图）**。照片本身就是最好的视觉资产，界面不该跟它抢。

2. **降低认知负荷靠排版，不靠装饰**（[医疗预约 App 案例](https://me.muz.li/orbix-studio/healthcare-appointment-mobile-app-design-2)）
   → 原话：*"uses a clean layout, soft shadows, and clear typography to improve readability and reduce cognitive load"*；*"highlights important information like ratings, availability, pricing, and experience to help users make confident decisions"*；*"balance usability with a premium visual style while maintaining accessibility and clarity"*
   → 对我们的意义：首页要做的是**把"省份数/旅程数/最近一次旅行"这三条关键信息放到最短决策路径上**，而不是用渐变和胶囊堆氛围。

3. **设计系统不是 UI Kit，是"审计 → 地基 → 组件 → 模式 → 对齐工程 → 文档 → 推广"七步**
   来源：[Orbix《Design Systems 101》](https://www.orbix.studio/blogs/design-systems-101-saas-guide)
   → 他们列的常见错误，我们**现在条条都中**：
   - ✗ 把设计系统当 UI Kit 用，不守使用规则 → 我们有 token 但组件里到处硬编码
   - ✗ 孤立设计组件，不看真实工作流 → 有 `m-card` 但每个页面自己拼
   - ✗ 变体/例外太多 → 9 档图标尺寸、4 种描边、6 处硬编码渐变
   - ✗ 设计组件与代码组件不对应 → Figma 无源，纯代码手写
   - ✗ 建完没有治理 → 后续新增页面继续各写各的

4. **"Clear · Premium · Effortless"**（来自其房地产案例描述：*"make property operations feel clear, premium, and effortless"*）
   → 这三个词可以直接当我们这一轮的设计北极星。

### 2.2 开源 / 公共设计系统参考（可直接借用规范）

| 系统 | 可借用的部分 | 链接 |
|---|---|---|
| **Apple HIG + SF Symbols 6** | 移动端"原生感"的黄金标准：4 种字重 + 可变渲染、光学尺寸对齐、6000+ 符号的**网格纪律**；我们的"图标丑"问题本质是不守网格 | [SF Symbols 6 发布说明](https://www.macgadget.de/News/2024/07/10/Apple-kuendigt-SF-Symbols-60-an-Mehr-als-6000-Grafiken-fuer-Entwickler-und-Designer) |
| **Material Symbols (Google)** | **可变字体图标**：3 种风格（outlined/rounded/sharp）× 7 种字重 × 光学尺寸 —— 一套图标覆盖所有场景，正是我们"一个 App 内 4 种描边"的对症解 | Google Fonts |
| **Lucide**（我们在用） | 优点：24px 网格、2px 描边、圆角端点、MIT、1500+。**我们已经用对了库，只是用错了方式** | lucide.dev |
| **Phosphor Icons** | **Duotone（双色调）** 权重 —— 解决"功能入口图标很单薄"的利器，且支持 6 种字重线性过渡 | phosphoricons.com |
| **Tabler Icons** | 5900+ 图标、24px、统一 2px 描边，体量最大的统一线性集 | tabler.io/icons |
| **Iconoir** | 更"设计感"的极简集，适合做品牌符号 | iconoir.com |
| **Heroicons v2** | outline(1.5px) + solid 双风格，Tailwind 官方生态，与我们的 Tailwind 栈天然契合 | heroicons.com |
| **RNTravelJournal-concept** | React Native 旅行日志 App 的完整 UI 概念实现，可参考"日记型首页"的信息编排 | [GitHub](https://github.com/abdenasser/rntraveljournal-concept) |
| **bookmytix-starter** | Flutter 机票预订 UI Kit，48 个屏，可参考"行程/票务型信息密度"的处理 | [GitHub](https://github.com/ilhammeidi/bookmytix-starter) |
| **TravelDiary / Minimal Travel Diary（Dribbble）** | 旅行照片日志的排版范式：Hero 大图 + 极简元信息 | [Dribbble 1](https://dribbble.com/shots/25870014-TravelDiary-UI-UX-Design-for-Travel-Photo-Journal-Mobile-App)、[Dribbble 2](https://dribbble.com/shots/4991482-Minimal-Travel-Diary-App-Concept-Day-232-365-Project365) |

### 2.3 结论：我们要学的不是"某种风格"，而是"纪律"

Orbix Studio 的产出之所以显得高级，**不是因为用了某个色板**，而是因为：
- 极少的装饰 + 极大的留白
- 严格的 8pt 网格与字阶
- 一套图标走到底（统一网格/描边/尺寸档）
- 每屏只有一个"最重"的元素

这正是我们缺的。

---

## 3. 重构目标与设计原则

### 3.1 北极星：Clear · Premium · Effortless

| 原则 | 含义 | 反面（现状） |
|---|---|---|
| **Clear** | 首屏 3 秒内说清"这是什么、我有什么、下一步做什么" | 装饰与文案抢焦点 |
| **Premium** | 靠**留白、字阶、微妙的层次与材质**建立高级感，不靠渐变与彩色 | 6 处硬编码渐变、3 套强调色 |
| **Effortless** | 主操作永远在拇指区、一屏一主行动、无需学习 | 7 类信息同屏、入口层级混乱 |

### 3.2 四个"一眼"验收标准（可量化）

1. **一眼知道 App 是干什么的** —— 新用户首屏（不看文案）能从"地图 + 省份数 + 最近一张旅行照片"识别出"这是一个记录旅行足迹的 App"。
2. **一眼看到重点** —— 首屏只有 **1 个**视觉最重元素（推荐：足迹地图或最近旅行大图），其余全部降级为次级信息。
3. **一眼找到主操作** —— 「记录一次旅行」在拇指区（底部 Dock 中央 FAB），且全 App 唯一强主色按钮。
4. **一眼看出是一套产品** —— 任意两屏并排，图标描边、圆角、间距、字阶完全一致，无"拼装感"。

---

## 4. 视觉设计语言（Foundations）

### 4.1 色彩：从"暖陶土 + 多渐变"收敛为"纸感单色 + 唯一强调色"

**现状**：5 个彩色 token + 6 处硬编码渐变。

**目标规范**：

```
品牌层（不变，保留识别度）
  --m-accent        陶土棕  唯一强调色（按钮/FAB/激活态/关键数字）
  --m-accent-strong 深陶土  强调色的文字态

中性层（新增，承载 90% 界面）
  --m-bg            #FFFBF7  页面底（比现在 #FFF9F2 更中性一点）
  --m-surface       #FFFFFF  卡片
  --m-surface-2     #F7F3EF  次级填充
  --m-line          rgba(...) 发丝线
  --m-text / muted / faint   三级文字

语义层（新增，替代"用彩色表达状态"）
  --m-success / --m-warning / --m-danger
```

**规则（写进规范，禁止违反）**：

1. **界面上彩色面积占比 ≤ 15%**，且只出现在：主 CTA、激活态、关键数字、内容图。
2. **禁止新增硬编码 hex**。所有颜色必须来自 token；需要新色先加 token。
3. **渐变只允许 1 处**（主 CTA，可选），其余全部改纯色/细描边。
   - `HomeMobile.tsx:314` CTA 渐变 → 保留或转纯色 `--m-accent`
   - `MobileBottomNav.tsx:60` FAB 渐变 → **转纯色 `--m-accent` + 轻投影**
   - `HomeMobile.tsx:461-465` 纪念日 3 套渐变 → 统一为 `--m-surface` + 左侧 3px 强调色竖条
   - `HomeMobile.tsx:172,425` 占位渐变 → `--m-surface-2` 纯色
4. **删除 Hero 装饰光斑**（`HomeMobile.tsx:294-295`、`TravelMobileClient.tsx:108`）—— 用留白替代。

> 理由：Orbix 的"clean minimalism + high-impact visuals"= 界面中性、内容出彩。我们的内容（旅行照片/地图）已经足够好看，界面越安静，内容越突出。

### 4.2 字体与字阶：10 档收敛为 7 档

**现状**：11/13/14/15/17/18/22/28/32/34 共 10 档，且 28 与 34 两个大标题并存。

**目标字阶**（8pt 节奏，语义命名）：

| Token | 字号/行高 | 用途 |
|---|---|---|
| `m-display` | 32 / 38 | 首页唯一大标题（替换 34px） |
| `m-title-1` | 24 / 30 | 页面标题（`LargeTitle` 从 28 收到 24，降低压迫感） |
| `m-title-2` | 18 / 24 | 卡片组标题、区块标题（新增，补 22px 空缺） |
| `m-body` | 15 / 22 | 正文（统一现在 14/15 混用） |
| `m-caption` | 13 / 18 | 辅助说明（统一 13） |
| `m-label` | 11 / 14 | 眉标/大写标签（字距 0.08em，**不再用 0.24em 的超宽字距**） |
| `m-stat` | 32 / 32 | 统计数字专用（tabular-nums，替换 3xl 混排） |

**规则**：
- 一个页面最多 **2 个**大标题级别。
- 英文眉标字距从 `0.24em` → `0.08em`（现在的超宽字距在小屏上很"用力过猛"）。
- 所有数字统一 `tabular-nums` + `m-stat`，消除跳动。

### 4.3 间距节奏：确立 8pt 网格

**现状**：`px-4 / px-5 / px-6`、`gap-2/3/4/5`、`pb-8/10/16`、`pt-[max(26px,30px,40px,48px,...)]` 混用。

**规范**：
- 基准单位 **4pt**，主要节奏 **8pt**：`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64`
- **页面横向内边距统一 20px**（现在 16/20/24 三种）
- **区块间垂直间距统一 32px**（现在 8/10/16 混用）
- **顶部安全区内边距统一 `pt-[max(20px,env(safe-area-inset-top))]`**（现在 26/30/40/48 四种）

### 4.4 材质分级：三档阴影 + 一档发丝线

**现状**：`m-glass` / `m-card` / `m-shadow-sm` / `m-shadow-md` + 各组件自己写 `shadow-lg` / `shadow-[0_...]`。

**目标**：

| 层级 | 用途 | 定义 |
|---|---|---|
| **L0 平面** | 页面底、分组背景 | 无阴影，用 `--m-surface-2` 或发丝线分隔 |
| **L1 卡片** | 内容卡 | `0 1px 2px rgba(0,0,0,.04), 0 8px 24px -16px rgba(...,.18)` |
| **L2 悬浮** | FAB、Dock、Sheet、Toast | `0 8px 32px -12px rgba(...,.28)` |
| **发丝线** | 列表分隔、Tab 顶边 | `0.5px solid var(--m-line-strong)` |

**规则**：禁止组件内自写 `shadow-[...]`，全部走 token。

### 4.5 圆角收敛

**现状**：`--m-radius-lg:24` / `md:18` / `sm:12` + 组件里 `rounded-2xl / rounded-[22px] / rounded-3xl / rounded-full` 混用（22px 是"魔术数字"）。

**规范**：`radius-card=20`、`radius-control=14`、`radius-pill=999`、`radius-sheet=24`（顶部两角）。**删除 22px 等非标值。**

---

## 5. 图标系统重构（本方案重点）

> 用户原话："移动端 APP 有一些运动什么的图标做得非常丑，需要重新优化一下。"
> 审计后确认：这不是"某几个图标丑"，而是**图标体系缺失**导致整体显得业余。

### 5.1 现状问题（已逐条定位到代码）

| # | 问题 | 证据 |
|---|---|---|
| 1 | 描边 4 种粗细混用 | `EmptyState.tsx:23`(1.6) / 默认(2) / `MobileBottomNav.tsx:99`(2.4) / `:63`(2.4) |
| 2 | 尺寸 9 档混用 | h-3, 3.5, 4, 5, 6, 7, 8, 9, 12 |
| 3 | 图标底色硬编码 | `HomeMobile.tsx:498,508,518` 三处 `#F7E6D9/#E7F1F5/#6C8EA6/#EAF0E9/#6E9070` |
| 4 | 字符冒充图标 | `AlbumDayDivider.tsx:24` `✦`、`MeHome.tsx:232,259` `✦`、`PhotoChatView.tsx:163` `✨`、`PixelPhotoChat.tsx:215` `✍` |
| 5 | **活动/关系类型完全无图标** | `TravelDetailShell.tsx:26-31`、`TravelCircleFeed.tsx:30-36`、`TravelMobileClient` 仅文字 pill |
| 6 | 图标语义重复/冲突 | `ImageIcon` 与 `Images` 与 `Camera` 与 `ImageOff` 四处表达"照片"；`MapPin` 同时表示"地点/省份/旅行/足迹"四种含义 |
| 7 | 天气图标风格不搭 | `WeatherIcon.tsx` 用填充色块 + lucide 线性图标混搭 |

### 5.2 图标体系规范（写死，不再自由发挥）

**① 只保留一套主图标库：Lucide（继续用，不换库）**

理由：已全站使用、24px 网格规范、MIT、1500+ 覆盖足够。**换库的迁移成本远大于收益**，问题在用法不在库。

**② 引入第二套"双色调"仅用于功能入口：Phosphor Duotone（可选）**

仅用于「更多玩法」这类**功能入口卡片**，用双色调解决"单线图标太单薄、彩色底块太糙"的问题。若不引入新依赖，则用 Lucide + 统一 token 底色 + `fill` 弱化层模拟。

**③ 尺寸只允许 3 档**

| 档位 | 尺寸 | 描边 | 用途 |
|---|---|---|---|
| `sm` | 16px | 2px | 行内、chip、inlines |
| `md` | 20px | 2px | **默认**（列表行首、Tab、按钮内） |
| `lg` | 24px | 1.75px | 空态、Sheet 标题、Hero 图标 |

**禁止** 3/3.5/4.5/5.5/7/9/12 等中间值。需要更大视觉重量时，**放大容器而不是放大图标**。

**④ 描边只允许 2 档**：`2px`（默认）/ `1.75px`（仅 24px 大图标，避免视觉过重）。删除 1.6 / 2.4。

**⑤ 图标颜色只允许取 token**：
- 默认：`--m-muted`
- 激活/强调：`--m-accent`
- 反白：`#FFF`（仅深色底）
- **禁止**直接用 hex 或"为了好看"上彩色

**⑥ 图标容器统一：新增 `IconBadge` 组件**

替代当前 3 处硬编码彩色方块：

```tsx
<IconBadge icon={CalendarDays} tone="accent" />   // 40×40, radius 14, bg=accent-soft
<IconBadge icon={BookOpen}    tone="neutral" />
<IconBadge icon={Camera}      tone="sky" />       // tone 只允许 4 种语义色调
```

**⑦ 禁止字符冒充图标**：`✦ / ✨ / ✍` 全部替换为 lucide 图标（`Sparkle` / `Sparkles` / `PenLine`）或删除装饰。

**⑧ 图标语义去重（建立映射表）**：

| 语义 | 唯一指定图标 | 弃用 |
|---|---|---|
| 地点/城市 | `MapPin` | — |
| 省份/足迹 | `Map`（或 `Footprints`） | 不再用 `MapPin` |
| 旅行(导航 Tab) | `Route`（或 `Luggage`） | 不再用 `MapPin` |
| 照片(单张) | `Image` | `ImageIcon` 别名统一 |
| 相册/画册 | `Images` / `BookOpen` | — |
| 拍摄 | `Camera` | — |
| 纪念日 | `Heart` | — |
| 时间线 | `CalendarDays` | — |
| 数据 | `ChartColumn`（BarChart3 已废弃名） | — |
| 记录(主操作) | `Plus` | — |

> 附带收益：`BarChart3` 是 lucide 旧名，建议统一升级到 `ChartColumn`，避免未来版本告警。

### 5.3 新增：旅行专属符号集（解决"活动图标丑/缺失"）

这是目前**最大的功能-视觉缺口**，也是用户感知最强的地方。建议自建 **12 个品牌符号**（基于 Lucide 网格二次绘制，或直接用 Lucide+统一容器）：

**A. 旅行关系类型（7）** —— 现仅有文字
`独旅 / 情侣 / 家庭 / 朋友 / 闺蜜兄弟 / 结伴 / 其他`
→ 从 `lucide` 选：`User` / `Heart` / `Users` / `UsersRound` / `HeartHandshake` / `Users2` / `MoreHorizontal`
→ 渲染为「图标 + 文字」的 pill，替代纯文字 pill（`TravelDetailShell.tsx:125-128`）

**B. 出行方式（5）** —— 暂无
`飞机 / 高铁 / 自驾 / 轮渡 / 徒步`
→ `Plane` / `TrainFront` / `Car` / `Ship` / `Footprints`

**C. 天气（统一风格）** —— 现有 `WeatherIcon.tsx` 混搭
→ 统一为线性 + 单色 token 上色，不再填充色块

**D. 状态/空态插画**
→ 空态从"一个线性图标 + 灰字"升级为**统一风格的轻量插画**（Orbix 的 Empty States 规范：icon/illustration + 短文案 + 单一行动）

### 5.4 落地方式（工程化，避免回归）

1. **新增 `components/mobile/Icon.tsx`**：封装尺寸/描边/颜色的唯一入口
   ```tsx
   <Icon name="mapPin" size="md" tone="accent" />
   ```
   或轻量版：导出 `ICON_SIZE` / `ICON_STROKE` 常量 + `<Icon>` 包装 lucide。
2. **新增 ESLint 规则（或 CI 检查）**：禁止在 `components/**` 直接 `import { X } from 'lucide-react'`（改为从 `@/components/mobile/Icon` 导入）。这样**从机制上**防止再出现 9 档尺寸/4 种描边。
3. **新增 `IconBadge` / `TravelTypePill` / `WeatherIcon`（重写）** 三个组件收口。
4. **一次性替换清单**：85 个图标引用点，按 §5.2 映射表批量替换（预计 1 人日）。

---

## 6. 组件库重构

### 6.1 补齐 5 个缺失组件

| 新组件 | 替代现状 | 价值 |
|---|---|---|
| `IconButton` | `w-9 h-9` / `w-10 h-10` 手写 8+ 处（`TravelClient.tsx:185,198,226,239`） | 统一 44px 触达 + 3 种 variant |
| `IconBadge` | 3 处硬编码彩色方块 | 颜色收口、暗色自适应 |
| `ListRow` / `ListSection` | 3 处重复的 `m-card flex items-center gap-4 p-4` | 统一行高/图标位/箭头/分隔线 |
| `StatBlock` | 首页/旅行页/看板各写一遍 | 语义一致、tabular 数字 |
| `TravelTypePill` | 纯文字 pill ×3 处 | 图标 + 文字 + 语义色 |

### 6.2 已有 13 个组件的规范修订

- `LargeTitle`：28px → 24px；`trailing` 区强制用 `IconButton`
- `Pressable`：统一 `active:scale(0.97)` + haptic（现在有的地方有、有的没有）
- `SegmentedControl`：容器从 `--m-surface-2` 提到 `--m-surface`，thumb 加发于线
- `Skeleton`：形状必须匹配真实内容（现在首页骨架与真实布局不符，见 `HomeMobile.tsx:536-557`）
- `EmptyState`：接受插画（不只是 LucideIcon）+ 强制单一 CTA
- `BottomSheet` / `ActionSheet` / `Toast` / `Switch` / `PullToRefresh` / `Stagger` / `CountUp` / `MobilePageTransition`：随 token 统一，行为不变

### 6.3 组件文档化（Orbix 第 6 步）

在 `docs/design/` 下建 `移动端组件规范.md`：每个组件给「结构 / 状态（hover·active·disabled·loading）/ 尺寸变体 / 使用与禁用示例」。

> 现在的问题不是没组件，是**没人知道该用哪个、什么时候不该自己写**。

---

## 7. 关键页面重构

### 7.1 首页（`components/HomeMobile.tsx`）—— 优先级最高

**现状**：7 个区块堆叠（Hero → 每日一言 → 画册横滑 → 最近旅行 → 碎碎念 → 重要日子 → 更多玩法），首屏 7 类信息。

**重构后信息架构**（首屏只留 3 件事）：

```
┌─────────────────────────────┐
│  早上好                      │  ← 13px caption
│  我的旅行足迹                │  ← 24px title（不再是 34px 营销口号）
│                             │
│  ┌───────────────────────┐  │
│  │                       │  │
│  │    足迹地图（Hero）    │  │  ← 唯一视觉最重元素，占首屏 45%
│  │    已点亮 12 省        │  │     内含悬浮统计条，取代独立统计卡
│  │                       │  │
│  └───────────────────────┘  │
│                             │
│  [ 记录一次旅行 ]  [ 相册 ]  │  ← 1 主 + 1 次
└─────────────────────────────┘
─────────────────────────────
  最近旅行（横向大卡，保留）      ← 次级，首屏下方
  旅行画册（横向，保留但瘦身）
  碎碎念（保留）
  更多玩法（保留，图标重做）
```

**具体动作**：
- **删除**：Hero 装饰光斑（`294-295`）、标题内嵌渐变胶囊（`304`）、独立 2 宫格统计卡（`343-363`，并入地图卡）
- **降级**：34px 营销口号 → 24px 功能标题；15px 三行副文案 → 一行 13px
- **保留**：每日一言（有情感价值，但**移到首屏下方**，不与地图争焦点）
- **前置**：地图从「更多玩法」层级提到 Hero（当前首页**没有地图**，而地图是这个 App 最强的差异化资产）
- **"更多玩法"**：3 个入口的硬编码彩色底 → `IconBadge` + `ListRow`

**预期效果**：首屏 3 秒可读 → 满足验收标准 1/2/3。

### 7.2 旅行页（`app/travel/TravelMobileClient.tsx`）

- 删除顶部装饰渐变（`108`）
- 地图卡高度 310px → 自适应（`min(52vh, 420px)`），让列表上移
- 统计三元组（`125`）改为 `StatBlock` 组件
- 省份抽屉（`MobileProvinceDrawer`）与地图的层级关系明确化

### 7.3 画册页（`app/album/page.tsx` + `components/album/**`）

- 三模式（画册/像素/银河）保留（这是产品特色），但**统一顶栏**（HUD）用同一套 `IconButton` + 字阶
- 消除字符装饰 `✦ DAY 01 ✦` → 规范分隔组件
- 模式切换控件统一为 `SegmentedControl`

### 7.4 我的页（`components/social/MeHome.tsx`）

- 通知入口的 `✦` 字符 → `Bell` 图标
- 头像/统计/入口的间距走 8pt 网格
- `--social-*` token 与 `--m-*` token 合并（现在两套并存）

### 7.5 底部导航（`components/MobileBottomNav.tsx`）

- FAB 渐变 → 纯色 `--m-accent`；删除 `m-fab-glow` 呼吸动画（**常驻动画是"廉价感"的典型来源**）
- 4 个 Tab 图标统一 20px / 2px；激活态容器从"模糊圆角块"改为**顶部 2px 指示条**或**图标+文字统一变色**（更克制）
- "旅行" Tab 图标 `MapPin` → `Route`（避免与地图内地点图标语义冲突）

---

## 8. 动效与触觉：从"炫技"到"有意义的反馈"

**现状**：`mobile.css` 有 6 组 keyframes（`m-enter` / `m-tab-pop` / `m-fab-glow` / `m-shimmer` / `m-list-in` / `m-soft-pulse` / `m-page-fade` / `m-pop`），其中 `m-fab-glow`（无限呼吸）与 `m-shimmer`（5s 循环）属于**常驻装饰动画**。

**规范**（对齐 Orbix *"Graphics that move smoothly"*）：
1. **禁止无限循环动画**（除 loading）。删除 `m-fab-glow`。
2. **时长收敛**：交互反馈 120ms、入场 320ms、页面转场 240ms（现在 420/380/500ms 偏慢）。
3. **只做 opacity + transform**，不碰 layout 属性。
4. **触觉分级**：
   - `light`：Tab 切换、卡片按压
   - `medium`：主操作（记录一次旅行）
   - `success` / `error`：登录、保存、失败
   - 现状：`hapticLight` 覆盖不全（部分 `m-press` 无触觉），需统一到 `Pressable`
5. **`prefers-reduced-motion`** 全量降级（已有，保持）。

---

## 9. 可访问性与性能

**可访问性**（对齐 Orbix 的 *"accessibility and clarity"* 与 WCAG 2.2 AA）：
- 触达目标：全部 ≥ 44×44（现在 `IconButton` 缺失导致部分 36px，见 `TravelClient.tsx:185`）
- 对比度：`--m-muted` 在浅底上需 ≥ 4.5:1。实测 `#9A8574` on `#FFF9F2` = **3.36:1（不达标）**；建议加深为 `#7D6754`（实测 **5.10:1**，达标且不失柔和）
- 所有 `IconButton` 补 `aria-label`（现状部分缺）
- 焦点可见（键盘/外接键盘场景）

**性能**：
- 图标改为常量导出 + tree-shaking 友好（避免 barrel 全量引入）
- 删除常驻动画可降低低端机 GPU 占用
- 骨架屏形状与真实布局对齐，降低 CLS

---

## 10. 我还建议一并参考/补强的方面（你没想到但值得做）

1. **建立"设计-代码一致性"检查**（Orbix 第 5 步）：CI 里加一条脚本，扫描 `components/**` 中的硬编码 hex、非标字号、非标圆角、直接 lucide 导入 —— **机制上防止回到"粗糙"**。这是本轮最有长期价值的一件事。
2. **建一份 `docs/design/移动端设计规范.md`**（单一事实源）：token 表 + 字阶 + 图标规则 + 组件用法。现在知识散在 `mobile.css` 注释和各组件里。
3. **引入 Storybook 或轻量组件预览页**（`/dev/ui` 路由，仅 dev 可见）：一屏看全所有组件的所有状态。当前"改一个组件不知道影响了哪些页面"。
4. **深色模式对齐**：`--m-*` 与 `--social-*` 两套 token 并存（`components/social/*` 用后者），暗色下同一 App 有两套色温，建议合并。
5. **App 图标 / 启动屏与新版 UI 对齐**：UI 变简约后，现有品牌图（`public/brand/logo.png`）与 splash 需复核一致性。
6. **空态与首用引导（Onboarding）**：现在新用户进 App 看到的是空列表 + 灰字。Orbix 的做法是空态即引导（短文案 + 单一 CTA + 插画）。建议加**一次性 3 屏 Onboarding**（只说三件事：记录旅行 / 点亮地图 / 生成画册），直接满足"上手就知道 App 干什么"。
7. **无障碍字体缩放**：用 `rem` 而非纯 `px`（当前全 `px`），支持系统字体放大。
8. **列表虚拟化**：旅行记录/旅行圈在数据量大时需虚拟滚动（当前全量渲染）。

---

## 11. 落地路线图

### P0 · 地基 + 图标（预计 3–4 人日）—— 收益最大

| 任务 | 产出 |
|---|---|
| 色彩 token 收敛 + 删除全部硬编码 hex/渐变 | `app/mobile.css` 重写 token 段 |
| 字阶 10 档 → 7 档 | 新增 `m-display/title-1/title-2/body/caption/label/stat` |
| 间距/圆角/阴影规范落地 | token + 全量替换 |
| **图标体系：`Icon` 组件 + 3 尺寸 + 2 描边 + 语义映射表** | `components/mobile/Icon.tsx` |
| **`IconBadge` / `IconButton` / `ListRow` / `TravelTypePill`** | 4 个新组件 |
| 字符图标 `✦✨✍` 全量替换 | 4 处 |
| 删除 Hero 装饰光斑、无限动画 | `HomeMobile` / `MobileBottomNav` |

### P1 · 关键页面（预计 3–4 人日）

| 任务 | 产出 |
|---|---|
| **首页信息架构重排**（地图进 Hero，砍到 3 件事） | `HomeMobile.tsx` 重构 |
| 旅行页 / 画册页 / 我的页 token 与图标对齐 | 3 页 |
| 底部导航重做（纯色 FAB、克制激活态） | `MobileBottomNav` |
| 空态插画 + 首次 Onboarding 3 屏 | 新组件 + `/welcome` |
| 组件状态补齐（loading/disabled/error） | 13 组件 |

### P2 · 治理与深化（预计 2–3 人日）

| 任务 | 产出 |
|---|---|
| `docs/design/移动端设计规范.md` | 单一事实源 |
| CI 一致性检查脚本 | `scripts/check-design-tokens.mjs` |
| 组件预览页 `/dev/ui` | dev only |
| `--social-*` 合并进 `--m-*` | 暗色统一 |
| 字体改 rem + 对比度达标 | 可访问性 |

**总计约 8–11 人日**，可拆成 3 个发版（与现有 1.5.0/build 6 → 1.6.0 节奏匹配）。

---

## 12. 验收标准

| # | 标准 | 验证方式 |
|---|---|---|
| 1 | `components/**` 中硬编码 hex 数量 = **0** | CI 脚本扫描 |
| 2 | 图标尺寸档位 = **3**，描边档位 = **2** | CI 脚本扫描 |
| 3 | 非标字号（不在 7 档内）= **0** | CI 脚本扫描 |
| 4 | 无限循环动画 = **0**（除 loading） | 人工审查 |
| 5 | 字符冒充图标 = **0** | CI 脚本扫描 `✦✨✍` |
| 6 | 首屏信息类型 ≤ **3** | 人工评审截图 |
| 7 | 全部触达目标 ≥ 44px | 自动化扫描 |
| 8 | `--m-muted` 对比度 ≥ 4.5:1 | 对比度检查 |
| 9 | 桌面端零回归（`md:` 断点隔离） | `npm run test:e2e`（22 用例）+ 人工 |
| 10 | 暗色模式全页面无"两套色温" | 人工逐页审查 |

---

## 13. 待确认问题（需你拍板）

1. **"运动什么的图标"具体指哪些？** 我审计后锁定 4 个候选，请确认或补充：
   - ① 「更多玩法」3 个入口的彩色方块图标（`HomeMobile.tsx:498,508,518`）
   - ② 旅行类型/关系标签（独旅/情侣/家庭…，目前**没有图标**）
   - ③ 字符装饰 `✦ ✨ ✍`
   - ④ 底部导航与 FAB
   （或直接截图标注，我按图精确重构）

2. **首页 Hero 主视觉选哪个？** 我推荐**足迹地图**（差异化最强、最能说明"这是旅行 App"）。备选：最近一次旅行的大图。

3. **首页是否保留"每日一言"？** 保留则下移；删除则更简洁。我倾向**保留但下移**（贴合情侣产品的情感调性）。

4. **是否引入 Phosphor Duotone 作为第二图标库？** 引入能让功能入口更精致，但增加一个依赖（约 30KB）。或坚持单库 + `IconBadge` 方案。

5. **画册三模式（画册/像素/银河）是否统一顶栏？** 统一则一致性最佳，但会削弱三模式个性。我倾向**统一交互控件、保留各自氛围**。

6. **是否加首次 Onboarding？** 这是"上手就知道 App 干什么"最直接的解法，但会改变新用户首次路径。

7. **实施顺序**：先做 P0（地基+图标，全局受益、风险低）还是直接改首页（效果最直观、但地基未收敛会返工）？**我强烈建议 P0 先行。**

---

## 附：本轮方案与既有文档的关系

- 承接 `docs/design/移动端重构-上线与iOS化实施方案.md`（M1–M5 已完成，建立了 token/组件/动效基础）
- 本稿是其**收敛与提纯阶段**：目标从"补齐功能"转为"建立纪律与审美"
- 与 `docs/design/相册重构与端优化方案.md`（画册专项）并行不冲突
- 完成后建议回写 `docs/design/改动记录.md` 并新增 `docs/design/移动端设计规范.md` 作为长期事实源
