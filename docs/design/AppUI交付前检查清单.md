# App UI 交付前检查清单（pro-rules 落地版）

> 来源：`ui-ux-pro-max` 技能的 `references/pro-rules.md`（**canonical，唯一权威版本**）。
> 本文件把该清单转成**本项目可执行**的形式：每条标注当前状态、对应实现位置、以及未做项的原因。
>
> 技能仓库：https://github.com/nextlevelbuilder/ui-ux-pro-max.git
> 本地克隆：`F:\CodeFiles\Learn-Workbench\.local\skills\ui-ux-pro-max-skill`（skill 在 `.claude/skills/ui-ux-pro-max/`）
>
> ⚠️ 注意：`C:\Users\yuan\.workbuddy-ai\plugins\...\ui-ux-pro-max-skill` 是**被裁剪过的 vendored 快照**
> （SKILL.md 10.9KB vs 正本 16.2KB，且没有 `references/`），不要以它为准。

## 位置与用法

```bash
# 正本目录（两个 reference 文件在这里，SKILL.md 要求交付前必读 pro-rules.md）
BASE="F:/CodeFiles/Learn-Workbench/.local/skills/ui-ux-pro-max-skill/.claude/skills/ui-ux-pro-max"

# 设计系统
python "$BASE/scripts/search.py" "<product> <industry> <keywords>" --design-system -p "<Project>"
# 单个关注点
python "$BASE/scripts/search.py" "<2-5 个词>" --domain ux|style|color|typography|icons|gsap|chart
# 技术栈
python "$BASE/scripts/search.py" "<keyword>" --stack nextjs|react|html-tailwind
```

**Python 3.9 兼容性**：正本 `design_system.py:443` 用了 3.12+ 才支持的 f-string 内反斜杠，
在 3.9 上会 `SyntaxError`；Windows 控制台为 GBK，输出 emoji 会 `UnicodeEncodeError`。
解法（不改动技能本体）：复制到临时目录后打补丁，并设 `PYTHONIOENCODING=utf-8`。

---

## 一、Accessibility（CRITICAL）

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 正文对比度 ≥4.5:1 | ✅ 已修 | v1.24.4：`--m-faint` 浅色 2.24:1→**4.53:1**、深色 3.29:1→**5.06:1**；`--m-success` 3.84:1→**4.94:1** |
| 装饰性图标对读屏隐藏 | ✅ 已有 | `components/mobile/Icon.tsx` —— 无 `label` 即 `aria-hidden="true"` |
| 图标控件要有可访问名称 | ✅ 已修 | v1.24.5：补 `CommentPanel` 关闭、`UserProfile` 返回等图标按钮 |
| 表单字段有 label | ✅ 已有 | `FieldShell` 统一渲染 label/`htmlFor` |
| 颜色不是唯一指示 | ✅ 已有 | 选中态同时用底色 + 描边 + 图标；状态用文字+色 |
| 焦点可见 | ✅ 已修 | v1.24.4：`.m-press`/`.m-pressable`/`.m-chip`/`.m-choice`/`.m-card-pressable`/`.m-action-item` 统一 `:focus-visible` |

## 二、Touch & Interaction（CRITICAL）

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 触达 ≥44pt(iOS) / ≥48dp(Android) | 🟡 部分 | 已修 `AddPhotoButton`、`CommentPanel`、`UserProfile`、4 个编辑器关闭按钮（新增 `.m-icon-btn` 统一 44×44）。**其余 `rounded-full p-2` 类关闭按钮仍为 ~36px，待续** |
| 按压反馈 80–150ms | ✅ 已有 | `.m-press:active` 100ms；`.m-pressable`/`.m-btn` 同档 |
| 按压不改变布局边界 | ✅ 已有 | 只用 `transform: scale()` + `filter`，不动 width/height |
| 禁用态清晰且不可交互 | ✅ 已修 | 统一 `cursor: not-allowed` + `opacity` |
| 手势冲突 | ✅ 已修 | v1.24.3：`SideDrawer` 去掉 `drag`（曾吞掉行内点击） |
| 拖动/滑动有按钮替代 | ✅ 已有 | 抽屉有 × 与遮罩关闭；滚轮有时间步进按钮 |

## 三、Light / Dark 对比（pro-rules 单列一节）

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 两个主题正文都 ≥4.5:1 | ✅ 已修 | 见上表；深浅两套 token 均已复算 |
| 分隔线在两个主题都可见 | ✅ 已有 | `--m-line` / `--m-line-strong` 双主题各自定义 |
| 交互状态两主题一致可辨 | ✅ 已有 | 按压/焦点/禁用均由 token 驱动，非单主题硬编码 |
| token 驱动、无按屏硬编码 hex | 🟡 持续 | 设计 token 门禁监控（基线下硬编码 hex 仍有存量，新增会被拦） |
| 遮罩足够隔离前景 | 🟡 待统一 | 弹层遮罩当前散布在 `bg-black/40`–`/70`，可用单一 token 收敛 |

## 四、Layout

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 安全区（刘海/手势条） | ✅ 已有 | `viewport-fit=cover` + `env(safe-area-inset-*)` |
| 内容不被固定栏遮挡 | ✅ 已有 | 底部 Dock 预留内边距 |
| 4/8dp 间距节奏 | ✅ 已有 | Tailwind 尺度 + `--m-space-*` |
| 断点自适应 | ✅ 已有 | 142 处断点使用，375/768/1024/1440 有覆盖 |

## 五、Animation

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 尊重 `prefers-reduced-motion` | ✅ 已有 | 中央降级列表（新增动画类必须登记，文件内已写明约定） |
| 不用无限动画做装饰 | ✅ 已有 | 仅 `Loader` / 骨架 shimmer；曾移除 FAB 呼吸光 |
| 时长分档而非一刀切 | ✅ 已有 | `--m-dur-*` + 弹簧曲线 |

## 六、加载与反馈

| 项 | 状态 | 说明 |
| --- | --- | --- |
| >300ms 有骨架/spinner | ✅ 已修 | v1.24.4 新增 `SkeletonList`（`SkeletonRows`/`SkeletonGrid`），评论列表已用 |
| 内容回来不跳高度 | ✅ 已修 | 骨架屏占位 + `.m-skeleton` |
| 错误就近显示 | ✅ 已有 | 表单错误在字段旁；`error` 状态就近渲染 |

---

## 已知未做项（诚实记录）

1. **部分关闭按钮触达仍为 ~36px**：`rounded-full p-2` 的写法还有若干处（多为弹层右上角关闭）。
   已提供 `.m-icon-btn`，继续替换即可；优先级低于功能缺陷故暂缓。
2. **弹层遮罩不透明度未收敛为单一 token**：当前 40–70% 混用。视觉上均能隔离前景，
   但不符合 pro-rules「scrim 要按实际背景度量」的精神，值得后续用 token 统一。
3. **未在真机验证 Dynamic Type / 最大字号下的布局**：pro-rules 要求测「largest system text size」，
   本项目尚无自动化手段覆盖，需要真机人工确认。
4. **未在横屏与平板尺寸实测**：代码层有断点覆盖，但没有设备级验证。
