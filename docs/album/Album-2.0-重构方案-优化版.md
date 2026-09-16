# Travel-Notes Album 2.0 · 重构方案（优化版）

> **本文是对 ChatGPT「Travel-Notes Album 2.0 / 旅行画册」实施方案的复核与优化版本。**
> 原方案：`Travel-Notes_Album_2.0_Travel_Book_Codex实施方案.md`（1785 行，44 节）
>
> 编写依据：`F:\CodeFiles\Travel-Notes` 工作区实况（master @ `d885c2f`），逐文件审计
> `app/album/page.tsx`(904L)、`components/album/travel-book/*`、`components/album/reader/*`、
> `lib/modules/album/travel-book.service.ts`(376L)、`lib/modules/album/photo-layout.ts`、
> `prisma/schema.prisma`、`public/vendor/page-flip.browser.js`、`app/globals.css`(1590L)、
> `tailwind.config.js`、`docs/design/*`、`tests/**`。
>
> 基线校验（本轮实测）：`npx tsc --noEmit` → **exit 0**；`npx vitest run tests/unit/travel-book.service.test.ts
> tests/unit/art-photo-layout.test.ts tests/unit/album-deep-link.test.ts` → **19 passed / 3 files**。

---

## 0. 一句话结论

**原方案的产品方向（Album = Travel Book）是对的，可以执行；但它的三个技术前提全部不成立**
（"参考仓库里有可复用的 3D Runtime"、"BookPage 需要新建一套模型"、"按 Phase 0–8 分九期推进"），
**并且漏掉了本项目已经踩过并解决的四个硬约束**（相册锁、深链契约、静态导出、媒体变体链）。

优化版把方案收敛为 **4 个必做阶段 + 1 个可选阶段**（§7），并把它从"重写相册"改成
**"修运行时 + 抽页面模型 + 拆主题皮肤"**——因为现有代码的**产品壳**（书架墙、翻页阅读器、
Art Mode 版式、两级 API、变体链、三模式共存）已经完成约 70%，
真正的问题只有 **1 个致命性能缺陷 + 1 个数据缺口 + 1 个架构错位**。

| | 原方案 | 优化版 |
|---|---|---|
| 阶段数 | 9（Phase 0–8） | **4 个必做（P0 + M1–M3）+ 1 个可选（M4）**，见 §7 |
| 参考仓库角色 | 3D Runtime 复用来源 | **仅文档/思路来源**（无可用代码，见 §2.1） |
| 新技术依赖 | 建议引入 Three.js R3F / quick_flipbook | **0 个新依赖** |
| 最大风险 | 3D 渲染性能 | 翻页运行时重建、单本查询 O(全库) |
| 现有 Pixel/Galaxy | 升级为 Theme | **保留为并列"模式"**（它们不是主题，见 §3.1） |
| 路由 | 新建 `/albums/:id/read` | **不新增路由**（见 §3.2） |
| 不可删的东西 | 仅一句"不要删数据" | 显式列 12 项契约冻结清单（§5） |

---

## 1. 「坑」清单：原方案中必须修正的地方

### 坑 1（致命）：把 `create-photo-flipbook-ui` 当作可复用运行时

原方案 §16/§17/§42/§44 反复要求 Codex "clone 仓库 → 提取 3D Book Runtime / Page Turn 核心 /
Quick FlipBook 适配代码"，并称它是本方案的"3D 阅读器核心复用来源"。

**实际情况（已核实）：**

| 事实 | 证据 |
|---|---|
| 该仓库是 **Codex skill（提示词 + 素材）**，不是运行库 | 仓库描述："Codex skill for building responsive 3D photo flipbook websites from user-supplied images"；`SKILL.md` frontmatter `name: create-photo-flipbook-ui`，描述"三阶段 agent 工作流" |
| 仓库根 LICENSE 是 MIT（Copyright (c) 2026 Haichao Li），但 **README 明确排除 3D 代码** | README："The adapted code in `ui-collections/3d-book-1/` and all photographs, videos, and other media are excluded unless expressly stated otherwise." |
| 3D 示例在 `ui-collections/` 内，**"not installed with the skill"** | skill 安装路径 `skills/create-photo-flipbook-ui`，`ui-collections/` 在 skill 之外 |
| `ui-collections/3d-book-1/` 是 **adapted 版本**（源自 `wass08/r3f-animated-book-slider-final`），**许可不明** | 仓库 README + 该目录 package.json（Vite + React + `@react-three/fiber ^9.7.0` + `@react-three/drei ^10.7.8`） |
| `ui-collections/3d-book-2/` 用 `quick_flipbook ^1.1.3`（BSD-2-Clause, Bandinopla） | 该目录含 `THIRD_PARTY_NOTICES.md` |
| **skill 真正 ship 的运行时是 2D DOM/StPageFlip 翻页书，不是 Three.js** | `skills/create-photo-flipbook-ui/assets/html/` |
| 它 vendored 的 `page-flip.browser.js` = **44,058 字节**，与 npm `page-flip@2.0.7` 的 `dist/js/page-flip.browser.js` **字节数完全一致** | skill 的 `assets/html/vendor/` 副本 |
| **本项目 `public/vendor/page-flip.browser.js` = 44,059 字节**，末 4 字节 `41 3B 0D 0A`（即 `";` + CRLF） | 本轮实测：[System.IO.File]::ReadAllBytes |

> **结论：两个副本是同一份 `page-flip@2.0.7` 产物，仅差一个行尾。**
> 也就是说本项目**已经拥有**原方案想从参考仓库"提取"的那个 runtime。`public/vendor/PAGE-FLIP-LICENSE` = MIT / Copyright (c) 2020 Nodlik，与上游一致。
> （skill 另一份 `ui-collections/film-negative-flipbook/vendor/page-flip.browser.js` 是 44,156 字节的**另一副本**。）

**由此得到三条判断：**

1. 原方案 §16 的"允许直接复用"清单里，**唯一真实存在的可复用代码就是 `page-flip`**，而它 **本项目已经 vendored 并在用**（`components/album/reader/ArtFlipBook.tsx`）。照原方案执行会得到**零收益 + 一份许可风险**。
2. `ui-collections/3d-book-1/` **不可复制**（README 声明排除 + 该目录无 LICENSE + 上游 `wass08/r3f-animated-book-slider-final` **无任何许可**）。`3d-book-2/` 若要参考，只能参考 `quick_flipbook`（BSD-2，需保留 NOTICE），但它与现有 2D 翻页是**互斥的渲染路线**，切换等于重写阅读器。
3. 原方案 §44 结尾的两条 `cite` 说明（"仓库明确提供可安装的 Codex skill…包含 vanilla runtime、React Three Fiber 实验、Three.js/Quick FlipBook 方案"）**描述本身没错，但推导错了**——"仓库里有这些文件"≠"这些文件可被许可证允许地复制进生产项目"。

**优化版处理：** 把该仓库定位为 **UX / 节奏设计参考（`opener/transition/pause/peak/ending`）与 skill 工作流参考**，代码复用归零。§2.1 给出替代的零依赖路线。

---

### 坑 2（致命）：`imgly/starterkit-photobook-ui-react-web` 连"参考仓库"都不该出现在依赖讨论里，但原方案 §18 的"只吸收产品结构思想"也不够

**实际情况（已核实）：**

