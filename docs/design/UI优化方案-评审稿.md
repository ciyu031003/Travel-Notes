# 行迹 · Travel-Notes UI 优化方案（Web 端 + 移动端）

> 版本：v1.1 ｜ 日期：2026-10-12 ｜ 状态：**评审稿，未改动任何代码**
> 基线：`package.json` v1.22.0 ｜ 扫描范围 `app/` `components/` `lib/` `hooks/` `docs/design/`（374 个 UI 源文件）
> 数据来源：`scripts/check-design-tokens.mjs` 实跑输出、PowerShell 全量统计、双线并行代码审计（Web / 移动端）逐文件抽读
> **所有结论均已二次独立验证**，关键条目附可复现命令。

---

## 0. 结论先行

这个项目的 UI 工程化水平**明显高于同类个人项目**：存在唯一事实源设计规范（`docs/design/移动端设计规范.md`）、
CI 基线回归门禁（`npm run tokens:check`）、axe 无障碍用例、Lighthouse 体积预算，以及一份 32 万字逐日改动记录。

因此本方案**不建议推倒重来**，而是围绕五个真实存在的结构性缺口做收敛：

| # | 核心缺口 | 一句话描述 | 影响面 | 严重度 |
|---|---|---|---|---|
| **0** | **桌面首页首屏塞进 582KB GeoJSON** | `HomeClient.tsx:23` **静态** import 地图 → `lib/geo.ts` → `china-geo.json`（实测 582,522 字节）+ d3-geo，全部进桌面首屏；而**移动端 `HomeMobile.tsx:43` 早已用 `dynamic(ssr:false)` 做对** | Web LCP 最大单点 | 🔴 **P0 最高** |
| **A** | **6 套并行 token 体系** | `--m-*`(131) / `--social-*`(34) / `--album-*`(30) / `--space-*`(24) / `--semantic-*`(13) / `pixel`(15)，同屏可混用；规范 §5.3 已承认「迁移图标时传 tone 会静默变色」 | 全站视觉一致性 | 🔴 P0 |
| **B** | **双树 + 无 SSR 的首屏** | 桌面/移动两棵组件树用 `useIsMobile()` 在客户端二选一 + `ssr:false`，首屏必然经历「转圈 → 整屏跳变」 | Web LCP、CLS | 🟠 P1 |
| **C** | **移动端「原生感」的最后 20%** | iOS 输入聚焦缩放、键盘遮挡、非标字号 236 处、触达 <44px 等 | 移动端体验上限 | 🔴 P0/P1 |
| **D** | **可访问性只有 3 个匿名页面** | `sr-only` 全站仅 **1** 处、`aria-live` **4** 处、`outline-none` **96** 处 vs `focus-visible` **7** 处 | WCAG 合规 | 🟠 P1 |
| **E** | **Admin 后台在豁免名单里** | checker 整体豁免，`AdminShell.tsx:132` 手写 `h-[18px]` 魔术尺寸 | 长期债务 | 🟡 P2 |

**建议排期**：P0（1–2 周，多数为零风险收敛）→ P1（2–3 周，结构性）→ P2（按需）。

### 0.1 如果只看三件事

1. **把桌面首页的地图改成 `dynamic(ssr:false)`** —— 照抄 `HomeMobile.tsx:43` 的现成写法，**改动 < 5 行**，
   直接砍掉首屏最大的一笔体积（582KB JSON + d3-geo）。投入产出比全项目最高。
2. **把 `outline-none` 改成 `focus-visible`** —— 96 处 vs 7 处，键盘用户当前基本"摸黑"。
3. **修 iOS 输入聚焦缩放** —— 所有 `<input>` 字号 < 16px 会触发 iOS 自动放大页面，
   这是用户最容易感知的"网页感"来源。

---

## 1. 现状盘点（有据可查）

### 1.1 架构分层

```
Next.js 15 App Router
├── 页面层    app/*（Server / Client Components 混用，195 个 'use client'）
├── 协议层    app/api/* + middleware.ts
├── 业务层    lib/modules/*（travel / space / memory / social / album / offline ...）
├── 服务层    lib/services · lib/repositories
├── 基础设施  lib/infrastructure（cache / storage / rate-limit / media-validation）
├── 数据层    Prisma + MySQL（自定义 mysql2 适配器 lib/prisma-adapter.ts）
└── 移动端    Capacitor Android 静态导出壳（scripts/build-mobile.cjs → www/）
```

分层本身**干净、职责清晰**，UI 问题不来自架构分层，而来自**跨层的设计系统分裂**。

### 1.2 设计系统现状

