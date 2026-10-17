## [未发布] - 2026-10-17

> 画册阅读器翻页体验优化（Album 2.0 reader pass）：修掉两个 P0 ——
> **开启系统「减弱动态效果」必白屏**、**低端机切换视觉档后整本书空白**。
> tsc 0 错误 · lint 0 error · vitest **58 文件 / 538 用例全绿** · build 成功 ·
> 画册 E2E **6/6 通过**。本轮**只提交，不发版/不打 OTA 包**。

### Fixed

- **系统「减弱动态效果」打开画册必白屏（P0）**
  视觉档 `reduced` 的语义是「直切」，其 `flippingTime = 0`；而 vendored 的
  `page-flip` 2.0.7 在 `getSettings()` 里对 `flippingTime <= 0` **直接抛
  `Invalid flipping time`**。构造失败即落到「翻页组件加载失败」兜底 —— 连
  「重新加载」也救不回来。`detectTier()` 在 `prefers-reduced-motion: reduce` 时
  **强制**返回 reduced，因此 iOS「减弱动态效果」用户全部打不开画册。

  修法：新增 `lib/modules/album/book/flip-runtime.ts` 收口「语义值 → 库可接受值」
  （`resolveFlippingTime(0) = 1ms`，一帧内走完，肉眼等同直切）。

- **低端机／切换视觉档后整本书空白（P0）**
  建实例的 effect 依赖里含视觉档派生的 `flippingTime` / `drawShadow`，而真实档位在
  挂载后才由 `detectTier()` 落定（低内存设备为 `lite`），effect 于是会在**同一个容器
  DOM** 上重跑。`page-flip` 的 `destroy()` 会连同整棵页元素 DOM 一起移除，
  React 却以为页元素还在容器里 —— 新实例 `loadFromHTML` 拿到 0 个页元素，画册空白。

  修法：容器 `key` 覆盖建实例 effect 的全部输入（mountKey / portrait / retryNonce），
  视觉档改为**运行时同步** `getSettings()` 活对象，切档位不再重建整本书
  （延续 M2「主题/档位不重建」契约）。

### Changed

- **翻页台面尺寸改实测**：`BookReader` 用 `ResizeObserver` 实测 `<main>` 内容盒高度，
  写 `--book-stage-h` 给 `.art-flip-rig` 反推书页宽度上限。原
  `calc(100dvh - 108px)` 在安全区/顶栏变化时会裁到书页（实测旧值已外溢 2px）；
  并为 `ArtFlipBook` 增加 `refresh()`，容器尺寸变化但不伴随 `window.resize` 时
  显式催一次重新测量。
- **移动端安全区**：画册顶栏 / 底栏补 `env(safe-area-inset-*)`，底栏「上一页 / 下一页」
  不再压在 Home Indicator 上。
- **首次翻开提示**：封面且未翻页时底栏显示一次「点击右半页 / 左右滑动」提示，
  翻过一页即收起；提示行高度常驻，不触发台面重算。
- **单页模式可用宽度**：`.art-flip-rig--single` 由 `92vw` 改为 `100%`（父级已有内边距），
  390px 视口下课页宽度 359px → 374px。

### 测试

- 新增 `tests/unit/book-flip-runtime.test.ts`（8 例）：锁定「任何档位的
  `flippingTime` 换算后恒 > 0」这条库契约，以及阴影档位换算。
- 新增 E2E `画册阅读器：系统「减弱动态效果」下仍是真书（不是加载失败兜底）`。
  **已双向验证**：把 `resolveFlippingTime` 临时还原为原样透传 0 后该例失败
  （`.art-flip-fallback` 出现），确认它是缺陷的真回归护栏，而不是恰好通过的断言。
- `tests/e2e/album-reader.spec.ts` 6/6 通过（原有 5 例不变）。

### 说明

- 遗留观察（本轮未改，建议单独排期）：桌面双页模式下一屏会同时出现 2 个对开，
  因为本项目把「一张 sheet = 一个对开」交给 `page-flip`，而库自身在 landscape
  下再 2-up 一次。要符合技能「一张跨页 = 一次翻页」的模型，需把交付给库的页集合
  改成单叶（`2N + 2` 张）并同步调整分页、章节直达与 E2E 页数断言。

---

## [1.24.6] - 2026-10-17

> 修复两个顽固缺陷：行程时间时区错乱、抽屉导航点不动（**均有实测证据**）。
> tsc 0 错误 · lint 0 error · vitest **57 文件 / 530 用例全绿** · build 成功。

### Fixed

- **行程时间全部错乱 / 选 17:00 变成次日 01:00（时区语义错误）**
  行程的「开始 / 结束」是**墙上时间**（行程表上写的 17:00），不是时间点。此前服务端用
  `d.setHours()` 按**服务器时区**（容器 `TZ=UTC`）写入，客户端用 `getHours()` 按**设备时区**
  （UTC+8）读回 —— 两边时区不一致就整体平移。这同时解释了「选下午5点到晚上9点，回头变成
  凌晨1点到5点」和「之前添加的行程时间全乱了」（每条都被平移了相同的量）。

  生产库实测证据：`id=6 东莞虎门公园 start=16:50Z end=20:30Z`；`id=7 湖南餐馆吃饭
  start=12:00Z end=02:00Z`（结束早于开始，不可能的时间段）。即库里的 UTC 字段恰好等于
  当初写入的墙上时间，只是读取时被加了 8 小时。

  修法：**写入与读取都用 UTC 字段承载墙上时间**（`Date.UTC(1970,0,1,h,m)` / `getUTC*`），
  与设备、服务器时区完全解耦：存 17:00，任何时区读出来都是 17:00。
  **历史数据自动修复** —— 库里那些 `16:50Z` / `20:30Z` 改用 UTC 读取后即正确显示。

- **抽屉里所有导航项点不动（`next/link` 在该 portal 子树内不生效）**
  这是连续三轮未修对的缺陷。这次用 Playwright 打开**真实静态壳**逐项验证才定位：

  | 场景 | 结果 |
  | --- | --- |
  | 正文 `<Link href="/moments">` | ✅ 跳转成功（2 个请求） |
  | 抽屉 `<Link href="/moments">` | ❌ 无跳转、**0 个请求**，且 `defaultPrevented=true` |
  | 抽屉普通 `<a href="/moments">` | ✅ 跳转成功 |
  | 抽屉 `href` 从 `/moments.html` 改回 `/moments` | ❌ 仍然不行（**不是 href 的问题**） |

  即：`next/link` 在抽屉这个 portal 子树里不工作，原生锚点完全正常。
  `DrawerRow` 的导航改用**原生 `<a>`** —— 抽屉是「点一下就离开」的场景，
  用一次整页加载换「确定可用」是划算的。

- **撤销 v1.24.3 的 `appHref`（补 `.html`）改动**：它基于「Capacitor `html5mode` 会把无扩展名
  路径回落首页」的推断，但实测证明客户端路由并不通过 HTTP 取文档，该推断对 `Link` 跳转不成立；
  而补 `.html` 会让路由表里没有的路径更不可能被正确处理。`lib/mobile/app-href.ts` 已删除。

### 测试

- 新增 `tests/unit/travel-itinerary-time-tz.test.ts`（5 例）：锁定「UTC 字段即墙上时间」，
  含 17:00 / 21:00 不得被平移成次日 01:00 / 05:00 的回归断言。
- 修正 `tests/unit/travel-detail-format.test.ts` 中一处**本身就依赖机器时区**的旧断言
  （它只在测试机时区恰好与构造时区一致时通过 —— 正是同一 bug 在测试里的同构形态）。

### 说明

- Playwright 实测：修复后点击抽屉「时间线」，URL 变为 `/timeline`，`changed=true`。
  这是三轮以来第一次**有可复现验证**地确认该缺陷已修复。

---

## [1.24.5] - 2026-10-16

> 改用 ui-ux-pro-max 的**正本**，按其 canonical `pro-rules.md` 清单逐条审计并修复。
> tsc 0 错误 · lint 0 error · vitest **56 文件 / 525 用例全绿** · build 成功。

### 重要更正：此前使用的是被裁剪的技能副本

仓库 `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git` 在本地是
`F:\CodeFiles\Learn-Workbench\.local\skills\ui-ux-pro-max-skill`（git clone，提交 `56ea9cf` / 2026-10-15），
**正本位于 `.claude/skills/ui-ux-pro-max/`**：

- `SKILL.md` **16,183 B**（之前用的 vendored 副本只有 10,947 B，少约 48%）
- 含 `references/quick-reference.md` 与 `references/pro-rules.md` —— `SKILL.md` 中**两次**明确要求
  「交付 App UI 前必读 `pro-rules.md` 并过一遍它的 canonical Pre-Delivery Checklist」
- 22 个技术栈（副本 12 个）、119 条 UX 规则（副本更少）

之前使用的 `C:\Users\yuan\.workbuddy-ai\plugins\...\ui-ux-pro-max-skill` 是**无 `.git` 的裁剪快照**。
因此上一轮虽修复了对比度等真实问题，但**未取得技能最核心的两份 reference**。本轮已改读正本。

### Fixed

- **图标控件缺少可访问名称**（canonical：*Icon controls have an accessible name*）：
  `CommentPanel` 关闭按钮（`<Icon icon={X}>` 无 `aria-label`）与 `UserProfile` 返回按钮
  （`<Icon icon={ArrowLeft}>` 无 `aria-label`）已补名称，并同时把命中区从约 28px / 36px 提升到 44×44。
- **Touch Target Minimum**（iOS ≥44pt、Android ≥48dp，且「图标本身小的时候要扩大命中区」）：
  关闭类按钮普遍写成 `rounded-full p-2`（约 36px），低于下限。新增设计系统类 **`.m-icon-btn`**
  （44×44 命中盒，含按压 / 焦点 / 禁用态，图标仍走 `<Icon>` 三档不变），
  已替换 `TravelInfoEditor` / `ItineraryEditor` / `MemoryComposer` / `TravelTimeline` 四处，
  并登记到 `prefers-reduced-motion` 降级列表（遵循该文件既有的维护约定）。

### Added

- **`docs/design/AppUI交付前检查清单.md`**：把 canonical `pro-rules.md` 的检查清单转成**本项目可执行**形式，
  每条标注状态（✅ 已修 / 🟡 部分 / 待续）、对应实现位置与未做原因；含本地路径与 Python 3.9 兼容说明，
  避免后续再次误用裁剪副本。

