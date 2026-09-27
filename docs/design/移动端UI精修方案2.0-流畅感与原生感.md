# 移动端 UI 精修方案 2.0 —— 流畅感与原生感

> **文档版本**: v1.0
> **日期**: 2026-09-27
> **范围**: 甜途移动端（Capacitor Android 壳 + 移动 Web）
> **前置**: `移动端UI优化-实施计划.md`（M1~M9）、`移动端UI精修方案-Uiverse模式移植.md`（M5）、`移动端设计规范.md` 均已落地
> **定位**: 静态观感层已经达标，本轮解决"**动态层 + 原生层**"——即用户说的"没有 iOS APP 那种流畅感美观感"
> **状态**: 待确认后实施

---

## 0. 结论速览

**评审结论**：经过 M1~M5 多轮建设，移动端的**静态设计系统已经过关**——token 体系完整（`--m-*`）、字阶收敛、44px 触达、双主题对比度校核、触觉反馈已接入、`check-design-tokens.mjs` 有脚本守护。这些**不需要再动**。

**"不够 iOS"的感觉来自六个动态差距**，按体感影响排序：

| # | 差距 | 现状证据 | iOS 对照 |
|---|---|---|---|
| 1 | **弹层没有手势、没有退场动画** | `BottomSheet` 把手是装饰（不能拖拽），`if (!open) return null` 关闭瞬间消失 | 跟手拖拽、速度判定甩出、退场弹簧 |
| 2 | **页面转场无方向** | `m-page-fade` 只有 opacity 渐入 | push 右滑入 / pop 左滑出，有空间层级 |
| 3 | **大标题不折叠** | `LargeTitle` 是静态块，滚走就没了 | 滚动时压缩成毛玻璃小标题栏 |
| 4 | **原生层未接管** | 无 `@capacitor/status-bar`；targetSdk 36（Android 15 强制 edge-to-edge）未审计；`theme-color` 写死不随暗色 | 状态栏与页面融为一体、随主题联动 |
| 5 | **按压无弹性** | `:active` scale 0.97，松手 `0.12s ease` 线性收回，全元素同一档 | 按下快、松手弹簧过冲；大卡片小按钮两档缩放 |
| 6 | **滚动细节露馅** | Android 12+ 拉伸 overscroll 未禁用；`viewport-fit=cover` 缺失导致 `env(safe-area-inset-*)` 大概率恒为 0 | 干净的滚动停止 + 真实安全区 |

**关键认知**：这六个差距里，**#1 和 #5 只需要改 2 个基础组件 + 几行 CSS，13 个使用方全部自动受益**。先做杠杆最大的，一两天内就能让整体"手感"上一个台阶。

**工作量估算**：P0 ≈ 2 天，P1 ≈ 4~5 天，P2 ≈ 2~3 天（打磨性质，可穿插）。

---

## 1. 评审：现状盘点

### 1.1 已达标（本轮不动）

- **Token 体系**：`--m-*` 前缀统一，双主题、抬升三级（L1/L2/L3）、受控渐变仅 3 个、图标 3 档 2 描边；有 checker 脚本强制。
- **组件库**：`components/mobile/` 已覆盖 Sheet/ActionSheet/Toast/Skeleton/PullToRefresh/SegmentedControl/Switch/EmptyState/LargeTitle/Pressable/Stagger/CountUp。
- **可访问性**：`--m-muted` 对比度修复（5.10:1）、`--m-on-accent` 事故修复、44px 触达下限（含 `m-btn-sm` 伪元素扩容的巧思）、`prefers-reduced-motion` 全量降级。
- **触觉反馈**：`lib/mobile/haptics.ts` 封装干净，Tab/按压/下拉/分段选择均有触点。
- **首屏动效**：Stagger 逐项入场仅移动端生效、骨架屏、下拉刷新已具备。

### 1.2 差距诊断（六条，附代码证据）

#### D1 · 弹层：无手势、无退场动画（体感最差的一处）

`components/mobile/BottomSheet.tsx:38`：

```tsx
if (!open) return null        // 关闭 = 瞬间消失，无任何退场动画
...
<span className="m-sheet-grabber" aria-hidden="true" />   // 把手纯装饰，拖不动
```