- 它是 **Vite 6 + React 18.3 SPA**（`"build": "tsc && vite build"`，`src/index.tsx`，**无 `next` 依赖、无 App Router 文件**——`src/app/` 只是目录名）。React **锁 18.3.1**，React 19 未经验证。
- 依赖 **`@cesdk/cesdk-js ^1.75.2` 与 `@cesdk/engine ^1.75.2`**；README 虽写 MIT（IMG.LY GmbH），但明确 **"This starterkit is provided under the CE.SDK license terms"**。
- CE.SDK 许可（已核实原文）：**"subscription-based commercial model"**、**"tied to a single commercial product instance, verified by the hostname"**、试用 **"valid for 30 days"**；npm 包 `"license":"SEE LICENSE IN LICENSE.md"`，其 LICENSE.md 是 ToS：*"No rights shall be granted to Licensee by virtue of these Terms of Service alone as such grant requires the execution of an Order Form."* → **商业使用不免费。**
- 包体积：`@cesdk/cesdk-js@1.82.0` 的 `unpackedSize` = **140,633,457 B（≈140 MB）**（tree-shake 后运行时体积未核实）。
- **无可用代码切片**：`src/imgly/photobook-layouts.ts` 只是资产清单（指向 `template-N.scene`）；真正的版式在 `public/*.scene`（4×~92KB + `photobook.scene` 682KB）闭源场景数据里。仅有 `SinglePageModeContext` / `PagePreviewContext` 属 UI 编排。

**结论：** 原方案 §18「第一阶段不要引入 CE.SDK」的决策**正确**，但理由不完整——它列的是"增加依赖/包体积/复杂度"（包体积这一条其实说轻了：**≈140 MB**），**没点出许可证才是硬阻断**。而"吸收其信息架构"这条对本项目**几乎无价值**：它是**编辑器**（上传/图层/贴纸/文字/导出 + Undo/Redo），本项目要的是**只读阅读器**；两者页面模型（可编辑场景 vs 派生渲染）不兼容。

**优化版处理：** 该仓库从"参考"降级为 **"明确不采用"**，只在 §9 的第三方清单里留一行否决记录。真正的版式参考改用**本项目已有的 `docs/design/travel-notes-design-skill.md`**（已是唯一前端规范来源）+ 通用编辑设计原则；阅读器交互参考改用 §2.4（PhotoSwipe / yet-another-react-lightbox）。

---

### 坑 3（严重）：`page-flip` / `react-pageflip` 已事实停止维护，原方案却把生产架构压在上面

**实际情况（已核实）：**

- `page-flip@2.0.7` 最后发布 **2021-04-18T15:11:50Z**（registry `time` 表最后一项，此后 ~5.4 年无新版，零运行时依赖）；`react-pageflip@2.0.3` 同日发布，且 dependency 写成 **`"page-flip": "latest"`（未锁版本）**。
- GitHub：StPageFlip 863★ / 191 forks / **46 open issues**，最后 push **2024-01-08**；`react-pageflip` 743★ / **54 open issues**，最后 push **2023-08-26**。均未 archive，但**事实停止维护**。
- `react-pageflip` 的 `HTMLFlipBook` 源码 **没有任何 unmount 清理**（全文无 `return () => …`），仅用 `!pageFlip.current` 守卫 `new PageFlip(...)`，页面集合由 `useEffect(…, [props.children])` 驱动。
- 上游 issue 记录（与本项目场景直接相关）：
  - **#14 `Lazy Loading Feature`** — *"Right now, flipbook component requests all the images at the time of initializing"* → 印证：相册**必须**自建懒加载层。
  - **#54** 动态页面列表时**没有翻页动画**、每页独立渲染；**#24** 改 props（宽度）重渲染不生效（2026-03-03 仍有活动）；**#20/#21/#46** 均为 Next.js/SSR 场景问题。
- **`updateFromHtml` 的克隆行为**：StPageFlip README 明示 `usePortrait` *"uses cloning of html elements (pages)"* —— 结合本项目 `BookReader.tsx:206` 的 `portrait={!isWide}`，**移动端每次 `updateFromHtml` 都是"销毁 + 重建 + 克隆 + 建 canvas"**（见坑 6）。

**本项目相关风险（已在代码中确认）：** `components/album/reader/ArtFlipBook.tsx:55-69` 用
**动态注入 `<script src="/vendor/page-flip.browser.js">`** 的方式加载，并直接操作 `window.St.PageFlip`（`any` 类型，无 TS 类型）。

**换库评估（已核实，供决策留档）：** 目前**不存在** React 19 下可直接替换、且支持"拖拽跟随 + 页面弯曲"的维护中方案：

| 候选 | 版本 / 许可 | React 19 | 弯曲拖拽 |
|---|---|---|---|
| `page-flip` (StPageFlip) | 2.0.7 / MIT | 无关（vanilla） | **有** — 源码 `drawSoft()` 生成旋转的 `clip-path: polygon(...)`，`userMove()` → `flipController.fold(t)` |
| `react-pageflip` | 2.0.3 / MIT | **未验证**（devDeps React 17，未声明 react peer） | 继承 page-flip |
| `quick_flipbook` | 1.1.3 (2024-02-20) / **BSD-2-Clause** | 无关（three.js） | **有** — 真网格形变，peer `three >=0.160.1` |
| `turn.js` 官方 v4 | **商业许可** | 否（jQuery 时代） | 有，但许可不可用 |
| npm `turn.js` | 1.0.5 / 元数据写 MIT，但作者是第三方 repackage | 否 | — |
| `react-flip-page` | 1.6.4 / MIT | **否**（`react-dom: ^16.2.0`） | 平面翻页，弯曲**未验证** |
| `@react-three/fiber` / `drei` | 9.7.0 / 10.7.8 · MIT | **是**（`react: ">=19 <19.3"` / `"^19"`） | 需自建几何 |
| 纯 CSS 3D transform | — | — | **只有平面 `rotateY`**；弯曲需 clip-path 多边形数学或 WebGL 网格 |

**结论：** 继续用 `page-flip` **可以**（MIT、已 vendored、已验证可用、移动端壳里也已内联），
但**必须把它隔离在一个适配器接口后面**（§4.4），且**不得**让页面模型/主题系统依赖它的内部行为。
同时，**"纯 CSS 3D" 不能作为"看起来一样"的替代**——它只能做平面翻转，做不出弯页；
若 `tier: 'lite'` 走 CSS 路线，必须接受**视觉上有意简化**（并在方案里写明，而不是假装等价）。

---

### 坑 4（严重）：原方案把现有"像素/银河"当成"主题"，与实际代码结构不符

原方案 §5/§27/§31/§32 的设计是：

> **3D Book 是产品形态，Pixel / Galaxy / Film 是视觉主题。**

**实际情况：**

- 现有是 **3 个"模式"**（`lib/album-modes.ts`：`book` / `pixel` / `space`），
  且 **`pixel` 与 `space` 有各自完全独立的容器、顶栏、解锁弹窗、后端权限口径**：
  - `pixel`：`PixelDeskBackground` + `DriftWall`(WebGL) + `PixelPhotoChat` + `PixelUnlockModal`
  - `space`：`GalaxyAlbumScene`(Three.js) + `SpaceAlbumHUD` + `TravelStarMap` + `SpaceUnlockModal`
- 两者的数据源是 **`/api/album`（受相册纪念日锁保护）**；而 `book` 模式的数据源是
  **`/api/travel-book`（刻意不受锁保护）**。这是**两套数据和两套权限**，不是两套配色。
  （`app/api/travel-book/route.ts:12-14` 注释原文："口径说明（刻意与 /api/album 不同）"）

