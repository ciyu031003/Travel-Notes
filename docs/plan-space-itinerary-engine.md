# 空间旅行计划 · 规划引擎与全链路方案（v1 草案）

> 状态：**待你确认后再动代码**。本文只做架构核查 + 实施方案，不含任何代码改动。
> 编写时间：2026-11-28 · 对应版本 1.30.18 / build 82

---

## 0. 一句话结论

你要的不是"给计划页换皮"，而是把「旅行计划」从*记事本*升级成**结构化行程引擎**：
用户只填"住哪、吃啥、玩啥、怎么去"，系统按天/时段生成骨架，填完后一键生成**内容完整的旅行记录**（含每日交通、住宿、餐饮、景点、花销、照片），并且可以**同时公开到旅行圈**。
改动涉及 1 次数据库迁移、1 组新 API、3 个页面重写和 1 处全局布局修正。

---

## 1. 当前架构事实（已逐文件核查）

### 1.1 底部 Tab 栏与「新建旅行」页

| 事实 | 位置 |
|---|---|
| Tab 栏只在"非沉浸页"渲染；**新建页被显式排除在'隐藏'之外** | `components/layout/LayoutContent.tsx:56`：`isTravelDetailPage = /^\/travel\/[^/]+$/.test(pathname) && pathname !== '/travel/new'`，渲染处 `{!isTravelDetailPage && <MobileBottomNav />}` |
| 新建页 CTA 是"悬浮玻璃条"，高度预留按 **Tab 栏高度**算 | `app/travel/new/travel-new.css` 的 `.tn-cta-dock`：bottom 用了 `--m-tab-h` + 20px |
| 页面留白同样按 Tab 栏高度预留 | `travel-new.css` 表单容器 padding-bottom |

→ **结论**：隐藏 Tab 栏不能只改一行布尔；同时要把 CTA 下移到"占据原 Tab 栏位置"，并同步收紧页面底部留白，否则会出现一条空白带。

### 1.2 计划页顶部栏压状态栏

| 事实 | 位置 |
|---|---|
| 空间详情的"非 Hero 状态"靠 `.space-route` 壳补状态栏安全区 | `app/space/space.css:95`：`.space-route > *:not([data-space]) { padding-top: calc(var(--m-system-top) + 8px) }` |
| `/space/plans` 这个 query 参数路由**没有**包 `.space-route` | `app/space/plans/page.tsx` 直接 `<SpaceThemeScope>` + `m-gutter pt-2` |
| 计划详情的返回栏是 `LargeTitle`，右侧是自绘 44×44「编辑计划信息」按钮 | `components/space/plans/SpacePlanDetail.tsx:304` 附近 + `LargeTitle` |
| 对比：`/space/detail?slug=` 之前也踩过同一个坑，已补 `.space-route` | `app/space/detail/page.tsx` |

→ **结论**：根因是**路由不在空间安全区壳里**（不是图标本身定位错）。修法是把 `/space/plans` 纳入 `.space-route`（列表/详情/错误态都要），并让"编辑"按钮与返回键同处一个安全区内。

### 1.3 计划数据模型（现状）

```prisma
model SpaceTravelPlan {
  id, spaceId, title, destination, startDate, endDate, budget, note,
  status: PLANNING | CONFIRMED | DONE,
  tasks: Json?        // [{id,text,kind:TODO|PACK|PLACE,done,doneBy,doneAt}]
  createdBy / createdById, convertedTravelId? @unique, createdAt, updatedAt
}
```

**没有**：天、每一天的行程项、交通/住宿/餐饮的结构、照片、参与成员明细。
→ 所以现在"计划"无法承载你描述的详细度，也无法完整转成旅行记录。

### 1.4 旅行记录侧（可直接复用的结构化能力）

| 模型 | 关键字段 | 说明 |
|---|---|---|
| `Travel` | title, slug, location, startDate/endDate, budget, cover, coverMediaId, status, visibility(PRIVATE/SPACE/PUBLIC), travelType, companions | 旅行本体 |
| `TravelDay` | travelId, date, title, summary, sortOrder | 每一天 |
| `ItineraryItem` | travelDayId, startTime/endTime, title, type, locationId, notes, sortOrder | 行程项，type 已有 **SPOT / FOOD / HOTEL / TRANSPORT / ACTIVITY**（`lib/mobile/icon-system.ts:152`） |
| `Memory` | spaceId, travelId, travelDayId, title, content, happenedAt, media[] | 带图回忆，可按天挂 |
| `Expense` | travelId, 金额分, 分类, 分摊 | 花销 |

对应 API 也已存在：`/api/travels/[id]/days`、`/api/travels/[id]/itinerary`、`/api/travels/[id]/itinerary/[itemId]`。

