# Travel-Notes Design System（UI V2）

> 阶段：第二阶段 · 在现有架构上建立统一视觉系统（不推翻已有 travel.* / social.* token）
> 原则：**不修改后端 API / 数据库 / 业务逻辑 / 数据结构**；在现有 token 与组件上"建立系统"，不大规模重构。
> 优先级：产品设计 > UX > 信息架构 > 视觉 > 动效 > 装饰。

---

## 一、视觉方向（V2 Design Language）

**「一本可以一直翻下去的个人旅行手账」**

三档叙事语言，对应三种页面壳：

| 壳 | 适用页 | 视觉基调 | 目的 |
|----|--------|---------|------|
| **标准壳** | 首页/时间线/搜索/旅行/碎碎念/Forget | 暖米纸面 + travel.* | 信息效率、阅读、浏览 |
| **沉浸壳** | 相册/旅行详情 | 深色相册(album)/全屏 | 故事浓度、情绪沉浸 |
| **档案壳** | /me /circle | `--social-*` 明暗可切（night 暗 + 暖金） | 个人品牌、社交发现 |

> 目标不是三套割裂风格，而是**同一品牌的三档浓度**：标准=日常、沉浸=故事、档案=身份。通过统一 Logo/字体/圆角/图标体系串联，消除"像三个产品"的观感。

---

## 二、Design Tokens

### 2.1 Color（沿用已有值，仅补齐语义命名）
保留 `travel.*`（亮）+ `social.*`（档案）+ `album.*`（相册）+ `night.*`（档案暗）。

**新增对齐（色值不变）**：
```css
/* 语义化，替换无前缀 success/warning/danger */
--color-travel-success: #22c55e;   /* success 500 */
--color-travel-warning: #f59e0b;   /* warning 500 */
--color-travel-danger:  #ef4444;   /* danger 500 */
```

**页面层级命名（约定，不强制硬编码）**：
```
content  → bg-cream / bg-[var(--social-bg)]   （页面底）
surface  → card / bg-[var(--social-surface)]  （卡片）
raised   → bg-[var(--social-surface2)]        （内嵌面）
border   → border-travel-line / ring-[var(--social-line)]
text     → text-travel-ink / text-[var(--social-text)]
muted    → text-travel-ink/70 / text-[var(--social-muted)]
faint    → text-travel-sand / text-[var(--social-faint)]
```

### 2.2 Typography Scale（12 → 72）
```ts
// 在 tailwind.config 归一（value 与现网一致，仅收敛内联 text-[xx]）
fontSize: {
  'display-hero': ['3rem',  { lineHeight: '1.12' }],        // 48px  (首页/档案大标题 hero)
  'display-1':    ['2.25rem',{ lineHeight: '1.25' }],       // 36px  (页级 H1)
  'display-2':    ['1.5rem', { lineHeight: '1.4' }],        // 24px  (区块 H2)
  'heading':      ['1.125rem',{ lineHeight: '1.5' }],       // 18px  (卡片标题)
  'body':         ['1rem',   { lineHeight: '1.7' }],        // 16px  (正文)
  'body-sm':      ['0.875rem',{ lineHeight: '1.6' }],       // 14px  (次级)
  'caption':      ['0.75rem',{ lineHeight: '1.5' }],        // 12px  (meta/标签)
  'data':         ['1.75rem',{ lineHeight: '1.2' }],        // 28px  (数据大数, tabular)
}
```
> 收敛所有 `text-[9-11px]`→`caption`、`text-[44px]`→`display-hero`，标题统一走 display 字体族 + weight 600/700。

### 2.3 Spacing（约定）
```
section : py-16   block : mb-10   card : p-6   gap : gap-4   stack : space-y-4
```