| 维度 | 现状 | 评价 |
|---|---|---|
| 设计规范 | `移动端设计规范.md` 单一事实源，§1–§10 完整 | ⭐ 优秀 |
| Token 治理 | `check-design-tokens.mjs` 11 条规则 + 基线门禁 | ⭐ 优秀 |
| 移动组件库 | `components/mobile/` 30+ 组件，Icon / Button / Field / ListRow 齐全 | ⭐ 优秀 |
| 主题支持 | 亮/暗 + 空间五主题（受控多主题） | 良好 |
| 色板数量 | **4 套并行**（见 1.3） | ⚠️ 待收敛 |
| 断点策略 | sm 117 / md 250 / lg 49 / xl 8 —— 重 md、轻 lg | ⚠️ 平板断层 |

### 1.3 四套 token 体系（缺口 A 的证据）

规范 §5.3 自陈的四套体系，实测确认：

| 体系 | 强调色（亮色） | 作用域 | 定义位置 |
|---|---|---|---|
| `--m-*` | `#C67A4E` | `components/mobile/` + 移动页面 | `app/mobile.css` |
| `--album-*` | `#e8b06a` | 相册三模式 | `app/globals.css:92-106` |
| `--social-*` | `#A85F3A` | 旅行圈 / 我的 | `app/globals.css:130-146` |
| `pixel-*` | `--album-pixel-*` | 像素模式 | `app/globals.css:109-123` |

**更关键的是第 5、6 套已经在暗处生长**：
- `pixel: {...}` 在 `tailwind.config.js:65-81` **重复声明了一份**（与 `--album-pixel-*` 同值双写）；
- `shell: {...}`（`tailwind.config.js:116-125`）是第 5 套冷灰蓝，与 `semantic.*` 语义层**功能重叠**；
- `travel.*`（`tailwind.config.js:45-63`）19 个色值，与 `primary.*` 数字阶（`40-43`）**同色系双命名** ——
  `travel.accent #A85F3A` 与 `primary.500 #A85F3A` 完全相同。

> 这是**同一份色值的 3–4 种写法**，是后续任何视觉调整的最大阻力：改一处不会全站生效。

### 1.4 硬数据（本次实跑统计）

**设计 token 门禁输出（`node scripts/check-design-tokens.mjs`）**：

```
待处理合计: 439 处（原有 7 条规则 335 + M5/P1 新增 104）
⚠️ 硬编码 hex        77 文件      ⚠️ 非标字号        100 文件
⚠️ 硬编码 rgba()     57 文件      ⚠️ 组件内写渐变     85 文件
⚠️ 直接 import lucide 90 文件     ⚠️ !important 覆盖  19 文件
✅ 图标尺寸自由取值   0 文件      ✅ 未定义 CSS 变量    0 文件
✅ 空间令牌泄漏       0 文件      ✅ 散落冷色/危险红    0 文件
```

**独立统计（PowerShell 全量扫描）**：

| 指标 | 数量 | 解读 |
|---|---|---|
| 硬编码 hex（组件） | 648 处 / 60 文件 | 主题豁免外仍有 77 文件待收敛 |
| 内联字号 `text-[Npx]` | 306 处 / 50 文件 | 规范字阶仅 7 档，实际 50 个文件在自造字阶 |
| 直接 import lucide-react | 117 处 / 114 文件 | 仅 106 处走了新 `Icon` 入口 |
| `transition-all` | 104 处 / 45 文件 | 规范 §7 要求「只做 opacity + transform」 |
| `animate-spin` | 60 处 / 38 文件 | 规范 §7 只允许 `Loader` 作为唯一无限动画 |
| `animate-pulse` | 18 处 / 4 文件 | 同上（骨架例外，但应统一走 `Skeleton`） |
| 自由尺寸 `h-9 w-9` | 29 处 / 20 文件 | 规范 §6.2 要求走 `IconButton` |
| `min-h-screen` | 43 处（移动页面 11 处） | **仅 1 处用了 `dvh`** → 移动端地址栏遮挡 |
| `!important` | 35 处 / 7 文件 | 规范 §2.6 第 10 条明令禁止 |
| 双树标记 | `hidden md:block` 26 处 + `md:hidden` 35 处 | 9 个文件同时含两者（真双树） |
| `dark:` 变体 | 1362 处 | 覆盖面尚可，但 28 个页面文件零 `dark:` |
| `backdrop-blur` | 50 个文件 | 移动端 GPU 合成压力来源 |
| `next/image` vs 裸 `<img>` | 43 vs 21 | 21 处裸 img 无优化、无尺寸 |
| `prefers-reduced-motion` | 4 处（2 个 CSS 文件） | ✅ 全量降级已做 |

### 1.5 双线审计新增的关键证据（已二次验证）

下列条目由 Web / 移动端两条独立审计线产出，Lead 已逐条复核：

