# 移动端 UI 精修方案 —— Uiverse 模式移植（UI-M5）

> 版本：v1.0 · 状态：**P0 已实施，预览台待你确认后继续 P1–P4**
> 基准：HEAD `74bd37c` · 扫描范围 `components/` + `app/` 共 327 文件
> 参考源：[Uiverse.io](https://uiverse.io/)（社区开源 UI 片段库，MIT）
> 配套规范：[移动端设计规范.md](./移动端设计规范.md) · 检查脚本 `scripts/check-design-tokens.mjs`
> 审计附件：[_audit-mobile-screens.md](./_audit-mobile-screens.md)（逐屏清单）· [_audit-mobile-components.md](./_audit-mobile-components.md)（组件库清单）
> Uiverse 来源与致谢：[uiverse-picks.md](./uiverse-picks.md)

---

## ✅ 已确认的决策（2026-08-28）

| # | 决策 | 结果 |
|---|---|---|
| 1 | 改造深度 | **A · 只换手感**（按钮/输入/开关/勾选/加载/反馈/卡片质感），版式与信息架构不变 |
| 2 | 是否允许受控渐变 | **允许**，收敛为 3 个 token（`--m-grad-hero/-scrim/-cta`），组件内禁止直写 |
| 3 | 循环动画仅限 loading | **确认**（规范本已豁免 loading） |
| 4 | 深色模式同步 | **同步** |
| 5 | 先做 `/dev/ui/v4` 预览台 | **先预览**（已完成，见下） |
| 6 | 相册 / 像素 / admin | **保持不动** |
| 7 | 6 个缺陷（D1–D6） | **全部本轮修完**（已完成） |

## 📦 P0 实施结果

| 项 | 状态 | 产物 |
|---|---|---|
| D1 未定义变量修复 | ✅ | `app/mobile.css` 补 `--m-shadow-lg` / `--m-on-accent` / `--m-cta-bg` / `--m-on-danger` |
| D3 旅行详情移动端返回 | ✅ | `app/travel/[slug]/TravelDetailShell.tsx` 吸顶返回栏 |
| D4 `/search` 双树共用 ref | ✅ | `app/search/page.tsx` 拆 `desktopInputRef` / `mobileInputRef` + 断点选择 |
| D5 `/moments` 重复管理入口 | ✅ | `app/moments/page.tsx` 桌面入口补 `hidden md:flex` |
| D6 `/me/notifications` 接入设计系统 | ✅ | `components/social/NotificationsList.tsx` |
| D2 `/dashboard` 补移动布局 | ✅ | `components/dashboard/DashboardClient.tsx` 安全区 + LargeTitle + 返回 |
| Token 扩充 | ✅ | elev 三档 / inset / ring / dur / ease / 受控渐变 / 纹理 |
| 新增 Button | ✅ | `components/mobile/Button.tsx` |
| 新增 Field ×3 | ✅ | `components/mobile/Field.tsx` |
| 新增 Loader ×2 | ✅ | `components/mobile/Loader.tsx` |
| 新增 Checkbox | ✅ | `components/mobile/Checkbox.tsx` |
| 新增 ChoiceCard / ChoiceGroup | ✅ | `components/mobile/ChoiceCard.tsx` |
| 升级 Switch / SegmentedControl / Toast | ✅ | 同名文件（API 向后兼容） |
| 规范文档同步 | ✅ | §2.6 受控渐变 · §2.7 强调色文字与对比度 · §4.3 三级抬升 · §6.1 组件清单 · §7 动效 token · §9 检查项 |
| checker 新增 4 条规则 | ✅ | 渐变 / 未定义变量 / 冷色字面量 / `!important` 覆盖 |
| `/dev/ui/v4` 预览台 | ✅ | `app/dev/ui/v4/` + 截图 `docs/design/screenshots/m5-preview-*.png` |
| 预览台冒烟脚本 | ✅ | `scripts/m5-preview-verify.mjs`（真浏览器断言：无 pageerror / 无开发错误浮层） |
| 截图脚本 | ✅ | `scripts/m5-preview-shots.mjs`（明暗 × 390/360 + 6 区块特写） |
| 预览台免登录可达（附带） | ✅ | `lib/public-paths.ts` 新增 `isDevToolPath()`：**仅非生产**放行 `/dev/ui*`。生产一律 false，原有登录门禁不变；补 3 条安全测试 |

**验收（P0）**

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit` | ✅ 0 错误 |
| `npm run build` | ✅ 通过（`/dev/ui/v4` 7.72 kB / 132 kB First Load JS） |
| `npx vitest run` | ✅ 36 文件 / **375 用例全绿**（含新增 3 条开发路径安全测试） |
| `node scripts/check-design-tokens.mjs` | 原有 7 条 **295 处**（基线 308，↓13）· 新增 4 条 **100 处**（首次可见的既有欠债）· 未定义变量 **0** · 冷色字面量 **0** |
| 双主题预览 | ✅ 浅色 / 暗色 × 390 / 360 实测截图 + 6 个区块特写 |
| 门禁回归 | ✅ 无会话 `/dev/ui/v4` → 200；`/travel`、`/dashboard` → 307（未被误放行） |

> ⚠️ **未做**：P1–P4 的全局接入（5 处 CTA 替换、登录页接入 `Field`、魔术圆角/裸 hex 渐变清理、
> `MobileBottomNav` 胶囊、卡片分级落地、5 种危险红归一）。等你确认预览视觉方向后再动。

---

## 0. 先说结论：Uiverse 能拿什么、不能拿什么

我把 Uiverse 的 11 个分类逐类对过本项目：

| 事实 | 依据 |
|---|---|
| Uiverse 是**单文件 HTML/CSS 片段**，不是组件库：无 props、无暗色、无主题层、无 a11y、无 `prefers-reduced-motion` | [galaxy 镜像仓](https://github.com/uiverse-io/galaxy) README + 实际文件结构 `分类/<作者>_<代号>.html` |
| 许可为 **MIT**，可自由使用/修改/分发，**不强制署名**（官方"欢迎"署名） | galaxy 仓库 `LICENSE`（已核对原文） |
| 分类：Buttons / Cards / Checkboxes / Forms / Inputs / Notifications / Patterns / Radio-buttons / Toggle-switches / Tooltips / loaders | galaxy 仓库根目录 |
| **绝大多数组件的"精美"建立在四种技法上**：`:hover` 悬浮态、霓虹/彩虹渐变、无限 `@keyframes`、发光阴影 | 社区惯例；与本项目规范逐条对照见下 |

**实测样本（直接取 galaxy 仓原始文件核对，非推断）**

```html
<!-- Tooltips/G4b413l_dry-turtle-84.html -->
<style>
/* From Uiverse.io by G4b413l  - Tags: tooltip, button, button hover effect  */
.tooltip { background-color: #282828; color: #f1f1f1; ... }   /* ← 硬编码 hex */
.tooltip:hover .tooltiptext { visibility: visible; ... }        /* ← 只有 hover，触屏无效 */
</style>
```
```html
<!-- Patterns/vnuny_tough-dog-52.html -->
<style>
/* From Uiverse.io by vnuny - Tags: simple, pink, circle, pattern */
.container {
  background-color: #e5e5f7;                                     /* ← 硬编码浅紫 */
  background-image: repeating-radial-gradient(circle at 0 0, transparent 0, #e5e5f7 30px),
                    repeating-linear-gradient(#ffb5b58a, #ffb8b8); /* ← 硬编码粉 + 渐变 */
}
</style>
```

两个样本一致印证：**颜色写死、单主题、只有 hover、无 a11y**。
（好消息：每个文件头部都有 `/* From Uiverse.io by <作者> - Tags: ... */`，署名信息可直接提取，见附录。）

而这四条恰好是**本项目设计规范明令禁止的**：

| Uiverse 常用技法 | 本项目规范 | 冲突 |
|---|---|---|
| `:hover` 悬浮/抬升 | 移动端无 hover；触控只有 press | ❌ 无效 |
| 渐变 / 霓虹 / 发光 | §2.6「禁止新增渐变」；§1 彩色面积 ≤ 15% | ❌ 违规 |
| 无限循环动画 | §7「除 loading 外，禁止无限循环动画」 | ❌ 违规 |
| 硬编码 hex / 单主题 | §1「禁止硬编码 hex，一切走 token」；需双主题 | ❌ 违规 |

**所以本方案不安装任何 Uiverse 代码**，而是：**提取其交互与质感模式 → 用本项目 `--m-*` token 体系重写 → 作为 `components/mobile/` 的正式组件落地**。

> 判断：Uiverse 约 70% 的组件（hover 卡、3D tilt、霓虹 loader、渐变按钮、Tooltips）在本项目**不可直接采用**；
> 可提取的是约 **12 个"结构优雅、动效克制"的模式**。真正的价值不是"搬运组件"，而是**它补上了本项目移动端恰好缺失的那几个基础件**（见 §1 第 1 条）。

---

## 1. 现状取证：这不是重做，是补缺口

全部结论均有 `文件:行号` 依据。基线由 `node scripts/check-design-tokens.mjs` 实测。

### 1.1 ⭐ 最大缺口：移动端**根本没有 Button 组件**

`components/ui/Button.tsx` 存在，但它是**桌面组件**——用 `semantic.*` token、`hover:` 态、`rounded-xl`、无 44px 保证、无按压反馈。**移动端从未 import 它**。

于是移动端所有 CTA 都是**内联复制粘贴**，甚至拿 `m-chip` 当按钮用并靠 `!important` 覆盖：

| 位置 | 代码 | 问题 |
|---|---|---|
| `components/HomeMobile.tsx:300-306` | `m-press m-body inline-flex h-12 items-center gap-2 rounded-full bg-[var(--m-accent)] px-5 font-semibold text-white` | 主 CTA 内联 |
| `components/HomeMobile.tsx:307-313` | 同上，换成 `border` + `bg-[var(--m-surface)]` | 次 CTA 内联 |
| `components/HomeMobile.tsx:486-492` | `m-press m-chip m-chip-active !h-11 !px-6 !text-sm` | **chip 当按钮**，靠 `!` 覆盖尺寸 |
| `app/travel/TravelMobileClient.tsx:170-176` | `m-chip m-chip-active mt-5 !h-11 !px-5 !text-sm` | 同上 |
| `app/travel/TravelMobileClient.tsx:268-275` | 同上 | 同上 |
| `app/dev/ui/UiPreview.tsx:316-319` | 手写 `rounded-full bg-[var(--m-accent)] px-5` | 第 4 份副本 |
| `app/login/page.tsx:464-472` | `m-press m-chip m-chip-active !mt-4 flex h-12 w-full ... !rounded-2xl !text-[15px]` | 第 5 份；**这是移动端登录的主 CTA** |

→ **Uiverse `Buttons` 分类正好补这个洞**，且是唯一"必须做"的一项。

### 1.1b 登录页：三种输入框实现并存

`app/login/page.tsx` 一个文件里就有 **3 套互不相同的输入框样式**，且**桌面走旧体系、移动走新体系**：

| 行 | 实现 | 体系 | 圆角 |
|---|---|---|---|
| `:173` | `w-full rounded-xl border border-travel-line bg-white/70 py-3 pl-11 ... dark:border-shell-line ...` | 桌面 `travel.*` + `shell.*` | `rounded-xl` |
| `:393` | `w-full rounded-2xl border border-travel-line bg-white/60 ... dark:bg-shell-surface2/80` | 桌面（相册解锁弹窗） | `rounded-2xl` |
| `:448` | `w-full rounded-2xl border border-[var(--m-line-strong)] bg-[var(--m-surface-solid)] py-3.5 pl-11 pr-4 text-[15px] ... focus:ring-2 focus:ring-[var(--m-accent)]` | **移动 `--m-*`** | `rounded-2xl` |

同页还有：
- `:459` `border-[rgba(224,108,108,0.35)] bg-[rgba(224,108,108,0.12)] text-[var(--danger-soft)]` — 裸 rgba + 第 2 种危险红
- `:434` `text-[22px]`、`:467` `!text-[15px]` — 非标字阶
- `:484` `bg-[#1A1F26]` — 裸 hex 加载态
- `:336-339` `rotate-[-4deg]` 虚线圆圈 + `text-[10px]` — 装饰"旅行印章"

→ 这正是 §2 第 2 项（`Field`）与第 1 项（`Button`）要解决的问题：**登录页是用户看到的第一屏，却最不规范**。

### 1.2 圆角魔术数字 / 按序号交替圆角

```tsx
// app/travel/TravelMobileClient.tsx:186-189
'... overflow-hidden rounded-[26px] border ... shadow-[var(--m-shadow-sm)]',
index % 2 === 1 && 'rounded-[30px] border-[var(--m-line-strong)]',
```
规范 §4.2 只允许 4 档圆角（20 / 14 / 999 / 24）。checker 实测非标圆角 **9 处 / 6 个文件**：
`components/moments/MomentComposer.tsx:46`、`components/moments/MomentTimeline.tsx:110,137`、
`components/social/TravelCircleFeed.tsx:265`、`app/timeline/page.tsx:127,132`、
`app/travel/TravelMobileClient.tsx:187,188`、`components/album/TravelTimeline.tsx:27`（`rounded-[2px]`）。

### 1.3 硬编码渐变与 rgba（规范 §2.6 直接禁止）

| 位置 | 值 | 备注 |
|---|---|---|
| `app/travel/TravelMobileClient.tsx:138` | `linear-gradient(165deg,#FFF8EF,#EAF2F4)` | **裸 hex，且 `#EAF2F4` 是冷蓝**，与暖陶土冲突 |
| `app/travel/TravelMobileClient.tsx:205` | `rgba(26,16,9,0.62)` | 裸 rgba 遮罩 |
| `components/HomeMobile.tsx:381` | `rgba(24,15,9,0.72)` | 同款遮罩，**值还不一样** |
| `components/HomeMobile.tsx:384,389` | `!bg-white/18`、`text-white/72` | 裸白透明度 |
| `app/mobile.css:554` | `rgba(42, 30, 22, 0.92)` | `m-toast` 背景 |

### 1.4 Toast 用的是 **iOS 冷色系统色**，且全项目有 **5 种"危险红"**

```css
/* app/mobile.css:560-562 —— 冷色系统色混进暖陶土体系 */
.m-toast[data-kind='success'] svg { color: #34C759; }
.m-toast[data-kind='error']   svg { color: #FF453A; }
.m-toast[data-kind='info']    svg { color: #64D2FF; }
```
```css
/* app/mobile.css:540-542 */
.m-action-item.is-danger { color: #E5484D; }
```

| # | 变量/值 | 出处 |
|---|---|---|
| 1 | `--m-danger` `#C0453F` | `mobile.css:48` |
| 2 | `--danger-soft` `#E06C6C` | `globals.css:150,172` |
| 3 | `travel-danger` `#ef4444` | `tailwind.config.js:132` |
| 4 | `--album-error` `#E06C6C` | `globals.css:106` |
| 5 | `#E5484D` | `mobile.css:541`（未 token 化） |

规范 §2.5 已自曝"有 3 种危险红"，实测是 **5 种**。

### 1.5 栅格不统一（规范 §4.1 规定统一 20px）

同一屏内混用三种横向内边距：

| 文件 | `m-gutter`(20) | `px-4`(16) | `px-5`(20) |
|---|---|---|---|
| `app/travel/TravelMobileClient.tsx` | `:120` | `:136`、`:160` | `:232` |
| `components/HomeMobile.tsx` | `:264` | `:145`、`:337` | `:457` |

### 1.6 非标字阶（checker 实测 67 个文件）

`TravelMobileClient.tsx:212` `text-[22px]` · `Switch.tsx:47` `text-[15px]`、`:50` `text-[12px]` ·
`Toast.tsx:34` `text-[13px]` · `HomeClient.tsx:368` `text-[9px]`

### 1.7 底部 Tab 无法承载角标

`components/layout/MobileBottomNav.tsx:95-99`：激活态只有"图标+文字变色"，没有指示器、没有角标位，
未读通知数无处表达（`/me` 的通知、旅行圈的未读）。

### 1.8 基线数字（checker 实测，报告模式不失败）

```
扫描 327 个文件
硬编码 hex          81 文件
硬编码 rgba         53 文件
裸 import lucide    96 文件
非标字号            67 文件
非标圆角             9 文件
待处理合计         308 文件
```

### 1.9 ⚠️ 顺带发现的真实缺陷（不是审美问题，是 bug）

逐屏审计（详见 `docs/design/_audit-mobile-screens.md`）暴露了 6 个**功能性缺陷**，本轮一并修掉。

> 📌 **这 6 项是 bug，不是审美选择** —— 建议**无论本方案是否采纳都单独修掉**（可拆成独立 PR）。
> 其中 D1（变量未定义导致阴影/文字色失效）与 D3（移动端可能无法返回）影响真实可用性，优先级高于任何视觉改造。

| # | 缺陷 | 证据 | 影响 |
|---|---|---|---|
| **D1** | **两个 CSS 变量全仓未定义，却被 7 个文件引用**：`var(--m-shadow-lg)`、`var(--m-on-accent)` | `TravelComposerForm:409`、`TravelTimeline:54,96`、`TravelInfoEditor:111,250`、`MemoryComposer:122,251`、`ItineraryEditor:85,172`、`DateRangePicker:118,176,200`、`AppUpdatePrompt:50,75` | `shadow-[var(--m-shadow-lg)]` **解析为空 → 无阴影**；`text-[var(--m-on-accent)]` **解析为空 → 文字继承父色**，在强调色底上可能不可见 |
| **D2** | **`/dashboard` 完全没有移动分支** —— 单棵桌面树 | `DashboardClient.tsx`（190 行）：`bg-gradient-to-b from-travel-cream via-travel-parchment` + `container-custom` + `ChinaMap h-[340px] sm:h-[440px] lg:h-[520px]`，无 `md:` 分支、无 LargeTitle、无返回键 | 数据看板在手机上就是**桌面版缩小**，且**无法返回** |
| **D3** | **旅行详情页移动端可能"出不去"** | `app/travel/[slug]/`：`LayoutContent` 对 `/travel*` 不渲染 Navbar；`TravelDetailShell` 无 LargeTitle/返回；**只有含媒体时** `TravelDetailClient` 的「返回旅行记录」才出现 | 纯文字游记在移动端**没有任何返回入口** |
| **D4** | `/search` 同页两棵 DOM **共用同一个 `inputRef`** | `app/search/page.tsx:159`（桌面）与 `:286`（移动） | 焦点/清空行为在断点切换后错乱 |
| **D5** | `/moments` 移动端**有两个"管理"入口** | `app/moments/page.tsx:28` 的 `ManageEntry` **漏了 `md:` 限制**，`:52` LargeTitle trailing 又是「管理」 | 同一功能重复暴露，视觉冗余 |
| **D6** | `/me/notifications` 是**唯一不用设计系统的二级页** | `NotificationsList.tsx`：手写 header + 头像行，不用 `LargeTitle` / `ListSection` / `EmptyState` / `Skeleton` | 与其余二级页观感割裂；也没有 iOS 大标题 |

另有 2 处**硬编码渐变**（UI-V3 文档曾专门要求清零的"粉/紫残留"，实际仍在）：

| 位置 | 值 |
|---|---|
| `components/moments/MomentsContent.tsx:43-49` | FAB 内联 **3 段硬编码 hex 渐变** `#C67A4E → #A85F3A → #8A4A2B` |
| `app/travel/[slug]/record/TravelRecordPage.tsx` | `bg-gradient-to-r from-travel-bloom to-[#D4A5B0]`（硬编码粉） |

### 1.10 改造工作量分布（`arb` = 任意值类计数，审计实测）

移动端"最脏"排序，决定 P1/P2 的优先级：

| 文件 | `arb` | 说明 |
|---|---|---|
| `components/travel/TravelComposerForm.tsx` | **121** | 全仓移动端最高；4 处重复手写输入框类串；命中 D1 |
| `components/me/MeHome.tsx` | 52 | `:371/:399/:485/:526` 重复手写 `rounded-[1.4rem]` + ring 算式 |
| `components/social/TravelCircleFeed.tsx` | 50 | 双层 `radial` 氛围 + `[mask-image:linear-gradient(...)]` |
| `components/HomeMobile.tsx` | 48 | 见 §1.1 / §1.3 |
| `app/travel/TravelMobileClient.tsx` | 31 | 见 §1.2 / §1.3 |
| `app/login/page.tsx` | 24 | 见 §1.1b |
| `app/search/page.tsx` | 20 | 见 D4 |

---

## 2. 移植清单：Uiverse 分类 → 本项目落点

预览入口（分类浏览，可直接点开看效果）：
[Buttons](https://uiverse.io/buttons) · [Cards](https://uiverse.io/cards) · [Inputs](https://uiverse.io/inputs) ·
[Forms](https://uiverse.io/forms) · [Checkboxes](https://uiverse.io/checkboxes) ·
[Radio-buttons](https://uiverse.io/radio-buttons) · [Toggle-switches](https://uiverse.io/toggle-switches) ·
[Notifications](https://uiverse.io/notifications) · [loaders](https://uiverse.io/loaders) ·
[Patterns](https://uiverse.io/patterns) · [Tooltips](https://uiverse.io/tooltips)

| # | Uiverse 分类 | **取什么**（只取这一条） | 本项目落点 | 类型 |
|---|---|---|---|---|
| 1 | Buttons | 顶部 1px 内高光 + 底部内阴影形成的"实体压印感"，按压回落 0.97 | 新增 `components/mobile/Button.tsx` → `m-btn` × `primary/secondary/ghost/danger`，尺寸 `h-11/h-13`，含 `loading` | **新增** |
| 2 | Inputs / Forms | 浮动 label + 聚焦描边扩散为 3px 光晕 + 错误态文字下移 | 新增 `components/mobile/Field.tsx`（`Field`/`FieldTextarea`/`FieldSelect`） | **新增** |
| 3 | Toggle-switches | 轨道内阴影 + 滑块到位轻微过冲（jelly，非无限动画） | 升级 `components/mobile/Switch.tsx`（**API 不变**，新增 `bare` 供 `ListRow` 内联） | 升级 |
| 4 | Radio-buttons | radio-card：整块可选 + 选中边线加粗 + 勾标入场 | 新增 `components/mobile/ChoiceCard.tsx`（旅行关系 / 同步策略 / 相册模式） | **新增** |
| 5 | Checkboxes | 勾线路径绘制动画（`stroke-dashoffset`，一次性） | 新增 `components/mobile/Checkbox.tsx`（选照片 / 行程项完成 / 打包清单） | **新增** |
| 6 | Cards | 抬升分级 + 顶部高光边 + 按压内缩 | `m-card` 扩为 `m-card-flat` / `m-card` / `m-card-raised`；清掉 §1.2 §1.3 | 升级 |
| 7 | Notifications | 底部进度条 + 下滑关闭 + 图标入场 | 升级 `components/mobile/Toast.tsx`（`progress` / `action` / `dismissible`） | 升级 |
| 8 | loaders | 三点脉冲 / 轨道环 / 波纹（三选一按场景，**唯一允许的循环动画**） | 新增 `components/mobile/Loader.tsx` → `dots` / `ring` / `ripple` | **新增** |
| 9 | Patterns | 点阵 / 细网格 / 纸纹（纯 CSS，非图片） | `m-pattern-dot` / `m-pattern-grid` / `m-pattern-paper`（空态、Hero 底、登录页） | **新增** |
| 10 | Tooltips | — | **不采用**（移动端无 hover） | — |
| 11 | —（Uiverse 无对应） | 底部 Tab 滑动胶囊 + 角标 dot | 升级 `components/layout/MobileBottomNav.tsx` | 升级 |

**候选筛选方式（落地第一步，不在本方案内定稿）**：我会按上表 9 个类别，各从 Uiverse 拉 **3 个候选**，
在**本项目 token 下** 1:1 复刻到 `/dev/ui` 预览台新增的 v4 区块，你在真机/浏览器上看过 → 选定 → 落地。
这一步不改动任何线上组件。

---

## 3. Token 扩充（**纯增量，不改既有值**）

追加到 `app/mobile.css` 的 `:root` 与 `html.dark`：

```css
/* ── 抬升分级：替代散落的 shadow-[...] 与 !important 覆盖 ── */
--m-elev-1: 0 1px 1px rgba(61,43,32,.04), 0 6px 16px -12px rgba(61,43,32,.16);
--m-elev-2: 0 8px 32px -12px rgba(61,43,32,.28);
--m-elev-3: 0 18px 48px -16px rgba(61,43,32,.34);
--m-inset-hi: inset 0 1px 0 rgba(255,255,255,.55);   /* 顶部高光（按钮"实体感"来源） */
--m-inset-lo: inset 0 -1px 0 rgba(61,43,32,.06);

/* ── 焦点环（a11y：焦点可见统一表达） ── */
--m-ring: 0 0 0 3px var(--m-accent-soft);
--m-ring-danger: 0 0 0 3px rgba(192,69,63,.18);

/* ── 动效（规范 §7 的 token 化，时长/缓动不再各写各的） ── */
--m-dur-press: 120ms;
--m-dur-enter: 320ms;
--m-dur-page: 240ms;
--m-ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1);

/* ── 受控渐变：全项目只允许这 3 条，且组件内不得再写 linear-gradient() ── */
--m-grad-hero: linear-gradient(165deg, var(--m-bg-soft), var(--m-surface-2));
--m-grad-scrim: linear-gradient(to top, rgba(24,15,9,.68), rgba(24,15,9,0) 62%);
--m-grad-cta: linear-gradient(180deg, var(--m-accent), var(--m-accent-strong));

/* ── 纹理（纯 CSS 图案，0 图片请求） ── */
--m-pattern-dot: radial-gradient(circle at 1px 1px, var(--m-line-strong) 1px, transparent 0);
--m-pattern-grid: linear-gradient(var(--m-line) 1px, transparent 1px),
                  linear-gradient(90deg, var(--m-line) 1px, transparent 1px);
```

**规范需同步修订两处**（否则新组件天生违规）：
1. §2.6「禁止新增渐变」→ 改为「禁止组件内写 `linear-gradient()`；仅允许使用 `--m-grad-hero/scrim/cta` 三个 token」。
2. §6.1 组件清单补入新增的 5 个组件与 `m-elev-*` / `m-ring` / `--m-dur-*`。

**checker 同步增强**（`scripts/check-design-tokens.mjs`）：
- 新增规则：组件内出现 `linear-gradient(` / `radial-gradient(` → 违规（`mobile.css` / `globals.css` 白名单）
- 新增规则：出现 `#34C759|#FF453A|#64D2FF|#E5484D` → 违规（iOS 冷色 / 第 5 种红）
- 新增规则：`!h-` / `!px-` 在 `components/` 中出现 → 违规（`!important` 覆盖是"按钮缺失"的症状）
- 保持报告模式；`--strict` 留给 CI

---

## 4. 分阶段执行计划

> **P0 先修 D1–D6**（§1.9 的功能缺陷），再做视觉。理由：D1 的失效变量会让新按钮也一起失效，必须先清掉地基里的坏变量。

### P0 · 地基 + 缺陷修复（预计 1.5 天 · 风险低）

| 项 | 文件 |
|---|---|
| ⚠️ **D1** 补/删未定义变量（`--m-shadow-lg`、`--m-on-accent`） | `app/mobile.css` + 7 个引用文件 |
| Token 扩充 + 规范修订 + checker 增强 | `app/mobile.css`、`docs/design/移动端设计规范.md`、`scripts/check-design-tokens.mjs` |
| 新增 `Button` | `components/mobile/Button.tsx`（新） |
| 新增 `Field` | `components/mobile/Field.tsx`（新） |
| 新增 `Loader` | `components/mobile/Loader.tsx`（新） |
| `Switch` 视觉升级（API 不变） | `components/mobile/Switch.tsx` |
| 接入 **5 处**内联 CTA（含登录页） | `components/HomeMobile.tsx`、`app/travel/TravelMobileClient.tsx`、`app/dev/ui/UiPreview.tsx`、`app/login/page.tsx` |
| 登录 / 找回密码接入 `Field`（清 3 套输入框） | `app/login/page.tsx`、`app/forgot-password/page.tsx` |

验收：5 处 CTA 全部改为 `<Button>`；`!h-11` / `!px-5` / `!rounded-2xl` 覆盖清零；
`grep -rn "var(--m-shadow-lg)\|var(--m-on-accent)" app components` = 0；登录页输入框有 label 与焦点环。

### P1 · 导航兜底 + 卡片列表（预计 1 天）

| 项 | 文件 |
|---|---|
| ⚠️ **D3** 旅行详情移动端补返回入口 | `app/travel/[slug]/TravelDetailShell.tsx` |
| ⚠️ **D5** 清 `/moments` 重复管理入口 | `app/moments/page.tsx:28` |
| ⚠️ **D6** `/me/notifications` 接入设计系统 | `components/me/NotificationsList.tsx` |
| ⚠️ **D4** `/search` 双树共用一个 `inputRef` | `app/search/page.tsx:159,286` |
| 卡分级 `m-card-flat/-card/-card-raised`；清 §1.2 魔术圆角 | `TravelMobileClient`、`MomentComposer`、`MomentTimeline`、`TravelCircleFeed`、`app/timeline` |
| 清裸 hex / rgba 渐变 → `--m-grad-hero/scrim` | `TravelMobileClient:138,205`、`HomeMobile:381,384,389`、`MeHome` |
| 栅格统一 `m-gutter`（§1.5 全部 6 处） | `TravelMobileClient`、`HomeMobile` |
| `ListRow` 升级：行高 64 不变，补 `trailing` 槽与按压内缩 | `components/mobile/ListRow.tsx` |
| `MobileBottomNav` 加滑动胶囊 + 角标 dot | `components/layout/MobileBottomNav.tsx` |

验收：`grep -rn "rounded-\[2[0-9]px\]" app components` = 0；`#FFF8EF|#EAF2F4` = 0；旅行详情纯文字页可返回。

### P2 · 表单与选择（预计 1.5 天 · 收益最大）

| 项 | 文件 |
|---|---|
| 新增 `Checkbox`（相册多选、行程项完成） | `components/mobile/Checkbox.tsx`（新） |
| 新增 `ChoiceCard`（旅行关系 / 同步策略 / 相册模式） | `components/mobile/ChoiceCard.tsx`（新） |
| `SegmentedControl` 补图标 + `m-seg-thumb` 改 `--m-elev-1` | `components/mobile/SegmentedControl.tsx` |
| ⭐ **`TravelComposerForm` 重构**（`arb`=121，全仓最脏；4 套重复输入框 → `Field`） | `components/travel/TravelComposerForm.tsx` |
| 清硬编码粉渐变 | `app/travel/[slug]/record/TravelRecordPage.tsx` |
| 接入 `app/travel/new`、`app/travel/record`、`app/me/settings`、`app/sync` | — |

验收：`TravelComposerForm` 的 `arb` 计数 121 → ≤ 25；所有表单控件触达 ≥44px 且有 `--m-ring` 焦点环。

### P3 · 反馈与加载（预计 1 天）

| 项 | 文件 |
|---|---|
| ⚠️ **D2** `/dashboard` 补移动布局（现为纯桌面树） | `components/dashboard/DashboardClient.tsx` |
| `Toast` 2.0：`progress` / `action` / 下滑关闭；色板改 `--m-*` | `components/mobile/Toast.tsx`、`app/mobile.css:547-562` |
| **5 种危险红归一为 1 种**（`--m-danger`） | `mobile.css:48,541`、`globals.css:106,150,172`、`tailwind.config.js:132` |
| 清 `MomentsContent` FAB 的 3 段硬编码 hex 渐变 | `components/moments/MomentsContent.tsx:43-49` |
| 上传 / 同步进度接入 `Loader` + 进度条 | `app/sync`、上传相关组件 |
| `Skeleton` 调优（形状对齐真实布局） | `components/mobile/Skeleton.tsx` |

验收：`grep -rn "#34C759\|#FF453A\|#64D2FF\|#E5484D\|#E06C6C\|#ef4444" app components` = 0；看板页有移动布局与返回键。

### P4 · 质感（预计 0.5 天）

- `m-pattern-*` 应用到空态 / Hero 底 / 登录页
- `EmptyState` 支持纹理底 + 插画位
- 触觉补齐（`hapticLight` / `hapticSuccess`）
- 微交互：Tab 胶囊、勾选绘制、点赞弹簧（≤200ms）
- `/dev/ui` 预览台补 v4 区块（新增组件 + 全状态 + 双主题）

---

## 5. 验收协议（每阶段都跑）

| # | 项 | 命令 / 方法 | 达标线 |
|---|---|---|---|
| 0 | 预览台冒烟（真浏览器） | `node scripts/m5-preview-verify.mjs` | 均 200、渲染出内容、**无 pageerror / 无开发错误浮层** |
| 1 | 设计规范一致性 | `node scripts/check-design-tokens.mjs` | 触碰文件 **0 新增违规**；原有 7 条规则数须**下降**（308 → 目标 ≤ 250） |
| 2 | 类型 | `npm run typecheck` | 0 错误 |
| 3 | 单测 | `npx vitest run` | 全绿（当前 36 文件 / 375 用例） |
| 4 | 构建 | `npm run build` | 通过，无 LCP 关键 chunk 增大 |
| 5 | 截图回归 | `node scripts/m5-preview-shots.mjs` → 扩展为 `stage0-screenshots.mjs` 的 dark + 360 档 | before/after 存 `docs/design/screenshots/`，逐张比对 |
| 6 | e2e | `npx playwright test tests/e2e/interact.spec.ts tests/e2e/geometry.spec.ts tests/e2e/browse.spec.ts tests/e2e/me-archive.spec.ts` | 全绿 |
| 7 | 对比度 | 每个新前景/背景对 | 正文 ≥4.5:1，大字 ≥3:1（明暗各算） |
| 8 | 桌面零回归 | >768px 截图对比 | 视觉零变化 |
| 9 | 真机 | `node scripts/build-mobile.cjs` → assemble → 装 360/390/412 三档 | 无横向溢出、无遮挡、44px 达标 |

> ⚠️ **`next dev` 与 `next build` 不能同时跑** —— 二者共用 `.next` 目录，dev server 运行期间
> 执行 `next build` 会冲掉 dev 的 React Client Manifest，页面白屏并弹出
> `TypeError: Cannot read properties of undefined (reading 'call')`。
> **这种故障 curl 看不出问题**（SSR HTML 仍是好的），必须用真浏览器才能发现 —— 这正是
> `scripts/m5-preview-verify.mjs` 存在的理由。
>
> 正确顺序：**停 dev → `next build` → 重启 dev**；若已踩坑：停 dev → 删除 `.next` → 重启 dev。

> ⚠️ 移动端是 **Capacitor 本地壳**（`capacitor.config.ts`：`webDir: 'www'`，静态导出，API 指向 `https://travel-notes.yuanabd.cn`）。
> 因此**改完必须重新静态导出 + 重装 APK** 才能看到效果；开发期用浏览器 390×844 视口预览。

---

## 6. 边界：明确不动的部分

| 范围 | 处置 | 理由 |
|---|---|---|
| 相册三模式（`--album-*`）、像素主题（`pixel-*`）、后台 admin | **不动** | checker 已豁免；自有沉浸视觉是有意设计（UI-V3 §2.3） |
| 4 套 token 体系合并 | **不动** | 属 UI-V3 P1/P2 另案，与本方案正交 |
| 业务逻辑 / 接口 / 数据结构 | **不动** | 纯视觉层 |
| npm 依赖 | **不新增** | 纯 CSS + 现有 `lucide-react`，APK 体积不增 |
| 旅行圈 / 档案页的暗色 `--social-*` | 只在**新组件被复用时**按规范 §5.3 跨主题边界处理，不主动迁移 |

---

## 7. 需要你确认的 7 个问题

| # | 问题 | 选项 | 我的建议 |
|---|---|---|---|
| 1 | **改造深度** | A 只换手感（按钮/输入/开关/勾选/加载/反馈/卡片质感）<br>B 连版式一起重排（首屏结构会变）<br>C 换设计语言（推翻暖陶土，风险最高） | **A** — 收益 80%、风险最小、可回滚 |
| 2 | 是否允许**受控渐变**（3 个 token） | 允许 / 保持禁止 | **允许** — 否则按钮"实体感"与图片遮罩只能继续裸写 hex |
| 3 | 是否允许**循环动画仅限 loading** | 是 / 否 | **是** — 规范 §7 本已豁免 loading，确认即可 |
| 4 | **深色模式**是否同步 | 同步 / 仅浅色 | **同步** — 组件全走 CSS 变量，几乎零成本 |
| 5 | 是否先做 **`/dev/ui` v4 预览台**（不动线上组件，你先看再定） | 先预览 / 直接改 | **先预览** — 你能在真机上挑，避免改完返工 |
| 6 | 相册 / 像素 / admin 是否保持不动 | 不动 / 一并改 | **不动** |
| 7 | **§1.9 的 6 个缺陷（D1–D6）**是否本轮一起修 | 一起修 / 先单独立 PR / 暂不修 | **先单独修 D1+D3**（影响可用性），其余随 P1–P3 带过 |

---

## 8. 确认后我的执行顺序

1. **（若你同意）先修 D1 + D3** 两个影响可用性的缺陷，单独提交，便于 review
2. `docs/design/uiverse-picks.md`：按 §2 的 9 个槽位，各拉 3 个 Uiverse 候选 + 直链（供你复核）
3. P0 token 扩充 + 规范修订 + `Button`/`Field`/`Loader` + `/dev/ui` v4 预览台 → **截图给你看**
4. 你点头后依次 P1 → P4，每阶段跑 §5 全量验收并给你 before/after 截图
5. 最后 `build-mobile.cjs` 出包，真机 360/390/412 三档实测

> 全程**不新增 npm 依赖**、**不改业务逻辑**、**不动相册/像素/admin**；每阶段可独立回滚。

---

## 附录：Uiverse 来源与署名

- 来源站点：[uiverse.io](https://uiverse.io/) · 镜像仓：[uiverse-io/galaxy](https://github.com/uiverse-io/galaxy)
- 许可：**MIT**（已核对 `LICENSE` 原文），允许商用、修改、分发，**不强制署名**
- 官方表述："while not mandatory, we deeply value and appreciate attribution"
- 本方案**不复制 Uiverse 源码**，仅提取交互模式后用本项目 token 重写，因此无署名义务；
  但会在 `docs/design/uiverse-picks.md` 中记录**每个模式的原始作者与链接**，作为致谢（低成本、符合开源礼仪）
