# B · 数据层实施报告（task-7 / P1-15 + P2-32 travel 部分）

实施人：impl-data ｜ 依据：`docs/review/行迹-全维度评审报告-2026-10-18.md` §4 P1-15（D-2）、P2-32（C-1）

## 1. 改了哪些文件

| 文件 | 类型 | 说明 |
|---|---|---|
| `lib/modules/travel/travel.service.ts` | 改 | 多表写事务化 + 去静默；1162 → **830 行**（拆分前 → 后） |
| `lib/modules/travel/travel.mapper.ts` | 新增（248 行） | 行 → DTO 纯函数：`mapTravelSummary` / `mapTravelList` / `mapTravelDetail` / `mapTravelPublicDetail` / `mapTravelTimelineDays` / `mapExpenseRecords` / `mapExpenseList` / `safeParseTags` / `iso` / `isoBudget` |
| `lib/modules/travel/travel.policy.ts` | 新增（266 行） | 规则与日期计划：`parseTimeOrDate`（墙上时间）/ `planTravelDayDates` / `planDaySpan` / `planDayAlignment` / `dayTitle` / 标题与预算归一 / `makeUniqueTravelSlug` / `canManageTravel` / `assertCoverMediaBelongs` / `findTravelIdBy*` |
| `lib/modules/travel/travel.types.ts` | 新增（140 行） | 读模型 DTO 类型（纯类型，避免 mapper ↔ service 循环依赖） |
| `lib/modules/travel/space-travel.service.ts` | 改 | 6 处 `.catch(() => {})` → `bestEffort(label, fn)` + `console.error` |
| `lib/modules/social/social.service.ts` | 改 | `updateSocialPost` 三表进同一事务；`notify` 去静默 |
| `lib/modules/social/travel-post.service.ts` | 改（Lead 批准扩范围） | `syncTravelPost` / `publishTravelPost` / `unpublishTravelPost` 增加可选 `tx?: Prisma.TransactionClient`；3 处 `.catch(() => {})` → try/catch + `console.error` |
| `tests/unit/travel-write-transaction.test.ts` | 新增（9 例） | 事务边界 / 失败传播 / 去静默 |
| `tests/unit/travel-split.test.ts` | 新增（20 例） | mapper / policy 纯函数回归 |
| `tests/unit/travel-day-sync.test.ts` | 改 | mock 增加 `$transaction` 与 travel-post mock（断言未削弱） |

`prisma/schema.prisma`、`app/api/**`、页面组件、offline 目录**未改动**。

## 2. 关键决策

### 2.1 事务边界与失败语义（分层，避免把可用性一起锁死）

| 入口 | 事务内包含 | 失败处理 |
|---|---|---|
| `createTravel` | `tx.travel.create` + `syncTravelPost(id, tx)` + `ensureTravelDays(id, s, e, tx)` | `ensureTravelDays` 失败 → **整体回滚抛错**（老实现是 `.catch` 后返回成功，用户得到 0 天旅行）；`syncTravelPost` 失败 → 记日志继续（TravelPost 是 Travel 的派生投影，可重算） |
| `updateTravelInfo` | `tx.travel.update` + `syncTravelPost(id, tx)` + `syncTravelDayDates(id, s, e, tx)` | 主表失败 → 抛错；post/day 同步失败 → 记日志后提交（保持原「同步失败不失败主操作」语义），`daysChanged` 返回 0 |
| `updateTravel` | 主表 + post 同步 | 同上 |
| `deleteTravel` | `unpublishTravelPost(id, tx)` + `tx.travel.delete` | 删除失败 → 抛错；post 清理失败 → 记日志（schema 有 `onDelete: Cascade` 兜底） |
| `updateSocialPost` | `TravelPost` / `Post` / `Travel` 三表 update | **全成功或全失败**（三表不一致是用户可见问题，必须原子） |