| # | 发现 | 证据（已复核） | 严重度 |
|---|---|---|---|
| V1 | **桌面首页静态引入 582KB 地图数据** | `HomeClient.tsx:23` 静态 import；`lib/geo.ts:1-2` 静态 import `d3-geo` + `@/data/china-geo.json`；实测文件 **582,522 字节**。对照 `HomeMobile.tsx:43` 已用 `dynamicImport(..., {ssr:false})` | 🔴 P0 |
| V2 | **`semantic.*` 语义层被架空** | `tailwind.config.js:18-36` 注释写「新页面/新组件一律用 semantic.*」；实测语义类引用 **app/ 下 0 处**，仅 `components/ui/` 7 个文件 43 处。规范承诺与代码现实脱节 | 🔴 P0 |
| V3 | **`outline-none` 96 处 vs `focus-visible` 7 处** | 全量 grep：`outline-none`=96、`focus-visible`=7；多数改用 `focus:ring`，而 `focus:` 对鼠标点击同样触发 → 键盘/鼠标不可区分 | 🔴 P0 |
| V4 | **`tailwind.config.js` 未定义 `screens`** | 全文无 `screens` 键 → 全部走 Tailwind 默认断点，无项目自定义档；配合 lg 仅 49 / xl 仅 8 的用量，1024–1280 区间实事上没有专属布局 | 🟠 P1 |
| V5 | **容器宽度三套并行，导航与内容不对齐** | `globals.css:342-344` `container-custom` = `max-w-6xl`(1152)；`HomeClient.tsx:224,415,484,563,601,630` 六处 `max-w-7xl`(1280)；Navbar/Footer 用前者 → **首页比导航宽 128px** | 🟠 P1 |
| V6 | **`--album-*` 是死代码** | `globals.css:92-123` 定义 30 个变量，但组件里 `var(--album-*)` 仅 **1** 处引用；同一批色值又在 `tailwind.config.js:83-99` 复制一份 → 双写 | 🟠 P1 |
| V7 | **首页加载态用 spinner 而非骨架** | `app/page.tsx:11-19` 两个 dynamic 的 `loading` 都回退 `AsyncState variant="loading"`（Loader2 转圈）；而 Skeleton 体系早已就绪（`components/mobile/Skeleton.tsx`），timeline 已正确使用 | 🟠 P1 |
| V8 | **iOS 输入聚焦缩放** | `<input>`/`<textarea>` 字号 < 16px 会触发 iOS 自动放大整页；`.m-field-input`（`mobile.css:1163`）为 **15px**，`CommentPanel.tsx:140`、`PostDetail.tsx:375` 等用 `text-sm`(14px)。实测输入类标签 116 个中仅 2 个显式小字号，但**绝大多数未声明字号** → 继承到 <16px | 🔴 P0(移动) |
| V9 | **虚拟键盘遮挡底输入条** | 全项目 `visualViewport` **0 处**（grep 确认）；`CommentPanel.tsx:128-140` 固定底输入条无键盘避让。2.0 设计文档 §H.3 曾明确要求用 visualViewport 跟随 | 🔴 P0(移动) |
| V10 | **唯一非 loading 的无限动画** | `mobile.css:591-593` `.m-soft-pulse` = `animation: m-soft-pulse 3s ... infinite`；规范 §1 第 3 条「除 loading 外禁止无限循环动画」。另 `mobile.css:1393` 的 reduce-motion 列表**已含** `.m-soft-pulse`，但遗漏 `.m-tab-active-dot`(:547) 与 `.m-toast-bar`(:891) | 🟠 P1 |
| V11 | **`SyncBadge` 是死组件** | 全项目仅自身定义处 1 处命中，**0 处引用**；且其 `✓ ↑ ☁ !` 字符图标 + 4 个裸 hex（`sync-symbols.ts:14-17`）违反规范 §1 第 7 条 | 🟠 P1 |
| V12 | **首页同屏堆叠 4 种「文艺手法」** | `HomeClient.tsx`：blur 光斑(:319-320) + 手绘 SVG 下划线(:328-341) + `-6deg` 虚线印章(:401-408) + `±0.6deg` 随机倾斜(:248) → 模板味的主要来源 | 🟡 P2 |

> **说明**：V8 的实测口径为「116 个 input/textarea 标签中，显式声明 <16px 的仅 2 个，
> 其余 114 个未声明字号」。未声明不等于安全——它会继承父级/组件默认值，
> 而 `.m-field-input` 默认即 15px。**修法是给输入控件统一显式 16px，而非只改那 2 处。**

---

## 2. 缺口 A · 四套 token 合并为「两层一套」

### 2.1 问题本质

当前不是「缺 token」，而是**token 有 4–6 份同义副本**，导致：
1. 跨模块迁移组件时静默变色（规范 §5.3 亲口承认的头号陷阱）；
2. 改一次品牌色需要在 4 套体系里找勾；
3. checker 的 `spaceTokenLeak` 等规则只能「事后拦截」，不能「事先归一」。