### 已审计达标、无需改动

装饰性图标对读屏隐藏（`Icon.tsx` 无 `label` 即 `aria-hidden="true"`，与 pro-rules 一致）·
按压反馈 100ms（要求在 80–150ms 内）· 按压只动 `transform`/`filter` 不改变布局边界 ·
两主题正文对比度均 ≥4.5:1 · 分隔线双主题可见 · 安全区 · 内容不被固定栏遮挡 · 断点覆盖 ·
`prefers-reduced-motion` · 骨架屏。

### 已知未做项

1. 仍有若干 `rounded-full p-2` 关闭按钮为约 36px（已提供 `.m-icon-btn`，继续替换即可）。
2. 弹层遮罩不透明度散布在 40–70%，未收敛为单一 token。
3. 未在真机验证 Dynamic Type / 最大字号下的布局（pro-rules 要求）。
4. 未在横屏与平板尺寸实测。

以上第 1–4 项均记录在 `docs/design/AppUI交付前检查清单.md` 的「已知未做项」。

---

## [1.24.4] - 2026-10-16

> 按 ui-ux-pro-max 技能系统性处理 UI/UX：对比度、cursor、焦点环、悬停反馈、骨架屏。
> tsc 0 错误 · lint 0 error · vitest **56 文件 / 525 用例全绿** · build 成功。

### 关于技能

技能脚本在 Python 3.9 下无法运行（`design_system.py:443` 用了 3.12+ 才支持的 f-string 内反斜杠），
且 Windows 控制台为 GBK，输出 emoji 会 `UnicodeEncodeError`。已将 `scripts/`、`data/` 复制到临时目录
打补丁后运行（**未改动下载的技能本体**），取得其设计系统建议与 UX 规则清单后逐条对照本项目审计。

技能对「旅行手账 / 照片日记」类产品的推荐是 **Claymorphism**（软 3D、厚边、双重阴影、16-24px 圆角、
soft press 200ms ease-out）—— 与本项目既有的暖陶土拟物质感一致，说明方向本就正确；
本轮是补齐它列为 CRITICAL 的欠账。

### Fixed

- **对比度（Accessibility CRITICAL · 4.5:1）**：实测 token 后确认 `--m-faint`
  （浅色 **2.24:1**、深色 **3.29:1**）与 `--m-success`（浅色 3.84:1）不达标。
  `--m-faint` 用在占位符、时间戳、说明文字等**真实内容**上（全站 65 处），不是装饰，必须达标。
  已调整（保持原暖褐色相）：`--m-faint` 浅色 `#B9A897 → #867060`（4.53:1）、
  深色 `#6E6259 → #8B8078`（5.06:1）；`--m-success` 浅色 `#3F8F62 → #2F7C52`（4.94:1）。
  这与项目既有做法一致（`--m-muted` 此前已因 3.36:1 不达标修过一次）。
- **可点元素的 `cursor`（Interaction CRITICAL）**：全站此前只有 12 处手写 `cursor-pointer`，
  设计系统的按压类一个都没声明 —— 桌面端鼠标移到按钮上是普通箭头，读起来像"不可点"。
  已为 `.m-press` / `.m-pressable` / `.m-btn` / `.m-chip` / `.m-choice` / `.m-card-pressable` /
  `.m-action-item` / `.m-seg-item` / `.m-tab` 统一补 `cursor: pointer`，禁用态 `not-allowed`。
- **焦点环（`focus-states`）**：为上述类补统一 `:focus-visible` 轮廓（键盘可达；鼠标点击不出现）。
- **悬停反馈（Cards: hover feedback）**：全站此前只有 4 处 `hover:shadow`。
  已统一 `.m-card-pressable:hover` 抬升一档（`--m-elev-2`），按钮与操作行补亮度/底色反馈；
  并用 `@media (hover: hover) and (pointer: fine)` 限定 —— 触摸设备没有真正悬停，
  不加限定会出现"点完还留着悬停态"的粘滞感。

### Added

- **`components/mobile/SkeletonList.tsx`**（`SkeletonRows` / `SkeletonGrid`），复用既有 `.m-skeleton`
  （含 shimmer，且已在 `prefers-reduced-motion` 降级列表内）。评论面板的「加载中…」空文本改为骨架屏 ——
  先给出结构、等待感更低，内容回来时也不会跳高度（对应技能 `content-jumping`）。

### 已审计通过、无需改动

无 emoji 图标（统一 lucide + `<Icon>`）· `prefers-reduced-motion` 已覆盖 · `viewport-fit=cover`
与安全区已处理 · 断点使用 142 处（375/768/1024/1440 均有覆盖）· 触达尺寸无 <44px 的可点元素 ·
z-index 层级已在 `BottomSheet` 注释中固化。

---

## [1.24.3] - 2026-10-16

> 第三轮真机反馈修复：抽屉跳转、时间滚轮取值、删除确认框、可达性补强。
> tsc 0 错误 · lint 0 error · vitest **56 文件 / 525 用例全绿** · build 成功。

### Fixed

- **抽屉项「点不动」的真根因**：读 Capacitor 安卓源码 `WebViewLocalServer.java:425` 确证 ——
  `if (path.equals("/") || (!lastPathSegment.contains(".") && html5mode)) return basePath + "/index.html"`，
  且 `CapConfig.java:36` 里 `html5mode` **默认 true**。本项目是**多页静态导出**（产物为
  `moments.html` / `timeline.html` 等带扩展名的文件），不是 SPA 单壳，所以 `/moments`、
  `/timeline`、`/dashboard`、`/me/favorites` 这些"末段不含点"的访问在原生壳里拿到的都是**首页**。
  新增 `lib/mobile/app-href.ts`：在原生壳里把路径补成真实存在的 `.html`（末段含点 → 跳过
  html5mode → 命中真实文件）；Web 端保持原路径。已核对 `www/` 下 13 个目标文件全部存在。
- **`SideDrawer` 彻底去掉 `drag`**：此前两版都保留 drag（先默认、后 `dragListener={false}`），
  抽屉内点击始终不可靠。抽屉本就有明确关闭方式（× 与点遮罩），横滑关闭不值得拿
  「行内点击可靠」去换。
- **时间滚轮「不管选什么都是 1 点到 5 点」**：第二版用 `Math.round(scrollTop / ITEM_H)`
  **推算**选中项，依赖"行高恰为 ITEM_H / spacer 恰为整数倍 / scroll-snap 吸附点恰在 i×ITEM_H"
  三个假设同时成立；真机上只要行高被字体、DPR 或安全区影响几像素就系统性偏移。
  第三版改为**直接测量**（各行 `offsetTop` 与容器中心比距离，与行高解耦），并**去掉 scroll-snap**
  （吸附会让停留位置与"用户以为选中的行"错位）、显式 `touch-action: pan-y`。
  另加保底输入：每行可直接点选 + 右侧 ▲▼ 步进按钮。
- **删除评论确认框**：此前 `window.confirm` 在 App 里是**安卓系统原生 alert**，与全站设计割裂；
  改为自绘弹层（图标 + 标题 + 说明 + 取消/删除）。
- **删除后数量不立即变化**：确认后**先从本地列表移除**（评论区标题与详情页评论数立即更新），
  再发请求，失败回滚；新增 `onCountChange` 回调，新发评论也会立即 +1。

### Changed

- **可达性补强（参考 ui-ux-pro-max 技能清单）**：技能脚本在 Python 3.9 下无法运行
  （`design_system.py` 用了 3.12+ 的 f-string 反斜杠语法），已改为直接按 `SKILL.md` 检查清单执行。
  · 为 `.m-press` / `.m-pressable` / `.m-btn` / `.m-chip` / `.m-choice` / `.m-card-pressable` /
  `.m-action-item` / `.m-seg-item` / `.m-tab` 统一补 `cursor: pointer`（禁用态 `not-allowed`）——
  此前设计系统的按压类一个都没声明，桌面端鼠标移上去是普通箭头。
  · 为上述类补统一 `:focus-visible` 焦点环（键盘可达性）。
  · 触达尺寸：`AddPhotoButton` 的关闭按钮 `h-9 w-9`（36px）→ `h-11 w-11`（44px，技能硬性下限）。

---

## [1.24.2] - 2026-10-15

> 第二轮真机反馈修复：抽屉点不动、时间滚轮回归、评论区体验、导出弹窗。
> tsc 0 错误 · lint 0 error · vitest **56 文件 / 525 用例全绿** · build 成功。

### Fixed

- **我的页面所有抽屉项点不动（真机严重）**：`SideDrawer` 面板用了 `drag="x"` 但没有
  `dragListener={false}`，整个面板都在监听拖拽 —— 手指点击时的微小抖动被识别成"正在拖动"，
  从而吞掉行内 `<Link>` 的点击。这正是「我的旅行 / 旅行画册 / 时间线 / 碎碎念 / 数据看板 /
  我的收藏 / 旅行圈点击都没有任何反应」的根因（`BottomSheet` 一直是 `dragListener={false}`
  + 专用把手，所以那边一直正常）。改为 `dragListener={false}` + `dragControls`，
  从标题栏起拖，保留横滑关闭手势。
- **时间选择改回滚轮（左小时 / 右分钟）**：第一版滚轮把 `onChange` 直接绑在 `onScroll` 上、
  且每次值变化都程序化改 `scrollTop`，构成反馈环（真机卡死/闪退）。这一版：① `onScroll` 只做
  140ms 防抖，**滚动停止后**才取值回写；② 程序化定位只在"与目标差 > 1px"时发生且期间屏蔽取值；
  ③ **内联在表单里**，不再是"抽屉里再开一层 BottomSheet"。
- **「确定后直接回到总览、时间没写入」**：根因是嵌套弹层互相干扰（关内层把外层也带走）。
  时间选择改为内联后只有一层 modal，且值在选择过程中实时回写，不会丢。
- **评论加载慢**：新增会话内缓存（按 postId），打开瞬间先用缓存渲染，同时后台
  stale-while-revalidate 拉最新 —— 不再每次点开都空白等待。

### Added

- **评论区升级为小红书 / 抖音 风格**：头像 36、昵称 +「我」标记 + 时间、正文留白、
  回复 / 点赞 / 删除动作行；层级更清晰。