- `ensureTravelDays` / `syncTravelDayDates` 增加可选第 4 个参数 `tx?: TravelTx`，缺省走全局 `prisma`，签名向后兼容（`app/api/travels/[id]/memories|photos|timeline` 的既有调用不变）。
- `syncTravelPost` / `publishTravelPost` / `unpublishTravelPost` 增加可选 `tx`；不传时行为与拆分前一致。
- 两个较重的事务显式 `{ timeout: 15_000 }`：`updateTravelInfo` 的日期对齐逐天 UPDATE（上限 60 条），默认 5s 在慢库上会假失败。
- 静默失败消除方式：写入旁路（同步帖 / 审计 / 通知）→ `try/catch + console.error`（**带 travelId/postId/userId 等上下文**）且不改变主流程语义；用户可见的写入失败 → 继续抛错。

### 2.2 P2-32 拆分（只做安全部分）

- 对外导出签名与类型**全部保持不变**：`travel.service.ts` 末尾以 `export { ... }` 再导出迁移到 policy 的函数，以 `export type { ... }` 再导出类型，调用方（`app/api/**`、`lib/modules/export/share-card.service.ts`、existing tests）无需改 import。
- 拆分前后行数：`travel.service.ts` **1162 → 830 行**（-332，-28.6%）；新增 mapper 248 + policy 266 + types 140 行，均为可单测的纯函数/规则。
- 未做：`getTravelTimeline` / `getTravelMemoryPhotos` 的查询本身未搬（搬走只是挪代码，不产生可测性收益）；`space-travel.service.ts` 的 repository 事务透传未做（见 deferred）。

## 3. 验证命令与结果

```
npx tsc --noEmit --incremental false   # exit 0（我的改动无 error）
npx vitest run --reporter=dot          # 65 files / 598 tests 全绿
```

新增用例（29 例）：
- `travel-write-transaction.test.ts`：用「记录调用时事务深度」的 prisma mock 断言 createTravel 的 Travel/TravelPost/TravelDay 写全部 `inTx=1` 且顺序正确；`ensureTravelDays` 抛错时 `createTravel` reject（不返回成功）；post 同步失败不阻断；deleteTravel 两步同事务；updateSocialPost 三表同事务且第三表失败整体失败。
- `travel-split.test.ts`：墙上时间解析、60 天上限、日期对齐计划（不删天/不空转 UPDATE）、标题与预算归一、DTO 映射（封面缩略图优先/照片去重/分→元/locationName）。

## 4. Deferred（及原因）

1. **space-travel.service 的 repo 写 + syncTravelPost 未包事务**：`PrismaTravelRepository` 内部直接用全局 `prisma`，要做需给 repository 全部方法加 `tx` 透传（`create/update/remove/slugExists`），属跨文件重构；本任务已先消除该文件 6 处静默失败。建议后续与 `space.repository` 一起做。
2. **`syncTravelPost` 失败不出现在 UI**：仅在服务端日志留痕；如需用户可见建议后续统一「同步异常」埋点（`lastError` 落库），本次未引入 schema 变更（schema 归 A）。
3. **D-2 里「逐天循环改 updateMany/批量」**：日期对齐仍是逐天 UPDATE（在事务内 + 先算后写），因每行目标日期不同，改批量需要 CASE WHEN 原生 SQL，收益低且引入 raw query 风险；未做。
4. **TravelPost 软下架（`unpublishedAt`）**：arch 评审 3.7 提到的互动数据丢失问题需 schema 变更，不在本任务范围。

## 5. 验收方式

1. 静态：`npx tsc --noEmit --incremental false` → exit 0。
2. 单测：`npx vitest run tests/unit/travel-write-transaction.test.ts tests/unit/travel-split.test.ts tests/unit/travel-day-sync.test.ts` → 全绿。
3. 全量：`npx vitest run --reporter=dot` → 全绿。
4. 手工（有 MySQL 环境时）：
   - 新建一本无日期旅行 → 详情页应至少有 1 天；若故意让 `TravelDay.createMany` 失败（如临时改表名/权限），接口应返回 5xx 且**不留** Travel 行（老实现会留 0 天旅行）。
   - 编辑旅行标题/日期 → `Travel`、`TravelPost`、`TravelDay.date` 三者一致；改完立刻看旅行圈 feed，标题一致。
   - 编辑旅行圈帖子标题 → `TravelPost.title`、`Post.title`、`Travel.title` 三处一致。