### 2.2 目标结构：语义层 + 主题层

```
第 1 层  原始调色板（Primitive）   --palette-terracotta-500 等，只有值，无用途语义
第 2 层  语义 token（Semantic）     --ui-accent / --ui-surface / --ui-text ...
第 3 层  主题皮肤（Theme Skin）     在语义 token 上做「覆盖赋值」，而非另起一套名字
```

关键动作：**相册 / 旅行圈 / 像素不再是「另一套 token 名」，而是对同一批语义 token 的重新赋值。**

```css
/* 示例：相册模式只是把语义层重映射，组件仍写 bg-[var(--ui-accent)] */
[data-skin='album'] {
  --ui-accent: #e8b06a;      /* 而非新造 --album-accent */
  --ui-surface: rgba(255,255,255,0.06);
}
[data-skin='social'] {
  --ui-accent: #A85F3A;
}
```

**收益**：`components/album/**` 里所有 `text-album-accent` → `text-ui-accent`，一次替换后，
迁移图标时**再也不会静默变色**（因为 tone 和 className 指向同一个变量）。

### 2.3 落地步骤（每步可独立验证）

| 步 | 动作 | 验证方式 |
|---|---|---|
| A1 | 新建 `app/tokens.css`，声明三层结构；`globals.css` 只 `@import` | 视觉零变化（值照抄） |
| A2 | 把 `--album-*` 改名为 `--ui-*`，在 `[data-skin='album']` 下赋值 | `npm run tokens` 计数不上升 |
| A3 | 同上迁移 `--social-*` | Playwright 视觉冒烟 |
| A4 | `tailwind.config.js` 删掉重复的 `pixel` 与 `shell`，统一指向语义层 | 构建通过 + 无 `undefined var` |
| A5 | `travel.*` 19 色收敛为 `primary.*` 别名（同值），标注 deprecated | checker 新增规则拦截新引用 |
| A6 | 更新规范 §2.2 / §5.3：删除「4 套体系」说明，改写为「1 套语义 + N 个 skin」 | 文档一致性 |

> **风险控制**：A2 / A3 是**纯改名**，值不变，可用 `git diff` 逐行确认；任一步视觉有变即回滚。
> 建议给 checker 加一条 `legacyTokenName` 规则，禁止新代码再写 `--album-*` / `--social-*`。

### 2.4 附带修复：字阶与图标入口

- **字阶**：306 处 `text-[Npx]` 中，`text-[10px]` 出现最多（≥6 文件）。规范 7 档最小 11px，
  建议**新增第 8 档 `.m-micro`（10px/14）** 或明确 10px 的合法场景（角标 / 徽标），
  而不是让 50 个文件各自定义。**先补规范，再收敛代码**（规范 §10 流程第 1 条）。
- **图标**：90 个文件仍直接 `import lucide-react`。建议**分批**：
  先处理**移动端路径**（`components/social/`、`components/space/`、`components/moments/`），
  再处理 `components/album/`（该目录在豁免名单内，可最后动）。
  注意规范 §5.3 的警告：在这些目录迁移时**只归一尺寸/描边，不传 tone**。

---

## 3. 缺口 B · Web 首屏：从「双树 + 无 SSR」到「渐进增强」

### 3.1 问题定位

`app/page.tsx` 的现有模式：

```tsx
const HomeClient = dynamic(() => import('@/components/HomeClient'), { ssr: false, loading: ... })
const HomeMobile = dynamic(() => import('@/components/HomeMobile'), { ssr: false, loading: ... })
const isMobile = useIsMobile()   // SSR 返回 null

if (loading || !data || isMobile === null) {
  return isMobile === true ? <HomeMobileLoading /> : <AsyncState variant="loading" ... />
}
```

**三个叠加的代价**：

1. **首屏 100% 在客户端**：`ssr:false` × 2 棵树 + `useApi` 客户端取数 ⇒ HTML 里没有真实内容，
   LCP 元素只能在 JS 执行 + fetch 返回后才出现；
2. **必然的空窗**：`isMobile === null` 时先渲染 `AsyncState`（桌面骨架）或 `HomeMobileLoading`，
   水合后才切到真树 ⇒ **一次额外的整屏替换**，是 CLS 与「白闪」的来源；
3. **代价翻倍**：`dynamic` 只会加载命中的那一棵，但**两棵树的代码都在路由的 client chunk 图里**，
   构建产物体积与预取策略都受影响。

同类模式还有 `app/travel/TravelClient.tsx`（另一处 `useIsMobile`）。

### 3.2 优化方向（按收益/风险排序）