- 打开有 `m-sheet-up` 弹簧入场（不错），但**关闭是硬切**——iOS 的 sheet 关闭同样是弹簧，"有进没出"是典型的"网页弹窗感"。
- 把手（grabber）在 iOS 里是**可拖拽的**：按住把手上滑/下滑、速度够快直接甩出、到底部橡皮筋回弹。当前完全不做。
- `ActionSheet` 继承 `BottomSheet`，同样问题；全项目 **13 个文件**用到这两个组件（行程添加、相册、空间、碎碎念、登录、更新提示等），全部受影响。

#### D2 · 页面转场：只有 opacity，没有空间感

`app/mobile.css:443` 的 `m-page-fade` 只做 opacity（`MobilePageTransition.tsx` 注释解释了原因：页面内含 `position:fixed` 元素，translate 会弄乱 fixed 锚点）。

- 结果：无论"进入详情页"还是"返回列表页"，动画一模一样——**用户失去了"我在层级里走到哪"的空间线索**。iOS 的 push/pop 是最重要的心智模型。
- 此外转场时长 0.28s 偏长（iOS push 实测 ≈ 0.30~0.35s 但带位移，纯 fade 超过 0.2s 就显得"粘"）。

#### D3 · 大标题不折叠

`components/mobile/LargeTitle.tsx` 是静态块。iOS Large Title 的签名行为：**滚动时大标题淡出，顶部浮出一条毛玻璃 compact 栏（小标题居中）**。当前二级页往下滚后顶部空无一物，返回键也跟着滚走（`LargeTitle` 的返回键在文档流里，不是 fixed），这正是"网页感"的另一来源。

#### D4 · 原生层未接管（壳与页面"两张皮"）

- `package.json` 无 `@capacitor/status-bar`、无 `@capacitor/keyboard`；`MainActivity` 是裸 `BridgeActivity`，`styles.xml` 是 Capacitor 默认模板。
- `android/variables.gradle` **targetSdkVersion = 36**：Android 15 上系统强制 edge-to-edge，Capacitor 8 的 `adjustMarginsForEdgeToEdge`（默认 auto）会原生子栏补边——状态栏区域是原生色块还是内容延伸，**未审计过**，这与"毛玻璃头部延伸到状态栏底下"的 iOS 质感直接相关。
- `app/layout.tsx:25` `theme-color` 写死 `#FAF6EE`（且这个值已经和现在的 `--m-bg #FFFBF7` 不一致），不随暗色切换——暗色模式下状态栏仍是亮色。
- **`viewport-fit=cover` 缺失**（无 `export const viewport`，导出的 `www/index.html` meta 只有 `width=device-width, initial-scale=1`）：`mobile.css:117` 的 `--m-safe-top: max(20px, env(safe-area-inset-top))` 里的 `env()` 在多数场景恒为 0，安全区实际退化为固定 20px。

#### D5 · 按压无弹性

`app/mobile.css:464`：

```css
.m-pressable { transition: transform 0.12s ease, opacity 0.15s ease; }
.m-pressable:active { transform: scale(0.97); }
```

- 按下 0.12s 还行；**松手也是同一条 0.12s ease 线性收回**——iOS 松手是弹簧回弹（带轻微过冲 >1 再回落）。
- 全元素统一 0.97：大卡片按下去和 36px 小按钮按下去视觉位移量相同，大卡片显得"抖"，小按钮显得"钝"。iOS 的惯例是大元素缩更少（0.98+）、小元素缩更多（0.94~0.96）。

#### D6 · 滚动与渲染细节

- 全项目未设置 `overscroll-behavior`：Android 12+ 的**拉伸 overscroll 效果**（页面到顶继续拉会整体拉伸）与 iOS 行为差异明显，是"一眼安卓 WebView"的信号之一。
- `backdrop-filter: blur(18~22px) saturate(1.5)` 同时叠在 Tab 栏 + Sheet + 玻璃卡片多层，中低端 Android WebView 是掉帧大户（流畅感的隐性杀手）。
- `touch-action: manipulation` 只覆盖 `m-pressable`/`m-btn`，散落的 `<button>`/`<a>` 仍可能有 tap 高亮/延迟。

---

## 2. 方案总览