### 1.5 现在的"转成旅行记录"做了什么（关键差距）

`lib/modules/space/space-plan.service.ts` 的 `convertPlan()` 目前只做：
```
建 Travel（title / dates / description=note / spaceId / travelType / budget）
→ 回填 convertedTravelId（幂等）
```
**不建天、不建行程项、不迁照片**。转换出来的是一条空壳旅行，用户还得从头再写一遍——这正是你说"要串起来"的断点。

### 1.6 公开到旅行圈（能力已有，缺用户入口）

- `lib/modules/social/travel-post.service.ts` 的 `syncTravelPost(travelId)`：当 `Travel.visibility === 'PUBLIC'`（或 `isPublic`）时 upsert `TravelPost`，否则删除。
- `travel.service` 的 create/update 已把这次投影放进事务，**改 visibility 就会自动进出旅行圈**。
- 但目前**没有面向用户的"发布到旅行圈"路由**（只有后台/导入路径），需要补一个轻量端点或直接复用旅行更新。

---

## 2. 需求拆解与验收标准

| # | 需求 | 验收标准 |
|---|---|---|
| R1 | 新建旅行页隐藏底部 Tab，CTA 下移顶替 | /travel/new 无 Tab 栏；CTA 距底部 safe-area+8px；键盘弹起时 CTA 跟随；页面无多余空白；其余页面 Tab 正常 |
| R2 | 计划页顶部栏避开系统状态栏 | 390×844（状态栏 44/47px）下返回键与"编辑计划信息"都不与状态栏重叠；滚动/键盘/横屏不回归 |
| R3 | **规划引擎**：按天数与偏好生成骨架 | 输入目的地/出发地/日期/交通/同行人/节奏/兴趣 → 输出 N 天 × 时段块骨架（Day1 交通+入住、末日返程）；块类型可直接映射 ItineraryItem.type |
| R4 | 计划页全面重构 | 天切换器、时间轴块、块编辑面板、进度与待办、成员协作；空态/骨架/错误态齐全 |
| R5 | 转换组件挪到页面最下方 + 液态玻璃 | 樱花粉→晚霞红渐变玻璃条（吸底），三态：未填完（提示缺什么）/可转换/已转换；不再出现在页面中部 |
| R6 | 转换"内容完整"的旅行记录 | 生成 Travel + TravelDay + ItineraryItem（含时间与类型）+ 每日照片（Memory）+ 预算；详情页打开即是完整行程 |
| R7 | 一键同时公开到旅行圈 | 转换流程内可勾选"公开到旅行圈"；公开后 /circle 出现该文章；取消公开则下架 |
| R8 | 全流程串联 | 空间 → 计划 → 引擎骨架 → 逐块填写 → 生成记录 → 公开 → 圈内可见，一条链路走通且可回看 |

---

## 3. 数据模型方案

### 3.1 推荐：扩展 `SpaceTravelPlan`（JSON 行程）+ 少量结构化字段

理由：与现有 `tasks Json` 同风格；一次 PATCH 原子更新；离线缓存/同步层不需要新增实体；未来要拆表可以按 `schemaVersion` 平滑迁移。

```prisma
model SpaceTravelPlan {
  // …既有字段保留…
  /// 结构化行程：{ v: 1, days: [ { date, title, theme, summary, blocks: [...] } ] }
  itinerary     Json?
  /// 规划输入与元信息：{ departureCity, transportMode, pace, interests[], travelers[], budgetSplit, engineVersion, generatedAt }
  planMeta      Json?
  /// 计划封面（复用空间/媒体体系；转换时作为 Travel.coverMediaId）
  coverMediaId  Int?
  /// 行程最后编辑人/时间（协作提示用）
  lastEditedBy  String?  @db.VarChar(255)
}
```

块结构（`itinerary.days[].blocks[]`）建议：
```json
{
  "id": "b_171xxxx",
  "kind": "TRANSPORT | HOTEL | FOOD | SPOT | ACTIVITY | FLEX",
  "startAt": "2026-12-06T09:00",
  "endAt":   "2026-12-06T11:30",
  "title": "上海 → 杭州（高铁 G7301）",
  "place": "虹桥站 → 杭州东站",
  "cost": 146,
  "note": "06:40 出门，预留安检时间",
  "mediaIds": [],
  "done": false,
  "updatedBy": "sakura467950",
  "updatedAt": 1795xxxx
}
```
块 `kind` → 转换时的 `ItineraryItem.type`：TRANSPORT/HOTEL/FOOD/SPOT/ACTIVITY；FLEX 转 ACTIVITY。
天结构里保留 `title`（如"抵达杭州"）与 `theme`（如"西湖慢走"），转换时写入 `TravelDay.title/summary`。