#### B1 · 把「取数」搬回服务端（收益最高，风险中）

`app/page.tsx` 是 `'use client'`。改为 **Server Component**，直接调 `/api/home` 对应的 service：

```tsx
// app/page.tsx（Server Component）
export default async function HomePage() {
  const data = await getHomeData()          // 直接调 lib/services
  return <HomeShell data={data} />          // 壳组件把数据传给双树
}
```

这样：
- HTML 里**首屏就有真实内容**（旅行卡片、统计数字、地图容器）→ LCP 从「JS 后」提前到「首字节后」；
- 首屏不再需要 fetch 等待 → 去掉最大的空窗；
- 与项目既有的 SoA 分层**完全吻合**（`lib/services/dashboard.service.ts` 已是现成模式）。

> 注意：`/api/home` 已有服务端缓存（`lib/http-cache.ts`），迁移时复用同一 service 即可。

#### B2 · 断点判定改由 CSS 完成，而非 JS（收益高，风险低）

现状：`useIsMobile()` 返回 `null` → 必须先渲染占位。改为 **CSS 决定可见性**：

```tsx
<>
  <div className="hidden md:block"><HomeDesktop data={data} /></div>
  <div className="md:hidden"><HomeMobile data={data} /></div>
</>
```

- 服务端即可渲染**两棵树**（数据同源，无副作用差异时安全）；
- **零空窗、零 CLS**：浏览器首帧就画对；
- 代价：两棵树都在 HTML 里 → 用 `content-visibility: auto` + 组件拆分控制成本，
  且移动端树的 JS 仍可 `lazy`。

> ⚠️ **必须逐页判断**：只有当两棵树**服务端渲染结果一致**时才可这么做。
> 含 `window` / `matchMedia` / 触觉调用的组件仍需 `ssr:false` 或 `useEffect` 守卫。
> 这正是 1.21.0 记录的「暂缓项：ResponsiveShell 整页双树」—— 本方案建议**先做首页试点**。

#### B3 · 统一加载态形状（收益中，风险极低）

现状 4 种加载表达并存：`AsyncState` / `HomeMobileLoading` / `Skeleton` / 各页自绘。
建议**全部走 `components/mobile/Skeleton`（桌面复用同一套形状）**，
规范 §6.1 已规定「骨架形状须匹配真实布局」。

#### B4 · 视口单位与移动端高度（收益中，风险极低）

**43 处 `min-h-screen`，仅 1 处 `dvh`**。iOS Safari / Android Chrome 地址栏收起时
`100vh` 会让底部内容被裁切。建议：
- 全局把 `min-h-screen` 语义替换为 `min-h-[100dvh]`（或新增 `.m-screen` 工具类）；
- 现有 `m-mobile-page` / `m-bottom-nav-safe` 已是好基础，扩展它即可，不要散改。

#### B5 · Web 桌面端的信息密度与宽度（收益中）

- `container-custom` = `max-w-6xl`（1152px）。在 1440/1920 显示器上两侧留白过大，
  而 `app/admin/*` 又用 `max-w-7xl` —— **两套宽度策略**。建议统一为
  `max-w-7xl` + 分档（内容型页面 `max-w-4xl` 收窄保证行长 ≤ 75 字符）。
- `xl: 8 处 / 2xl: 0 处` ⇒ **几乎没有针对大屏的设计**。建议至少为「旅行详情 / 相册 / 首页」
  加 `xl:` 分档（如瀑布流列数 2→3、地图高度分档）。

---

## 4. 缺口 C · 移动端「原生感」的最后 20%

### 4.1 已做得好的部分（不必动）

- `viewportFit: 'cover'` 已配（`app/layout.tsx:24`）→ `env(safe-area-inset-*)` 生效；
- `--m-safe-top` / `.m-bottom-nav-safe` 体系完整（28 处 bottom / 9 处 top）；
- Capacitor `Keyboard.resize: 'native'` 已配（`capacitor.config.ts`）→ 键盘不遮底部输入条；
- `prefers-reduced-motion` 全量降级；`hapticLight / Success / Error` 分级已建；
- `EdgeSwipeBack` / `use-close-on-back` / `MobilePageTransition` 已有原生转场雏形。

### 4.2 待修清单（均为长尾，逐条可验证）

