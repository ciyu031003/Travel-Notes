# Travel-Notes 相册视觉系统优化方案 · V3 深化版

> 版本：V3 · Album Visual System Deep-Dive  
> 日期：2026-08-18  
> 基础：《Travel-Notes_相册视觉系统优化方案》V2（微信文档）  
> 依据：本仓库前端 UI 代码现状审计（v2.5.0 · commit 2ebd3b2）+ design-taste-frontend / react-bits 技能准则  
> 核心结论：**V2 的方向完全正确，问题在"落地规格不够"。** V3 把 V2 的理念翻译成可执行的设计 Token、组件规格、交互参数与分阶段验收标准，并补上 V2 没有覆盖的三个现实问题：双相册系统割裂、三套视觉风格并存、旅行圈社交尚未成型。

---

# 〇、三句话摘要

1. **值得肯定**：不推翻现有风格、三层视觉架构（银河=天空 / 像素=记忆 / 照片=灵魂）、社交克制、Offline First 这些判断是对的；代码里 `/album` 的双模式（银河唱片 + 复古像素）、质量自适应引擎、next/image 迁移都已经是很好的底子。
2. **需要优化**：现在的"装饰"密度仍然高于"照片"（拍立得角标/蜡封/黑遮罩、唱片粒子化照片、书脊微信息过载）；项目里同时存在 4 套互不相关的风格（travel 暖色 / rose 粉色 / notes 紫霓虹 / 相册暗色玻璃），V2 没有处理它们的关系；`/album` 与 `/albums` 两个相册入口彼此割裂。
3. **深化方向**：把 V2 的"理念"固化成一套 Album Design Tokens + 组件规格（TravelFilmCard / AlbumPhoto / PhotoViewer / AlbumDayDivider）+ 性能预算 + 无障碍标准，最后按 8 个阶段（Phase 0-7）落地，每阶段都有验收标准。

---

# 一、现状审计：前端 UI 设计盘点（我读了什么）

## 1.1 页面与组件地图

| 模块 | 路由 / 文件 | 现状 |
| --- | --- | --- |
| 沉浸式相册（双模式） | `app/album/page.tsx` | 解锁 → 银河唱片空间(Three.js) 或 像素书架+拍立得墙，一键切换、localStorage 记忆、WebGL 失败自动回落像素 |
| 银河模式 | `components/album/space/*` | `GalaxyAlbumScene` + `galaxyEngine`（360° 环视/滚轮切换/点击特写/双指缩放）+ `SpaceAlbumHUD` + `SpaceRadar` + `GlassPanel` |
| 像素模式 | `PixelDeskBackground` / `PolaroidWall` / `PixelPhotoChat` / `PixelUnlockModal` | 木屋桌面 + 书架书脊选城 + 拍立得错落照片墙 + 书卷留言 |
| 传统相册 | `app/albums/*` + `app/admin/albums/*` | 后台管理的 Album/AlbumMedia 模型，玫瑰粉卡片网格 + 简单 Lightbox |
| 首页 | `components/HomeClient.tsx` | 暖色 travel 系：统计、足迹地图、旅行卡片、弹幕、纪念日倒计时 |
| 旅行 | `app/travel/*` | 中国地图 + 旅行列表 + 详情页海报式改版 |
| 时间线 | `app/timeline/*` | 按旅行/回忆/TimelineItem 自动排版 |
| 社交雏形 | `components/moments/*`、`components/like/LikeButton.tsx`、`components/comments/CommentsSection.tsx` | 碎碎念时间线、点赞（乐观更新）、Giscus 评论 |
| 全局壳 | `components/layout/*` | `LayoutContent` 对 `/album` 不套全局 Navbar/Footer（已把相册当独立沉浸空间） |

## 1.2 设计资产盘点

- **Tailwind Token（已有雏形）**：`travel` 暖色系 `cream/ink/dim/sakura/bloom/sky/mist` + 语义色 success/warning/danger；字体 `display(Noto Serif SC)/sans/mono/zpix`；阴影 `soft/card/glow-bloom/glow-sky`；动画 fade-in 等（`tailwind.config.js`）。
- **相册暗色 Token（CSS 硬编码）**：`#050508`（银河底）、`#0d0604`（像素底）、`#dfa87a`（像素金）、`#f2b123`（Minecraft 金）、`#a89f91`（次级文字）、`space-glass`（蓝紫玻璃）等，全部散落在组件里。
- **数据模型**：`Album/AlbumMedia/Media/MediaVariant`、`Travel/TravelDay/Location/Memory/TimelineItem`、`Space/SpaceMember`、`Like/Moment/PhotoMessage` 已存在；**不存在** 旅行圈 / 公开旅行 / TravelPost / TravelFilm 相关代码。