- **删除自己的评论**：服务端 `serializeComment` 增加 `isMine`（由服务端判定，
  免去客户端再查"我的 id"），本人评论显示删除入口。
- **长按评论菜单**：长按 480ms（移动即取消，避免滚动误触）或右键 → 弹出小抽屉
  「分享 / 复制 / 删除」，删除仅本人可见。
- **导出记忆档案改为居中弹窗**：新增 `components/me/ExportArchiveDialog.tsx`，
  选形式 → 选旅行 → 导出；保存位置优先用 File System Access API（`showSaveFilePicker`）
  让用户明确选路径，不支持时退化为常规下载并提示。
- **旅行卡片导出（HTML）**：新增 `lib/modules/export/share-card.service.ts` +
  `GET /api/export/card?slug=xxx`，产出**自包含单文件 HTML**（样式全内联、HTML 转义防注入）：
  封面大图 + 标题/日期/地点 + 天数/行程数/照片数/花销统计 + 逐日行程时间轴 + 九宫格掠影，
  暖陶土配色并带打印样式 —— 打开即是一张分享卡片。

### 说明

- 评论「看不到内容」在服务端与构建产物上均核对正常（`curl` 帖子 67 返回 2 条带作者信息，
  CORS 允许 `https://localhost`；b47 的壳里 `apiUrl` 已内联 `https://travel-notes.yuanabd.cn`）。
  该问题属于 b47 之前"相对 `/api` 请求打到本地壳"，需更新到 b47+ 才生效；本轮在此之上
  补齐了缓存、删除与长按菜单。

---

## [1.24.1] - 2026-10-14

> 修复 v1.24.0 的真机回归：闪退、点不动、评论空白、时间改不了。
> tsc 0 错误 · lint 0 error · vitest **56 文件 / 525 用例全绿** · build 成功 ·
> 设计 token 无新增回退。

### Fixed

- **选择器被渲染在编辑面板背后（「时间/日期/名字都改不了」）**：`BottomSheet` 此前是
  `z-[95]`，而 5 个页面级全屏编辑器（`TravelInfoEditor` / `ItineraryEditor` /
  `MemoryComposer` / `TravelTimeline` / `AddPhotoButton`）都在 `z-[130]`。于是从编辑器里
  打开选择器（选日期 / 选时间 / 选行程）时，抽屉被渲染在编辑器**背后** —— 用户看到的是
  "点了完全没反应"。已把 `BottomSheet` 提到 `z-[135]`、`Toast` 提到 `z-[150]`，
  并把完整层级写进 `BottomSheet` 注释避免再次踩坑。
- **时间选择器滚轮存在反馈环（真机卡死/闪退且时间选不准）**：第一版用 scroll-snap 滚轮
  + 滚动监听回写值 + 程序化 `scrollTop` 定位，三者构成反馈环
  （scroll → setState → effect 改 scrollTop → 再触发 scroll）。改为**纯点选网格**：
  小时 24 格 + 分钟 12 档 + 常用快捷项 + 大号回显，无任何 scroll 监听、无程序化滚动，
  结构上不可能成环；触达 44×44 也更好点。已删除随之废弃的 `.m-wheel*` CSS。
- **相对 `/api` 请求打到本地壳（评论数 2 但列表全白）**：Capacitor 壳的页面源是
  `https://localhost`，组件里 `fetch('/api/...')` 会打到手机本地壳。已全量收敛：
  `components/` 与 `app/` 中 **33 处**裸 `/api` 请求改为 `apiUrl(...)`，补 18 个缺失 import；
  评论读写另补 `credentials: 'include'`。Web 端 `apiUrl` 返回原相对路径，行为不变。
- **`inert` 可能残留（全站点不动、输入框无法聚焦）**：`useModalLayer` 原按"打开时是否已
  inert"决定是否移除，嵌套 / 异常卸载时会漏；残留在应用根上即导致所有点击无效、
  输入框进不去。改为**引用计数**归还（计数归零无条件移除），且 `panel` 未就绪时不做 inert
  （那会把弹层自己锁死）。另加兜底自愈 `clearStrayInert()`：路由切换时若无弹层在用 inert
  就清掉残留。
- 花销「日期」改用品牌化日历（新增 `DateField` + `DateRangePicker` 单日模式），不再用原生
  `<input type="date">`。
- 修掉 `DateRangePicker` 里局部变量 `single` 遮蔽 `single` prop 的隐患（改名 `isSingleDay`）。

### Changed

- 评论抽屉高度：此前只有 `max-h` 没有 `h`，内容少时缩成很小一条；改为 `h-[62dvh]` 约半屏。

---

## [1.24.0] - 2026-10-13

> 新建旅行体验精修：把三个原生控件换成品牌化自绘组件 + 混合角色同行。
> tsc 0 错误 · lint 0 error · vitest **56 文件 / 525 用例全绿** · build 成功 ·
> 设计 token 欠债 404 → **401**（实际收敛，基线已收紧）。

### Added

- **`TimePicker`（自绘时间滚轮）**：行程的开始/结束时间此前用原生 `<input type="time">`，
  Android WebView 会拉起**系统圆盘钟表** —— 与全站暖陶土设计语言割裂，且各 ROM 造型不一致
  （真机反馈「这个圆形钟表挺丑的」）。新组件：双列 scroll-snap 吸附滚轮 + 中央高亮带 +
  上下渐隐遮罩；打开自动定位当前值；滚动切换给轻触觉；顶部常用时间快捷项；
  分钟按 5 分钟一档并对齐（不会出现滚轮里没有的值）。已接入 `AddItinerarySheet`、
  `ItineraryEditor`，原生 time 输入清零。
- **`SelectField`（品牌化下拉）**：原生 `<select>` 在 Android 上会拉起系统滚轮下拉。
  新组件字段外观与 `Field` 一致，点击拉起 `BottomSheet` 选项面板（整行大触达 +
  当前项勾选 + 可选副标题），已替换花销「选定行程」。
- **混合角色同行**：`roleMixOf` / `formatRoleMix`（纯逻辑，含单测）把同行者按关系
  聚合为「朋友 3 · 家人 2」，人数相同按关系名稳定排序；表单显示角色构成并在多角色时
  标注「（多角色同行）」；折叠摘要从「5 位同行」升级为「5 位同行 · 朋友 3 · 家人 2」；
  `GROUP` 标签改为「结伴 / 聚会」、hint 改为「朋友、家人、同事同团」。

### Changed

- **`DateRangePicker` 重做**（真机反馈「这个圆形弹窗做得挺丑的」）：
  ① 改用品牌化 `BottomSheet` —— 弹簧入场、可下拉关闭、接管系统返回，不再是从裸 `fixed`
  层凭空出现；② 日期格从**孤立圆圈**改为**连续色带 + 两端圆角**（按钮占满整列承载色带、
  内层 `span` 才是圆），一眼看出从哪天到哪天；③ 新增常用区间快捷项（今天 / 明天 /
  本周末 / 三天 / 一周）。三个调用方改为 `open` 控制并保持挂载，退场弹簧动画才播得完。
- **按钮按压反馈增强**：原先按压只有缩放（"像贴纸在动"）。为 `.m-press` / `.m-pressable` /
  `.m-btn` 的 active 态补上 `brightness` + `saturate` 的**压入表面**反馈，`.m-btn` 另加
  `--m-inset-lo` 内阴影收紧。`filter` 不参与布局、不与 `transform` 合成冲突，
  且这几个类都在 `prefers-reduced-motion` 降级列表内。

### 说明

- 未新增 `PARTY` 枚举值：`TravelType` 是数据库枚举，新增值需同时改 schema + 增量迁移 +
  8 处枚举清单（api 校验 / social feed 过滤 / space 服务 / 图标映射 …），任一处漏改会出现
  「存得进、筛不出」的静默不一致。产品真正要的是「一次旅行里可以有多种关系的人」，
  这由 `companions[].relation` 承载，`GROUP` 只是它的类型标签。

---

## [1.23.3] - 2026-10-13

> 一致性修复（无功能变化），由 token 门禁抓出的新增回退清零。
> tsc 0 错误 · lint 0 error · vitest 55 文件 / 519 用例全绿 · build 成功 ·
> check-design-tokens --check-baseline **无新增回退**。

### Fixed

- **图标尺寸自由取值 0 → 1**：`VersionCheckRow` 用了裸
  `<Loader2 className="h-4 w-4 animate-spin">`。规范 §6.1 要求图标只走 `<Icon>` 三档尺寸、
  §7 要求无限动画只能由 `Loader` 组件承载，已改为 `<Loader variant="ring" size="sm" />`。
- **直接 import lucide-react 90 → 91**：新增的 `StackedGallery` 位于 `components/social/`，
  不在 `ICON_SYSTEM_ALLOWLIST` 内。它本质是通用 UI 原语（堆叠卡组），已归位到设计系统层
  `components/mobile/`，同步更新 `PostDetail` 的引用路径 —— 既消除计数，也符合目录职责。
- **非标字号 86 → 87**：总览新增的「行程费用」明细用了 `text-[12px]`（不在 7 档字阶内），
  改用设计系统的 `.m-caption`（13px）。

### 说明

本轮不改基线，而是修真实问题 —— 基线是「存量欠债的可见账本」，
不是用来把新增违规合法化的。

---

## [1.23.2] - 2026-10-13

> 真机反馈修复批 + 花销绑定行程。tsc 0 错误 · lint 0 error ·
> vitest **56 文件 / 519 用例全绿** · next build 成功 · 版本 1.23.2/b44 一致。

### Fixed

- **Android 系统边缘返回直接退出 App**：上一轮只改了网页侧滑，但系统手势由 Activity
  处理，网页监听拦不住。现在 MainActivity 注册 `OnBackPressedCallback`，把系统返回
  转成网页事件 `window.__tiantuHandleBack`，不再走默认 `finish()`（默认就是回桌面）；
  `use-close-on-back` 监听该事件，有弹层先关弹层、无弹层才返回上一级。