**结论：** 把 `pixel` 降级成"Book 的一个主题"会让**照片墙、像素留言、星图、银河场景、纪念日锁全部失去归属**——
这是一次**产品功能删除**，不是主题重构。原方案 §5「不要删除现有视觉资产」与 §27 的 Theme 设计**自相矛盾**。

**优化版处理：** 见 §3.3 —— **`pixel` / `space` 保留为并列模式，不并入 Book Theme**；
新增的 `editorial / film / memory` 作为 **Book 内部主题**。二者是**正交的两个维度**。

---

### 坑 5（严重）：原方案漏掉本项目已踩过的 4 个硬约束

| 漏项 | 实际代码事实 | 不处理会怎样 |
|---|---|---|
| **相册纪念日锁** | `album_token` cookie（`lib/album-auth.ts`）+ 服务端 `verifyAlbumToken` + `/api/album` 未解锁返回 403 + 三个 `*UnlockModal` | 新路由/新页面绕过锁 → **私密照片墙泄露** |
| **深链契约** | `/album?book=<bookKey>`（`app/album/page.tsx:109-121` + `TravelBook.tsx:129-151`），且有单测 `tests/unit/album-deep-link.test.ts`(4 用例) 与 `lib/album-deep-link.ts` | 改路由破坏首页"画册目录 → 城市直达"入口 |
| **已有 `/albums` 路由** | `app/albums/page.tsx` = `redirect('/album')` | 原方案 §24 建议新建 `/albums` 会与之直接冲突（同路径不同语义） |
| **移动端是静态导出** | `next.config.js`：`MOBILE_EXPORT=1` → `output:'export'` + `images.unoptimized:true`；产物在 `www/`（含 `album.html`） | 用 `next/image` 优化 API / SSR-only 能力会在 APK 里失效 |

**优化版处理：** §5 把上述 4 项 + 其它共 **12 项写成"契约冻结清单"**，每个阶段结束必须逐项回归。

---

### 坑 6（严重）：最高的性能优先级，原方案完全没提

原方案 §20「性能方案」写的是图片三级 + 只渲染 current/prev/next + 移动端 Lite Mode —— 方向对，
但**漏掉了当前代码里唯一致命的缺陷**：

**`ArtFlipBook.tsx:143-147`**
```ts
useEffect(() => {
  if (!ready || !pageFlipRef.current || !containerRef.current) return
  const pageElements = containerRef.current.querySelectorAll<HTMLElement>('.art-flip-page')
  pageFlipRef.current.updateFromHtml(pageElements)
}, [ready, pages])
```

**vendored `page-flip.browser.js` 里 `updateFromHtml` 的实现（已从产物中解出）：**
```js
updateFromHtml(t){
  const e = this.pages.getCurrentPageIndex();
  this.pages.destroy();                                    // ① 销毁整个 PageCollection
  this.pages = new o(this, this.render, this.ui.getDistElement(), t);
  this.pages.load();                                       // ② 重新解析全部页 + 建 canvas
  this.ui.updateItems(t);
  this.render.reload();                                    // ③ 重新测量/重排
  this.pages.show(e);
  this.trigger("update", ...)
}
```

**而 `pages` 的依赖链是：**
```
BookReader.buildPages(book, measured, isWide)   // measured 由图片 onLoad 回填
   ↑ setMeasured() 每测到一张新照片就 +1
   → pages 变 → useEffect([ready, pages]) 触发 → updateFromHtml → 整本重建
```
→ **一本 128 张照片的画册，在翻页过程中最多触发 ~128 次"整本书销毁重建"**，
每次都要销毁/重建全部页元素并重新 `load()`。这正是"翻页卡、翻页后页码跳、图片闪"的根因，
而原方案 §20 里一个字都没有。

**次要但同样真实的问题：**

| 位置 | 问题 |
|---|---|
| `travel-book.service.ts:372-375` | `getTravelBookByKey` = `listTravelBooks()` 取全库再 `find`；单测注释自认"每次调用都会重跑一次聚合"。**打开 1 本 = 全库全量聚合** |
| `travel-book.service.ts:188-330` | Post 城市画册路径**逐篇文章、逐张图** await（`Promise.all` 只在单篇内），无并发上限聚合 |
| `travel-book.service.ts:240-241` | 该路径 `width: null, height: null` → 客户端**必然**走 `onPhotoMeasure` 回填 → **必然**触发坑 6 |
| `ArtPage.tsx:46/176/207` | 手写 `<img loading="lazy">`；而项目里 **26 个文件用 `next/image`**（`AlbumPhoto.tsx` 是标准范式），本项目自有约定未被遵守 |
| 生成变体 | `resolveLocalUrlVariants` 返回**预测 URL**，实际文件由后台队列生成（并发 3）→ 首访时该 URL 可能 404，`<img onError>` 静默回落原图 → **大图被当书页图加载** |
| 无预取 | 除 `blurUrl` 占位外，当前页之外**没有任何** `preload` / `decode()` / 邻页预热（`Sketchbook.tsx` 曾有 `imgCache` LRU，但它现在是死代码）。上游亦承认 *"flipbook component requests all the images at the time of initializing"*（react-pageflip issue #14）→ **懒加载层必须本项目自建** |
| `app/globals.css` | Art Mode 样式（`.art-page*` / `.art-flip*`）**内联在 1590 行的全局样式表**里，约 126 行命中；且 `--art-paper:#f7f6f0` / `--art-ink:#292c26` / `--art-cloth:#7d8572` **硬编码，未接 `travel.*` token** |

**优化版处理：** §4.1（数据层修缺口）+ §4.3（冻结页面集合）+ §6（性能预算与验收阈值）。

---

### 坑 7（中）：原方案对"派生数据"的推导正确，但落地的 `BookPage` 模型缺关键字段

原方案 §12 的 `BookPage` 建议模型**缺两样东西**，会导致实现时又要回到"客户端测量"：

1. **缺页面自身尺寸**：现有 CSS 用 `aspect-ratio: 0.8`（单页）与 `1.6`（双页），
   排版判定 `photoSpreadFits(w/h >= 1.6)`（`lib/modules/album/photo-layout.ts`）**必须**知道照片宽高比。
   现有 `Media.width/height` 是 nullable，Post 城市画册路径更是恒 null。
2. **缺 `spread`（对开）概念**：现有实现是在 `BookReader.buildPages` 里用
   `placed % 2 === 1 → push(blank)` 手工凑齐左右配平——**页面模板与"翻页单位"耦合在同一个数组里**。
   一旦引入 `PHOTO_PAIR` / `COLLAGE`，这个手工配平会立刻崩掉。

**优化版处理：** §4.2 重新定义 `BookPage` / `Spread` 双层模型，并给出**服务端补齐 `width/height`** 的方案。

---

### 坑 8（中）：原方案的"自动排版"与"质量 > 数量"没有可执行的判据

原方案 §13/§14：
> 横向照片优先 `FULL_BLEED`；竖向优先 `PHOTO_CAPTION/PHOTO_PAIR`；2→PAIR，3-4→COLLAGE，5+→多页拆分
> 照片选择必须优先：**质量 > 数量**

问题：**"质量"在本项目里没有任何数据支撑。** 现有可用信号只有：
`Media.width/height`（分辨率）、`Media.takenAt`、`Media.latitude/longitude`、
`Memory.mood`、`ItineraryItem`（行程点）、`Post.images` 顺序、`Media.hash`（去重）。