## 1.3 三个 V2 方案没写到的现实问题

1. **双相册系统割裂**：前台导航指向 `/album`（沉浸式、数据来自 Post 图片聚合的城市相册）；后台"相册管理"管的是 `/albums`（Album 模型）。同一产品两个相册入口、两套视觉、两套数据。
2. **四套风格并存**：travel 暖色（首页/旅行）、rose 粉色（`/albums`、`/moments`）、notes 紫霓虹（学习笔记模块）、相册暗色玻璃（`/album`）。V2 只说"银河和像素是同一套 Design System"，没有定义它们与全站的关系。
3. **旅行圈尚未存在**：V2 把"旅行圈/公开旅行/点赞评论收藏"当成已有功能来写视觉，实际代码只有碎碎念 + 点赞 + Giscus 评论。需要给出从现状到旅行圈的落地路径，而不是只写 Feed 长什么样。

---

# 二、值得肯定的方面（Strengths）

## 2.1 方案层面（V2 文档本身）

1. **"不推翻"的判断正确**：像素 + 银河 + 真实照片是这个产品最稀缺的辨识度，删掉就退化成普通旅行 App（V2 §三）。这条是整份方案的地基，完全成立。
2. **三层视觉架构**：银河=天空、像素=记忆、照片=灵魂，是一个清晰、可复述、可传导给团队的心智模型（V2 §二）。
3. **视觉优先级链**：照片 > 标题 > 旅行信息 > 互动按钮 > 装饰 > 银河背景（V2 §4.2 / §三十一），方向正确。
4. **社交克制**：图标 + 数字而不是大按钮（V2 §十一），保持"旅行记忆产品"而不是"社交平台"（原则 10）。
5. **主题统一**：银河/像素是同一 Design System 下的两个主题，而不是两套 UI（V2 §十五 / 原则 6）。
6. **Offline First + 性能优先 + 移动端优先**：图片加载、滚动、手势优先于粒子与动画（V2 §十七 / 二十七 / 原则 7-9）。
7. **TravelFilmCard 作为公共连接器**：相册、旅行、旅行圈、分享、用户主页共用同一卡片（V2 §三十），这是把视觉统一落到代码的正确杠杆点。

## 2.2 实现层面（代码现状）

1. **双模式已落地且工程化良好**：`viewMode` + localStorage 记忆 + `handleWebGLFail` 自动回落像素 —— 说明"两套主题"不是概念，是可切换的产品形态。
2. **银河引擎质量自适应**：移动端 DPR ≤1.5、粒子 900 vs 桌面 1600、流星 7 vs 14、`prefers-reduced-motion` 关闭流星、`document.hidden` 处理、ResizeObserver（`galaxyEngine.ts`）。比很多演示项目认真。
3. **像素风资产完整且自洽**：Zpix 字体、Minecraft 硬边立体按钮、书脊配色循环、拍立得错落旋转、蜡封印章 —— 一套真正有记忆点的视觉语言，值得保留。
4. **next/image 已在相册使用**（fill + sizes），符合 Phase 6 性能迁移。
5. **已有社交基础件**：`LikeButton`（乐观更新 + 失败回滚）、`PhotoMessage`、`MomentTimeline`、`CommentsSection`，为旅行圈打底。
6. **已识别沉浸空间边界**：`LayoutContent` 对 `/album` 不套全局导航，承认相册是"另一个世界"，这个边界意识是对的。

---

# 三、需要继续优化的方面（Gaps）

## 3.1 结构性问题

| # | 问题 | 证据 | 优先级 |
| --- | --- | --- | --- |
| G1 | 双相册入口割裂 | 导航 `/album` vs 后台 `/admin/albums` → `/albums` | 🔴 |
| G2 | 四套风格并存无归属 | travel 暖色 / rose 粉 / notes 紫霓虹 / 相册暗色玻璃 | 🔴 |
| G3 | 旅行圈没有落地路径 | 无 TravelPost/TravelFilm 代码，只有 Moment/Like/Giscus | 🟠 |
| G4 | 社交组件风格未统一 | LikeButton 是 gray/rose 常规胶囊，与相册沉浸风不匹配；Giscus iframe 与沉浸场景冲突 | 🟠 |

## 3.2 视觉层级执行偏差（装饰 > 照片）