- **社交互动（点赞/评论/收藏/举报/屏蔽）点了没反应、退出重进就丢**：已用内存复现
  确认根因 —— `social-write` 入队前先 `JSON.stringify`，而 `SyncQueue.enqueue` 又
  stringify 一次，库里存成「字符串的 JSON」；分发器只 parse 一次得到 string，
  `payload.postId` 为 undefined 直接抛「缺少 postId」，**fetch 从未发出**。
  修：social-write 改为**在线优先**（只有网络不可达才入队，认证/业务错误一律报错）；
  新增 `decodeSyncPayload` 兼容历史双重编码并拒绝 string/array 穿透；分发器不再
  `res.json().catch(()=>({}))`（2xx 但 `success:false`、重定向到登录页都必须抛错）；
  SyncEngine 增加 30s 定时回放（原先只在启动/网络变化触发）。
- **点赞/收藏接口非幂等**：POST 与 DELETE 都调同一个 toggle，队列重放一次就把用户
  刚点的赞撤销。改为 `setPostLike/setPostFavorite(postId, userId, 目标态)`：
  POST=确保已赞、DELETE=确保未赞，重复执行结果恒定。
- **行程上传的照片只有占位图标 / 点不开 / 全屏空白**（三个独立缺陷）：
  ① `getTravelTimeline`、`getTravelMemoryPhotos` 手拼 `/uploads/${key}` 漏掉绝对化，
  原生壳页面源是 `https://localhost`，相对地址被解析到本地壳必然 404。已三处统一收敛到
  `storageKeyToUrl`；② 行程缩略图是**裸 `img`**，没有 button/onClick、props 也没回调，
  点了必然没反应 → 加 `onOpenViewer` 并包 button，父级复用同一查看器；
  ③ 查看器只判 `open`，photos 为空时返回监听已入栈、body 滚动已锁，然后 `return null`
  → 空白且页面锁死 → 统一用 `opened = open && photos.length > 0`，顶部封面点击的集合
  兜底并入封面（`viewerPhotos`）。另：detail 接口 `images` 改为优先并入 `coverUrl`。
- **堆叠相册切换残留上一张、过渡卡顿**：离场卡只偏移 18px、留 0.55 透明度（旧图一直在
  屏里）；无离场/入场区分；touchmove 每帧 setState 掉帧；松手硬跳。已重做为方向感知三态
  （active 居中 / peek 停在行进方向一侧 / leave 沿反方向**完全滑出** 104%），方向按原始
  索引差值判定，touchmove 用 rAF 节流，卡片声明 `will-change`，松手恢复弹簧过渡。

### Added

- **花销绑定行程**：`Expense` 新增可空 `itineraryItemId`（`ON DELETE SET NULL`，
  删行程不连带删掉真实账目），含索引与外键；`apply-schema-migration.cjs` 补幂等 DDL。
  - 服务：`addExpense` **校验行程属于本旅行**（跨旅行/已删除/查询出错一律退化为
    「不绑定」，不因校验失败丢账）；`getTravelExpenses` 回传；timeline 每条行程带上
    其绑定花销（整数分求和）。
  - UI：记一笔表单新增「选定行程」下拉（按日期唯一匹配时自动预选）；花销列表回显归属；
    行程每条下方显示该行程花费合计；总览新增「行程费用」明细。
- 测试：新增 `travel-expense-itinerary.test.ts`（6 例）与社交同步 7 例。

---

## [1.23.1] - 2026-10-12

> 用户反馈 8 个 bug 的集中修复 + 相关体验优化。tsc 0 错误 · lint 0 error ·
> vitest **54 文件 / 506 用例全绿** · `next build` 成功 · 版本 1.23.1/b43 一致。

### Fixed

- **Web 端「进入空间」停留门户、闪烁不切换**：门户检测到登录后把入口指向 `/`，
  而 nginx 有 `location = / { return 301 /portal/; }` → 301 弹回门户，形成自环。
  现把「根路径该去哪」的决策上移到应用（需登录态）：middleware 未登录访问 `/`
  跳 `/portal/`（访客仍看落地页），已登录放行渲染应用首页；nginx `location = /`
  改为反代应用。
- **移动端省份弹窗跑到整页最底部**：CSS 中任何非 `none` 的 transform 都会让祖先
  成为 `position: fixed` 的包含块 —— `PullToRefresh` 内容层恒写 `translateY(0px)`、
  `m-enter` 动画 `fill-mode: both` 保留 `translateY(0) scale(1)`，抽屉因此相对
  内容容器而非视口定位。修：PullToRefresh 静止时不写 transform（下拉/回弹/静止三态）；
  抽屉 portal 到 `document.body`，并补 `m-sheet-up` 从屏幕下沿滑入。
- **旅行圈详情顶栏与手机状态栏重叠**：`/circle/*` 走「不挂 Navbar」分支，
  顶部安全区须页面自管而该页只有 `py-6` → 改用 `m-safe-top`。
  `/me/favorites`、`/me/followers` 同类问题一并修。
- **评论发送后列表不显示**：原生壳 `createComment` 只写本地同步队列
  （返回 `{ ok, local: true }`），而提交后立即从服务端重拉 —— 服务端此刻没有该数据。
  现新增 `pendingComments` 本地待同步列表，渲染时与服务端结果合并（按「父评论+内容」
  去重，同步完成后由服务端版本接管）。
- **屏蔽作者不可逆、退出软件后状态回退**：详情页把「已屏蔽」只放在本地
  `useState(false)`，既不读服务端状态也没有取消路径。现服务端 `getSocialPost`
  返回 `isBlocked`；前端改为可切换（POST 屏蔽 / DELETE 取消），乐观更新 + 失败回滚
  + toast，按钮文案区分「屏蔽作者 / 已屏蔽 · 点击取消」并把触达提到 44px。
- **侧滑返回直接退出 App**：`goBackOrHome` 用 `window.history.length > 1` 判断有无
  上一页，而 **Capacitor WebView 里该值恒 > 1** → `router.back()` 退到空白历史项，
  真机表现即「左滑回到手机桌面」。现新增 `lib/navigation-stack.ts` 自维护**只含本站
  路径**的导航栈（LayoutContent 每次 pathname 变化上报），`canGoBackInApp()` 作为
  可信判据，永不退出应用。
- **返回按钮未覆盖全部页面 / 位置不对**：`EdgeSwipeBack` 由「逐页挂载」改为挂到
  全局壳（所有常规页面共享），内部按 `canGoBackInApp()` 兜底并在 Tab 根页自动不响应；
  帖子详情返回键从「固定回 `/circle`」改为「返回上一级」；
  `/me/favorites`、`/me/followers` 的返回键从**右侧**移到**左侧**、由固定 Link
  改为返回上一级、触达 36→44px。

### Added

- `components/social/StackedGallery.tsx`：堆叠相册，支持**左右或上下**滑动切换、
  跟手位移、切换触觉、计数徽标、指示点、点击打开全屏查看器；无自动轮播
  （旧 `StackedImageSlider` 含 6s `setInterval`，违反规范 §1 第 3 条）。
  堆叠相册与 `PhotoViewer` 共用同一相册数组，避免下标错位。
- `components/mobile/VersionCheckRow.tsx`：「我的 → 抽屉 → 关于」中的版本行，
  显示当前 `v{version} (b{build})` 并可手动检测更新（三态反馈 + 触觉）。
- `lib/navigation-stack.ts` + `tests/unit/navigation-stack.test.ts`（7 例）。
- `.m-sheet-up` / `.m-fade-in` 两个受控动画类，并纳入 `prefers-reduced-motion` 降级。

---

## [1.23.0] - 2026-10-12

> UI 体验优化专项：Web 端 + 移动端一次性收敛。typecheck 0 错误 · `next lint` **0 error** ·
> vitest **499 全绿** · `next build` 成功 · 设计 token 欠债 **439 → 404** · 版本 1.23.0/b42 一致。
> 方案文档：`docs/design/UI优化方案-评审稿.md`（评审稿，含逐条证据与复现命令）。

### Performance（首屏）

- **桌面首页 582KB 地理数据移出首屏**：`HomeClient.tsx` 此前**静态 import** 地图组件，
  经 `lib/geo.ts` 把 `data/china-geo.json`（实测 **582,522 字节**）与 d3-geo 一并打进
  桌面首页首屏 chunk —— LCP 的最大单点。移动端（`HomeMobile.tsx`）早已用
  `dynamic(ssr:false)` 规避，本次补齐，两端策略一致。首页 First Load JS 降至 **129 kB**，
  地理数据落到独立懒加载 chunk（583 kB）。

### Fixed

- **iOS 输入聚焦自动缩放**：iOS Safari / WKWebView 在表单控件字号 < 16px 时聚焦会强制
  放大整页、失焦再缩回 —— 每点一次输入框整页跳一下。不能用 `user-scalable` 规避
  （伤害可访问性）。现于 `@media (max-width:767px)` 对 input/textarea/select 全局兜底
  16px，`.m-field-input` 单独声明，4 处 `text-sm` 输入控件改 `text-[16px]`；
  规范新增 §3.1 硬约束，checker 的 `ALLOWED_FONT_SIZES` 纳入 16。
- **焦点可见性**：全站 96 处 `outline-none` 但仅 7 处 `focus-visible`，且大量控件用
  `focus:ring` —— 而 `focus:` 对鼠标点击同样触发，键盘与鼠标态不可区分，键盘用户实际
  "摸黑"。脚本化把 37 文件 / 90 行的 `focus:ring|border|outline|shadow|z-` 改为
  `focus-visible:`（已含 `focus-visible` 的行跳过），引用数 7 → 229，残留裸 `focus:` 归零。
- **移动端键盘遮挡**：全项目此前 **0 处** `visualViewport`，《移动端UI精修方案2.0》§H.3
  明确要求却未落地。新增 `hooks/use-keyboard-inset.ts`（容差 24px 防地址栏误判、rAF 合并
  高频 resize、不干预滚动），用于评论面板与旅行详情底部 CTA。
- **视口高度**：全站 46 处 `min-h-screen`(100vh) → `min-h-dvh`（34 文件）。地址栏收起/展开
  时 100vh 会导致底部空白或内容被推出视口；dvh 桌面端与 vh 等价，可全站统一、零回归。
- **首页加载态**：此前是居中转圈 + 一行文字，随后整页跳变成版面完全不同的内容（CLS 与
  感知慢双输）。新增 `components/HomeLoading.tsx` 复刻真实版面的骨架；错误态补
  `actionLabel="重试"` —— 此前三处 `AsyncState` 都没传重试回调，用户看到"加载失败"
  却无路可走。