| 优先级 | 编号 | 事项 | 改动面 | 工作量 | 体感收益 |
|---|---|---|---|---|---|
| **P0** | A | 按压弹簧化（两档缩放 + 松手过冲） | 仅 `mobile.css` | 0.5 天 | ★★★★ |
| **P0** | B | BottomSheet 2.0：真手势 + 退场动画 | 仅 2 个基础组件，13 处自动受益 | 1 天 | ★★★★★ |
| **P0** | C | 滚动观感 + 全局细节（overscroll/touch-action/viewport-fit/theme-color） | `mobile.css` + `layout.tsx` | 0.5 天 | ★★★ |
| **P1** | E | 方向感知页面转场（push/pop 滑动） | `MobilePageTransition` + 少量页面适配 | 1.5 天 | ★★★★★ |
| **P1** | F | 大标题折叠 CollapsingHeader | 新组件 + 5 个 Tab 页接入 | 1.5 天 | ★★★★ |
| **P1** | G | 下拉刷新 iOS 化（纯 spinner 跟手） | 仅 `PullToRefresh` | 0.5 天 | ★★ |
| **P1** | H | 原生层接管：StatusBar/edge-to-edge/Keyboard | android 工程 + 壳配置 | 1 天 | ★★★★ |
| **P2** | I | 边缘右滑返回（详情页 opt-in） | 新 hook | 1 天 | ★★★ |
| **P2** | J | 图片渐进加载推广（blur-up/主色占位） | feed 卡片 | 1 天 | ★★ |
| **P2** | K | 性能审计：blur 层数/长列表/低端机 60fps | 审计为主 | 1 天 | ★★★ |

---

## 3. P0 —— 两天内可见效（改基础组件，全量生效）

### A. 按压弹簧化

CSS 语义：按下时用 `:active` 自己的快速 transition，**松手回落时用基类的弹簧曲线**（`--m-ease-spring` 的 cubic-bezier y 值 >1，回落到 1 时自然产生轻微过冲）。

```css
/* app/mobile.css —— 替换现有 .m-pressable */
.m-pressable {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  /* 松手相位：弹簧过冲回弹 */
  transition: transform 0.4s var(--m-ease-spring), opacity 0.15s ease;
}
.m-pressable:active {
  /* 按下相位：快进无弹跳 */
  transform: scale(0.96);
  transition: transform 0.1s ease-out, opacity 0.1s ease-out;
}

/* 两档缩放：大卡片缩得少、小控件缩得多（iOS 惯例） */
.m-press-soft:active  { transform: scale(0.985); }   /* 大卡片/列表行，配 .m-pressable 用 */
.m-press-deep:active  { transform: scale(0.94); }    /* 图标按钮/chip/tab */
```

同款处理应用到 `.m-btn`、`.m-action-item`、`.m-chip`、`.m-card-pressable`（各选合适档位）。

**验收**：真机上按住任一卡片松手，有"果冻感"一次回弹（非持续晃动）；reduce-motion 下维持现状直切。

### B. BottomSheet 2.0：真手势 + 退场动画

用已安装的 `motion@13`（`motion/react`）重写 `BottomSheet`，**对外 props 不变**，13 个使用方零改动：

```tsx
// components/mobile/BottomSheet.tsx（骨架）
import { AnimatePresence, motion, useDragControls } from 'motion/react'

export function BottomSheet({ open, onClose, title, children, className, dismissible = true }) {
  const dragControls = useDragControls()
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[95]">
          <motion.button
            aria-label="关闭面板" tabIndex={-1} onClick={() => dismissible && onClose()}
            className="m-sheet-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          />
          <motion.div
            role="dialog" aria-modal="true" aria-label={title || '底部面板'}
            className={cn('m-sheet', className)}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 42 }}
            drag="y"
            dragListener={false}                 // 关键：不从整个面板起拖
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.02, bottom: 0.6 }}   // 顶部橡皮筋、底部跟手
            onDragEnd={(_, info) => {
              // 位移过半 或 速度够快 → 甩出关闭（iOS 手感的关键）
              if (info.offset.y > 120 || info.velocity.y > 500) onClose()
            }}
          >
            <span
              className="m-sheet-grabber"
              onPointerDown={(e) => dragControls.start(e)}   // 只从把手/头部起拖
              aria-hidden="true"
            />
            {/* m-sheet-head 整块也绑 onPointerDown 起拖，标题栏可拖 */}
            <div className="m-sheet-body">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
```

要点：