1. **拍立得墙信息过载**：每张照片默认叠加"记忆底片"角标 + 底部手写题字 + 蜡封"记"印章，hover 还有整张黑色遮罩 —— 一张照片上同时有 3-4 层装饰。与 V2"照片必须是最重要的内容"自相矛盾。
2. **银河唱片把照片粒子化**：`buildPhotoAtlas` 把真实照片采样成粒子再重组，照片的质感被装饰稀释。用户想看的是一张真实的照片，不是一个粒子特效。
3. **书脊微信息过载**：每本书脊同时有 序号 + 竖排城市名 + 张数 + 两条黄条 + 金色选中标签，字号低至 8-11px。
4. **像素字体滥用**：多处正文/按钮使用 `font-zpix` + `text-[10px]`，像素字体只该做"记忆符号"，不该做正文（V2 §5.1 自己也是这么说的，代码没执行）。

## 3.3 设计与实现的落差

1. **Token 没有真正统一**：`/album` 内大量硬编码色值（`#0d0604`、`#dfa87a`、`#a89f91`、`#f2b123`、`rgba(120,140,255,…)`），tailwind 的 travel 色系与相册暗色系没有打通。
2. **两套金色**：像素 `#dfa87a` 与 Minecraft 按钮 `#f2b123` 并存，选中态又是蓝紫 `rgba(120,140,255,…)`，银河 HUD 与像素金不是同一强调色。
3. **移动端硬编码**：拍立得墙外层 `lg:h-[calc(100vh-230px)] min-h-[420px]`，小屏下滚动与布局不自由；银河模式 `fixed inset-0 z-[90]` 无系统返回键。
4. **对比度不足**：`space-glass` 上大量 `text-white/35`、`text-white/45`、`text-[10px]`，深空背景上可读性差；银河解锁页文字直接压在星点背景上（违反 V2 §二十八自己写的无障碍原则）。

## 3.4 V2 方案本身的不足

1. **概念多、规格少**：37 节大部分是理念与 ASCII 草图，没有具体的 token 值、组件 props、动效参数、验收标准。
2. **主题扩展只列名字**：胶片/极简/自然/夜行 4 个未来主题没有任何定义（配色、字体、适用场景、与银河/像素的关系）。
3. **没有验收机制**：没有把"降低噪音""照片优先""社交克制"翻译成可检查的清单。
4. **忽略现状代码**：把规划中的旅行圈写成已有功能，也没有处理双相册与四套风格。

---

# 四、设计读取与深化方向（Design Read）

按 design-taste-frontend 的流程，先给出设计读取，再定三轴：

> **Reading this as：私人数字旅行档案 + 沉浸式相册 + 轻社交，受众是情侣（未来扩展公开旅行圈），语言是「低噪音银河氛围 + 像素记忆符号 + 真实照片叙事」，是"旅行记忆产品"而不是"社交平台"。**

三轴设定（相册模块）：

```text
DESIGN_VARIANCE : 6   偏移但克制（照片墙错落、书架、唱片环轨都可以留，但不堆叠）
MOTION_INTENSITY: 4   流畅低噪（星星呼吸、淡入、轻跳入；禁止高频闪烁/自动旋转/大面积发光）
VISUAL_DENSITY  : 3   画廊感（给照片留白，装饰元素只出现一次、只在一个层级）
```

社交 Feed（未来旅行圈）单独设定：

```text
DESIGN_VARIANCE : 5
MOTION_INTENSITY: 3   克制，内容优先
VISUAL_DENSITY  : 5   正常信息密度
```

## 4.1 深化后的五条执行原则

1. **照片永远是一级内容**：任何组件里，照片只允许被一层 UI 覆盖（hover 态可以，常驻态不行）；常驻角标每张照片最多 1 个（同步状态 或 Day 序号，二选一）。
2. **像素只做符号**：Zpix 只用于 日期、DAY、城市名、标签、小图标；正文、按钮、评论一律用 sans。
3. **银河只做氛围**：星点透明度上限 0.5，禁止文字直接压在星云上（中间必须隔一层半透明内容层）。
4. **一个强调色**：相册暗色系只保留一个强调色（琥珀金），选中态、主按钮、发光全部派生自它；星蓝只允许在"唱片被选中"这一个语义点上出现。
5. **一套系统**：全站最终收敛为 travel 暖色（明） + 相册暗色（沉浸） 两套皮肤，rose/notes 的独立色全部迁移进 travel 语义色（notes 霓虹保留为 notes 模块内部皮肤，不扩散）。

---

# 五、Album Design Tokens（深化后的规格）

在 `globals.css` 的 `:root` 增加一组语义 token，组件内禁止再出现裸色值。

## 5.1 相册暗色（Album Dark）