### 3.2 备选（不推荐 v1 使用）：拆表 `SpacePlanDay` / `SpacePlanItem`

优点：可做逐条并发编辑/附件外键；缺点：多 2 张表 + 4~6 个端点 + 与空间成员权限矩阵交叉，实施成本约 +2 人日，且离线缓存层要新增实体。**建议 v2 再做**，届时用 `itinerary.v` 迁移。

### 3.3 迁移与兼容

- 新增列全部可空 → 老计划读取时 `itinerary == null`：显示"旧版计划"布局（保留现有 tasks 清单）+ 一个"生成日程骨架"按钮，点后按既有日期生成。
- 回滚：只读 null 处理，不需要降级脚本；新列不被老代码读取。

---

## 4. 规划引擎（核心）

### 4.1 输入

| 输入 | 来源 | 默认 |
|---|---|---|
| destination | 计划已有 | 必填 |
| departureCity | 新增（引擎表单） | 空→骨架里留"从哪里出发"占位 |
| startDate / endDate | 计划已有 | 必填 |
| transportMode | 新增：FLIGHT / TRAIN / DRIVE / MIXED | TRAIN |
| pace | 新增：RELAXED / STANDARD / PACKED | STANDARD |
| interests | 新增多选：美食 / 自然 / 人文 / 购物 / 亲子 / 夜生活 | [] |
| travelers | 空间成员 | 当前用户 |
| budget | 计划已有 | 空→不分配 |

### 4.2 规则（确定性、可测试）

1. `dayCount = 含首尾的日期差`（1–30 天，超 30 天只生成前 30 天 + 提示）。
2. **第 1 天**：`TRANSPORT`（出发地→目的地，默认 09:00，title 按交通方式："上海 → 大理（航班 MU5731）"）→ `HOTEL`（15:00 入住，title 占位"入住 XX 酒店"）→ `FOOD`（18:30 晚餐，占位"找一家本地菜"）。若到达早于 12:00，插入一个 `FLEX`（轻松散步）。
3. **中间天**（第 2 ~ N-1 天）按节奏决定块数：
   - RELAXED：3 块（早/主活动/晚）
   - STANDARD：4 块（早/上午/下午/晚）
   - PACKED：5~6 块（+ 夜生活 + 机动）
   兴趣注入占位文案：美食→"本地人推荐的小馆"；自然→"近郊徒步/湖边"；人文→"博物馆/老街"；亲子→"亲子友好景点"。
4. **最后一天**：`FOOD`（早餐）→ `HOTEL`（11:00 退房）→ `TRANSPORT`（返程，默认 14:00，方向反转）。
5. **单日行程**：一天里合并进/出交通 + 1 个活动，避免生成空天。
6. **预算分配**（有 budget 时给软目标，不强制）：交通 35% / 住宿 30% / 餐饮 20% / 门票活动 15%，写入 `planMeta.budgetSplit`，UI 在分类标题旁显示"建议 ¥xxx"。
7. **时间默认值**：早 08:30 / 午 12:00 / 晚 18:30；用户可改；改任意块时间不自动重排其他块（避免"我改一个全乱"），但提供"按时间排序"按钮。
8. **引擎版本**：`planMeta.engineVersion = 1`；只在新生成或用户点"重新生成"时覆盖，永不静默改动用户已填内容（重新生成需二次确认，且只补空块）。

### 4.3 输出示例（3 天）

```
Day 1 · 抵达杭州
  09:00 TRANSPORT 上海 → 杭州（高铁 G7301）     [空占位：车次/时刻]
  15:00 HOTEL     入住西湖边酒店                  [空占位：酒店名/地址]
  18:30 FOOD      找一家本地菜（河坊街一带）      [空占位：店名/人均]
Day 2 · 西湖慢走
  08:30 FOOD      酒店早餐 / 街边早点
  10:00 SPOT      西湖环湖（断桥 → 白堤）         [空占位：具体点位]
  12:30 FOOD      午餐
  15:00 ACTIVITY  下午：茶馆 / 手作 / 骑行
  18:30 FOOD      晚餐
Day 3 · 返程
  08:30 FOOD      早餐
  11:00 HOTEL     退房（寄存行李）
  14:00 TRANSPORT 杭州 → 上海（高铁）             [空占位：车次]
```

### 4.4 实现位置与可测试性

- 纯函数：`lib/modules/space/plan-engine.ts`（输入 → itinerary JSON，无 IO、无随机，可 100% 单测）。
- 服务端只在"创建计划"和"重新生成"时调用；前端预览也调同一函数（同构，保证一致）。
- 单测覆盖：天数 1/2/3/7/30、四种交通、三种节奏、兴趣组合、预算分配、跨月/跨年日期、单日行。