1. `dragListener={false}` + 把手/头部 `dragControls.start()` —— **内容区滚动不受拖拽干扰**（这是与"整面板 drag="y""最本质的区别，不做这步会打断表单滚动）。
2. `AnimatePresence` 让退场从**当前位置**继续滑出（拖到一半松手也算数）。
3. 进阶（可后补）：backdrop 透明度跟随拖拽位移（`useTransform`），拖得越深背景越透。
4. `ActionSheet`/`SideDrawer`/`AppUpdatePrompt` 等基于它的组件自动获得全部行为；`SideDrawer`（右滑抽屉）同法加 `drag="x"`。

**验收**：把手上滑不关、下拉跟手、快速一甩直接关闭、拖一半松手回弹；背景点击关闭有 0.22s 淡出 + 面板滑出；表单类 sheet 内滚动正常。

### C. 滚动观感与全局细节

```css
/* app/mobile.css */
@media (max-width: 767px) {
  html, body {
    overscroll-behavior-y: none;   /* 禁 Android 12+ 拉伸 overscroll */
  }
  a, button, [role='button'] {
    touch-action: manipulation;    /* 全局消灭 tap 高亮/双击缩放延迟 */
  }
  nav, .m-title, .m-btn, .m-tab-label {
    user-select: none;
    -webkit-touch-callout: none;   /* 界面框架禁长按选中（内容区不受影响） */
  }
}
```

`app/layout.tsx` 补 viewport 导出 + theme-color 随主题：

```tsx
import type { Viewport } from 'next'
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',   // 让 env(safe-area-inset-*) 生效
}
```

并在**暗色切换处**（现有 html.dark 切换逻辑）同步更新 `theme-color` meta 为 `#100C0A` / `#FFFBF7`（各一行）。

**验收**：列表拉到顶继续下拉，页面不再整体拉伸；真机刘海屏/挖孔屏上顶部留白来自真实 inset 而非固定 20px；暗色下状态栏区域变暗。

---

## 4. P1 —— 核心体感（一周内）

### E. 方向感知页面转场（push/pop 滑动）

**分两步走，第一步不依赖任何新 API：**

**第 1 步（必做）**：把现在的单向 fade 升级为**方向感知的进入动画**。新增一个极小的导航方向上下文：

- `router.push()` 到更深路径（或路径深度增加）→ 标记 `push`；`router.back()` / 路径变浅 → 标记 `pop`；Tab 间平级切换 → 标记 `tab`。
- `MobilePageTransition` 按 标记 挂 `m-page-push` / `m-page-pop` / `m-page-fade`：

```css
/* push：新页从右侧 24% 滑入（同时轻微淡入），空间感即可建立 */
@keyframes m-push-in {
  from { opacity: 0; transform: translateX(24%); }
  to   { opacity: 1; transform: translateX(0); }
}
/* pop：新页（上一层）从左侧 -18% 滑回 */
@keyframes m-pop-in {
  from { opacity: 0; transform: translateX(-18%); }
  to   { opacity: 1; transform: translateX(0); }
}
.m-page-push { animation: m-push-in 0.3s cubic-bezier(0.22, 1, 0.36, 1) both; }
.m-page-pop  { animation: m-pop-in  0.3s cubic-bezier(0.22, 1, 0.36, 1) both; }
```

- 注：`MobilePageTransition` 现注释"translate 会弄乱 fixed 锚点"——只对**页面内** fixed 元素（FAB/Tab 栏）。解决方案：动画只包 `<main>` 内容，把 fixed 元素（MobileBottomNav 等）留在外面（`LayoutContent` 现有结构正好如此，Tab 栏已在 wrapper 外）；个别页面自带的 fixed FAB 在动画期间加 `will-change` 并接受 0.3s 内的跟随（真机验证，若跳动则该页退回 fade）。
- 旧页不动（无退出动画）也可接受——**方向性的进入动画已能建立 80% 的空间心智**，这是性价比最高的一步。

**第 2 步（spike，可选）**：启用 View Transitions API 获得真正的进+出双端动画。Android WebView 是 Chromium 内核（111+ 全支持），是本项目最理想的 VT 环境；Web 端 Chrome 同样支持、Safari/Firefox 自动降级为无动画：

- 优先尝试 Next 15 的 `experimental.viewTransition`（需验证当前 pinned 的 `react 19.0.0` 是否满足其 React 版本要求；不行则升级 React 小版本做 spike）。
- 备选：手动 `document.startViewTransition()` 包装 `router.push/back` + CSS `::view-transition-old/new(root)` 定义 push/pop 两套动画。
- 若 spike 顺利，第 1 步的 class 动画即被替换；不顺利则保留第 1 步成果，无沉没成本。