### 2.4 Radius / Shadow / Border
- Radius 保留现有：`rounded-xl(.875rem)/2xl(1.25rem)/3xl(1.75rem)`；卡片统一 `2xl`，胶囊 `full`，按钮 `xl`。
- Shadow：`shadow-soft`(默认卡片) / `shadow-card`(hover) —— 已定义，沿用，**不新增夸张投影**。
- Border：`border-travel-line/70`（亮）/ `border-[var(--social-line)]`（档案）—— 统一。

### 2.5 Motion（已有基础，规范明确）
- 时长：200-800ms，缓动 `ease-out-soft`(0.23,1,0.32,1)。
- 只用 `opacity/transform/scale/translate`，禁 blur 滥用、禁无限漂浮。
- 尊重 `prefers-reduced-motion`（已有全局兜底）。

### 2.6 Z-index
```
base 0 · content 10 · overlay/nav 40-50 · modal 70 · toast 80
```

---

## 三、ui/ 基础组件（新增，收敛重复）

在 `components/ui/` 建立：
```
Button.tsx      (variant: primary|secondary|ghost|danger, size: md|lg)
Badge.tsx       (封装 rounded-full px-3 py-1 + 文本)
Input.tsx       (rounded-xl px-4 py-3 + focus:ring)
TextArea.tsx
Card.tsx        (wrapper 统一 rounded-2xl border + shadow-soft)
SectionHeader.tsx (eyebrow + title + optional action)
```
> 这些组件**薄封装现有类名**，不改动任何页面行为；后续渐进替换分散写法。

---

## 四、分层改造计划

### Phase 1 —— 统一导航壳 + 数据看板重定位（最高优先，P0）

**改哪些 / 为什么**：
- `components/layout/LayoutContent.tsx`：让 `/travel` 走标准壳（去掉 travel 自绘 header，用统一 Navbar + MobileBottomNav）。✅ 消除 4 套导航割裂。
- `app/travel/page.tsx`：移动端记录列表前移（地图可作为可收起的视觉主体）。
- `app/dashboard`（`DashboardClient.tsx`）：重定位为「旅行记忆空间」——弱化 6 张统计卡为 3 个大数（点亮省份/旅行/照片），足迹地图前置，去掉「内容构成」等报表元素。

**验证**：375/390/414/768/1024/1440 截图 QA（无横向溢出、首屏信息合理）。

### Phase 2 —— Design System 落地（P1）

**改哪些**：
- 建 `components/ui/` 4-6 个基础组件。
- `tailwind.config.js`：归一 Typography Scale + 补 `travel-success/warning/danger`。
- 前台 hardcoded `gray-*/bg-white/80` → token（重点 Navbar/Footer/DashboardClient/首页）。

**验证**：tsc + build + 关键页截图（亮/暗）。

### Phase 3 —— 信息层级与移动端体验（P2）

**改哪些**：
- 首页 `/`：Hero + 最近旅行前置，功能入口收敛为「旅行相册/时间线/留言」3 卡并移到中段。
- 个人档案 `/me`：把「我的记忆」4 数据格改成照片化入口（小图 + 计数），弱化面板感。
- Empty/Loading/Error 全量铺开到 admin 页面。

**验证**：移动端六档 + 视觉对比。

### Phase 4 —— 双主题统一 + Motion + 微体验（P2/P3）

**改哪些**：
- 亮色 `travel` 与档案 `social` 的圆角/标题/间距对齐，让明暗切换"像同一产品"。
- Motion System 统一定义到 tailwind（复用已有 animation + ease-out-soft）。
- 沉浸页（相册/旅行详情）微交互打磨，保持「打开相册」的浓度。

**验证**：明暗切换截图 + 沉浸页滚动/图片浏览。

---

## 五、执行纪律

1. 每阶段：`tsc --noEmit` + `next build` + 截图 QA 通过后才进入下一阶段。
2. 改动仅前端（组件/样式/布局），**不动后端 API、DB、数据结构、业务逻辑**。
3. 每阶段独立 commit，且不走大规模重构（在现有类名上薄封装/token 化）。
4. 视觉方向如有大改，先在此文档更新方向再动手，避免"改完发现方向错"。