```css
:root {
  /* 背景层级 */
  --album-bg-0: #050508;            /* 银河最底层 */
  --album-bg-1: #0b0807;            /* 像素暖黑（统一 #0d0604） */
  --album-bg-2: #14100e;            /* 像素卡片底 */
  --album-surface: rgba(255,255,255,0.06);
  --album-glass: rgba(10,12,22,0.55);  /* 玻璃底 */

  /* 文字 */
  --album-text-1: rgba(245,247,255,0.92);
  --album-text-2: rgba(245,247,255,0.68);
  --album-text-3: rgba(245,247,255,0.45);  /* 仅限非关键信息 */
  --album-text-warm: #a89f91;

  /* 强调色（唯一） */
  --album-accent: #e8b06a;          /* 统一 #dfa87a 与 #f2b123 */
  --album-accent-strong: #f5c97e;
  --album-accent-dim: rgba(232,176,106,0.16);

  /* 语义态（不依赖颜色） */
  --album-ok: #6fcf97;
  --album-sync: #f5c97e;
  --album-wait: #9aa3b2;
  --album-error: #e06c6c;
}
```

## 5.2 字体角色

| 角色 | 字体 | 用途 |
| --- | --- | --- |
| 展示标题 | Noto Serif SC（现有 `font-display`） | 相册大标题、档案标题、空状态文案 |
| 正文 | PingFang SC / sans（现有） | 描述、留言、评论 |
| 数字 | JetBrains Mono（现有 `font-mono`） | 日期、DAY 序号、计数、坐标 |
| 记忆符号 | Zpix（现有 `font-zpix`） | 城市名、标签、✦ DAY ✦ 分隔符、小图标 |

## 5.3 圆角 / 阴影 / 发光

```text
圆角:   sm 4px（像素按钮） · md 8px（小标签） · lg 16px（容器/卡片） · full（胶囊）
照片:   0 或 4px —— 照片不该被大圆角框住，圆角是"装饰"，不是"照片"的事
阴影:   --shadow-card（已有） + --shadow-album: 0 8px 32px rgba(0,0,0,0.45)
发光:   --glow-accent: 0 0 24px rgba(232,176,106,0.28) —— 只用于选中态/主操作，禁止常态发光
```

## 5.4 z-index 层级表（项目常量）

```text
10 背景层（星云/星点/木屋桌面）
20 内容层（照片、卡片、书架）
30 HUD 层（银河模式顶栏/底栏、像素模式顶栏）
40 底部导航（MobileBottomNav）
50 全局导航（Navbar）
60 遮罩层（解锁半透明层、弹幕层）
70 弹窗层（解锁弹窗、留言弹窗）
80 全屏查看器（PhotoViewer / Lightbox）
90 沉浸场景（GalaxyAlbumScene 画布）
100 全局 Lightbox 顶部
```

## 5.5 动效规格（把 V2 §二十六"应该轻量"变成参数）

| 场景 | 参数 | reduced-motion |
| --- | --- | --- |
| 星点呼吸 | 2-4s 循环，透明度 0.15 → 0.5（现 `space-twinkle` 0.15→0.9 过强，调低） | 静态 |
| 页面入场 | 0.4-0.6s `ease-out-soft` 淡入上浮 | 直接显示 |
| 像素卡片跳入 | 0.2s scale 1.0→1.03 回弹一次 | 无 |
| 照片淡入 | 0.3s opacity（不缩放，避免 LCP 抖动） | 无 |
| 唱片切换 | 相机 0.6-0.9s 阻尼缓动（已有 damp 逻辑） | 立即切换 |
| 悬停 | 仅 transform/opacity，禁止改 layout 属性 | 无 |

禁止：高频闪烁、自动旋转、大范围发光、多个元素同时发光、`window.addEventListener('scroll')` 驱动的 React state（改用 Motion `useScroll` / IntersectionObserver / CSS scroll-driven）。

---

# 六、银河模式深化规格

## 6.1 三层降噪结构

```text
第一层  背景：静态星云 + 低对比星点（透明度 ≤0.5，禁止高频闪烁）
第二层  唱片：中心 = 真实照片封面（不粒子化）；外圈 = 1-2 圈像素粒子槽纹 + rim 高亮
第三层  前景：HUD（玻璃面板，文字层级 text-2 起）
```

关键改动：**唱片中心从"照片粒子化"改为"真实照片 + 像素外圈"**。粒子只保留在槽纹/光晕这些"非照片"区域，让真实照片在银河里依然是一张照片。照片纹理用缩略图（≤320px 采样），不把原图喂给 GPU。

## 6.2 HUD 深化