---

## 5. API 设计

| 方法 | 路径 | 用途 | 备注 |
|---|---|---|---|
| POST | `/api/spaces/[id]/plans` | 创建计划（可带 engine 输入） | 服务端生成 `itinerary` + `planMeta` |
| PATCH | `/api/spaces/[id]/plans/[planId]` | 改计划信息 / 单块更新 / 排序 / 勾选 | 新增 `patchBlock`、`reorderBlocks`、`regenerate` 三种动作，避免整表覆盖 |
| POST | `/api/spaces/[id]/plans/[planId]/convert` | 转成旅行记录 | 扩展：写 days/itinerary/照片；body `{ publish?: boolean }` |
| POST | `/api/travels/[id]/publish` | 发布/取消发布到旅行圈 | 轻量端点，内部走 travel 更新（自动 syncTravelPost） |

兼容：现有 PATCH 的 `tasks` 语义保留（打包清单仍是独立能力），新行程用 `itinerary`。

---

## 6. 页面与交互设计

### 6.1 计划详情（重写）

```
[状态栏安全区]
← 返回        计划名（可折叠标题）        [编辑信息]
Hero：目的地 · 日期 · N 天 · M 人 · 状态（规划中/已敲定）
进度条：已填 12/18 个安排 · 缺 2 天晚餐
天切换：[Day 1][Day 2][Day 3] …（横向滚动，吸顶）
─────────────────────────────
Day 1 · 抵达杭州            [整理][+ 加一项]
 09:00  🛫  上海 → 杭州（高铁 G7301）  ¥146   [未填车次] ›
 15:00  🏨  入住西湖边酒店              [选酒店]  ›
 18:30  🍜  找一家本地菜                [填店名]  ›
（点击块 → 底部玻璃面板：类型/时间/标题/地点/花销/备注/照片/删除）
─────────────────────────────
出行清单（打包/待办，沿用 tasks，折叠）
参与成员（头像 + 各自填写进度）
─────────────────────────────
[ 柔和液态玻璃 · 樱花粉→晚霞红 ]
   ✨ 一键生成旅行记录
   ☑ 同时公开到旅行圈
```

要点：
- **块 = 卡片**，左侧时间轴，右侧类型图标；空块用虚线 + "填内容"CTA，填完变实心并打勾。
- 天切换吸顶（与返回栏层级分离），切天不滚动整页。
- 编辑块用 BottomSheet（键盘避让 + safe area），保存后局部更新，不整页刷新。
- 底部 CTA 放页面最下方（不吸底遮挡内容时用 `position: sticky` 或 fixed + 底部占位），玻璃质感与颜色见 §6.3。

### 6.2 发起计划（改写）

表单分组：去哪里（目的地/出发地/交通方式）→ 什么时候（日期，自动算 N 天）→ 怎么玩（节奏/兴趣）→ 谁一起（空间成员多选）→ 预算。
提交后**直接进入生成好的计划详情**，并把"第 1 个空块"高亮，引导开始填。

### 6.3 转换组件（液态玻璃 · 樱花粉→晚霞红）

- 位置：页面最下方（不再放中段）。
- 视觉：复用 `app/glass.css` 的 `.lg-card` 语言，新增 `.plan-convert-card`：`background: linear-gradient(150deg, 樱花粉 0%, 晚霞红 100%)`（token 化，放 CSS），叠加 rim 高光 + 内高光 + 大软影；内部主按钮用半透明白玻璃。
- 状态机：`incomplete`（缺 N 项 → 点按滚动到第一个缺口）/ `ready` / `converting` / `converted`（显示"去看旅行记录 →"）。
- 公开开关：默认关；打开时提示该旅行会出现在旅行圈（一句话，不啰嗦）。

### 6.4 全流程串联

```
空间详情 →「一起计划的旅行」→ 计划详情（引擎骨架）
   ↓ 逐块填写（地点/吃什么/住哪/玩什么/花销/照片）
底部玻璃卡「一键生成旅行记录」
   ↓ 转换（幂等）
旅行记录详情（每天有行程项、照片、花销、预算）
   ↓ 勾选"同时公开到旅行圈"
/circle 出现该旅行文章（TravelPost，可点赞/评论/收藏）
   ↓ 计划卡显示「已成旅行记录」+「已公开」
```

---

## 7. 转换实现细节（R6/R7）