**优化版处理：** §4.3 给出一套**只用现有字段、可单测**的确定性打分函数（不引入 AI/ML），
并明确"覆盖率"用**附录索引页**兜底，而不是往正册里塞照片。

---

### 坑 9（中）：原方案的 Phase 划分会让项目长期不可用

原方案 Phase 1 就"建立 Design System / Album Shelf / Album Card / Book Cover / Theme system"
且"暂时不接 3D"——但**现有 3D 阅读器是能用的（虽然慢）**。
按此推进意味着：先做一遍新视觉（丢弃现有 Art Mode 投入），再在 Phase 3 重新接 3D。

同时 Phase 1–8 里有**明显的重复劳动**：Phase 6 才接 Theme，但 Phase 1 已经建了 Theme system。

**优化版处理：** §7 改为 **P0 止血 → M1 数据层 → M2 运行时 → M3 主题/精修**，
每个里程碑结束时**线上都是可用的**，且都不推翻上一阶段的成果。

---

### 坑 10（小）：原方案 §23/§36 的"禁止事项"方向对，但缺少可验证的形式

"禁止重建数据库 / 禁止删除旧字段 / 禁止绕过 Service"——正确但没有检查手段。
本项目已有 `scripts/check-design-tokens.mjs`、`tests/security/*` 等门禁，应复用同样思路。

**优化版处理：** §5 契约冻结清单 + §9 每阶段门禁命令。

---

## 2. 参考开源项目：重新定位

### 2.1 `HaichaoLihc/create-photo-flipbook-ui` → **文档/节奏参考，零代码复用**

**可借鉴（且值得借鉴）的只有 4 条，全是设计层面的：**

1. **书籍节奏**：`opener → transition → pause → peak → echo → ending`（原方案 §14 引用的就是这条，**保留**）。
2. **照片取舍**：不为"照片全出现"牺牲画册质量（**保留**，但需要 §4.3 的判据）。
3. **响应式书页尺寸**：`size:'stretch'` + `min/maxWidth·Height` 的等比收缩思路 —— 本项目
   `ArtFlipBook.tsx:82-103` + `globals.css` 的 `.art-flip-rig` 已经实现同类逻辑（**已拥有，无需引入**）。
4. **skill 化工作流**：`理解素材 → 定义风格 → 构建` 的三段式，可作为"每阶段先审计后动手"的方法论（原方案 §35 已吸收）。

**明确不复用：** `ui-collections/3d-book-1/`（被 README 排除 + adapted 许可不明）、
`ui-collections/3d-book-2/`（引入 `quick_flipbook` 等于换渲染路线，且与现有 2D 翻页互斥）、
`skills/.../assets/html/` 的整套 demo（原方案 §17 已禁止，正确）。

### 2.2 `imgly/starterkit-photobook-ui-react-web` → **明确不采用**

理由三条（任一即足以否决）：
1. **许可证**：依赖 CE.SDK，订阅制商业授权 + 域名锁定，商业使用不免费。
2. **形态错配**：它是**编辑器**（Vite + React 18 SPA），本项目要**只读阅读器**（Next.js 15 + React 19）。
3. **无可用切片**：页面/布局模型在闭源 SDK 内部，拿不到可借鉴的代码。

### 2.3 其它候选（已筛查，均不采用，理由记录在案）

| 候选 | 结论 | 理由 |
|---|---|---|
| `turn.js`（官方 v4） | **不用** | **商业许可**（Emmanuel Garcia，明确禁止以公开/开源许可再分发）；仓库 LICENSE 为 `NOASSERTION`（7,490★ / 393 open issues） |
| npm `turn.js` 1.0.5 | **不用** | 是**第三方 repackage**（作者 Andrea Gherardi），非官方；依赖 `jquery 1.12.0`。把它的 MIT 字段当官方许可是有风险的 |
| `react-pageflip` | **不用** | 2021-04-18 最后发布；`"page-flip": "latest"` 未锁版本；**无 unmount 清理**；React 19 未验证 |
| `page-flip` (StPageFlip) | **继续用（已 vendored）** | MIT / Nodlik 2020；但**冻结版本（2.0.7）、隔离在适配器后**，见 §4.4 |
| `quick_flipbook` | **暂不引入** | BSD-2-Clause 可用（需保留 NOTICE），但只在决定走真 3D 网格几何时才需要；与现有 2D 翻页互斥，属 M3 之后的可选项 |
| `@react-three/fiber` / `@react-three/drei` | **暂不引入** | 二者 MIT 且支持 React 19，但本项目 `three@^0.185.1` 只服务银河模式；Book Reader **不需要** 3D 几何，引入即违反"不引入不必要依赖" |
| 纯 CSS 3D transform 自研 | **作为 lite 降级，不作为等价替代** | 只能平面 `rotateY`，做不出弯页；`lite` 档接受视觉简化 |

> **净结果：优化版需要引入的新依赖数量 = 0。**

### 2.4 阅读器 UX 参考（原方案未提，但比 §2.1/§2.2 更有实际价值）