**验收**：进入详情页新页从右滑入、返回时从左滑回、Tab 间轻淡入；`/circle/[postId]`、`/travel/[slug]`、设置子页这三类高频路径真机过一遍；页面内 fixed FAB 无跳动。

### F. 大标题折叠 CollapsingHeader

新增 `components/mobile/CollapsingHeader.tsx`，组合现有 `LargeTitle`：

```
结构：
┌─ fixed 顶部 compact 栏（m-glass + 0.5px hairline），初始 opacity 0 / translateY(-8px)
│    collapsed 时浮出：小标题 + 返回键 + trailing
└─ 文档流中的 LargeTitle（现有样式不变）
```

- 折叠判定用 **IntersectionObserver**（在 LargeTitle 上方放一个 1px 哨兵元素，滚出视口 → collapsed），零 scroll 监听。
- compact 栏只动 `opacity/transform/backdrop`，纯合成层属性。
- 返回键移入 fixed 栏（常驻可用），文档流中的返回键保留但视觉淡出。
- 接入页：`/me`、`/circle`、`/travel`、`/timeline`、`/search`、设置子页——即现在所有用 `LargeTitle` 的页面。

**验收**：滚动时大标题平滑让位给毛玻璃小标题栏（iOS 设置页同款行为）；往下滚随时有返回键可点。

### G. 下拉刷新 iOS 化

现实现（`PullToRefresh.tsx`）功能正确，精修观感：

1. 去掉「下拉刷新/松开刷新」文字（iOS 无文案，纯图形）；
2. spinner **跟随拉动进度旋转**（`rotate = progress × 180deg`），过阈值后锁定 180°，松手 spring 收位 + medium 触觉（已有）；
3. 指示器位移改从 header 高度处出现（当前从 -48px 滑入，观感已接近，微调）；
4. 内容位移回弹改 `0.4s var(--m-ease-spring)`（当前松手瞬移）。

### H. 原生层接管（Android 壳）

1. **安装 `@capacitor/status-bar`**：启动时设透明背景 + overlay，`setStyle` 随 `html.dark` 联动（LIGHT/DARK 内容色）；与 C 项的 theme-color 同步逻辑共用一处。
2. **edge-to-edge 审计**（targetSdk 36，Android 12/14/15 三档真机）：
   - 确认 Capacitor 8 `adjustMarginsForEdgeToEdge` 当前实际表现（状态栏区域是原生色块还是内容延伸）；
   - 目标：禁用原生补边（`adjustMarginsForEdgeToEdge: 'disable'`），让内容延伸到状态栏下、由 Web 侧 `env(safe-area-inset-top)`（C 项已补 viewport-fit）负责避让——毛玻璃头部延伸到状态栏底下是"iOS 质感"的重要一环；
   - 若验证发现 WebView `env()` 支持不完整（部分 Chromium 版本在 WebView 中返回 0），则保留 auto 补边作为兜底，记录在本文档。
3. **安装 `@capacitor/keyboard`**：确认 resize 模式下 sheet 内输入不被遮挡；碎碎念/评论等底输入条用 `visualViewport` 高度做 `padding-bottom` 跟随。
4. Splash 主题（`Theme.SplashScreen`）背景色与 `--m-bg` 对齐，消除启动瞬间闪色。

**验收**：亮/暗两种主题下状态栏图标始终可读；头部玻璃延伸至状态栏；键盘弹出输入框可见；冷启动无闪色。

---

## 5. P2 —— 打磨（穿插进行）

### I. 边缘右滑返回

详情页 opt-in（`/travel/[slug]`、`/circle/[postId]`、设置子页）：左缘 24px 触发、跟手位移（`dx × 0.9`）、过阈值（>120px 或速度 >500）`router.back()`、不足弹簧回位。注意与横向轮播/地图手势的冲突白名单。Android 有系统返回兜底，此项是锦上添花，冲突页面宁可不做。

### J. 图片渐进加载

feed/相册卡片统一「主色占位 → 实图 crossfade」（`travel-book`/`sketchbook` 已有实现，抽成通用 `FadeImage` 推广）。可选 blur-up（服务端已有 sharp，可产出 16px 缩略图）。

### K. 性能审计（流畅感的隐性一半）