| # | 问题 | 证据 | 影响 | 建议 |
|---|---|---|---|---|
| C1 | **字符冒充图标** | `lib/modules/offline/sync-symbols.ts:14-17` 用 `✓ ↑ ☁ !` 当图标；`SyncBadge.tsx:23` 直接渲染 | 违反规范 §1 第 7 条；不同字体下渲染不一致 | 改用 `Icon` + lucide（`Check` / `ArrowUp` / `Cloud` / `AlertCircle`） |
| C2 | **`!important` 硬顶** | `TravelMobileClient.tsx:191` `m-chip !h-11 !px-5 !text-sm`；`HomeMobile.tsx:361,454` | 规范 §2.6 第 10 条：`!` 是「缺组件」症状 | 换 `Button` 组件（该文件 143 行已有正确用法） |
| C3 | **魔术圆角** | `TravelMobileClient.tsx:205-206` `rounded-[26px]` / `rounded-[30px]`；`MomentTimeline.tsx:110,137` `rounded-[28px]` / `[22px]` | 规范 §4.2 只允许 4 档 | 收敛为 `--m-radius-card`(20) / `--m-radius-sheet`(24) |
| C4 | **内联渐变** | `TravelMobileClient.tsx:156,209,223` 三处裸 `linear-gradient` | 规范 §2.6：只有 3 个 grad token 合法 | 换 `--m-grad-hero` / `--m-grad-scrim` |
| C5 | **平板断层** | `md:` 250 处 vs `lg:` 49 处；`components/space/`、`TravelCircleFeed` 无 `lg:` 分支 | iPad 竖屏 768–1024 上，移动布局被拉伸到满宽 | 为 `md`–`lg` 区间增加「居中 + `max-w-2xl`」约束 |
| C6 | **`min-h-screen` 移动页面 11 处** | `PostDetail`(3)、`UserProfile`(3)、`TravelMobileClient`(2) 等 | iOS 地址栏遮挡底部 | 见 B4 |
| C7 | **`transition-all` 104 处** | 45 个文件 | 规范 §7「只做 opacity + transform」；`all` 会触发 layout | 改为 `transition-colors` / `transition-transform` |
| C8 | **`animate-spin` 60 处** | 38 个文件 | 规范 §7 唯一无限动画是 `Loader` | 统一走 `Loader` / `.m-btn-spinner` |
| C9 | **返回手势覆盖不全** | `use-close-on-back` / `EdgeSwipeBack` 仅部分页面接入（3.0 文档记录「空间详情页接入」） | 部分页面 Android 返回键行为不一致 | 逐页排查，纳入 checklist |
| C10 | **`backdrop-blur` 50 文件** | 移动端尤其相册 / 空间大量玻璃层 | 中低端 Android GPU 掉帧 | 用 `@supports` + 设备降级；或限制并发玻璃层数量 |

### 4.3 新增建议：把「原生感」做成可回归的清单

规范 §10 的变更流程缺一条**移动端专项自查**。建议补：

```
[ ] 首帧是否有 100dvh / safe-area 处理
[ ] 底部 64px 内是否有可点元素被 tab bar 遮挡
[ ] 键盘弹出时输入框是否可见（真机 Keyboard.resize=native 验证）
[ ] 返回手势 / 系统返回键是否有响应
[ ] 触达目标是否 ≥44×44（含图标按钮）
[ ] 是否引入了新的 transition-all / 无限动画
[ ] 平板（768–1024）下是否出现「超宽拉伸」
```

---

## 5. 专项 D · 可访问性从「3 页」到「全站」

### 5.1 现状

`tests/e2e/a11y.spec.ts` 只覆盖 `/login`、`/admin/login`、`/download` **三个匿名页面**，
且只断言 `critical/serious`。**登录后的所有主流程（旅行 / 相册 / 旅行圈 / 空间 / 我的）零覆盖。**

### 5.2 建议

1. **扩展 axe 扫描到登录态主流程**：复用 `playwright.config.ts` 的 `storageState`，
   新增一组「登录后」用例（这是 1.21.0 为 `/login` 显式关闭 storageState 的**反向补齐**）。
2. **升级到 WCAG 2.2**：当前 tags 是 `wcag2a/2aa/21a/21aa`，缺 `wcag22aa`。
   2.2 新增的 **2.5.8 Target Size (Minimum) 24×24** 与 **2.4.13 Focus Appearance**
   与本项目相关性极高（规范 §8 只写了 44×44，比 WCAG 更严，但仍需自动化兜底）。
3. **焦点管理**：`Modal` / `BottomSheet` / `ActionSheet` / `SideDrawer` / `CommandPalette`
   需确认 **focus trap + Esc + 关闭后焦点归还**。规范提到 `role="dialog"` 已补，
   但 **focus trap 未见统一实现**（`components/mobile/BottomSheet.tsx` 建议优先核查）。
4. **对比度**：规范 §2.5 自陈存在 **3 种「危险红」**（`--m-danger` / `travel-danger` / `--danger-soft`），
   建议在缺口 A 的 token 合并中一并解决。

---

## 6. 专项 E · Admin 后台纳入设计系统

### 6.1 现状