- 顶部玻璃栏：标题用 `text-1`（0.92），副信息用 `text-2`（0.68）；当前 `text-white/35-45` 的提示文字全部上调一级。
- 底部胶囊栏保留（拖拽环视 / 滚轮切换 / 点击放大 / Ctrl+滚轮缩放），操作提示只显示在 lg+ 屏。
- 新增主操作按钮「进入相册」：点击唱片特写后出现，进入全屏 PhotoViewer —— 这是"照片优先"的关键出口。
- 返回导航：银河模式需要明显的返回入口（顶部已有，但移动端要更大命中区域）。

## 6.3 性能预算（写进代码，对照实测）

| 项 | 桌面 | 移动 |
| --- | --- | --- |
| 背景银河粒子 | 1600 | 900 |
| 单张唱片粒子（槽纹+rim） | ≤8000 | ≤3500 |
| 同屏唱片 | 3-5（含 LOD） | 3 |
| 总粒子上限 | ≤25000 | ≤12000 |
| DPR | ≤2 | ≤1.5 |
| Bloom 层 | 可开关 | 关 |
| 隐藏暂停 / reduced-motion | ✅ | ✅ |

---

# 七、像素模式深化规格

## 7.1 书架 → 旅行档案墙

保留书架隐喻，但每本书 = 一份 **Travel Film 档案**（城市 + 日期 + DAY 数 + 照片数 + 1 张封面缩略图）。书脊信息收敛为两层：**城市名（Zpix）+ 日期（mono）**，去掉 8-11px 的零碎微信息。

## 7.2 拍立得墙减负

- 常驻角标：每张照片最多 1 个（Day 序号 `#03`，或同步状态，二选一）。
- 去掉常驻"记忆底片"角标与蜡封"记"印章；hover 时只显示一个轻量 `MessageCircle` 图标 + 轻微上浮，不再整张黑遮罩。
- 手写题字区只保留城市名 + 日期两行，字号上调到 12px 以上。
- 照片方角（0-4px），让照片本身成为视觉主体。

## 7.3 Day 分隔符

保留 `✦ DAY 01 · ARRIVAL ✦` 像素分隔符，但缩小字级（12px mono + 两侧细线），作为照片墙之间的"呼吸节点"而不是"装饰带"。

## 7.4 留言页

`PixelPhotoChat` / `PhotoChatView` 保留（这是产品的记忆亮点），但正文用 `diary-book-font`（Courier）而非 Zpix 满屏；Zpix 只用于顶部城市/日期符号。

---

# 八、TravelFilmCard —— 统一连接器规格

这是 V2 §三十的核心组件，V3 给出可执行规格。

```text
┌────────────────────────────────────┐
│          [cover 4:3 真实照片]        │
│   ✦ TOKYO · DAY 03 ✦   (Zpix 符号)  │
│   2026.08 · 5 DAYS      (mono 数字)  │
│   东京五日旅行                        │
│   👤 Ciyu                (sans)      │
│   ❤ 128   💬 23   🔖 42              │
└────────────────────────────────────┘
```

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `coverUrl` | string | 封面照片（next/image，`sizes` 按尺寸变体传） |
| `title` / `cityName` | string | 档案标题 / 城市名（Zpix） |
| `dateRange` | string | `2026.08.12 - 08.16`（mono） |
| `dayCount` / `photoCount` | number | DAY 数 / 照片数（mono 计数） |
| `location` | string | 地点标签（Zpix 小标签） |
| `author` | { name, avatar } | 作者（公开场景显示） |
| `stats` | { likes, comments, bookmarks } | 互动数字 |
| `variant` | 'card' / 'hero' / 'strip' | 尺寸变体 |
| `onOpen` | callback | 进入相册 / 进入旅行 |

尺寸变体：
- `card`：网格 Feed / 用户主页（1 列）
- `hero`：相册封面 / 旅行档案页头部（2 列）
- `strip`：横向滑动条（首页"最近旅行"、旅行圈横向推荐）

交互：hover 轻上浮 2px + 封面 scale 1.03（仅 transform/opacity）；点击进相册；社交按钮在卡片右下角，on-dark 与 on-light 两套变体。

---

# 九、旅行圈（轻社交）深化

## 9.1 从现状到旅行圈的路径

现状只有 `Moment`（碎碎念）+ `Like` + `PhotoMessage` + Giscus。落地顺序：

1. `Travel` 增加公开状态（`visibility: PRIVATE/COUPLE/PUBLIC`，模型上 `Media.visibility` 已有类似概念，需打通）。
2. 公开旅行发布为 `TravelPost`（视图，不新增重型表；复用 Travel + TravelFilmCard）。
3. 旅行圈 Feed = TravelFilmCard 列表（公开 Travel）。
4. 用户主页 / Space 主页复用 TravelFilmCard。

## 9.2 社交按钮规格