- `backdrop-filter` 并存层数审计：同屏 >2 层玻璃时，低端机考虑降 blur 半径或去掉 saturate；
- 长列表（旅行圈 feed、相册墙）滚动帧率：DevTools Performance 真机 trace，重点看 `m-list-item` 入场动画是否在滚动中重复触发（Stagger 已限定首挂载，验证确认）；
- 目标：中端机（如 Redmi Note 级别）滚动/转场稳定 60fps。

### L.（架构项，单独立项）Tab 状态保持

iOS 切 Tab 返回时列表位置与数据都在；当前每次切 Tab 重挂载 + 重拉。可结合离线层 SQLite 缓存做「Tab 内存级快照」，涉及架构改动，建议单独方案讨论，不并入本轮。

---

## 6. 实施顺序与验收

```
P0（A→B→C，~2天）—— 改完真机过一遍，体感即可明显升级
   ↓
P1（E→F→G→H，~4-5天）—— E/F 是"iOS 感"的主菜
   ↓
P2（I/J/K，穿插）
```

**真机验收清单**（Android 12 / 14 / 15 各一台 + 低端机一台）：

- [ ] 所有弹层：可拖拽关闭、快速甩动关闭、退场有动画、表单滚动正常
- [ ] 按压：卡片/按钮/Tab 松手弹簧回弹，reduce-motion 直切
- [ ] 转场：详情页 push 右滑入、返回 pop、Tab 轻淡入；页面内 FAB 不跳
- [ ] 大标题：滚动折叠出毛玻璃栏，返回键常驻
- [ ] 下拉刷新：纯 spinner 跟手旋转、弹簧收位
- [ ] 状态栏：亮/暗主题图标可读、玻璃延伸到状态栏、无启动闪色
- [ ] 滚动：无拉伸 overscroll、稳定 60fps
- [ ] Web 端（>768px）视觉零回归（screenshot diff）

**工程验收**：`tsc --noEmit` 0 错误；`npm test` 全绿；`SKIP_DB_ON_BUILD=1 next build` 通过；`build-mobile.cjs` 产出 `www/` + `cap sync` 正常；`check-design-tokens.mjs` 无新增违规。

---

## 7. 风险与兼容性

| 风险 | 评估 | 对策 |
|---|---|---|
| View Transitions 依赖 React/Next 实验特性 | 中（react 19.0.0 pinned，`experimental.viewTransition` 需验证） | 两步走：第 1 步纯 CSS 方向动画不依赖它；VT 作为 spike，成则升级替换 |
| Android WebView `env(safe-area-inset-*)` 支持不完整 | 中（历史版本返回 0） | `adjustMarginsForEdgeToEdge` auto 补边兜底；真机三档验证后定稿 |
| motion 拖拽与 sheet 内滚动冲突 | 高（不规避必出） | `dragListener={false}` + 把手/头部起拖（B 项已内置） |
| 页面 translate 转场影响 fixed 元素 | 中 | 转场只包 `<main>`；自带 fixed 的页面逐个验证，异常者退回 fade |
| blur 性能 | 中低端机 | K 项审计；必要时 blur 半径 18→12、去 saturate |
| 桌面端回归 | 低（全部变更在 `md:` 断点内或移动组件内部） | screenshot diff 兜底 |

---

## 8. 涉及文件清单

| 项 | 文件 |
|---|---|
| A/C | `app/mobile.css` |
| B | `components/mobile/BottomSheet.tsx`、`components/mobile/ActionSheet.tsx`、`components/mobile/SideDrawer.tsx`（连带受益：13 个使用方零改动） |
| C | `app/layout.tsx`（viewport/theme-color）、暗色切换处 |
| E | `components/mobile/MobilePageTransition.tsx`、新增 `lib/mobile/nav-direction.tsx`、`components/layout/LayoutContent.tsx` |
| F | 新增 `components/mobile/CollapsingHeader.tsx`、`app/mobile.css`；接入：`/me`、`/circle`、`/travel`、`/timeline`、`/search` 等现有 `LargeTitle` 使用方 |
| G | `components/mobile/PullToRefresh.tsx` |
| H | `package.json`（+status-bar/keyboard）、`capacitor.config.ts`、`android/`（styles/colors）、新增 `lib/mobile/status-bar.ts` |
| I | 新增 `hooks/useEdgeSwipeBack.ts`、详情页接入 |

---

## 9. 实施记录（2026-09-27，v1.17.0）