`components/admin/` 与 `app/admin/` 在 checker 的 `THEME_ALLOWLIST` 中**整体豁免**。
1.21.0 实测「移出豁免后违规从 335 → 578（+243）」，因此**暂缓**。

### 6.2 关键观察

`AdminShell.tsx:132` 是最有代表性的一行：

```tsx
<Icon className="h-[18px] w-[18px] shrink-0 ..." />
```

—— `h-[18px]` 既不是移动端 3 档（16 / 20 / 24），也不是任意既有 token，是**当场手写的魔术数字**。
一个已高度工程化的组件库里仍会出现这种写法，说明**豁免名单在事实上变成了「设计债务黑洞」**。

### 6.3 建议

**不要一次性移出豁免**（会立刻变红）。改为**分规则、分目录渐进**：

| 阶段 | 动作 |
|---|---|
| E1 | 仅把 admin 从**「硬编码 hex」**规则豁免中移出，其余规则暂留 |
| E2 | 补一个 **admin 专用组件集**（`components/admin/ui/`：`AdminButton` / `AdminTable` / `AdminToolbar`）—— `!` 与魔术数字的根因是「缺组件」 |
| E3 | 表格类页面（`audit` / `social`）补 `overflow-x-auto` + 移动端卡片化降级 |
| E4 | 全量移出豁免，并把该批次的违规**固化进基线**，之后只拦新增 |

---

## 7. 对标 2026 设计趋势（外部参考）

结合当前公开趋势讨论，三个方向与本项目**契合度高、且成本可控**：

| 趋势 | 本项目现状 | 建议动作 | 优先级 |
|---|---|---|---|
| **Liquid Glass / 深度材质** | 已有 `--m-glass` / `.m-glass` 与大量 `backdrop-blur`；但**无光学分层规则**，玻璃是「平」的 | 补**材质层级规范**：哪一层用多强的模糊 / 边框高光（`--m-elev-1/2/3` 已有，扩展到玻璃）；**不做动态折射**（成本高、收益低） | P2 |
| **Typography-led hierarchy** | 首页 hero 48px，方向对；但 306 处内联字号说明**字阶未收口** | 见 §2.4：先把字阶收敛为「事实上的 7–8 档」 | **P0** |
| **尊重注意力（反成瘾）** | 无自动播放、无无限滚动诱导（旅行圈是有限分页）；`DanmakuSection` 弹幕可关闭 | 保持即可；建议补**动效强度设置**（对接系统 `prefers-reduced-motion` 之外的 App 内开关） | P2 |
| **移动端原生感** | 基础扎实（安全区 / 触觉 / 转场） | 见 §4.2 清单 | **P1** |
| **WCAG 2.2** | 只到 WCAG 2.1 AA，且仅 3 页 | 见 §5.2 | **P1** |

> 明确**不建议**跟进的：生成式 UI（GenUI）、WebGPU 实时光照、陀螺仪镜面高光 ——
> 对这个「私人旅行记忆空间」的定位而言，属于**投入产出比极低**的方向。

---

## 8. 执行路线图

### P0 · 抢修 + 收敛（1–2 周）

**P0-a 抢修（单点、改动极小、收益最大）**

| 任务 | 交付物 | 验收 | 预估 |
|---|---|---|---|
| P0-1 **桌面首页地图改懒加载** | `HomeClient.tsx:23` → `dynamic(..., {ssr:false})` + 骨架；照抄 `HomeMobile.tsx:43` | 首屏 chunk 不再含 `china-geo.json`（可用 `.next` 产物核对） | **< 5 行** |
| P0-2 **`outline-none` → `focus-visible`** | 96 处统一；保留视觉不变、只影响键盘态 | 键盘 Tab 全程可见焦点环 | 低 |
| P0-3 **iOS 输入聚焦缩放** | 输入控件统一显式 `font-size:16px`（含 `.m-field-input`） | iOS 真机聚焦不再自动放大 | 低 |

**P0-b 收敛（零视觉变化，可随时回滚）**

| 任务 | 交付物 | 验收 |
|---|---|---|
| P0-4 字符图标清理 | `SyncBadge` 改 `Icon`（或直接删除死组件） | checker 第 6 条归零 |
| P0-5 `!important` 清理 | 19 文件 → `Button` 组件 | checker 第 10 条归零 |
| P0-6 魔术圆角清理 | 8 文件 → 4 档 token | checker 第 6 条归零 |
| P0-7 内联渐变清理 | 移动端优先，85 文件分批 | checker 第 7 条计数下降 |
| P0-8 字阶规范补丁 | 规范 §3 明确 10px 场景或新增 `.m-micro` | 规范与代码一致 |
| P0-9 `min-h-screen` → `dvh` | 全局工具类 + 移动页面 11 处 | 真机地址栏无遮挡 |
| P0-10 `.m-soft-pulse` 无限动画 | 改一次性动画或移除 | 规范 §1 第 3 条恢复 |