- 图标用 lucide（`Heart` / `MessageCircle` / `Bookmark`，项目已依赖 lucide，遵循"已有依赖优先"）。
- 图标 + 数字（`tabular-nums`），不使用 emoji；当前 `LikeButton` 的 gray/rose 胶囊改为 `SocialButton` 双变体：`on-light`（travel 语义色）与 `on-dark`（album 暗色玻璃）。
- 点击动画：仅 `scale 1→0.85→1` 一次 + 状态色切换（乐观更新逻辑保留）。

## 9.3 评论

- 沉浸场景（相册留言、旅行档案）用自建轻量评论面板（`CommentList` + `CommentInput`，落库到现有模型或新增 `Comment`）。
- 博客页保留 Giscus（不侵入沉浸场景）。

## 9.4 克制原则

- Feed 里社交按钮放右下角一行，不放大、不加粗、不用彩色圆底。
- 关注功能简化：Space 已有成员概念，旅行圈"关注"= 关注某人的 Space，不另造关注表（除非数据规模需要）。

---

# 十、移动端 + Offline First 深化

## 10.1 移动端相册

- 默认进入 **全屏照片流**（PhotoViewer），书架折叠为顶部横向滑动城市条（保留 Zpix 城市标签）。
- 手势：左右切换照片、双指缩放、上滑回列表、长按保存/分享。
- 拍立得墙在移动端降级为 2 列照片网格（去掉错落旋转，保证滚动性能）。
- 修复 `lg:h-[calc(100vh-230px)]` 硬编码，改为 `min-h` + 自然流。

## 10.2 同步状态角标（像素符号）

```text
✓ 已备份    ↑ 上传中    ☁ 等待备份    ! 同步失败
```

规则：每张照片右下角最多显示一个状态符号（mono 图标 + 色），颜色 + 符号双通道表达（不依赖颜色区分，符合无障碍）。

## 10.3 存储与图片管线（承接 V2 §二十/二十一/二十二）

```text
原图（本地 File Storage）
  → 读取尺寸 + SHA-256 Hash
  → 缩略图 WebP（≤320px，进 GPU/网格）
  → 展示图 WebP/AVIF（进 PhotoViewer）
  → 本地 SQLite metadata（MediaMetadata）
  → SyncQueue → 云端（OSS/MinIO/R2/S3 兼容）
  → 去重：同 Hash 跳过上传
```

---

# 十一、无障碍与性能验收标准

## 11.1 无障碍

- 正文对比度 ≥ 4.5:1（AA），大标题 ≥ 3:1；`text-white/35-45` 全部上调或换底色。
- 文字不直接压在星空/照片上：中间必须隔半透明内容层（V2 §二十八的"半透明内容层"落实为规范）。
- 同步状态等状态表达 = 图标 + 颜色，不单靠颜色。
- `prefers-reduced-motion` 全场景降级为静态（相册已有基础，需覆盖到新组件）。
- focus-visible 保留现有 2px 描边并应用到新组件。

## 11.2 性能预算（对照实测）

- LCP < 2.5s：封面图 `next/image priority` 或预加载。
- INP < 200ms：粒子/3D 计算不阻塞主线程，卡片入场用 transform/opacity。
- CLS < 0.1：照片容器固定 aspect ratio，字体用 `font-display: swap`。
- 粒子预算表（§6.3）逐项实测。

---

# 十二、分阶段执行计划（每个阶段该做的事情）

> 顺序原则：**先收口现状（双相册/四套风格），再做组件，再做新功能（档案/旅行圈），最后性能与无障碍验收。** 每阶段都有可勾选任务与验收标准；阶段之间允许并行（Phase 1 token 与 Phase 2 组件可同 Sprint 推进）。

## Phase 0：审计基线（0.5-1 天）

**目标**：把"现状"固化成清单，作为后续所有阶段的输入。

- [ ] 全页面截图存档：桌面 + 移动 + 明暗两模式（首页 / travel / album 双模式 / albums / timeline / moments）
- [ ] 硬编码审计：扫描 `app/album`、`components/album`、`app/albums` 内所有裸色值、`font-zpix`、`text-[10px]`、`white/3x`，生成清单
- [ ] 双相册梳理：`/album` 与 `/albums` 的数据流、路由、后台入口对照表
- [ ] 四套风格清单：每个页面归属哪套皮肤（travel / rose / notes / album-dark）
- [ ] 本方案入库 `docs/`，创建 `docs/design/` 目录

**验收**：一份可执行审计清单（markdown），Phase 1 的 TODO 直接来源于它。

## Phase 1：视觉统一 · 设计 Token（3-5 天）

**目标**：全站从 4 套风格收敛为 2 套皮肤（travel 暖色 + 相册暗色），消灭相册硬编码。