- **容器宽度不对齐**：`.container-custom`(1152) 与首页手写 `max-w-7xl`(1280) 并存，
  导致宽屏下**导航栏与首页内容左右边缘不对齐**。收敛为 `.container-page`(1152) /
  `.container-wide`(1280) 两档，首页统一为前者，与 Navbar/Footer 同档。
- **admin 表格窄屏撑破卡片**：`admin/social` 表格补 `overflow-x-auto` + `min-w-[560px]`。

### Changed（设计系统收敛）

- **`!important` 清零（19 → 0）**：根因都是"组件缺能力"，因此补能力而非压制样式 ——
  新增 `.m-chip-inverse`（图上反色 chip）、`.m-chip-sm`（小号状态 chip）、
  `ListSection flush` prop；3 处 `m-chip m-chip-active !h-11 !px-* !text-sm` 手搓 CTA
  改用 `<Button>`；Navbar / login 的多余 `!` 前缀去掉。
- **魔术圆角清零（8 → 0）**：`rounded-[28px]/[30px]/[26px]/[22px]/[2px]` →
  `rounded-2xl`(卡片档 20) / `rounded-sm`；TravelMobileClient 的"交替圆角"噱头移除。
- **字符冒充图标清零**：`SyncBadge` 此前用 `✓ ↑ ☁ !` 充当图标并写死 4 个 hex，
  改为 `<Icon>` + lucide，颜色走 `--m-*` token（该组件此前全项目零引用，属死组件）。
- **无限循环动画清零**：移除零引用的 `.m-soft-pulse`（3s 无限呼吸），同类问题
  （`.m-fab-glow`）此前已移除。
- **减动效降级补全**：`prefers-reduced-motion` 列表遗漏 `.m-tab-active-dot` /
  `.m-toast-bar`，减动效用户此前仍会看到这两个动画；已补入并写明维护约定。
- **断点契约显式化**：`tailwind.config.js` 此前没有 `screens` 键（全走隐式默认），
  实测倾斜严重（md 250 / lg 49 / xl 8 / 2xl 0），1024–1280 无专属档位。
  现显式固化 sm/md/lg/xl/2xl 并写明各档用途；首页卡片流补 xl/2xl 分档。
- **玻璃材质三档**：此前 50 个文件各自手写 `backdrop-blur-*`，同屏可现 3 种强度。
  收敛为 `.m-glass`(18px) / `.m-glass-thin`(8px) / `.m-glass-thick`(28px)，
  与 `--m-elev` 分级对应，并补 `prefers-reduced-transparency` 降级。
- **视觉手法收敛**：首页同屏曾叠背景光斑 + 手绘下划线 + `-6deg` 虚线印章 + 随机倾斜卡片
  四种"营造文艺感"手法；保留手绘下划线（唯一承载品牌手作感），去掉印章倾斜，
  地图角标改为发丝线 + 玻璃 + `--m-elev-1`。
- **Admin 纳入设计系统（最小切口）**：`AdminShell` 此前 `const Icon = item.icon`
  **遮蔽了设计系统的 `<Icon>`**，导致图标尺寸只能手写 `h-[18px]`（既非 16/20/24 三档，
  也非任何 token）；现改走 `<Icon size="md">`，`AdminNavItem.icon` 的 `any` 改
  `LucideIcon` 真类型。
- **动效一致性专项**：全站审计 `<button>` 是否缺失过渡/按压反馈，17 处候选中 14 处
  确认为误报（动效来自 `m-pressable`/`m-btn` 等共享类）；真缺的已修
  （省份抽屉展开/返回/关闭补 `m-press` 并把 40×40 提到 44×44、举报提交按钮补按压）。
- 首页容器与卡片栅格同步收敛；`app/api` 与业务层零改动。

### Added

- `hooks/use-keyboard-inset.ts`：虚拟键盘避让（全项目首个 visualViewport 实现）。
- `components/HomeLoading.tsx`：复刻真实版面的首页骨架。
- `.m-glass-thin` / `.m-glass-thick` / `.m-chip-inverse` / `.m-chip-sm` 四个受控类。
- `tests/e2e/a11y.spec.ts` **扩面**：拆为匿名组（3 页 + 表单命名）与**登录组**
  （首页/旅行/旅行圈/我的/时间线/碎碎念/搜索 7 页 + 无可读名按钮整体断言），
  axe 规则集加入 `wcag22aa`（含 2.5.8 目标尺寸、2.4.13 焦点外观）。

### Docs

- `docs/design/UI优化方案-评审稿.md`：评审稿（五大缺口 + 硬数据 + 复现命令）。
- 规范新增 §3.1（表单控件强制 16px）、§4.0（视口高度必须 dvh）；
  §3 规则补"不要给 input/textarea 加 `text-sm`"。
- token 基线收紧：`--update-baseline` → 439 → 404。

### 验证

- `npx tsc --noEmit` **0 错误**；`npm run lint` **0 error**（470 warning，存量基线）；
- `npm test` **53 文件 / 499 用例全绿**；`npm run build` 成功；
- `node scripts/check-design-tokens.mjs --check-baseline` exit 0（无回退）；
- ⚠️ 本机无 MySQL / Docker，**Playwright e2e（含新增 a11y 登录组）未在本机实跑**，
  将在服务端部署后补验。

### 分批提交

```
ce90434 perf-ui-P0a-desktop-map-lazy-focus-visible-ios-input
e505168 refactor-ui-P0b-tokens-a11y-motion-convergence
ac489b9 feat-ui-P1-keyboard-inset-container-a11y-skeleton
cc5a702 feat-ui-P2-motion-polish-material-hierarchy-admin-system
```

---

## [1.21.0] - 2026-10-07

> 评审第三批（收尾）：结构收敛 / 代码优化 / 测试基建。typecheck 0 错误 · `next lint` **0 error**
> （CI Lint 步骤此前必然失败）· vitest 498 全绿 · 版本 1.21.0/b40 五处一致。
> 说明：本批次前半段由上一位执行者完成但未提交，本次接续补齐剩余项并逐项复核。

### Fixed（确定性缺陷）

- **CI 由红转绿 —— lint 存量 3 个 error**：`npm run lint`（= `next lint`）退出码 1，
  与本次改动无关的既有欠账，但会让 CI 的 Lint 步骤一直失败：
  - `components/album/space/GalaxyAlbumScene.tsx`、`SpaceAlbumHUD.tsx`：空银河态顶栏的
    「返回」用裸 `<a href="/">`，改为 `next/link` 的 `<Link>`（顺带获得客户端路由与预取）；
  - `components/home/DanmakuSection.tsx`：空 `interface DanmakuSectionProps {}` 改为
    `Record<never, never>`。两者对 TS 等价，但后者不触发 `no-empty-object-type`；
    **不能**用 `Record<string, never>`——它带索引签名，会与 `forwardRef` 注入的 `ref` 冲突
    （已实测报 TS2322）。
- **mermaid「只改动态 import」不等于省体积**：上一轮把静态 `import mermaid` 换成运行时
  `await import('mermaid')`，但 effect 在挂载时即执行，**每个旅行详情页仍会下载该 chunk**，
  等于换个位置付同一笔体积（该 item 的收益此前并未真正兑现）。现在先查 DOM 是否存在
  `pre code.language-mermaid`，无图表则完全不加载；另补 MutationObserver 兜底
  「正文将来改成异步注入」的情形，以及渲染异常兜底（图表失败不再把详情页带崩）。
- **新增的 a11y 用例会假绿**：`playwright.config.ts` 全局注入登录后的 `storageState`，
  而 `a11y.spec.ts` 要验的恰恰是「未登录用户第一眼看到的页面」。现该文件显式
  `test.use({ storageState: { cookies: [], origins: [] } })` 走匿名态；否则 `/login`
  一旦加「已登录则跳转」就会静默扫到别的页面。注释里多写的 `/timeline` 一并修正
  （该页需登录，不属于匿名基线）。
- **`npm run lhci` 指向未安装的二进制**：补 `@lhci/cli@0.15.1` 到 devDependencies
  （`lighthouserc.json` 本身有效，仅缺可执行依赖）。
- **最后一处 `console.log`**：`components/album/space/galaxyEngine.ts` 的「自适应画质切换」
  调试输出改走 `logger.debug`。全项目 `console.log` 归零（仅剩 logger 自身实现）。

### Changed（结构收敛）

- **相册解锁三弹窗状态机收敛**：`AlbumUnlockModal` / `PixelUnlockModal` /
  `SpaceUnlockModal` 三份同构的 fetch + error + verifying 逻辑抽为
  `hooks/use-album-unlock.ts`；三套刻意设计的视觉（旅行暖色 / 像素存档点 / 银河玻璃）
  刻意保留，仅共享状态与 API，并补 `role="dialog"` / `aria-modal` / `aria-label`。
- **admin 后台暖灰归一**：714 处 `gray-N` → 新增 `warm-N` 数字阶（stone 暖灰系，
  与 `gray-N` 亮度逐档对齐，替换后视觉零跳变），后台从「第三套色系」并入项目 token 体系。
- **结构化日志收口**：video-upload / mailer / video-transcode / prisma-adapter /
  admin send-code 的裸 console 输出改走 `logger`（JSON 行，便于采集与告警）。
- **`travel-stats.ts` 去 any**：`m: any` / `v: any` 换成显式结构类型
  （StatMedia / StatMemory / StatTravelRow），并注明「loadMyTravels 的 select 只取
  storageKey，THUMBNAIL 过滤在 where 完成」这一原本隐式的约定。
- **设计 token 与依赖审计进 CI**：token 走 `tokens:check` 基线门禁（**阻塞**，
  只拦新增回退）+ `tokens` 全量报告（不阻塞，保留欠债可见性）；`npm audit --audit-level=high`
  仍为报告模式——上游公告不该直接卡住发布。

### Added（测试基建）

- `tests/e2e/a11y.spec.ts`：axe-core 对 /login · /admin/login · /download 断言无
  critical / serious 违规，并断言不存在「无可读名的按钮/链接」。
- `lighthouserc.json`：脚本体积预算（script ≤ 500KB / total ≤ 1.5MB）+ LCP 警戒，
  用于拦住 mermaid 这类重库再次被静态引入。