| 项目 | 许可 / 体量 | 值得借鉴的点 |
|---|---|---|
| [PhotoSwipe](https://github.com/dimsemenov/PhotoSwipe) | MIT · 25,256★ · 2025-12 活跃 | **手势模型、从缩略图缩放变形（zoom-from-thumbnail）、图片预载与尺寸推导** —— 直接对应本项目 `PhotoViewer` 的精修方向 |
| [yet-another-react-lightbox](https://github.com/igordanchenko/yet-another-react-lightbox) | MIT · 1,313★ · **仅 2 个 open issue** · `peerDependencies.react` 含 `^19` · 自报 `bundleSize: 10.6 kB` | **插件化架构（thumbnails / zoom / captions）、a11y、CSS 变量主题** —— 是"轻量 + 可组合"的正面样板 |
| [photoview](https://github.com/photoview/photoview) | **AGPL-3.0** · 6,525★ | 时间线/相册浏览与缩略图管线思路可看，**但 AGPL 是 copyleft，禁止抄代码进本项目** |

> 注意：本项目**已有** `components/album/PhotoViewer.tsx` 与 `components/album/PhotoMorphViewer.tsx`。
> 因此 §2.4 的定位是**精修参考，不是替换**（原方案 §19 把 Photo Viewer 当作"待建"是审计不足）。

---

## 3. 架构决策（对原方案的关键修正）

### 3.1 三维度正交模型（取代原方案的"3D Book = 形态，Pixel/Galaxy = 主题"）

```text
维度 A · 模式 (mode)     ← 顶层入口，各有自己的数据源/权限/容器/顶栏
  ├─ book   「画册」  /api/travel-book   无锁       → Travel Book（本次重构主体）
  ├─ pixel  「像素」  /api/album         有锁       → 拍立得墙 + 留言 + 星图（保留原样）
  └─ space  「银河」  /api/album         有锁       → Three.js 沉浸场景（保留原样）

维度 B · 版式主题 (theme) ← 只作用于 book 模式内部的页面皮肤
  ├─ editorial  默认 · 现代旅行摄影画册
  ├─ film       胶片 / 接触印相 / 日期戳
  └─ memory     日记 / 票根 / 克制的手写感

维度 C · 性能档 (tier)    ← 与 A/B 都正交，由设备能力 + 用户偏好决定
  ├─ standard   默认（Web / 中高端移动）
  ├─ lite       低端（禁重阴影、缩短翻页时长、降像素比）
  └─ reduced    禁动效（prefers-reduced-motion 强制）
```

**为什么必须这样分：** `pixel`/`space` 承载的是**独立功能与独立权限**（§坑 4），
把它们塞进 `theme` 会丢功能；而 `editorial/film/memory` 只改版式，放进 `mode` 会变成 3 份重复的阅读器。

### 3.2 路由：不新增，只做兼容

| 路由 | 处置 |
|---|---|
| `/album` | **保留**（唯一入口）。`?book=<bookKey>` 深链保留 |
| `/album?book=<bookKey>` | **保留契约**，继续由 `lib/album-deep-link.ts` + 单测守护 |
| `/albums` | **保留**现有 `redirect('/album')`，不改成画册书架 |
| `/albums/:albumId/read` | **不新增**。画册阅读仍走 `/album?book=` 的应用内视图切换（保持 `BookReader` 的全屏 overlay 语义，移动端返回手势与壳层行为已调好） |

> 原方案 §24 的三条新路由在**本项目里是负收益**：会破坏已有深链单测、
> 与 `/albums` 的 redirect 冲突、并让移动端静态导出的页面数量再增。

### 3.3 `/api/album` 与 `/api/travel-book` 的边界（写死，不许混）

```text
/api/album        受纪念日锁保护   → 只服务 pixel / space 模式（私密照片墙）
/api/travel-book  刻意不加锁       → 只服务 book 模式（公开/归属范围内的旅行故事）
```

**重构期间严禁**为了"统一"把两者合并或互换数据源。若要改，必须先改 §5 契约清单并单独评审。

---

## 4. 优化版技术方案

### 4.1 数据层：先补缺口，再谈页面模型

**目标：把"客户端测量"变成"服务端已知"。** 这是解开坑 6 与坑 7 的**唯一前提**。

#### 4.1.1 补齐 `width/height`（P0，必须最先做）

| 来源 | 现状 | 动作 |
|---|---|---|
| `Media`（Travel / Memory 路径） | `Media.width/height` 字段存在，但可能为 null（既有数据） | 上传时**已经**用 sharp 解析过元数据（`lib/infrastructure/media-variants.ts` 的 `generateMediaVariants` 内 `image.metadata()`）→ **把该结果回写** `Media.width/height`；存量跑一次 backfill 脚本（可参照 `scripts/backfill-media-variants.cjs` 的形状） |
| Post 城市画册路径 | `travel-book.service.ts:240-241` 恒 `width: null, height: null` | 该路径没有 `Media` 行（只有 URL）。改为**按需读一次本地原图的 sharp metadata** 并写入现有 `LOCAL_URL_CACHE` 同款 LRU；**读不到时填 `aspect: 1` 作为安全缺省**（而不是留 null 让客户端去测） |

> ⚠️ **不改 Prisma schema**（`Media.width/height` 已存在）。原方案 §23「优先不修改数据库」保留。
>
> ⚠️ **`MediaVariant` 表也有可空的 `width/height`**，但变体是等比缩放，**取原图 aspect 即可**，
> 因此**不需要**为变体单独补数据——只要把原图 `Media.width/height` 补齐。

#### 4.1.2 单本查询从 O(全库) 降到 O(1)

新增 `getTravelBookByKey` 的**直接实现**，不再复用 `listTravelBooks()`：

```text
bookKey 形态：
  travel:<id>   → prisma.travel.findFirst({ where: { id, ...scopedWhere } , include: days→itinerary/memories→media+variant })
  city:<name>   → postService 按 location 过滤该城市，只拉命中的 posts（不再全量 + 后过滤）
```

- 保留旧函数供摘要列表使用；**两者共用同一套 `toPhoto()` / 章节映射**，避免口径漂移。
- 现有 `tests/unit/travel-book.service.test.ts` 的 7 个用例**必须继续通过**（它们锁的是聚合口径，不是实现）。

#### 4.1.3 三级缓存

| 层 | 内容 | 失效 |
|---|---|---|
| L1 进程内 LRU | 单本 `Book`（含 pages） | 该 travel/post 有写操作时按 key 清 |
| L2 `applyCacheControl` | 现有 `lib/http-cache.ts` 的 `'user'` 档 | 已有机制，沿用 |
| L3 客户端 `sessionStorage` | 最近 N 本的 `BookPage[]`（**不是**原图） | 会话结束 |

### 4.2 页面模型：`BookPage` + `Spread` 双层（修正原方案 §12）

```ts
// lib/modules/album/book/types.ts

/** 照片的最小必要信息：宽高比必须在服务端就有（§4.1.1） */
export interface BookPhotoRef {
  mediaId: number
  thumbnailUrl: string | null
  previewUrl: string | null
  blurUrl: string | null
  fullUrl: string | null
  /** 宽高比，服务端保证非 null（无法解析时填 1 作为安全缺省） */
  aspect: number
  takenAt: string | null
  locationName: string | null
}

export type BookPageType =
  | 'COVER' | 'OPENING' | 'DAY_OPENING'
  | 'FULL_BLEED' | 'PHOTO_CAPTION' | 'PHOTO_PAIR' | 'COLLAGE'
  | 'TIMELINE' | 'TEXT' | 'INDEX' | 'ENDING'

export interface BookPage {
  id: string
  type: BookPageType
  /** 章（TravelDay）归属，用于 folio / 章节跳转 */
  dayIndex: number | null
  title?: string
  subtitle?: string
  caption?: string
  body?: string
  locationName?: string
  takenAt?: string
  /** 本页承载的照片（FULL_BLEED=1, PHOTO_PAIR=2, COLLAGE=2..4, INDEX=n） */
  photos: BookPhotoRef[]
  /** 版式提示：主题可读，但不得改变分页结果 */
  layout?: { variant?: string; emphasis?: 'peak' | 'pause' | 'echo' }
}

/** 翻页单位（对开）：由 composer 决定，不由渲染器手工凑 blank 配平 */
export interface BookSpread {
  id: string
  /** 左页可为 null（封面/章首等"右页起排"场景） */
  left: BookPage | null
  right: BookPage
  /** 全书连续页码（1-based），用于 PageIndicator */
  pageNumber: number
}

export interface Book {
  bookKey: string
  title: string
  // ... 现有封面/统计字段沿用
  pages: BookPage[]
  spreads: BookSpread[]
  /** 附录：未入选正册的照片（见 §4.3 覆盖率兜底） */
  index: BookPhotoRef[]
}
```

**硬约束（写进测试）：**
1. `spreads` 由 `pages` 经**纯函数** `paginate(pages, mode)` 生成；`mode ∈ {'single','dual'}`。
2. `buildPages` **不得**读取任何"测量后才有"的运行时状态 → 从结构上消灭坑 6 的触发条件。
3. `PHOTO_PAIR` / `COLLAGE` 的左右配平由 `paginate` 负责，页面模板**不再感知**奇偶。

### 4.3 Book Composer：确定性排版 + 可测的"质量 > 数量"

`lib/modules/album/book/composer.ts`，**纯函数、零 DOM、零 IO**：

```ts
interface ComposerInput {
  photos: BookPhotoRef[]          // 已按时间排序
  days: { index: number; title: string | null; date: string | null
          summary: string | null; itinerary: string[]; memories: {...}[] }[]
  target: { maxPages: number }    // 默认 40；超出走附录
}

composeBook(input): { pages: BookPage[]; index: BookPhotoRef[] }
```

**照片入选打分（只用现有字段，无 AI）：**

```text
score(p) = w1 · 分辨率权重(p.aspect, p.longEdge)
         + w2 · 稀有性(该 aspect 在该 day 内的占比越低越高)      // 避免整册全是同一构图
         + w3 · 邻近性(|takenAt - day.date| 越小越高)
         + w4 · 有地点(hasLocation)
         + w5 · 有回忆绑定(photo 被 Memory 引用)
         - w6 · 与已入选的近重复(同 takenAt 分钟内 / 同 hash)
```

**节奏（原方案 §14，保留并落成规则）：**

```text
COVER → OPENING → ┌ 每个 day：DAY_OPENING → (PAUSE 1 张) → (PEAK 1 张 FULL_BLEED/COLLAGE)
                  │            → (ECHO 1..2 张 PHOTO_CAPTION/PAIR) ┐
                  └─────────────────────────────────────────────┘ × N days
       → TIMELINE → ENDING → INDEX（仅当有未入选照片）
```

**覆盖率兜底（关键设计）：** 未入选照片 **不塞进正册**，而是进 `INDEX` 附录页
（`COLLAGE` 密集小图，点击可进 `PhotoViewer`）。这样"照片一张没丢"与"画册节奏不被稀释"**同时成立**。

**可测性：** 上述全部逻辑进 `tests/unit/book-composer.test.ts`，覆盖原方案 §39 的 0/1/2/3/10/100+、
横/竖/方、有/无 caption、有/无 location、有/无 TravelDay —— **且不需要浏览器**。

### 4.4 运行时适配层：把 page-flip 关进笼子

```ts
// components/album/reader/runtime/types.ts
export interface BookRuntime {
  /** 只调用一次；pages 之后不再变化（§4.2 硬约束 2） */
  mount(el: HTMLElement, spreads: BookSpread[], opts: RuntimeOptions): Promise<void>
  next(): void; prev(): void; goTo(spreadIndex: number): void
  on(event: 'change' | 'flipping', cb: (spreadIndex: number) => void): () => void
  destroy(): void
}
```

- **`PageFlipRuntime`**（首个实现）：封装现有 `ArtFlipBook` 的 `window.St.PageFlip` 逻辑，
  加 **TS 类型声明**（消除现有 `any`），**删除** `updateFromHtml` 路径。
- **`CssFlipRuntime`**（**仅作 lite 降级**，不作等价替代）：纯 CSS 3D `rotateY` + `pointer` 拖拽。
  供 `tier: 'lite'` / `prefers-reduced-motion` 使用。
  ⚠️ **必须接受视觉简化**：纯 CSS 做不出"拖拽跟随的弯页"（需要 clip-path 多边形数学或 WebGL 网格）。
  方案上写明"lite = 平面翻转"，**不允许**对外宣称等价。
- 选择策略：`tier` + 内核能力探测（`CSS.supports('transform-style','preserve-3d')`）→ 默认 `PageFlipRuntime`；
  `reduced` 档直接**取消翻页动画**（直切 + 淡入），而不是换成另一种动画。

**收益：** ① 消灭坑 3 的维护风险；② 消灭坑 6 的性能缺陷；③ 未来换库（`quick_flipbook` / R3F）＝ 换一个实现文件。

### 4.5 主题系统：不只是调色板（修正原方案 §27）

原方案 §27 说"每个主题只控制 background/paper/text/.../font，不能改变业务逻辑"——**正确，但不完整**：
只换 token 的话，`film` 与 `editorial` 会长得一样（都是同一套 `ArtPage` 版式换色）。

**优化版：主题 = `tokens` + `bodies` + `cover` 三元组，由注册表提供：**

```ts
// components/album/book/themes/index.ts
export interface BookTheme {
  key: 'editorial' | 'film' | 'memory'
  tokens: Record<`--book-${string}`, string>   // 注入为 CSS 变量，不写死在 globals.css
  bodies: Record<BookPageType, React.ComponentType<PageBodyProps>>
  cover: React.ComponentType<CoverProps>
}
```

- 允许主题**替换页面视觉组件**（这才是真的"主题"），但**不得**改变 `pages`/`spreads` 的数量与顺序。
- **硬约束：** 主题注册表通过 `React.lazy` 分包，`editorial` 内联、其余按需加载。
- **顺带解决坑 6 的副产品**：把 `.art-page*`（约 126 行）从 `app/globals.css`
  搬进 `components/album/book/themes/*.css`，并把硬编码色接到 `travel.*` token。**逐行搬迁，不改视觉。**

### 4.6 精修清单（原方案完全没写的部分）

| 类别 | 项 | 现状 / 目标 |
|---|---|---|
| **诚实性** | 服务端已知宽高比 | 消灭"图片加载后版式跳变"（§4.1.1） |
| | 变体就绪性 | `resolveLocalUrlVariants` 的预测 URL 可能 404 → 书页图**先探测变体存在**，否则用原图并在响应头给 `immutable`（已有 `middleware.ts` 支持） |
| **手感** | 翻页时长 | Web 760ms（现）→ **560ms**；`lite` 380ms；`reduced-motion` 直切 |
| | 书脊厚度 | 内页厚度随 `pages.length` **量化**（3 档），不要恒定 |
| | 封面/封底硬页 | 现有 `data-density="hard"`（`ArtFlipBook.tsx:178`）保留；补**环衬页**（endpaper）过渡 |
| | 拖拽阈值 | 现有 `swipeDistance: 24` 偏小 → 移动端 32，避免误触 |
| **图片** | 占位链 | `blurUrl` 已有 → 补 `decoding="async"` + `fetchpriority="high"`（**仅**封面与当前跨页）+ 邻页 `img.decode()` 离屏预热（MDN 明确推荐"照片相册"用 `decode()` 先解码再上屏） |
| | 优先级节制 | `fetchpriority` / `<link rel="preload">` **只给 LCP 图（封面/当前跨页）**，其余保持 `auto`/`low`（MDN 明确警告"excessive or incorrect prioritization can degrade performance"） |
| | 离屏跳过 | 渲染窗口外的占位节点用 `content-visibility: auto` + `contain-intrinsic-size`（避免布局抖动） |
| | 失败可见 | `onError` 当前静默 `setLoaded(true)` → 补**可见的失败占位**（不是空白纸） |
| | 布局稳定 | 每张照片给 `aspect-ratio`（服务端已知）→ **CLS = 0** |
| **无障碍** | 翻页后焦点 | 翻页后焦点应落到新跨页的可聚焦标题（现无） |
| | 页码播报 | 现有 `aria-live="polite"`（`BookReader.tsx:238`）保留，补"第 X 页，共 Y 页"完整语义 |
| | 键盘 | ←/→/空格/PgUp/PgDn/Esc 已有（`BookReader.tsx:142-168`）→ 补 `Home`/`End` |
| | 触控目标 | 底部翻页按钮移动端 ≥44px 命中区（全站已有规范） |
| **移动端** | 安全区 | `env(safe-area-inset-*)` 贯穿阅读器（现仅外层页面有） |
| | 视高 | 用 `100dvh`（已有）→ 补 iOS 工具栏收起时的 `ResizeObserver` 重排 |
| | 下拉刷新冲突 | 阅读器内 `overscroll-behavior: contain`，避免翻页手势触发 PTR |
| | 横向溢出 | `overflow-x: hidden` + 书页宽度 `min(92vw, …)`（已有）→ 补单测式 E2E 断言 |
| **工程** | 设计 token 门禁 | 复用 `scripts/check-design-tokens.mjs`，把 `.art-*` 搬迁后的硬编码纳入检查 |
| | 死代码 | 见 §8 |

---

## 5. 契约冻结清单（每阶段结束逐项回归）

以下 12 项在 Album 2.0 全过程中**不得破坏**：

| # | 契约 | 守护方式 |
|---|---|---|
| 1 | `/album` 是唯一入口；`/albums` 仍 redirect | 人工 + grep |
| 2 | `/album?book=<bookKey>` 深链可用 | `tests/unit/album-deep-link.test.ts` |
| 3 | `album_token` cookie 与 `verifyAlbumToken` 语义不变 | `tests/security/album-access.test.ts` |
| 4 | `/api/album` 未解锁仍 403；`/api/travel-book` 仍不加锁 | `tests/security/album-access.test.ts` |
| 5 | `bookKey` 稳定为 `travel:{id}` / `city:{城市名}` | `tests/unit/travel-book.service.test.ts` |
| 6 | 城市画册章节**升序**（DAY 01 = 第一天） | 同上 |
| 7 | 跨源去重（有内容的 Travel 覆盖同城 Post 册；空壳不覆盖） | 同上 |
| 8 | 画册摘要不含 `chapters` | 同上 |
| 9 | `scopedWhere` 归属/公开过滤不被绕过 | `tests/security/permissions.test.ts` |
| 10 | 页面**不直接访问 DB**，只走 service/repository | Code review |
| 11 | 移动端静态导出可用（`MOBILE_EXPORT=1` 构建通过、`www/album.html` 存在） | 构建脚本 |
| 12 | 删除相册/照片的**引用保护**不变（被引用只解绑不删文件） | `tests/unit/album-delete-cascade.test.ts` |

**Prisma schema：本次重构不改。** 若确需字段（当前评估：不需要），必须先停下来单独说明。

---

## 6. 性能预算与验收阈值

| 指标 | 现状（推断） | 目标 | 测量方式 |
|---|---|---|---|
| 打开一本 128 图画册的**整本重建次数** | **~128 次**（坑 6） | **≤1 次** | 打点 `runtime.mount` 调用计数，测试断言 ==1 |
| 翻页响应（点击→动画开始） | 未测 | **< 80ms** | `performance.mark` |
| 翻页动画时长 | 760ms | 560ms / lite 380ms | 常量 |
| 单本查询 DB 往返 | O(全库) | **O(1)** | 查询计数器单测 |
| 书页图首字节 | 未知 | **< 400ms**（同域 + 命中变体） | Playwright trace |
| 内存（翻完全书后） | 未知 | **不随页数线性增长** | 邻页窗口 = current ± 1 |
| CLS（画册内） | 有（宽高比缺失） | **0** | Playwright `layout-shift` |
| 首次可翻页（TTI） | 未知 | **< 1.5s**（4G，中端机） | Lighthouse mobile |

**渲染窗口（原方案 §20 保留并收紧）：** DOM 中最多保留 `current ± 1` 跨页；
其余用占位尺寸节点，不挂 `<img>`。

---

## 7. 阶段计划（4 个必做阶段 + 1 可选，取代原方案 9 阶段）

### P0 · 止血（半天，独立可发）
- 删除 `ArtFlipBook` 的 `updateFromHtml` 重建路径 → 改为 **mount 一次 + 只改 spread 索引**。
  （此时页面集合仍由 `buildPages` 生成，但**只生成一次**；`measured` 变为"仅用于日志/诊断"）
- `getTravelBookByKey` 改为直接查询（§4.1.2）。
- `onError` 可见失败占位。
- 门槛：`tsc` / `vitest` / 现有 19 用例全绿；手动翻一本 ≥100 图册本子，重构次数 == 1。

### M1 · 数据层与页面模型（2–3 天）
- 补齐 `width/height`（§4.1.1）+ backfill 脚本。
- 落地 `types.ts` / `composer.ts` / `paginate.ts`（§4.2/§4.3），**纯逻辑，无 UI**。
- `BookReader` 改为消费 `spreads`；删除手工 `blank` 配平。
- 新增 `tests/unit/book-composer.test.ts`（覆盖 §39 全部场景）+ `book-paginate.test.ts`。
- 门槛：`tsc` 0；新老单测全绿；**浏览器里用纯 DOM 就能渲染 Book**（原方案 Phase 2 的目标，此处达成）。

### M2 · 运行时适配层 + 阅读器重构（3–4 天）
- `runtime/types.ts` + `PageFlipRuntime`（含 TS 声明）+ `CssFlipRuntime`（lite/reduced）。
- `BookReader` 瘦身为"壳 + 顶栏 + 底栏 + 页码 + 章节跳转 + 邻页预取"。
- 邻页预取（`img.decode()`）、渲染窗口 `current ± 1`、`fetchpriority`。
- 门槛：§6 全部指标达标；Web + 移动真机（Android Chrome / iOS Safari）翻页无跳页、页码准确。

### M3 · 主题体系 + 精修（3–4 天）
- `themes/editorial`（默认，内联）、`themes/film`、`themes/memory`（`React.lazy` 分包）。
- `.art-page*` CSS 从 `globals.css` 逐行搬入主题目录，硬编码色接 `travel.*` token。
- §4.6 精修清单整体过一遍。
- 门槛：三主题切换不改变页数与顺序（单测断言）；`check-design-tokens` 通过；视觉回归截图。

### M4（可选，不属于本次） · 分享 / 导出 / 公开画册
- 原方案 Phase 8 的内容，**明确不在本次范围**。

> **与 9 阶段方案的对照：** 原 Phase 0（审计）= 本文档；原 Phase 1（Design System）
> 拆入 M3；原 Phase 2（Data Layer）= M1；原 Phase 3–5（3D/Web/Mobile）= M2；
> 原 Phase 6（Theme）= M3；原 Phase 7（Performance）= 贯穿 M1–M3 的门槛；
> 原 Phase 8 = M4 延后。

---

## 8. 死代码处置（先隔离，不删）

审计发现以下文件**当前无任何引用**，但原方案未提及。**本次不删**，只在 `docs/album/` 里登记，
等 Album 2.0 验收通过后单独一次删除提交（避免与功能改动混在一个 diff 里）。

| 文件 | 体量 | 判断 |
|---|---|---|
| `components/album/sketchbook/Sketchbook.tsx` + `sketchbook.css` + `spreads.ts` | ~30KB | 已被 `BookReader` 取代，无引用 |
| `components/album/PolaroidWall.tsx` | — | 无引用（像素模式现用 `DriftWall`） |
| `components/album/TravelArchiveView.tsx` | — | 仅被 `app/album/page.tsx` 像素分支引用，**保留** |
| `app/globals.css` 内 `.book-spine-*` / `.wood-shelf` / `.book-cover-3d` / `.pixel-book-container` / `.book-paper` / `.book-flip-next/prev` | — | 部分仍被像素模式使用，**需逐个核实后再动** |

> ⚠️ 原方案 §17"其余 Demo 删除"若照字面执行会误删仍在用的像素模式样式。**必须先核实引用。**

---

## 9. 每阶段门禁命令

```bash
npx tsc --noEmit                     # 必须 0 错
npx vitest run                       # 全量单测
npx next lint                        # 或 npx eslint
node scripts/check-design-tokens.mjs # 设计 token 门禁
npm run build                        # Web 构建
MOBILE_EXPORT=1 npm run build        # 移动端静态导出（每个里程碑至少一次）
npx playwright test                  # E2E（画册相关）
```

**第三方记录：** 新增 `docs/album/THIRD_PARTY_LICENSES.md`，本次实际内容仅两行主体：

| Project | Reused | License | Modified |
|---|---|---|---|
| `page-flip` (StPageFlip, Nodlik) | `public/vendor/page-flip.browser.js`（v2.0.7 等价产物，44,059B） | **MIT**, Copyright (c) 2020 Nodlik（`public/vendor/PAGE-FLIP-LICENSE`） | 否（原样 vendored） |
| `HaichaoLihc/create-photo-flipbook-ui` | **无代码复用**，仅 UX/节奏设计参考 | 仓库 MIT（© 2026 Haichao Li），但 README **明确排除** `ui-collections/3d-book-1/`；该目录**无 LICENSE**，其上游 `wass08/r3f-animated-book-slider-final` **无任何许可** | — |
| `imgly/starterkit-photobook-ui-react-web` | **不采用** | LICENSE 文件 MIT（© 2025 IMG.LY GmbH），但 README 声明"under the CE.SDK license terms"；CE.SDK 为订阅制商业授权 + hostname 锁定 + 30 天试用，npm 包 `"SEE LICENSE IN LICENSE.md"` | — |
| `turn.js`（官方 v4） | **不采用** | **商业许可**（禁止以开源许可再分发）；仓库 LICENSE = `NOASSERTION` | — |
| npm `turn.js` 1.0.5 | **不采用** | 元数据 MIT 但为**第三方 repackage**，非官方 | — |
| `react-pageflip` | **不采用** | MIT，但 2021 停更 + 未锁依赖 + 无 unmount 清理 | — |
| `quick_flipbook` | **暂不采用**（若未来采用需保留 NOTICE） | **BSD-2-Clause**（Bandinopla） | — |
| `three`（已在依赖内） | 银河模式既有使用 | **MIT**, © 2010-2026 three.js authors | 否 |
| `PhotoSwipe` / `yet-another-react-lightbox` | **仅精修参考，无代码复制** | 均 MIT | — |
| `photoview` | **不采用** | **AGPL-3.0**（copyleft，禁止抄入本项目） | — |

---

## 10. 最终结论

**原方案的产品判断（Album = Travel Book）成立，架构判断不成立。**

要执行的不是"引入 3D Runtime 重写相册"，而是：

```text
P0  堵住唯一致命性能缺陷（整本重建 ×N）
 ↓
M1  把「数据缺口 + 页面模型」补齐，让排版变成可单测的纯函数
 ↓
M2  把 page-flip 关进适配器，阅读器瘦身，性能指标可测
 ↓
M3  主题变成「tokens + bodies」三元组，Art Mode 样式出全局 CSS
```

**净收益：0 个新依赖 · 0 次 schema 变更 · 0 个路由破坏 · 4 个必做阶段（原 9 个）·
12 项契约全程冻结 · 性能从"每张照片重建整本书"变为"整本书只挂载一次"。**

---

## 11. 本文档所用外部证据

所有外部事实均来自本轮实际拉取的 registry / 仓库 API / raw 文件，主要来源：

- `create-photo-flipbook-ui`：[仓库 API](https://api.github.com/repos/HaichaoLihc/create-photo-flipbook-ui)、
  [README](https://github.com/HaichaoLihc/create-photo-flipbook-ui)、
  [SKILL.md](https://raw.githubusercontent.com/HaichaoLihc/create-photo-flipbook-ui/HEAD/skills/create-photo-flipbook-ui/SKILL.md)、
  [LICENSE](https://raw.githubusercontent.com/HaichaoLihc/create-photo-flipbook-ui/HEAD/LICENSE)、
  [tree](https://api.github.com/repos/HaichaoLihc/create-photo-flipbook-ui/git/trees/HEAD?recursive=1)
- 其 3D 目录的上游：[wass08/r3f-animated-book-slider-final](https://api.github.com/repos/wass08/r3f-animated-book-slider-final)（`license: null`）
- `imgly/starterkit-photobook-ui-react-web`：
  [LICENSE](https://raw.githubusercontent.com/imgly/starterkit-photobook-ui-react-web/HEAD/LICENSE)、
  [README](https://raw.githubusercontent.com/imgly/starterkit-photobook-ui-react-web/HEAD/README.md)、
  [package.json](https://raw.githubusercontent.com/imgly/starterkit-photobook-ui-react-web/HEAD/package.json)
- CE.SDK 许可：[`@cesdk/cesdk-js` registry](https://registry.npmjs.org/@cesdk%2Fcesdk-js/latest)、
  [LICENSE.md](https://cdn.jsdelivr.net/npm/@cesdk/cesdk-js@1.82.0/LICENSE.md)、
  [IMG.LY licensing docs](https://raw.githubusercontent.com/imgly/agent-skills/main/plugins/cesdk/skills/docs-nextjs/licensing.md)
- `page-flip` / `react-pageflip`：[registry](https://registry.npmjs.org/page-flip)、
  [react-pageflip latest](https://registry.npmjs.org/react-pageflip/latest)、
  [StPageFlip](https://api.github.com/repos/Nodlik/StPageFlip)、
  [react-pageflip](https://api.github.com/repos/Nodlik/react-pageflip)、
  [`HTMLFlipBook` 源码](https://raw.githubusercontent.com/Nodlik/react-pageflip/master/src/html-flip-book/index.tsx)、
  [issue #14 懒加载](https://github.com/Nodlik/react-pageflip/issues/14)、
  [issue #24 重渲染](https://github.com/Nodlik/react-pageflip/issues/24)、
  [issue #54 动态页无动画](https://github.com/Nodlik/react-pageflip/issues/54)、
  [issue #20 Next.js](https://github.com/Nodlik/react-pageflip/issues/20)
- 候选替代：[quick_flipbook](https://registry.npmjs.org/quick_flipbook/latest)、
  [turn.js registry](https://registry.npmjs.org/turn.js/latest)、
  [turn.js 许可协议](http://turnjs.com/docs/index.php?title=Turn.js_4th_release_license_agreement)、
  [blasten/turn.js](https://api.github.com/repos/blasten/turn.js)、
  [react-flip-page](https://registry.npmjs.org/react-flip-page/latest)、
  [@react-three/fiber](https://registry.npmjs.org/@react-three/fiber/latest)、
  [@react-three/drei](https://registry.npmjs.org/@react-three/drei/latest)
- 许可事实：[three@0.185.1](https://registry.npmjs.org/three/0.185.1)、
  [three.js LICENSE](https://raw.githubusercontent.com/mrdoob/three.js/dev/LICENSE)
- 阅读器 UX 参考：[PhotoSwipe](https://github.com/dimsemenov/PhotoSwipe)、
  [yet-another-react-lightbox](https://github.com/igordanchenko/yet-another-react-lightbox)、
  [photoview](https://github.com/photoview/photoview)
- 图片加载最佳实践（MDN）：[`fetchpriority`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/fetchpriority)、
  [`<link rel=preload>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/link)、
  [`HTMLImageElement.decode()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode)、
  [`content-visibility`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility)

**未能核实（已标注，不作为决策依据）：** CE.SDK 实际报价（`img.ly/pricing` 为 JS 渲染）；
`@cesdk` 运行时可执行体积；`react-pageflip` 在 React 19 下的实际表现；
StPageFlip 在 React StrictMode 双挂载下的具体故障复现（上游无该 issue 记录，本项目也未复现）。