> P0/P1/P2-I 全部落地，P2-J 暂缓，P2-K 以静态审计完成。`tsc --noEmit` 0 错误、`vitest` 493 用例全绿、`SKIP_DB_ON_BUILD=1 next build` 通过、design-token checker 无新增违规；dev 冒烟（390×844 视口）验证：页面渲染正常、大标题折叠栏出现、SideDrawer/BottomSheet 开关含退场动画、Tab 转场在跑。

| 项 | 状态 | 落地内容 |
|---|---|---|
| P0-A 按压弹簧 | ✅ | `mobile.css`：`.m-pressable/.m-press/.m-card-pressable/.m-btn/.m-chip/.m-action-item/.m-seg-item/.m-choice` 统一两相位（按下 0.1s ease-out，松手 0.4s `--m-ease-spring` 过冲）；档位 0.96 / 0.985 / 0.94 |
| P0-B 弹层手势 | ✅ | `BottomSheet`：把手热区（`.m-sheet-grabber-zone`）+ 标题栏起拖，`dragListener=false` 内容滚动不受干扰；>120px 或 >500px/s 关闭；`AnimatePresence` 退场。`SideDrawer`：`drag="x"` 右滑关闭。CSS keyframes 移交 motion |
| P0-C 滚动细节 | ✅ | ≤767px：`overscroll-behavior-y:none`、全局 `touch-action:manipulation`、框架元素 `user-select:none`；`layout.tsx` 导出 `viewport`（viewport-fit=cover）；theme-color 随暗色实时同步（`ThemeColorSync`，MutationObserver） |
| P1-E 方向转场 | ✅ | `MobilePageTransition` 内置方向判定（深=push 右滑入 / 浅=pop 左滑回 / Tab 根互切=fade）；`LayoutContent` 把 fixed 的 Tab 栏移出转场容器；**动画播完即移除 class**（fill-mode both 留下的 transform 会成为 fixed 后代包含块） |
| P1-F 大标题折叠 | ✅ | `LargeTitle` 内置折叠（默认开）：IntersectionObserver 哨兵 + `.m-collapser` 毛玻璃栏（返回键 + 居中 16px 标题）；trailing 不复制（避免双实例状态漂移） |
| P1-G 下拉刷新 | ✅ | 纯 spinner 跟手旋转（进度×180°）、无文字、松手/完成弹簧收位 |
| P1-H 原生层 | ✅ | `@capacitor/status-bar@8.0.3`（图标/底色随主题，`lib/mobile/status-bar.ts`，吞错降级）+ `@capacitor/keyboard@8.0.5`（resize=native）；**edge-to-edge 深度改造（禁用原生补边改用 CSS env）留待真机验证后再做**，本轮仅接管颜色 |
| P2-I 边缘右滑返回 | ✅ | `EdgeSwipeBack` v1：左缘 24px 起手、右滑 >48px 触发整页+Tab 栏滑出（0.22s）→ `router.back()`；不做跟手位移（transform 常驻的包含块问题）；挂载 6 类二级页 |
| P2-J 图片渐进加载 | ⏸ 暂缓 | 需要服务端缩略图链路 + 视觉验收配合，单独立项更稳 |
| P2-K 性能审计 | ✅ 静态 | 结论：① 同屏 backdrop-filter 最多 2 层（Tab 栏 + 折叠栏/Sheet，不叠加时刻 ≤2），可接受但低端机留意；② `m-list-item`/`m-enter` 均 `animation-fill-mode: both`，动画结束后保留 `translateY(0)` transform——若未来把 fixed 元素放进 Stagger 子项会被锚点拖住，**约定：fixed 元素不得放进 Stagger/m-enter 子项**；③ 方向转场/折叠栏只动 transform/opacity 合成属性，符合 60fps 纪律 |

**遗留到真机验收**（无 Android 设备无法在本轮完成）：
1. 状态栏：亮/暗主题切换时图标可读性（`syncNativeStatusBar` 已就位）；
2. `env(safe-area-inset-*)` 在 targetSdk 36 + Capacitor 8 下的真实取值（决定是否做 edge-to-edge 深度改造）；
3. 键盘弹出时 sheet 内输入可见性（Keyboard 插件已装，config 已设 resize=native）；
4. 边缘右滑返回与横向轮播的实际冲突面（已留 `data-no-swipeback` 白名单）。