服务端 `convertPlan` 扩展为事务：
1. 建 `Travel`（title/dates/location=destination/budget/description/spaceId/travelType/coverMediaId）。
2. 对每个 plan day：建 `TravelDay`（date/title/summary/sortOrder）→ 每个 block 建 `ItineraryItem`（type 映射、startTime/endTime 由 `date + startAt` 组合、title/notes、sortOrder）。
3. 每天若有多媒体：建一条 `Memory`（travelDayId、content=day.summary、mediaIds）—— **只在该天有照片或备注时创建**，避免空回忆。
4. 回填 `convertedTravelId`；整个过程在同一事务，失败回滚。
5. `publish === true` → `Travel.visibility = 'PUBLIC'`（触发已有 `syncTravelPost`）→ 返回 `{ travelSlug, published }`。
6. 幂等：已转换则返回既有旅行（`alreadyConverted`）；提供"用计划更新旅行记录"作为 v2 能力（`mode=resync`，只更新未手改过的天/项，规则要再定）。

权限：沿用空间角色（OWNER/MEMBER 可转换，VIEWER 只读）；公开需要旅行 visibility=PUBLIC，作者归属沿用 `resolveAuthorId`（ownerId → space OWNER）。

---

## 8. 分阶段实施计划

| 阶段 | 内容 | 主要文件 | 估时 | 验收 |
|---|---|---|---|---|
| **P0 修正** | ① /travel/new 隐藏 Tab + CTA 下移；② /space/plans 纳入安全区 | `components/layout/LayoutContent.tsx`、`app/travel/new/travel-new.css`、`app/travel/new/page.tsx`、`app/space/plans/page.tsx`、`components/space/plans/SpacePlanDetail.tsx` | 0.5 人日 | 390×844 无重叠/无空白带；其余页 Tab 正常 |
| **P1 引擎与数据** | `plan-engine.ts` 纯函数 + 单测；Prisma 迁移（itinerary/planMeta/coverMediaId/lastEditedBy）；创建/更新/重新生成 API | `lib/modules/space/plan-engine.ts`、`prisma/schema.prisma`、`prisma/migrations/*`、`space-plan.{service,repository}.ts`、`app/api/spaces/[id]/plans/**` | 1.5 人日 | 引擎单测全绿；创建接口返回完整 JSON |
| **P2 计划 UI 重写** | 计划详情（天切换/时间轴/块编辑/进度/成员）+ 发起计划表单 + 空态/骨架 | `components/space/plans/**`、`app/space/plans/**` | 2 人日 | R3/R4 验收 |
| **P3 转换与公开** | convert 写 days/items/memories；底部樱花粉玻璃卡；`/api/travels/[id]/publish`；旅行详情回显 | `space-plan.service.ts`、`SpacePlanDetail.tsx`、`components/space/plans/plan-convert-card.tsx`、`app/api/travels/[id]/publish/route.ts` | 1.5 人日 | R5/R6/R7 验收：转换后有 N 天行程 + 圈内可见 |
| **P4 打磨与发布** | 动效（复用 motion-tokens）、暗色/安全区/键盘、全链路 E2E、构建发布 1.30.19 | 上述 + `CHANGELOG.md` | 0.5 人日 | 截图矩阵 + 门禁 + OTA |

合计约 **6 人日**（不含等待评审）。

---

## 9. 测试与验收清单

- **单测**：引擎（天数/交通/节奏/兴趣/预算/边界）、转换映射（block.kind→ItineraryItem.type、日期时间组合）、幂等。
- **接口**：创建带引擎、PATCH 单块、重新生成只补空块、convert（含照片/预算）、publish 开/关、VIEWER 403、跨空间 404。
- **E2E（390×844）**：新建计划 → 填 3 块 → 生成记录 → 详情页显示 3 天 + 行程项 → 公开 → /circle 出现 → 取消公开 → 消失。
- **视觉**：计划详情亮/暗、天切换、块编辑面板、底部玻璃卡三态、空间详情入口、旅行记录详情、圈内文章。
- **性能**：7 天 × 6 块渲染 p95 帧间隔；转换耗时；计划页首屏。
- **无障碍**：天切换 tablist/aria-selected、块按钮 aria-label、Editor Sheet 焦点陷阱、reduce-motion。

---

## 10. 风险与待你确认的决策

| # | 决策点 | 建议 |
|---|---|---|
| D1 | 行程存 JSON 还是拆表？ | **JSON（v1）**，拆表留 v2 |
| D2 | 转换后是否允许"用计划更新旅行记录"？ | v1 只做一次性转换；v2 加 resync |
| D3 | 计划里能不能放照片？ | v1 支持（块级 mediaIds + 计划封面），转换时落到当天 Memory |
| D4 | 公开默认开还是关？ | **默认关**，用户勾选才公开（隐私优先） |
| D5 | 计划编辑是否要离线可用？ | v1 不做离线写（读走 local-first 缓存），v2 接同步队列 |
| D6 | 转换出来的旅行是否标"计划中"状态？ | 是：`status = PLANNED`，用户结束旅行后可改"已完成"并归档票根 |
| D7 | 是否要"重新生成骨架"按钮覆盖用户已填内容？ | 只补空块，覆盖需二次确认 |