- [ ] `globals.css` 增加 §5.1 的 `--album-*` token 组
- [ ] 统一强调色：`#dfa87a` / `#f2b123` → `--album-accent`；选中态星蓝收敛到单一语义点
- [ ] 替换 `/album`、`components/album/**` 内硬编码色值为 token
- [ ] rose 系页面（`/albums`、`/moments`）迁移到 travel 语义色
- [ ] notes 紫霓虹限定在 notes 模块内部，不扩散到导航/全局样式
- [ ] 建立 z-index 常量文件（§5.4）
- [ ] 调低 `space-twinkle` 强度到 0.15-0.5，`space-glass` 文字层级上调
- [ ] 移动端硬编码高度修复（拍立得墙 `h-[calc(100vh-230px)]`）

**验收**：`/album` 与 `components/album/**` 无裸 `#` 色值；明暗两模式截图对比；`space-glass` 上所有文字对比度 ≥ 4.5:1。

## Phase 2：相册组件化（5-8 天）

**目标**：沉淀可复用相册组件库，为档案/旅行圈共用铺路。

- [ ] `AlbumPhoto`：next/image + 固定 aspect + 常驻角标（同步状态 / Day 序号，二选一）+ 点击回调
- [ ] `AlbumDayDivider`：✦ DAY 01 · ARRIVAL ✦（12px mono + 两侧细线）
- [ ] `PhotoViewer`：全屏照片浏览（左右切换 / 双指缩放 / EXIF / 长按保存分享 / 页码 `03 / 128`）
- [ ] `GalaxyBackground`：静态星云 + 低对比星点（透明度 ≤0.5，可关）
- [ ] `PixelBadge` / `PixelIcon`：Zpix 小标签与 16x16 像素图标
- [ ] `TravelFilmCard`：card / hero / strip 三变体（§八规格）
- [ ] 组件独立可测：临时 story 页或测试目录渲染各组件

**验收**：每个组件在独立页面可渲染；移动端 PhotoViewer 双指缩放可用；`prefers-reduced-motion` 下无动画。

## Phase 3：双相册合并（3-5 天）

**目标**：前台一个相册入口，后台数据在前台可见。

- [ ] 定义 `/album` 为唯一前台相册入口；`/albums` 转为 admin 专属或重定向
- [ ] 打通数据：城市相册（Post 图片聚合）与 `Album/AlbumMedia` 模型的关系（一个相册 = 一次旅行 / 一座城市）
- [ ] 导航统一：Navbar + MobileBottomNav 只保留一个相册入口
- [ ] 后台"相册管理"管理的内容能在 `/album` 呈现

**验收**：导航无重复相册入口；后台新建相册 → 前台 `/album` 可浏览；无 404 或数据不一致。

## Phase 4：旅行档案（5-8 天）

**目标**：从"图片管理器"升级为"数字旅行档案"（V2 §七-九）。

- [ ] `TravelFilm` 档案视图：封面 = TravelFilmCard hero
- [ ] Day 标记 + 地点标签 + 日期标签（Zpix 符号 + mono 数字）
- [ ] 旅行时间线：像素节点 + 日期 + 地点列表（承接 V2 §二十三）
- [ ] 旅行星图：地图城市连线（银河背景 + d3-geo 中国地图，复用现有 ChinaMap）
- [ ] Space 特色：共同星图（"我们一起去过 N 城 · N 国 · N 天 · N 张照片"，数字用 `CountUp` 动效，克制）

**验收**：任一城市可浏览完整档案（封面 → 相册 → DAY 分段 → 时间线 → 地图）；空状态/加载态齐全。

## Phase 5：旅行圈融合（7-10 天）

**目标**：私人相册 → 公开 → 旅行圈 Feed，社交组件统一。

- [ ] `Travel.visibility`（PRIVATE/COUPLE/PUBLIC）落库并打通 `Media.visibility`
- [ ] 公开旅行发布为 `TravelPost`（复用 Travel + TravelFilmCard，不新增重型表）
- [ ] 旅行圈 Feed 页：TravelFilmCard 列表 + 筛选（全部 / 关注 / 收藏）
- [ ] `SocialButton` 双变体（on-light / on-dark）：Heart / MessageCircle / Bookmark + 数字
- [ ] 自建轻量评论面板（沉浸场景）；博客页保留 Giscus
- [ ] 用户主页 / Space 主页复用 TravelFilmCard
- [ ] 收藏 = Bookmark 列表页

**验收**：私人相册 → 公开 → 出现在旅行圈 Feed → 可点赞/评论/收藏 → 收藏出现在收藏列表；整个链路视觉统一为 TravelFilmCard。