- **设计规范「基线回归门禁」`npm run tokens:check`**：上一轮把 `check-design-tokens`
  接进 CI 时用的是报告模式，而报告模式**拦不住回归**；`--strict` 又因存量 439 处等于永久红灯。
  故新增 `--check-baseline`：把每条规则的当前计数固化到 `scripts/design-token-baseline.json`
  （**逐规则**比对，避免「A 规则 +3、B 规则 -3」被总数掩盖），只要求「不得多于基线」；
  收敛一批后跑 `--update-baseline` 收紧。实测：临时写入一处 `#123456` + `text-[17px]`，
  门禁以 exit 1 精确报出 `硬编码 hex 颜色: 77 → 78（+1）` 与 `非标字号: 100 → 101（+1）`，
  移除后恢复 exit 0。
- 新脚本：`npm run tokens` / `npm run tokens:check` / `npm run test:a11y` / `npm run lhci`。

### 暂缓（本次明确不做，附实测依据）

- **admin 移出设计 token 豁免名单**：实测把 `components/admin/` + `app/admin/` 从
  `THEME_ALLOWLIST` 移除后，报告从 335 处涨到 **578 处（+243）**，且多为移动端专用规则
  （字阶 / 图标尺寸 / 字符图标）产生的噪音。与其把门禁直接变红，不如与「admin 全面重设计」
  一起做；当前 admin 欠债已以 info 形式可见。
- **`travel.service.ts` 行级 any（32 处）**：正确解法是改用
  `Prisma.TravelGetPayload<{ include: ... }>` 真类型；手写结构类型会给出「看似类型安全、
  实则可能与运行时形状不符」的虚假保证，风险高于收益，推迟。
- ResponsiveShell 整页双树（`hidden md:block` 57 处）、globals.css 拆分。

### 验证

- `npm run typecheck` **0 错误**；`npx next lint` **0 error**（471 warning 为存量基线）
  → `npm run lint` 退出码 0，CI Lint 步骤恢复；
- `npm test` **53 文件 / 498 用例全绿**；
- `npm run tokens` 无回退（原有 7 条规则 335 处 / 待处理合计 439 处，与 1.20.0 一致）；
  `npm run tokens:check` exit 0，且已实测能拦住新增违规（见上「基线回归门禁」）；
- `npm run build` **成功**（BUILD_EXIT=0）；
- **mermaid 体积收益实测**（对照 `.next` 编译产物）：mermaid 落在两个独立懒加载 chunk
  （200 KB + 406 KB），且**不在** `/travel/[slug]` 的 21 个初始 chunk 中——该路由
  First Load JS 为 232 kB，装不下 606 KB 的 mermaid。即「没有图表的详情页不付这笔体积」
  成立；此前只改动态 import 时，chunk 仍会在每次挂载后被下载；
- Playwright 用例发现自检：全套 **73 用例 / 17 文件**（含新增 a11y 4 例），`--list` 通过；
- 版本一致性自检 **8/8 通过**：package.json · package-lock.json · lib/app-version.ts ·
  android/app/build.gradle · scripts/build-mobile.cjs。
- ⚠️ **未在本机执行的部分**：本机无 MySQL（3306 未监听），Playwright e2e（含新增 a11y 用例）
  与 `lhci autorun` 都需要运行中的服务与数据库，未实跑；建议在具备数据库的环境补跑
  `npm run test:a11y`，并首次运行 `npm run lhci` 校准体积预算阈值。

---

## [1.20.0] - 2026-10-07

> 评审第二批：UI / 无障碍 / 设计 token 收敛。typecheck 0 错误 · vitest 498 全绿 ·
> lint 与 check-design-tokens 无回退。

### Added（桌面 a11y 基线）

- **全局键盘焦点环**：`globals.css` 增加 `:focus-visible` 兜底 outline（跟随主题强调色，
  键盘导航可见、鼠标点击不触发）。此前桌面主路径大量按钮/链接无可见焦点样式，键盘用户"摸黑"；
  移动端早有 `--m-ring`，桌面补齐同一层底座。
- **表单 label 关联**：登录页（用户名/密码/确认密码）与后台登录页补 `htmlFor`/`id` 与
  `autoComplete`——点击 label 可聚焦、读屏可播报。
- **纯图标按钮 aria**：Navbar 退出登录按钮补 `aria-label`（同文件其余图标按钮均有，唯漏它）。
- **封面图语义 alt**：首页进行中旅行封面、旅行详情 hero 封面、后台相册列表封面
  由 `alt=""` 改为真实标题（27 处 `alt=""` 中的语义封面类；纯装饰占位保持空 alt）。

### Changed（设计 token 收敛）

- **`.card` 硬编码 hex → token**：`dark:bg-[#161B22]/75 dark:border-[#2C343E]` →
  `dark:bg-shell-surface/75 dark:border-shell-line`（值相同，token 已有）。
- **冷灰 `#3D4852` 清零**（14 处 / 7 文件）：与暖色板 `travel-ink` 混用导致同屏色偏，
  统一替换为 `travel-ink`（admin 改密页 / admin 首页 / 两处登录页 / PostMetaPanel /
  LoginDoor / MomentsStrip）。
- **次级页顶部留白对齐**：`LayoutContent` 次级分支 `md:pt-20` → `md:pt-16`，
  与 travel/home 分支及 Navbar 实际高度（h-16）一致，消除页面切换时的呼吸感跳变。
- **错误红对比度达标**：浅色 `--danger-soft` `#E06C6C`（3.0:1，低于 AA）→ `#B4535B`
  （≈4.6:1）；暗色保持 `#E06C6C`（深底上原值已达标）。
- **admin 后台暖灰归一**：新增 tailwind `warm` 数字阶（stone 暖灰系，与 gray-N 亮度逐档
  对齐，批量替换后视觉零跳变），admin 全部 **714 处** `gray-N` → `warm-N` ——
  后台从"第三色彩世界"并入项目 token 体系，色温与全站暖陶土色板一致。
- **v4 M5 组件正式接入线上**（组件在 `/dev/ui/v4` 预览台已备好但从未接线）：
  - 旅行编辑链路 5 处逐字复制的内联主 CTA（新建旅行表单 / 保存信息 / 添加行程 /
    添加这一天 / 保存回忆）→ 统一 `<Button>`（lg 52px 与原高度一致）；
  - 登录页相册解锁面板：字段 → `<Field>`，主按钮从「m-chip 加 !important 硬顶」
    → `<Button>`（v4 预览台点名的两处欠账）；
  - MomentsStrip 手写骨架屏 → 统一 `mobile/Skeleton`（shimmer + 行宽错落）。
- **HomePanel 抽取**：桌面首页同一串卡片样式逐字复制 3 处 → 收敛为单一容器组件。
- **桌面首页补齐「进行中的旅行」**：移动端 R1 改版的模块此前桌面没有（双端信息架构漂移），
  现已对齐——归档入口与移动端同口径（添加照片 / 安排行程 / 完成并归档），归档后
  `onRefresh` 复用首页同一次取数。
- HomeClient 移除迁移遗留的 `no-img-element` 死注释（下方已是 `<Image>`）。

### 验证

- typecheck 0 错误；vitest 53 文件 / 498 用例全绿；lint 无新增告警；
  `check-design-tokens.mjs` 报告模式无回退（439 处存量欠债与基线一致）。
- 版本 1.19.0/b38 → **1.20.0/b39**，四处版本一致自检通过。

---

## [1.19.0] - 2026-10-07

> 全维度代码评审后的第一批确定性修复（P0）。评审基线：typecheck 0 错误、vitest 全绿、
> 移动端/桌面/admin 三套 UI 的 token 与交互逐行核对。

### Fixed（确定性 bug · 9 项）

- **暗色用户冷加载闪白屏**：theme class 此前等 Navbar 水合后才从 localStorage 恢复，
  html 底色固定亮色——暗色用户每次冷加载先画亮色首帧。`app/layout.tsx` `<head>` 加
  阻塞式内联脚本先于首帧完成 `classList.add('dark')`（与 Navbar 同一 key）。
- **HomeClient FeatureCard className 拼接事故**：`shadow- lg:p-8[…]` 是两个无效类，
  lg 屏丢加宽 padding 与预期阴影 → 拆回合法写法。
- **8 处无效透明度修饰符**（样式静默失效）：Tailwind 3 默认刻度不含 /12 /16 /18 /72 /97，
  编译产物中不存在这些类。涉及 HomeMobile（地点 chip 半透明白底、卡片日期弱化）、
  TravelMobileClient、TravelPhotoViewer（左右翻页按钮底色）、ProvinceCityPanel、
  MobileProvinceDrawer，统一改为任意值写法 `/[0.x]`。
- **深链返回行为**：`router.back()` 在通知/分享深链进入时会把用户退出站点。
  新增 `lib/navigation.ts#goBackOrHome`（有应用内历史 → back，否则 fallback），
  统一接入 EdgeSwipeBack / UserProfile / TravelDetailShell / LargeTitle
  （LargeTitle 原实现无历史且无 back 参数时会卡住，一并修复）。
- **弹层不接管物理返回键**：Android 返回键/浏览器返回在弹层打开时直接离开页面。
  TravelPhotoViewer 已验证的 pushState+popstate 模式抽为 `useCloseOnBack` hook
  （补齐嵌套语义：栈序保证逐层关闭），接入 ui/Modal、BottomSheet（含 ActionSheet）、
  SideDrawer、CommentPanel。
- **碎碎念空态 CTA 甩访客去后台登录页**：首页空态「写一条碎碎念」href=/admin/moments
  → 改跳 /moments（页面内有写入口）。
- **Footer 占位死链**：移除 mailto:your@email.com / github.com 脚手架占位，
  「联系方式」改为「获取应用」→ /download。

### Changed

- **花费金额改整数分存储**（精度修复）：`Expense.amount Float(元)` → `amountCents Int(分)`。
  浮点元直接求和会累积 0.1+0.2 类二进制误差；整数分求和永不丢精度。
  - 迁移内嵌 `scripts/apply-schema-migration.cjs`（幂等、值保持）：加列 → 元×100 回填 →
    删旧列。**特意在启动路径、prisma db push 之前执行**——新 schema 已删 amount 字段，
    db push 会 DROP 该列，回填不先行则历史金额永久丢失。
  - 元↔分换算单一事实源 `lib/modules/travel/money.ts`；API/前端契约仍是「元」，
    Web 与移动端 App 均无需感知；合计在整数分上求和后转回元。
  - 新增 `tests/unit/money.test.ts`（往返无损 / 0.1 类收口 / Int 上限 / 浮点对照）。