---

## 11. 需要你确认的三件事

1. 数据模型走 **JSON（快）** 还是拆表（重但更可扩展）？
2. 转换出来的旅行记录，**天标题/块文案**要不要带上"引擎建议"的痕迹（如"（本地人推荐）"），还是只留用户填的内容？
3. 公开到旅行圈的开关放在**转换卡片上**（一次决定），还是转换后在旅行详情页再决定？（可两处都有）
---

## 附录 A · 「行程存 JSON」的保密性 / 性能 / 本地缓存 / 上云 评估

> 针对「JSON 会不会不安全、会不会更快、能不能写本地缓存、方不方便传云端」的核查结论。
> 样张实测：7 天 × 6 块（含标题/地点/备注/mediaIds）的行程 JSON = **16,912 字节（约 17KB）**。

### A1 保密性 / 安全性：**存储格式不是安全边界**

| 维度 | JSON 列 | 拆表 | 结论 |
|---|---|---|---|
| 谁能读 | API 的 `withAuth` + `requireSpaceMember/Role` 决定 | 同 | **完全一样**，JSON 不会因为"塞在一个字段里"就更容易泄露 |
| 数据库被拖库 | 明文可读（导出一行即全部行程） | 明文可读（导出多行） | 一样；差异只是"一次拿到全部" vs "一次拿到一页" |
| 越权/注入 | 只需校验一个 JSON 入参 | 每个字段都要校验 | JSON 校验点更少，但**必须做 zod 白名单**（否则可塞任意字段） |
| 渲染 XSS | React 自动转义，只要不 `dangerouslySetInnerHTML` | 同 | 一样 |
| 引用完整性 | `mediaIds` 无外键，需服务端校验"属于该空间" | 外键天然约束 | 拆表更好一点；JSON 用校验补上 |
| 审计/追溯 | 整块 JSON 覆盖，字段级 diff 需自己做 | 行级 updatedAt 好查 | 拆表更好一点 |

**结论**：JSON 不降低保密性——真正的边界是"API 鉴权 + 入参校验 + 传输 TLS + 静态加密"。
JSON 带来的**新增风险只有 3 个**，都可控：
1. 大 JSON DoS（必须限 256KB、天数 60、每天 20 块、字符串长度）；
2. 任意字段注入（zod `strict` 白名单，拒绝未知键）；
3. `mediaIds` 越权引用（提交时校验每个 media 属于该 space）。

**如果"保密"是重点**，JSON 反而有一个拆表没有的优势：**列级加密很简单**。
`itineraryEnc` 用 AES-256-GCM 加密后存字符串（key 放 env/KMS），服务端读出解密再返回；
拆表方案要给几十行逐行加密、且每条都要密钥管理，成本高得多。代价是服务端失去"按行程项查询"的能力 —— 我们的场景不需要。

### A2 性能：**读更快、写也快，但"整列重写"是唯一代价**

| 操作 | JSON（1 行） | 拆表（1 Travel + N Day + M Item） |
|---|---|---|
| 打开计划详情 | **1 次 SELECT（1 行）** | 3 次查询或 2 层 join，返回 N+M 行 |
| 保存一个块 | 1 次 UPDATE（重写 ~17KB 列） | 1 次 UPDATE（1 行，几十字节） |
| 生成整个骨架 | 1 次 UPDATE | 1 + N + M 次 INSERT（或批量） |
| 渲染 | 前端一次拿到天+块，天然按天分组 | 前端还要做 rows → 天/块 的组装 |
| 负载上限 | 17KB / 7 天；30 天 × 6 块 ≈ 70KB，仍在毫秒级 | 行数约 210 行，查询开销上升 |

MySQL 8.4 的 JSON 列上限 1GB，业务上我们限 256KB 足够。17KB 列重写在 MySQL 里是**几十微秒到毫秒级**，远小于一次网络往返。
**结论**：在"单人/小群、低并发、按天阅读"的场景，JSON 读写路径更短、首屏更快；
只有在**多人同时编辑不同块**时，JSON 的读-改-写会丢更新，需要乐观锁（version/CAS，冲突返回 409 让前端合并）——这是 JSON 唯一实质代价。

### A3 本地缓存：**JSON 更适合本地优先**

