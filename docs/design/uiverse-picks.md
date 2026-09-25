# Uiverse 模式来源与致谢（M5）

> 本文记录 M5《移动端 UI 精修方案》中，每个组件参考了 Uiverse 的哪一类设计语言、
> 以及**刻意没有采用**的部分。用于评审追溯与开源致谢。
>
> Uiverse 授权：**MIT**（[LICENSE 原文](https://raw.githubusercontent.com/uiverse-io/galaxy/main/LICENSE)），
> 允许使用、修改、分发，**不强制署名**；官方表示"deeply value and appreciate attribution"。
> 本项目**未复制任何 Uiverse 源码**，仅提取交互/质感模式后用 `--m-*` token 重写，
> 因此无署名义务 —— 本文件为主动致谢。

---

## 1. 实际核对过的原始文件（一手证据）

| 文件 | 作者 | 核对结论 |
|---|---|---|
| [`Patterns/vnuny_tough-dog-52.html`](https://github.com/uiverse-io/galaxy/blob/main/Patterns/vnuny_tough-dog-52.html) | vnuny | 颜色写死（`#e5e5f7` / `#ffb5b58a`）、`repeating-*-gradient` 直接内联 |
| [`Tooltips/G4b413l_dry-turtle-84.html`](https://github.com/uiverse-io/galaxy/blob/main/Tooltips/G4b413l_dry-turtle-84.html) | G4b413l | 颜色写死（`#282828`）、交互**只有 `:hover`**（触屏无效）、无 a11y |

两个样本一致印证了方案 §0 的判断：**单主题 + 硬编码色 + 只有 hover**。
（每个文件头部都带 `/* From Uiverse.io by <作者> - Tags: ... */`，署名信息可直接提取。）

---

## 2. 采用的模式（分类 → 本项目落点）

| Uiverse 分类 | 采用的设计语言 | 本项目实现 | 重写要点 |
|---|---|---|---|
| [Buttons](https://uiverse.io/buttons) | 顶部 1px 内高光 + 底部内阴影构成的"实体压印感"；按压回落 | `components/mobile/Button.tsx` | 去掉所有 hover 与渐变；内高光改为 `--m-inset-hi/lo`；按压 0.97 + light 触觉；颜色走 `--m-cta-bg` 以过 WCAG AA |
| [Inputs](https://uiverse.io/inputs) / [Forms](https://uiverse.io/forms) | 聚焦时描边扩散为光晕；错误态文字下移 | `components/mobile/Field.tsx` | 光晕改 `--m-ring`（3px `--m-accent-soft`）；label 与控件强关联；控件高 ≥48px |
| [Toggle-switches](https://uiverse.io/toggle-switches) | 轨道内阴影 + 滑块到位轻微过冲（jelly） | `components/mobile/Switch.tsx`（升级） | 过冲用 `--m-ease-spring`（`y=1.3`，位移 16px 下过冲约 1px，不会戳出轨道）；API 保持不变 |
| [Checkboxes](https://uiverse.io/checkboxes) | 勾线路径绘制（`stroke-dashoffset`）一次性动画 | `components/mobile/Checkbox.tsx` | 只在选中时播放一次；`prefers-reduced-motion` 下静止 |
| [Radio-buttons](https://uiverse.io/radio-buttons) | radio-card：整块可选 + 选中边线加粗 + 勾标入场 | `components/mobile/ChoiceCard.tsx` | 选中色改 `--m-accent` / `--m-accent-soft`；触达 ≥56px |
| [Notifications](https://uiverse.io/notifications) | 底部倒计时进度条 + 操作按钮 | `components/mobile/Toast.tsx`（升级） | 进度条用 `scaleX` 动画（`animationDuration` 由 duration 驱动）；色板改 `--m-*` |
| [loaders](https://uiverse.io/loaders) | 点脉冲 / 轨道环 / 波纹 三种结构 | `components/mobile/Loader.tsx` | 颜色只取 `currentColor` 与 `--m-accent`；**唯一允许无限动画**的场景，已全部纳入降级列表 |
| [Patterns](https://uiverse.io/patterns) | 纯 CSS 点阵 / 细网格底纹 | `--m-pattern-dot` / `--m-pattern-grid`（`app/mobile.css`） | 纹理色改 `--m-line-strong` / `--m-line`，随主题变化；0 图片请求 |
| [Cards](https://uiverse.io/cards) | 抬升分级 + 顶部高光边 | `--m-elev-1/2/3` + `m-card-raised` / `m-card-pressable` | 收敛为 3 档；桌面 hover 抬升改为移动端 press 内缩 |
| （Uiverse 无对应） | 底部 Tab 滑动胶囊 | 待 P1 实施 | — |

---

## 3. 刻意**不采用**的部分（及原因）

| Uiverse 常见做法 | 不采用的原因 |
|---|---|
| `:hover` 悬浮 / 抬升 / 揭示 | 移动端没有 hover；本项目改为 `:active` 按压反馈 |
| 霓虹 / 彩虹 / 大面积渐变 | 与暖陶土单一强调色体系冲突；规范限定彩色面积 ≤15%，且只放行 3 个受控渐变 token |
| 发光阴影（`box-shadow: 0 0 Npx <亮色>`） | "廉价感"的主要来源；本项目只用 3 档中性抬升 |
| 无限 `@keyframes`（呼吸、旋转光晕、波浪） | 规范 §7 禁止，**唯一例外是 loading** |
| 3D tilt / 视差跟随鼠标 | 无指针设备；且会引入 layout 抖动 |
| [Tooltips](https://uiverse.io/tooltips) 整个分类 | 移动端无 hover，无用例 |
| 直接复制组件源码 | 单主题 + 硬编码色 + 无 a11y；重写比"去硬编码"更便宜，且能进 token 体系 |

---

## 4. 若后续需要新增组件时的选型流程

1. 在 [uiverse.io](https://uiverse.io/) 对应分类里挑 3 个候选（可直接看效果）
2. 用 `--m-*` token 在 `/dev/ui/v4` 预览台 1:1 复刻（**不动线上组件**）
3. 对照规范检查：hover→press、渐变→token、无限动画→loading only、hex→token、触达 ≥44
4. 跑 `node scripts/check-design-tokens.mjs`（新增规则会拦住渐变/未定义变量/冷色/`!important`）
5. 通过后在组件 JSDoc 里注明参考的 Uiverse 分类与作者，并补进本文件