## Phase 6：移动端 + Offline First（5-8 天）

**目标**：离线可浏览、可保存，联网自动同步。

- [ ] 移动端相册默认全屏照片流，书架 → 横向城市条
- [ ] 本地图片 + SQLite metadata（Capacitor 侧，承接 V2 §十七）
- [ ] 图片管线：缩略图/展示图/原图三级 + SHA-256 Hash 去重
- [ ] `SyncQueue` + 上传状态角标（✓/↑/☁/!）
- [ ] 同步中心页面 + "立即备份"入口（V2 §十九的设置在代码落地）
- [ ] 长按保存/分享（Capacitor）

**验收**：飞行模式可浏览本地相册与留言；联网后 SyncQueue 自动上传；状态角标在每张照片右下角正确显示。

## Phase 7：性能与无障碍验收（3-5 天）

**目标**：用数据确认"照片优先"，防止视觉升级拖累性能。

- [ ] Lighthouse 桌面 + 移动：LCP < 2.5s / INP < 200ms / CLS < 0.1
- [ ] 粒子预算表（§6.3）逐项实测，超标则降级
- [ ] 对比度审计（AA）：`/album` 双模式、旅行档案、旅行圈全部页面
- [ ] reduced-motion 全场景验证（含新增组件）
- [ ] 预检清单：照片每张最多 1 个常驻角标、Zpix 不用于正文、星点透明度 ≤0.5、无高频闪烁、无 `window.addEventListener('scroll')`
- [ ] 截图回归：与 Phase 0 存档对比，确认"噪音下降、照片更突出"

**验收**：§11 所有检查项通过；Phase 0 的硬编码清单全部清零或注明豁免。

---

# 附录 A：react-bits 组件映射（可选，克制使用）

> react-bits 只用于"已有自定义实现无法覆盖且确实需要动效"的点，且必须 `'use client'` + `prefers-reduced-motion` 降级。相册沉浸核心（Three.js 银河）保持现有自定义引擎，不替换。

| 需求点 | 组件 | 安装命令 | 依赖 |
| --- | --- | --- | --- |
| 档案统计数字（N 城/N 国/N 天） | `CountUp` | `npx shadcn@latest add @react-bits/CountUp-TS-TW` | 无 |
| 档案标题入场（克制） | `SplitText` / `BlurText` | `npx shadcn@latest add @react-bits/SplitText-TS-TW` | gsap + @gsap/react |
| TravelFilmCard hover 微光 | `GlareHover` | `npx shadcn@latest add @react-bits/GlareHover-TS-TW` | 无 |
| 旅行圈空状态 / 灵感轮播 | `CircularGallery`（仅桌面，可选） | `npx shadcn@latest add @react-bits/CircularGallery-TS-TW` | @use-gesture/react |
| 首页"最近旅行"横向条 | `LogoLoop` 改造成照片 marquee（仅 1 个/页） | `npx shadcn@latest add @react-bits/LogoLoop-TS-TW` | 无 |

约束（来自 react-bits 技能）：
1. 每个组件装完检查 import 块与 peer deps，避免缺模块。
2. Three/OGL 组件在 Next.js 里必须 `'use client'` 或 `next/dynamic({ ssr: false })`。
3. 所有组件包一层 reduced-motion 降级。
4. 同页最多 1 个 marquee；不堆叠 2 个以上 canvas 背景。
5. 银河/唱片相关不做替换：现有 `galaxyEngine` 已是定制实现，替换成本 > 收益。

---

# 附录 B：与既有文档的关系

| 文档 | 关系 |
| --- | --- |
| 《相册粒子化重构方案》（docs/） | 是 `/album` 银河唱片模式的实现方案，V3 不推翻它；V3 的 §6 对其提出一处改版：**唱片中心照片不再粒子化，保留真实照片** |
| 《Travel-Notes_优化设计方案》（docs/） | 全产品路线，V3 是其"相册视觉"子模块的深化 |
| 《Travel-Notes-2.0-优化整改路线图（修订版）》（docs/） | 工程路线（Phase 0-7），V3 的 Phase 0-7 与其 Phase 6（UI/UX+性能）对齐，并把"相册视觉"独立成专项 |
| V2《相册视觉系统优化方案》（微信文档） | V3 的输入，逐条承接其理念并补规格 |

---

# 附录 C：一句话收尾

> V2 说对了"要什么"，V3 说清楚"做成什么样、分几步做、每一步怎么验收"：**银河降噪、像素做符号、照片做主角，一套 Token、一个强调色、一个 TravelFilmCard，双相册合并、四套风格收敛、旅行圈从现状长出来，最后用性能与无障碍数据验收。**
