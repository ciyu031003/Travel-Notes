# P1 契约 · 计划结构化 + 实时协同（L3 / Yjs）

> 供实现者共用的一份契约：字段名/端点/协议以此为准，避免前后端各写一套。

## 1. Prisma 模型（新增，全部可空或带默认值）

~~~prisma
enum SpacePlanItemKind { TRANSPORT HOTEL FOOD SPOT ACTIVITY FLEX }

model SpacePlanDay {
  id Int @id @default(autoincrement())
  planId Int
  date DateTime? @db.Date
  title String? @db.VarChar(120)
  theme String? @db.VarChar(60)
  summary String? @db.Text
  sortOrder Int @default(0)
  version Int @default(0)
  updatedBy String? @db.VarChar(255)
  updatedAt DateTime @updatedAt
  plan SpaceTravelPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  items SpacePlanItem[]
  @@unique([planId, sortOrder])
  @@index([planId, date])
}

model SpacePlanItem {
  id Int @id @default(autoincrement())
  dayId Int
  kind SpacePlanItemKind @default(SPOT)
  startAt DateTime? @db.Timestamp(3)
  endAt DateTime? @db.Timestamp(3)
  title String @db.VarChar(200)
  place String? @db.VarChar(200)
  costCents Int?
  note String? @db.Text
  done Boolean @default(false)
  doneBy String? @db.VarChar(255)
  sortOrder Int @default(0)
  version Int @default(0)
  updatedBy String? @db.VarChar(255)
  updatedAt DateTime @updatedAt
  day SpacePlanDay @relation(fields: [dayId], references: [id], onDelete: Cascade)
  media SpacePlanItemMedia[]
  @@index([dayId, sortOrder])
}

model SpacePlanItemMedia {
  id Int @id @default(autoincrement())
  itemId Int
  mediaId Int
  sortOrder Int @default(0)
  item SpacePlanItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  media Media @relation(fields: [mediaId], references: [id], onDelete: Cascade)
  @@unique([itemId, mediaId])
  @@index([mediaId])
}

model SpacePlanDoc {   // Yjs 快照（二进制）+ 事件游标
  planId Int @id
  state Bytes
  lastEvent Int @default(0)
  revision Int @default(0)
  updatedAt DateTime @updatedAt
  plan SpaceTravelPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
}

model SpacePlanEvent {
  id Int @id @default(autoincrement())
  planId Int
  actor String @db.VarChar(255)
  action String @db.VarChar(40)
  payload Json
  createdAt DateTime @default(now())
  @@index([planId, id])
}

model SpacePlanPresence {
  planId Int
  userId Int
  username String @db.VarChar(255)
  nickname String? @db.VarChar(255)
  editingItemId Int?
  cursor Int?
  lastSeenAt DateTime @updatedAt
  @@id([planId, userId])
  @@index([planId, lastSeenAt])
}
~~~

SpaceTravelPlan 增补（可空）：planMeta Json?、coverMediaId Int?、docRevision Int @default(0)。

## 2. Yjs 文档结构（客户端/服务端同一份）

~~~
doc
├─ days: Y.Array<Y.Map>   // 顺序即展示顺序；{ id, date, title, theme, summary }
├─ items: Y.Map<Y.Map>    // key = itemId；{ id, dayId, kind, startAt, endAt, title, place, costCents, note, done, doneBy, sortOrder, mediaIds: Y.Array<number> }
└─ meta: Y.Map            // { departureCity, transportMode, pace, interests, budgetSplit, engineVersion }
~~~

- **同段文字双光标**：title / note / place 用 Y.Text（不是普通 string），两人可在同一段文字里同时打字；
  其余短字段（kind/date/数字）用普通值，LWW 合并。服务端物化时把 Y.Text 转 string。

## 3. REST 契约

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/spaces/[id]/plans | 创建计划（可带引擎输入，服务端生成 days/items 并初始化文档） |
| GET | /api/spaces/[id]/plans/[planId] | 详情：plan + days(含 items) + members + presence + docRevision + lastEventId |
| PATCH | /api/spaces/[id]/plans/[planId] | 计划级字段；带 version 乐观锁 |
| POST | .../items | 新增块（dayId/kind/title/startAt…），返回新行 + eventId |
| PATCH | .../items/[itemId] | 改块；**必须带 version**，冲突 409 返回当前行 |
| DELETE | .../items/[itemId] | 删除块（version 同上） |
| POST | .../items/[itemId]/move | 跨天/排序（dayId, sortOrder） |
| POST | .../items/[itemId]/toggle | 原子勾选（done），不覆盖别人改动 |
| GET | .../events?since=<id> | 增量事件（SSE 复用同一查询） |
| POST | .../collab-token | 返回 { token, wsUrl, room }，HMAC，5 分钟有效 |
| POST | /api/internal/plan-doc/[planId] | 仅实时服务调用（x-collab-secret）：提交 Yjs state + 物化 rows + 追加事件 |

权限：读用 requireSpaceMember；写用 requireSpaceRole([OWNER, MEMBER])；VIEWER 只读。

## 4. 实时通道（独立 Node 服务）

- realtime/：yjs + y-websocket + ws + y-protocols；端口 1234，路径 /collab，room = plan-<planId>；
- 鉴权：?token=HMAC(planId|userId|exp)，共享 COLLAB_SECRET，失败 close(4401)；
- 持久化：每 800ms 或断连时 POST /api/internal/plan-doc/<planId>（state + 物化 JSON）；
- presence：awareness 里 { user:{id,username,nickname,color}, editingItemId, cursor }，前端显示「谁正在编辑哪一块」；
- 新连接：sync step1/step2 + lastEventId；客户端先用 y-indexeddb 本地应用再同步。

## 5. 离线编辑

- Web 与 Capacitor 壳都用 y-indexeddb 持久化（WebView 支持 IDB）：先写本地，联网自动同步；
- 断网改动由 CRDT 合并，不需要 REST 操作队列；列表/卡片等非协同页仍走 local-first 缓存。

## 6. 交付切分

- **P1a**：迁移、repository/service、plan-engine 纯函数 + 单测、REST（含 version 乐观锁）、collab-token、内部 plan-doc 端点。
- **P1b**：realtime 服务 + docker-compose + nginx 路由；本地双客户端同步验收。