- **Web 端**：现有 local-first 层的 IndexedDB KV（`tiantu-local`）本来就是"整包 JSON"存储，`lf:acc:<userId>:plan:<planId>` 直接放行程 JSON，读出来就是完整计划，零转换。
- **原生端（SQLite）**：建议加一张极简缓存表
  `space_plan_cache(spaceId, planId, json, updatedAt)`（一次迁移，无外键），
  或复用 `home_snapshot` 那种 key→json 的通用表。**拆表方案则要在 SQLite 里镜像 3 张表 + 写映射 + 冲突合并**，工作量和出错面都更大。
- **转换之后**：旅行记录仍然是关系表（TravelDay/ItineraryItem/Memory），所以"相册、时间线、票根、圈内展示"的逻辑完全不受影响 —— **JSON 只存在于"计划草稿"阶段**。

### A4 上传云端：**JSON 更省事，拆表要新增同步实体**

- JSON：现有 `PATCH /api/spaces/[id]/plans/[planId]` 一个字段上传，离线队列只需"一条计划载荷"，与现有 sync 队列的单条 payload 模型完全贴合（`space-plan` 同步实体只需 1 个）。
- 拆表：要在 sync 队列里新增 `SpacePlanDay` / `SpacePlanItem` 两个实体，各自 LWW 合并、父级顺序重排、删除级联，离线冲突规则显著复杂。

### A5 推荐（与本方案一致）

**计划草稿用 JSON**（+ version 乐观锁 + zod 白名单 + 256KB 上限 + mediaIds 归属校验 + 可选列级加密），
**转换后的旅行记录用关系表**（已存在，不动）。
未来如果出现「多人实时协同编辑 / 逐块评论 / 逐块附件查询」的真实需求，再按 `itinerary.v` 平滑迁到拆表。
---

## 修订 R1（2026-11-28）：明确「多人实时协同编辑」后，数据模型改为**关系表**

> 触发：产品方明确「新建的旅行计划未来一定要多人实时协同编辑」。
> 结论：**放弃把行程存 JSON 的方案，改为 SpacePlanDay + SpacePlanItem 关系表**，并在 P1 就把行级版本与实时通道协议定下来。

### R1.1 为什么"要协同"就推翻 JSON

JSON 列的并发模型是「整列读-改-写」：两个人同时改不同块时，服务端必须在一个事务里重读整行、应用改动、写回，相当于**把所有编辑串行化**；
一旦有人基于旧快照提交，就得靠 version 冲突返回 409 让前端重试——人一多就是"你改完我这边报冲突"。

关系表是**行级原子写**：A 改 Day1 晚餐、B 改 Day3 景点，是两条独立 UPDATE，数据库层面天然无冲突、无 409；
实时广播也只需推"哪一行变了"，而不是"整份行程变了"，消息体积小一个数量级。

> 一句话：JSON 适合"一个人写、偶尔有人看"，实时协同要的是"行级并发 + 增量广播"。

### R1.2 新数据模型（4 张表）

```prisma
enum SpacePlanItemKind { TRANSPORT HOTEL FOOD SPOT ACTIVITY FLEX }

model SpacePlanDay {
  id        Int      @id @default(autoincrement())
  planId    Int
  date      DateTime? @db.Date
  title     String?  @db.VarChar(120)
  theme     String?  @db.VarChar(60)
  summary   String?  @db.Text
  sortOrder Int      @default(0)
  version   Int      @default(0)      // 行级乐观锁
  updatedBy String?  @db.VarChar(255)
  updatedAt DateTime @updatedAt
  plan  SpaceTravelPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  items SpacePlanItem[]
  @@unique([planId, sortOrder])
  @@index([planId, date])
}

model SpacePlanItem {
  id        Int      @id @default(autoincrement())
  dayId     Int
  kind      SpacePlanItemKind @default(SPOT)
  startAt   DateTime? @db.Timestamp(3)
  endAt     DateTime? @db.Timestamp(3)
  title     String   @db.VarChar(200)
  place     String?  @db.VarChar(200)
  costCents Int?                       // 金额用分，和 Expense 一致
  note      String?  @db.Text
  done      Boolean  @default(false)
  doneBy    String?  @db.VarChar(255)
  sortOrder Int      @default(0)
  version   Int      @default(0)
  updatedBy String?  @db.VarChar(255)
  updatedAt DateTime @updatedAt
  day   SpacePlanDay @relation(fields: [dayId], references: [id], onDelete: Cascade)
  media SpacePlanItemMedia[]
  @@index([dayId, sortOrder])
}

model SpacePlanItemMedia {          // 块级照片（协同时可单独增删，不整块覆盖）
  id       Int @id @default(autoincrement())
  itemId   Int
  mediaId  Int
  sortOrder Int @default(0)
  item  SpacePlanItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  media Media         @relation(fields: [mediaId], references: [id], onDelete: Cascade)
  @@unique([itemId, mediaId])
}

model SpacePlanEvent {              // 增量广播 + 断线补播 + 审计（三合一）
  id        Int      @id @default(autoincrement())  // 单调递增 = 游标
  planId    Int
  actor     String   @db.VarChar(255)
  action    String   @db.VarChar(40)   // day.update / item.create / item.update / item.delete / item.reorder / plan.update
  payload   Json                       // 变化的行（含新 version）
  createdAt DateTime @default(now())
  @@index([planId, id])
}
```