**P0 完成后跑 `npm run tokens -- --update-baseline` 收紧基线。**

### P1 · 结构性（2–3 周）

| 任务 | 说明 |
|---|---|
| P1-1 首页服务端取数 | §3.2 B1，先做 `/` 单页试点，消灭空窗与 CLS |
| P1-2 token 三层化 | §2.2 A1–A4，纯改名，逐模块验证 |
| P1-3 **`semantic` 层落地或撤诺** | V2：要么 codemod 推广 + CI 拦截，要么删除 `tailwind.config.js:18-36` 的承诺注释 |
| P1-4 容器宽度归一 | V5：`container-custom` 与首页 `max-w-7xl` 取其一，Navbar/Footer/页面共用 |
| P1-5 `screens` 显式声明 | V4：补 `screens` 键，为 1024–1280 增设档位 |
| P1-6 移动端键盘避让 | V9：`visualViewport` 跟随，先修 `CommentPanel` |
| P1-7 a11y 扩面 | §5.2 登录态主流程 + WCAG 2.2 tags |
| P1-8 `--album-*` 去双写 | V6：tailwind 值改为 `var(--album-*)` |
| P1-9 首页加载态换骨架 | V7：`AsyncState` spinner → Skeleton |

### P2 · 按需

Admin 组件集（§6）、Liquid Glass 材质层级（§7）、大屏 `xl:` 分档（§3.2 B5）、
视觉手法收敛（V12：从 4 种减到 1 种）。

---

## 9. 风险与约束

1. **不能破坏「桌面端零回归」**（规范 §10 第 4 条）—— 所有移动端改动走 `md:` 或独立分支。
2. **token 改名必须纯值不变** —— 任一步视觉有变立即回滚，用 `git diff` 逐行确认。
3. **CI 门禁只能收紧不能放松** —— 每批收敛后 `--update-baseline`。
4. **真机验证不可省**：项目 1.21.0 记录「本机无 MySQL，Playwright 与 lhci 未实跑」——
   本方案中任何移动端改动都必须在 **390×844 + 768×1024 真机/模拟器**上冒烟。
5. **文档同步**：规范 §2.2 / §5.3 / §9 / §10 需随代码同步更新（项目已有此纪律，保持即可）。

---

## 10. 一页速览

```
现状：工程化水平高，但设计系统在「6 套 token + 双树 + 豁免名单」三处漏气，
      且有一笔 582KB 的首屏数据债（桌面端），移动端却已做对。

第一优先（改动 < 5 行，收益最大）
  HomeClient.tsx:23 静态 import 地图 → dynamic(ssr:false)
  直接砍掉桌面首屏 582KB JSON + d3-geo

P0-a 抢修（1 周内）
  地图懒加载 · outline-none 96→focus-visible · iOS 输入 16px

P0-b 收敛（零视觉变化，全部是规范已禁止项）
  字符图标 · !important 19 文件 · 魔术圆角 8 文件 · 内联渐变 85 文件
  dvh 43 处 · .m-soft-pulse 无限动画

P1（2–3 周，结构性）
  首页服务端取数 → 消灭首屏空窗与 CLS
  token 三层化（--album/--social → skin 重映射）→ 消灭静默变色
  semantic 层落地或撤诺 · 容器宽度归一 · screens 显式声明
  移动端键盘避让（visualViewport）· a11y 扩到登录态 + WCAG 2.2

P2（按需）Admin 组件集 · 材质层级 · 大屏分档 · 视觉手法收敛
```

### 10.1 验证方式（复现命令）

```powershell
# token 门禁现状（应输出 439 处）
node scripts/check-design-tokens.mjs

# V1 证据：桌面首页静态引入地图
Select-String -Path components\HomeClient.tsx -Pattern 'HeroFootprintMap'
(Get-Item data\china-geo.json).Length          # → 582522

# V3 证据：焦点样式失衡
(Get-ChildItem app,components -Recurse -Include *.tsx |
  Select-String 'outline-none' -AllMatches).Matches.Count      # → 96
(Get-ChildItem app,components -Recurse -Include *.tsx |
  Select-String 'focus-visible' -AllMatches).Matches.Count     # → 7

# V2 证据：semantic 层在 app/ 下 0 引用
Get-ChildItem app -Recurse -Include *.tsx | Select-String 'semantic-'

# V9 证据：全项目无 visualViewport
Get-ChildItem app,components,lib,hooks -Recurse -Include *.ts,*.tsx |
  Select-String 'visualViewport'                             # → 无输出
```

---

*本文档为评审草案，**未修改任何代码**。所有数据来自本次实跑与双线逐文件审计，
关键结论已二次独立验证；复现命令见 §10.1。*