- **CSP 收紧**：生产 `script-src` 移除 `'unsafe-eval'`（React19/Next15/mermaid/katex
  运行期均不需要）；开发模式 HMR 依赖 eval 仅开发保留。
- **CORS 白名单收口**：允许主机名改由 `CORS_ALLOWED_HOSTNAMES` 环境变量配置
  （默认值保留历史域名与服务器 IP 兼容存量部署），换域名不再需要改代码。

### 验证

- typecheck 0 错误；vitest **53 文件 / 498 用例**全绿（+5 金额精度用例）；prisma schema valid。
- 版本 1.18.2/b37 → **1.19.0/b38**，四处版本一致自检通过。

---

## [1.18.2] - 2026-09-30

### Added（网站备案信息 · ICP / 工信部备案号 / 公安联网备案号）

- **备案信息补全**：`lib/icp.ts` 扩展为四类编号的单一来源 —— 网站 ICP `赣ICP备2024031528号-2`
  （www.yuanabd.cn 主站及 travel-notes / learn 子域名共用）、App ICP `赣ICP备2024031528号-4A`、
  工信部备案号 `30178737190355077`、公安联网备案号 `粤公网安备44010602017246号`（编号 44010602017246）。
- `components/IcpLicense.tsx` 改为四行「标签 + 可点击编号」：ICP（网站）→ 工信部备案系统、
  ICP（App）→ 工信部备案系统、工信部备案号 → 备案查询页、公安备案号（带官方警徽标识
  `public/brand/gongan-beian.png`）→ 全国互联网安全管理服务平台查询页；末行保留工信部备案系统网址。
  展示位沿用 6 处：账号设置 →「关于」、登录页、移动端首页底部、门户首页页脚、全站页脚、APK 下载页。
- **安装包内同步**：`android/app/src/main/res/values/strings.xml` 增加 `site_icp_license` /
  `miit_filing_no` / `police_filing_no` / `police_filing_query_url`；`AndroidManifest.xml` 同步增加
  4 条 `<meta-data>`；`public/icp-license.txt` 补全网站 + App 备案信息。
- **主站 www.yuanabd.cn**：新增 `site/yuanabd/filing-snippet.html`（页脚备案信息片段，唯一版本来源），
  `site/yuanabd/README.md` 增加部署目标（`public/brand/gongan-beian.png` →
  `/var/www/yuanabd/img/gongan-beian.png`）与 index.html 改动 ⑥。

### Changed

- 版本 1.18.1/b36 → **1.18.2/b37**（`bump-version.cjs`；typecheck 0 错误、vitest 493/493）。

### 验证

- APK：26,271,954 字节、SHA-256 `8a54cc5e…`；`aapt2 dump resources` 可读出四个编号，
  AndroidManifest 6 条 meta-data 均在；`apksigner` 证书 MD5 仍为 `f67e57f3…`（与备案登记一致）。

### 部署（2026-09-30）

- 生产 `.env` 对齐 1.18.2 / 37 + 新更新说明，`server-rebuild.sh` 重建上线：`/api/health` 与
  `/api/version` 均返回 1.18.2 / 37，`/download` 页直出四项备案信息与警徽。
- APK 复发布至 https://travel-notes.yuanabd.cn/downloads/tiantu.apk（新副本 `tiantu-20260930-v1.18.2-b37.apk`）。
- 主站 www.yuanabd.cn 页脚上线（index.html 备份于服务器 `~/backups/`）。
- learn.yuanabd.cn（learn-workbench 项目，不在本仓库）：落地页页脚已加入同一备案信息并**已上线**
  （其 apt 源 debian-security 502 + 服务器带宽限制使常规 Docker 重建不可用，改用「以现有镜像为基座
  只重编译 Next 产物」的快路径，约 40 秒完成，详见改动记录）。

---

## [1.18.1] - 2026-09-29

### Added（App 备案号 · 赣ICP备2024031528号-4A）

- **应用内展示备案编号**：按《工业和信息化部关于开展移动互联网应用程序备案工作的通知》与各应用商店
  上架规范（小米《APP备案编号的应用内展示指南》、华为/OPPO/vivo/应用宝同源要求）——App 内需在
  **显著位置**展示 App 备案编号，且编号可点击（或在编号下方）跳转工信部备案系统
  https://beian.miit.gov.cn/ 供用户查询。新增：
  - `lib/icp.ts`：备案号与备案系统地址单一来源（`ICP_LICENSE` 默认 `赣ICP备2024031528号-4A`；
    可用 `NEXT_PUBLIC_ICP_LICENSE` / `NEXT_PUBLIC_ICP_LICENSE_QUERY_URL` 覆盖）。
  - `components/IcpLicense.tsx`：统一展示块（「ICP 备案号：<编号>」+「工信部备案查询：<网址>」，
    两个链接均可跳转备案系统；根节点带 `data-icp-license`）。
  - 展示位置 6 处：**账号设置 →「关于」（新，规范推荐位）**、登录页（App 首屏）、移动端首页底部、
    门户首页页脚、全站桌面页脚、APK 下载页。
- **安装包内可扫描**：`android/app/src/main/res/values/strings.xml` 新增 `icp_license` /
  `icp_license_query_url` 字符串资源；`AndroidManifest.xml` 的 `<application>` 新增同名
  `<meta-data>`（运行期亦可用 `PackageManager.GET_META_DATA` 读取）；新增 `public/icp-license.txt`
  随静态壳打进 APK 的 `assets/public/icp-license.txt` —— 应用市场/备案核验扫描安装包
  （resources.arsc / AndroidManifest / assets / 内嵌 HTML）时均可读到备案号。
- 「账号设置 →「关于」」区块同时展示当前版本（v1.18.1 · build 36）。

### Changed

- 版本 1.18.0 / build 35 → **1.18.1 / build 36**（`scripts/bump-version.cjs`，`verify-version.cjs` 通过），
  OTA 更新说明同步更新（`app/api/version/route.ts`）。
- 重新打包 release APK：沿用 `tiantu-release.keystore`，包名 `com.tiantu.app`、签名与公钥不变，
  继续与已通过的 App 备案信息一致。

### 验证

- `npx tsc --noEmit` 0 错误；`npx vitest run` **493/493（52 files）** 通过。
- 静态壳 `www/`：20 个文件含备案号明文（15 个 HTML + 4 个 JS chunk + `icp-license.txt`）。

### 部署（2026-09-30）

- 生产 `.env` 的 `APP_VERSION` / `APP_BUILD_NUMBER` / `APP_CHANGELOG` 同步为 1.18.1 / 36（改动前已备份），
  `scripts/server-rebuild.sh` 完成 Docker 重建上线：`/api/health` 返回 1.18.1/36，`/download` 页直出备案号。
- APK 重新打包并复发布至 https://travel-notes.yuanabd.cn/downloads/tiantu.apk（SHA-256 `ae65426a…`，
  签名 MD5 `f67e57f3…` 与备案登记一致）。

---

## [1.18.0] - 2026-09-27

### Added（移动端 UI 精修 3.0 · 空间与旅行圈）

- **旅行圈真实类型筛选**：修复话题 chips 假筛选（点了没有任何效果）——改为按同行关系
  （独旅/与TA/与家人/与朋友/与闺蜜/结伴）真实过滤，API 新增 `travelType` 参数，
  recommended 热度缓存按类型隔离；筛选空态文案与「看全部」按钮配套。
- **旅行圈无限滚动**：IO 哨兵自动加载下一页（手动按钮保留兜底），底部加载/到底状态行。
- **空间退出确认 iOS 化**：`window.confirm` 浏览器弹窗 → ActionSheet（破坏性项红色）。
- **空间详情滚动折叠栏**：hero 滚出视口时浮出空间主题色毛玻璃 compact 栏（返回+空间名+设置）。
- **图片加载淡入**：通用 `m-img-fade`（onLoad 渐显，reduce-motion 直出），旅行圈封面与空间相册接入。
- **按压与 toast 统一**：空间卡片/详情行接入全局按压弹簧体系；列表页自绘 toast 收敛到全局
  ToastHost；旅行圈卡片接入 `m-card-pressable`。
- **清理**：旅行圈 3 处 `!important` 尺寸覆盖（违反规范 §2.6-10）移除；日期区间改为中文格式
  （`1月1日 – 1月5日`，跨年带年份）。

---

## [1.17.0] - 2026-09-27

### Added（移动端 UI 精修 2.0 · 流畅感与原生感）

- **按压弹簧化**：所有可按元素统一「按下快进（0.1s ease-out）、松手弹簧过冲回弹（0.4s spring）」两相位；档位收敛为控件 0.96 / 大卡片 0.985 / 小按钮 0.94。
- **BottomSheet / SideDrawer 2.0**：把手与标题栏跟手拖拽（内容区滚动不受干扰）、下拉过半或快速一甩直接关闭、不足弹簧回弹；进退场统一弹簧动画——关闭不再「瞬间消失」。13 个使用方零改动自动受益。
- **方向感知页面转场**：进入更深路径新页右滑入（push）、返回时左滑回（pop）、Tab 间轻淡入；底部 Tab 栏移出转场层，从此可以安全使用 translate 动画。
- **大标题滚动折叠**：`LargeTitle` 滚出视口顶部时浮出毛玻璃 compact 栏（返回键 + 居中小标题），16 处页面自动获得；IntersectionObserver 哨兵实现，零 scroll 监听。
- **下拉刷新 iOS 化**：纯 spinner 跟手旋转（进度 ×180°）、去掉文字标签、松手弹簧收位。
- **原生状态栏随主题联动**：新增 `@capacitor/status-bar`，图标风格与底色随暗色模式实时切换；新增 `@capacitor/keyboard`（resize=native）避免键盘遮挡弹层输入。
- **边缘右滑返回**：二级页（旅行详情/帖子详情/设置/收藏/通知/关注粉丝）左缘右滑即整页+Tab 栏方向性退场返回。