`SpaceTravelPlan` 只保留计划级字段（title/destination/dates/budget/note/status/coverMediaId/planMeta/version/convertedTravelId），
不再有 `itinerary Json`；`planMeta` 仍存引擎输入（出发地/交通/节奏/兴趣/预算分配/engineVersion），这是"一次性输入"，不需要协同。

### R1.3 实时协同协议（P1 定协议，P2 上通道）

| 层 | 能力 | 实现 | 工期 |
|---|---|---|---|
| **L1 实时看到** | 别人改完 1 秒内看到 | SSE：`GET /api/spaces/[id]/plans/[planId]/stream?since=<eventId>`；事件来自 `SpacePlanEvent`（同一事务写入，保证"数据落库=广播发生"） | 1 人日 |
| **L2 同块冲突** | 两个人在同一块上改，不互相覆盖 | 行级 `version` 乐观锁：PATCH 带 `version`，不匹配返回 409 + 当前行；前端提示"这条刚被 X 改过"，可一键采用对方/保留自己的 | 0.5 人日 |
| **L3 字级同编** | 同一段文字里两个光标同时打字 | Yjs CRDT + WebSocket（`note` 等长文本字段）；DB 行仍是权威副本，Yjs 文档定期快照。**本阶段不做**，只把 `note` 设计成可替换的纯文本字段留口子 | +3~5 人日 |
| 在线状态 | 谁在看/谁在编辑哪块 | 内存 presence（`planId → [{user, itemId, lastSeen}]`，15s 心跳 / 45s 过期），随 SSE 推给同计划成员；单容器部署够用，未来多副本再加 Redis pub/sub | 0.5 人日 |

**为什么不直接上 Yjs/CRDT**：本产品的协同粒度是"块"（谁订酒店、谁排晚餐），不是"同一段文字逐字合写"；
块级行锁 + SSE 已经能覆盖 95% 的多人规划场景，而 Yjs 需要 WebSocket 服务、快照持久化、多副本广播，成本和运维面高一个量级。

**断线补播**：SSE 连接建立时带 `since=<最后收到的 eventId>`，服务端从 `SpacePlanEvent` 回放；客户端本地缓存也按 eventId 记账，离线重连后先补播再拉快照，保证不丢改动。

### R1.4 离线与本地缓存（表结构下的做法）

- **原生端**：在 SQLite 里镜像 `space_plan / space_plan_day / space_plan_item` 三张表（sync 引擎已有"实体表 + LWW"模式，照 travel/social_post 的做法接即可）。
- **Web 端**：local-first 层存三张表的规范化快照 + `lastEventId`；页面先出缓存，SSE 连上后按事件增量更新。
- **离线写**：排队"操作"（item.create/update/delete/reorder），每条形如 `{planId, itemId, baseVersion, patch, at}`；重连后按序提交，冲突按 L2 规则处理并提示。
- 这比 JSON 方案多的是"三张表的映射"，少的是"整包覆盖带来的丢更新与 409 重试"。

### R1.5 工期影响

原方案 6 人日 → 调整后 **约 8 人日**：
- P1 引擎与数据：1.5 → **3 人日**（多 4 张表、仓储/服务/权限、事件表与流式端点、行级版本）
- P2 计划 UI：2 → **2.5 人日**（多"正在编辑"提示、冲突提示、增量合并）
- P3 转换与公开：1.5 → 2 人日（转换读表建 TravelDay/ItineraryItem；公开链路不变）
- P0 修正 0.5 + P4 打磨 0.5 不变

### R1.6 还需要你确认的协同边界

1. **协同层级**：只要 L1+L2（秒级看到 + 同块冲突提示），还是必须做到 L3（同段文字双光标）？
2. **在线状态**：要不要显示"谁正在编辑 Day 2 的晚餐"（需要 presence，+0.5 人日）？
3. **历史版本**：计划要不要"回滚到昨天"（`SpacePlanEvent` 已能支撑，但 UI 另算 1 人日）？
4. **离线编辑**：手机没网时能否改计划（决定是否现在接"操作队列"，+1 人日）？