### Fixed
- `viewport-fit=cover` 缺失导致 `env(safe-area-inset-*)` 恒为 0（刘海/挖孔屏安全区退化为固定 20px）——已导出 Next viewport 配置。
- `theme-color` 写死 `#FAF6EE` 不随暗色切换——现由 `ThemeColorSync` 实时同步（Web meta + 原生状态栏共用一个观察器）。
- Android 12+ 拉伸 overscroll 效果未禁用——`overscroll-behavior-y: none`；全局 `touch-action: manipulation` 消灭 tap 高亮/双击延迟；界面框架禁长按选中。
- 方向转场动画 `fill-mode: both` 残留 transform 会把容器内 `position:fixed` 后代（折叠栏）锚点拖走——动画播完即移除动画类。

---

## [1.16.0] - 2026-09-25

### Added
- **「我的空间」模块（新）**：`/space` 空间列表 + `/space/[slug]` 空间详情页，取代原 `SpacePanel` 弹窗。
  - 空间详情含五段：一起记录的旅行 / 一起经营的相册 / 正在规划 / 最近的共同回忆 / 空间动态，外加成员与邀请。
  - 创建空间时可选类型（情侣 / 家庭 / 朋友 / 独旅 / 其他），**每类一套清新淡雅配色**（色源 Radix Colors，明暗双主题，WCAG AA 已逐项校核）。
  - 成员管理升级：角色调整（主人/成员/访客，保留最后一位主人）、邀请码可选角色与有效期、邀请记录三态（待使用/已使用/已过期）、移除与退出。
  - 空间动态复用既有 `AuditLog`（零改库），内容归属显示「谁创建的 / 最近谁改的」。
- 新增 `GET /api/spaces/[id]/overview`（一次取回空间详情页全部数据）、`PATCH /api/spaces/[id]`（改名/改简介/改类型/换封面）、`PATCH /api/spaces/[id]/members`（角色调整）。
- 组件预览台新增 `/dev/ui/space`（五套主题并列评审，生产构建 404）。
- 维护脚本：`scripts/backfill-space-member-userid.cjs`（回填成员 userId）、`scripts/gc-orphan-spaces.cjs`（孤儿空间治理，默认 dry-run）、`scripts/space-preview-shots.mjs`（预览台截图）。

### Fixed
- **空间协作被一列数据挡死**：`SpaceMember.userId` 在「加入空间」与「创建空间」两条路径里都从不写入，而权限判定有 username 与 userId 两套键 ——
  用邀请码加入的成员**看不到也改不了**空间内任何内容；`getUserCapabilities` 又把「查不到成员身份」当成单用户 `OWNER`，**成员越权**拿到主人能力。现已写入侧补齐 + 双键查询，并附回填脚本。
- **相册读路径漏了空间范围**：`listAlbums`/`getAlbum` 只认 userId，而 `canManageAlbum` 已允许空间成员编辑 —— 成员看不到彼此的相册却能改。现与 `listTravels` 统一走 `lib/modules/access/space-scope`。
- **中文名空间创建 100% 失败**：服务端 slug 只接受 ASCII，而前端生成的是中文 slug。现由服务端派生（中文名回退 `sp-xxxxxxxx`），前端不再填 slug。
- 后台空间管理创建时不传 `spaceType`，导致后台建的空间类型恒为「其他空间」；现已补类型选择并显示类型徽标。
- 空间加入/角色/统计的文案拼接重复（「调整了权限成员」「邀请了新成员邀请」）。
- `tests/e2e/me-archive.spec.ts`：统计断言会被 `CountUp` 动画中间帧误伤（整套跑首次必挂、重试必过），改为读取稳定值。

### Changed
- 《移动端设计规范》新增 **§2.8 受控多主题（仅空间模块）**；`scripts/check-design-tokens.mjs` 新增第 11 条 `spaceTokenLeak`（`--space-*` 只允许出现在空间模块范围内，实测 0 泄漏）。
- `/me` 的「我的空间」入口改为跳转 `/space`；旧 `components/space/SpacePanel.tsx` 删除。

---

## [1.0.0] - 2026-09-01

### 版本重置 · 全新起点
- 删除全部历史版本标签（v1.0.0~v3.0.1），从 1.0.0 重新开始版本号（versionCode=1）。
- 移动端（甜途 App）正式上线：媒体绝对 URL 修复、Cookie Secure、OTA 版本机制、游客可浏览公开内容。
- 包含阶段 A 性能优化（API 缓存头、统一取数层、查询优化、媒体直出、限流）。

---

# Changelog

本项目所有值得注意的变更均记录于此。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [3.0.1] - 2026-08-30

### Fixed
- 相册正确性止血（全面体检 Phase A）：
  - TravelBook 加载失败无限转圈（补 res.ok/失败态 UI/重试/AbortController）
  - 城市画册 React key 重复（travelId 恒 0 → 新增稳定 bookKey）
  - 删相册/移除媒体打碎其他相册或回忆引用（新增 AlbumMedia/MemoryMedia 引用检查）
  - 素描本 Escape 恒穿透（分层退出：查看器 > 目录 > 整本）
  - 素描本触屏拖拽翻页不跟手（touch 手势支持 + pointercancel 回弹 + 纵向滚动意图识别）
  - /album viewMode hydration mismatch（改挂载后读 localStorage）
  - 城市画册章节倒序（改日期升序，DAY 01=第一天）+ 跨源画册去重（Travel 优先）
  - 城市串册（findCityByName 收紧为精确/行政后缀/结尾/长查询四级）

### Security
- 油画链路 SSRF 根治（同源强校验，杜绝反斜杠/编码绕过）+ 同图计费去重 + 每用户限流
- /api/uploads 扩展名白名单（拒 .sql/.db/.svg 等）+ 单段 Range/206 实现
- 中间件：/api/admin/settings 移出公开白名单（子路由均自带鉴权）+ 段边界匹配
- 验证码日志脱敏（生产不落明文）；secret-crypto 解密失败留痕
- 删除含明文密码的 setup.sql

### Added
- 后台「油画生成」设置 Tab：总开关（DB 优先/环境变量回退）+ DashScope API key 在线管理（AES-256-GCM 加密落库，只回打码掩码）

### Removed
- 死代码清理：PhotoRiver/ParticleImageBg/GalaxyBackground/AlbumLightbox 组件、TravelBook 内 215 行死 Reader、/albums/[id] 死路由、复数 /api/albums 与 /api/video 路由（测试重定向到现役路由）
- 孤儿依赖 markmap-common/lib/view；@types/* 与 @capacitor/cli 移至 devDependencies
- v1.x 裸机部署时代文件（migrate-db.cjs/deploy.sh/ecosystem.config.js）

## [3.0.0] - 2026-08-25

### Added
- 产品定位升级「行迹 · 个人旅行记忆空间」（去情侣化）
- Capacitor Android 移动端（离线 SQLite、同步中心、APK 构建链）
- 多元旅行场景：Travel.travelType + companions（独旅/情侣/家庭/朋友/闺蜜/结伴）+ Space.spaceType + 相册类型分组/同行者筛选 + 档案「和 TA 们去过」聚合
- 旅行画册 2.0（Post 城市聚合出册）+ 内容管理 2.0（文章可见性 × 旅行圈分享解耦）
- UI V2/V3：品牌色暖陶土统一、语义 token、ui/ 组件库补全、暗色归一、移动端地图触摸手势

### Fixed
- Prisma Json 序列化严重 bug（jsonStrings:true）修复 companions 写读全崩
- MySQL 枚举迁移三步走（COUPLE→SPACE）修复部署顺序 bug

## [2.5.0] - 2026-08-16

### Added
- Travel 移动端记录（Phase 3 补充）：
  - 新增 /travel/[slug]/record 记录页（标题/内容/心情）
  - 新增 /api/travels/[id]/memories 与 /api/travels/by-slug/[slug]
- UI/性能（Phase 6）：全站图片迁移到 next/image（旅行/相册/地图/首页/上传等），视频播放器动态导入
- Media 2.0（Phase 4）：
  - 上传生成 Thumbnail/Preview/Blur 媒体变体并写入 MediaVariant
  - 新增 scripts/migrate-media.cjs（PostImage LongBlob → 本地文件 + Media 记录）
- Timeline 统一（Phase 5）：
  - timeline.service 优先读取 TimelineItem，回退 Travel/Memory
- UI/UX+性能（Phase 6）：
  - 旅行详情页 VideoPlayer 改为动态导入
- 工程化收尾（Phase 7）：
  - 新增 docs/BACKUP_AND_MONITORING.md（定时备份/恢复演练/监控/错误追踪）
- Travel 2.0 前台（Phase 3，进行中）：
  - Travel 模型增加 content/tags/location/cover 文章兼容字段
  - /travel 列表页优先读取新 Travel 模型（未迁移时回退旧 Post）
  - 新增 scripts/migrate-travels.cjs（Post(type=travel) → Travel）
- 安全与隐私补漏（Phase 1）：
  - 相册 API 服务端访问控制（album_token），前台解锁弹窗
  - 邮箱验证码落库（VerificationCode，只存哈希）+ nodemailer SMTP 发送
  - middleware CSRF Origin 校验 + 存储键 crypto.randomUUID
- 数据模型收敛（Phase 2）：
  - 新增 User 表（多账号基础），认证从 SiteSetting 平滑迁移到 User
  - 新增 TimelineItem 统一时间线表
  - Session / SpaceMember / Memory / AuditLog 增加 userId 外键
  - 新增 scripts/migrate-phase2.cjs 数据回填脚本
- 工程化基线（Phase 0）：
  - Vitest 测试框架 + 单元/安全回归测试（媒体校验、限流、Markdown XSS、认证、视频路径穿越、权限 IDOR、上传鉴权）
  - GitHub Actions CI（lint → typecheck → test → build）
  - CHANGELOG 与分支规范（develop / feature / fix / security / refactor）
- 修订版优化整改路线图（docs/Travel-Notes-2.0-优化整改路线图-修订版.md）

## [2.1.0] - 2026-08-10

### Added
- 相册粒子银河空间模式与粒子化照片留言
- 留言页 Three.js 粒子化背景

## [2.0.0] - 2026-08-10

### Changed
- 产品重构为情侣共同旅行与记忆系统
- P0 安全加固：Session 落库、上传/Markdown 安全、限流、安全头
- P1 架构收敛与数据模型：Space/Travel/Memory/Media/Album/AuditLog

## [1.x] - 更早版本

### Added
- 旅行记录、中国地图、弹幕、碎碎念、点赞、静态全文搜索、相册灯箱、移动端适配等早期功能（详见 git tag v1.0.0 - v1.1.0）
