# 实时协同服务（realtime / P1b）

> 计划结构化 + 实时协同（L3 / Yjs）的**第二半**：独立 Node WebSocket 服务。
> 契约以 [plan-p1-collab-spec.md](./plan-p1-collab-spec.md) §4 为准；P1a（app 侧数据层/REST/内部端点）由 `app/api/internal/plan-doc`、`lib/modules/space/*` 提供。

## 1. 定位

```
浏览器 / Capacitor 壳                        服务器
┌──────────────────────┐            ┌────────────────────────────┐
│ plan 详情页（P2 接）  │  ws /collab │  nginx  ──► realtime:1234   │
│ Y.Doc + y-indexeddb   │◄───────────►│  （本服务，Yjs 合并在内存）  │
└──────────┬───────────┘  token 鉴权  └──────────────┬─────────────┘
           │ REST（加载/降级）                        │ POST/GET 内部端点
           ▼                                         ▼
      app:3000  ───────────────────────────────►  MySQL（SpacePlanDoc / 物化行 / 事件）
```

- 独立进程，**不挂在 Next.js 下**（App Router 无长连接能力；Capacitor 静态壳复用同一协议）。
- 只做三件事：**鉴权接入、Yjs/awareness 转发、持久化回传**；不直接连 MySQL，所有落库经 app 内部端点（`x-collab-secret`）。
- 不启动它 app 完全照常：客户端降级为纯 REST（无实时协作），不阻塞任何现有功能。

## 2. 本地运行

```bash
cd realtime
npm i
COLLAB_SECRET=dev node server.mjs          # http://127.0.0.1:1234/health
# 或（与 app 的本地回落密钥一致，可省 COLLAB_SECRET）
NODE_ENV=development node server.mjs
```

- app 侧本地 dev 用 `npx next dev -p 3111`，内部端点 `APP_INTERNAL_URL=http://127.0.0.1:3000`（默认值即此）。
- 生产环境**必须**显式设置 `COLLAB_SECRET`（与 app 同值），否则进程拒绝启动（fail-fast，避免空密钥放行）。

自测：

```bash
cd realtime
npm test              # vitest 单测（token / 物化 / 持久化重试 / 配置）
npm run selftest      # 双客户端真跑：起 realtime + mock app，10 步全绿（约 3s）
npm run compose:check # 无 docker 环境下的 docker-compose 结构校验
# 真实 app 端点冒烟（需要 app 已起 + 一个一次性计划 id；会真的写 DB；8 步）
# 有 tests/e2e/.auth/state.json 时额外验证「app 签发的 collab-token 被 realtime 接受」
PLAN_ID=10 APP_INTERNAL_URL=http://127.0.0.1:3111 npm run app:smoke
```

`selftest` 的真实输出（2026-11-28 本机）：

```
PASS 1. 服务启动 & /health
PASS 2. 非法 token 一律 close(4401) :: missing/wrongSecret/expired/roomMismatch/garbage = 4401
PASS 3. A 种子文档 → B 收到初始结构 (31ms)
PASS 4. A 改同段 Y.Text → B 实时收到 :: B 在 13ms 内收到
PASS 5. presence 双向可见 + /rooms 一致 :: B 在 13ms 内看到 A(nickname=小甜, editingItemId=12)
PASS 6. 800ms 防抖持久化 POST :: source=debounce, presence=[1,2], yjsState bytes=584
PASS 7. 保存失败重试 3 次后成功 :: attempts=500,500,200（同一份 yjsState）
PASS 8. B 断线编辑 → 重连 CRDT 补同步 :: items=2，文本一致
PASS 9. 最后客户端断开 → 立即 source=disconnect 回传 :: 31ms, presence=[] items=2
PASS 10. 服务重启后从 DB 快照恢复（GET 内部端点）:: GET 1 次，日志「快照已载入」
✅ 全部通过 (10/10 步)
```

真实 app 端点联调（2026-11-28，本机 dev 3111 + MySQL，一次性计划 id=10）：

```bash
cd realtime && PLAN_ID=10 APP_INTERNAL_URL=http://127.0.0.1:3111 npm run app:smoke
# PASS 0. GET 初始快照（404=尚未同步过） :: HTTP 200
# PASS 1. realtime 启动
# PASS 2. 真实 POST /api/internal/plan-doc 落库成功 :: 629ms, revision=5, lastEventId=14
# PASS 3. 双客户端实时同步（经真实 realtime） :: 8ms
# PASS 4. 防抖后再次落库 :: revision=6, lastEventId=15
# PASS 5. 最后客户端断开 → 立即回传（app 幂等短路，revision 不推进、presence 清空）
#         [save] plan=10 source=disconnect ok attempts=1 days=2 items=1 presence=0 took=100ms
# PASS 6. realtime 重启后从真实 DB 快照恢复 :: 0ms
# PASS 7. app 签发的 collab-token 被 realtime 接受 :: room=plan-10, expiresIn=300s, 同步后 days=2
# ✅ 真实 app 集成冒烟全部通过 (8/8)
```

## 3. 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `1234` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址（compose 内需要 0.0.0.0） |
| `COLLAB_SECRET` | 非生产回落 `dev-collab-secret` | **生产必填**。与 app 签发 collab-token / 校验 `x-collab-secret` 同一把密钥（`openssl rand -hex 32`） |
| `APP_INTERNAL_URL` | `http://127.0.0.1:3000` | app 内部端点基址；compose 内是 `http://app:3000` |
| `COLLAB_SAVE_DEBOUNCE_MS` | `800` | 文档变更聚合窗口（契约 §4） |
| `COLLAB_PRESENCE_SAVE_DEBOUNCE_MS` | `1200` | 连接/断开触发 presence 回传的防抖 |
| `COLLAB_SAVE_RETRY_DELAYS_MS` | `250,500,1000` | 失败重试间隔，数组长度 = 重试次数（默认 3 次重试 → 最多 4 次尝试） |
| `COLLAB_SAVE_TIMEOUT_MS` | `8000` | 单次 HTTP 超时 |
| `COLLAB_SAVE_RETRY_LATER_MS` | `5000` | 重试耗尽后仍 dirty 时的再试间隔（房间活着 / 空置都会排期） |
| `COLLAB_ROOM_IDLE_TTL_MS` | `1800000`（30 分钟） | 房间空置多久后卸载内存（卸载前会再 flush 一次） |
| `COLLAB_CLOCK_SKEW_SECONDS` | `30` | token exp 允许的时钟偏移 |
| `COLLAB_PING_INTERVAL_MS` | `25000` | WebSocket 心跳（避免 nginx 空闲断开长连接） |
| `COLLAB_MAX_PAYLOAD_BYTES` | `4194304` | 单帧上限（Yjs update 远小于此） |
| `COLLAB_LOG_LEVEL` | `info` | `debug` 会打印每条 sync/awareness 帧，排查协议问题用 |
| `NODE_ENV` | — | `production` 时 `COLLAB_SECRET` 缺失即退出 |

## 4. 鉴权

app 侧 `POST /api/spaces/[id]/plans/[planId]/collab-token` 返回 `{ token, wsUrl, room, expiresIn, exp }`（P1a）。

```
payload = "<planId>|<userId>|<exp>"                       // exp = Unix 秒，5 分钟有效
token   = "v1." + base64url(payload) + "." + base64url(HMAC_SHA256(COLLAB_SECRET, payload))
```

- base64url 无 padding；与 `lib/modules/space/plan-collab-token.ts` 逐字节一致（单测里用 crypto 手工复算锁死）。
- 兼容 64 位 hex 签名（便于手工 curl 调试），无 `v1.` 前缀也接受；**不兼容非 HMAC 方案**。
- 客户端连接：`ws(s)://<host>/collab/plan-<planId>?token=<token>`（也支持 `/collab?room=plan-<planId>&token=...`）。
- 校验失败一律：先完成 WS 握手，然后 **`close(4401, "unauthorized: <reason>")`**；y-websocket v3 把 4400–4499 视为「重连无用」，客户端会停止重试。
  - reason：`missing_token` / `malformed_token` / `malformed_payload` / `bad_signature` / `expired` / `bad_plan_id` / `bad_user_id` / `room_plan_mismatch` / `server_misconfigured`。
- 非法帧（乱码/未知消息类型）→ `close(4400, "bad message")`，不 crash 进程。

## 5. WebSocket 协议

与 `y-websocket` v3 客户端二进制协议一致（消息类型：`0` sync、`1` awareness、`2` auth、`3` queryAwareness）：

1. 连接建立 → 服务端发 **syncStep1**（自己已知状态向量）+ 当前 **awareness 快照**；客户端 onopen 也发 syncStep1 → 双方 step2 互相补齐。
2. 客户端编辑 → 服务端 `applyUpdate` 后广播给其它连接；同时触发 800ms 防抖保存。
3. awareness（光标/正在编辑哪一块）只在内存转发，**不逐帧写库**。

presence 约定（`awareness.setLocalState`，与契约 §4 一致）：

```js
provider.awareness.setLocalState({
  user: { id: 12, username: 'yuan', nickname: '甜', color: '#ff8800' },
  editingItemId: 345,   // 正在编辑的块 id（Int，可为 null）
  cursor: 7,            // 同段文字内的光标位置（可为 null）
})
```

服务端从 awareness 汇总出去的 presence（`/rooms` 与回传 body 里同构，按 `userId` 去重）：

```json
{ "userId": 12, "username": "yuan", "nickname": "甜", "editingItemId": 345, "cursor": 7, "clientId": "3224961095" }
```

## 6. 持久化回传（realtime → app）

触发：文档更新后 **800ms 防抖**；最后一个连接断开时**立即**（`source=disconnect`）；服务优雅退出（SIGTERM/SIGINT）时也各房间 flush 一次。

```http
POST ${APP_INTERNAL_URL}/api/internal/plan-doc/<planId>
x-collab-secret: ${COLLAB_SECRET}
content-type: application/json

{
  "planId": 42,
  "yjsState": "<base64(Y.encodeStateAsUpdate(doc))>",
  "materialized": {
    "days":  [{ "id": "d1", "date": "2026-12-01", "title": "第一天·上海出发", "theme": "出发日", "summary": null, "sortOrder": 0 }],
    "items": [{ "id": "i1", "dayId": "d1", "kind": "TRANSPORT", "startAt": "2026-12-01T01:30:00.000Z", "endAt": null,
                "title": "虹桥 → 首都机场", "place": null, "costCents": 88000, "note": null,
                "done": false, "doneBy": null, "sortOrder": 0, "mediaIds": [101, 102] }],
    "meta":  { "departureCity": "上海", "transportMode": "FLIGHT" }
  },
  "presence": [{ "userId": 12, "username": "yuan", "nickname": "甜", "editingItemId": 345, "cursor": 7, "clientId": "3224961095" }],
  "source": "debounce",
  "clientId": "<realtime 实例 uuid>",
  "sentAt": "2026-11-28T04:48:00.018Z"
}
```

- `source` 只有 `debounce` / `disconnect` 两个值（连接/断开导致的 presence 回传也用 `debounce`，app 按 yjsState 幂等跳过重复物化）。
- `materialized` 里 `id`/`dayId` 是 Yjs 里的 string，由 app 侧 parse 成 Int；`title/note/place` 已由 Y.Text 转 string；`mediaIds` 已去重转 number[]。
- 期望响应：`200 { ok, revision, eventId|lastEventId, idMap? }`（服务端只读 revision/lastEventId 做游标与日志）。
- 重试：网络错误/超时/5xx/408/429 会按 `COLLAB_SAVE_RETRY_DELAYS_MS` 重试（默认 3 次，间隔 250/500/1000ms）；4xx（参数/鉴权/计划不存在）立即失败并记录响应体片段。重试耗尽后房间保持 dirty，按 `COLLAB_SAVE_RETRY_LATER_MS` 再试；进程退出前会尽力 flush。
- 幂等：重试提交的是**同一份** yjsState；app 侧按「state 字节完全相同 → 直接返回既有 revision/eventId，不重复物化、不追加事件」保证安全。

## 7. 初始快照（app → realtime）

新房间（首次有人连接）或 realtime 重启后：

```http
GET ${APP_INTERNAL_URL}/api/internal/plan-doc/<planId>
x-collab-secret: ${COLLAB_SECRET}

200 { "planId": 42, "yjsState": "<base64>", "revision": 3, "lastEventId": 9 }
404  // 从未同步过（新计划 / state 为空）→ realtime 从空文档开始
```

- 成功：`Y.applyUpdate(doc, state)`，日志 `[room plan-42] 快照已载入 bytes=... revision=...`。
- 404：从空文档开始，日志「无 DB 快照」。
- 其他错误/超时：**降级为空文档**并 warn，不阻塞连接（客户端本地 y-indexeddb 仍会把本地内容推上来合并）。此时服务重启会以「DB 或本地快照较新者」为准，极端情况下可能丢掉「只在内存中未回传成功」的少量编辑——见 §11。

## 8. 运维端点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | `{ ok, service, version, instanceId, uptimeSec, rooms, clients, appInternalUrl, saveDebounceMs, secretConfigured }`；docker healthcheck 用 |
| GET | `/rooms` | 调试：每个房间的 `clients / presence / dirty / saveCount / lastSavedAt / lastSaveError / revision / lastEventId / snapshotSource / doc 计数` |
| GET | `/`、`/collab` | 简单说明页 |

`/rooms` 会暴露在线用户 ID 与文件摘要，**只绑宿主机回环**，不要直接公网暴露。

## 9. Docker / nginx 部署

### 9.1 compose

`docker-compose.yml` 新增 `realtime` 服务（不改变既有 `db`/`app`）：

- `build: ./realtime`（`realtime/Dockerfile`，node:22-slim，`npm ci --omit=dev`，非 root，HEALTHCHECK /health）
- `depends_on: app(service_healthy)`，`APP_INTERNAL_URL=http://app:3000`
- 端口只绑宿主机回环：`127.0.0.1:${COLLAB_PORT:-1234}:1234`
- `COLLAB_SECRET` 从根 `.env` 注入；**没设会拒绝启动**（容器 crash-loop 是预期行为，避免空密钥）

上线（在服务器上，由运维执行；本仓库本轮**没有**动生产）：

```bash
# 1) 生成并写入 .env（与 app 共用同一把，两个容器都要读）
echo "COLLAB_SECRET=$(openssl rand -hex 32)" >> /path/to/.env
# 2) 只重建 realtime（不要 up -d 全量重建）
docker compose up -d --build realtime
# 3) 探活
curl -fsS http://127.0.0.1:1234/health
docker compose logs --tail=100 realtime
# 4) nginx：按 docs/realtime-nginx.conf 增加 /collab location 后
sudo nginx -t && sudo systemctl reload nginx
```

回滚：`docker compose stop realtime`（或从 compose 删除该服务后 `docker compose up -d`）。停掉后客户端拿不到 ws，按设计降级为 REST，现有功能不受影响；若 nginx 仍保留 `/collab` location，会得到 502（可在回滚时一并注释掉）。

> 本机（开发机）没有 docker CLI，`docker compose config -q` 未能在本地执行；已用 `npm run compose:check`（YAML 解析 + 关键字段断言，含「db/app/mysql-data 未被破坏」）替代。**部署机/CI 上线前请补跑一次 `docker compose config -q`。**

### 9.2 nginx

片段见 [realtime-nginx.conf](./realtime-nginx.conf)（`^~ /collab` + `Upgrade`/`Connection: upgrade` + `proxy_read_timeout 3600s` + `proxy_buffering off`）。
要点：

- `location ^~ /collab` 必须放在 `location /` 之前生效（`^~` 前缀匹配优先于正则 location）。
- 必须带 `proxy_http_version 1.1` 与 `Upgrade`/`Connection` 头，否则 WebSocket 握手失败。
- 长连接超时要放大（默认 60s 会在空闲时断开）；应用层已有 25s 心跳双保险。
- token 在 query 里（5 分钟有效）：介意访问日志的话在 location 内 `access_log off;`。

## 10. 兼容 / 回滚 / 边界

- **只新增，不改既有语义**：不加 realtime 服务、不加 nginx location、不设 `COLLAB_SECRET`，app 与 P1a 的 REST 行为完全不变（collab-token 端点会 500/403）。
- 老计划（没有 days/items）：物化返回空数组 `{ days: [], items: [], meta: {} }`，不报错（单测覆盖）。
- 房间是内存态：realtime 重启会从 DB 快照恢复；重启窗口内未回传成功的编辑由客户端 y-indexeddb 在重连后重放（CRDT 合并，不丢已落盘内容）。
- 多副本：本服务按 room 在单实例内存里合并，**水平扩容需要 sticky（按 planId 粘到同一实例）**，否则同一计划被拆到两个实例会各存各的快照。当前部署单副本，暂不需要。

## 11. 已知限制 / 遗留

1. 服务重启后若 app 的 GET 快照不可用（app 挂/密钥错），房间降级为空文档；此时**只存在于客户端本地**的内容要等客户端连上来才回到服务端（随后正常回传）。已落库内容不会丢。
2. presence 落库只在连接/断开（及切块等 awareness 变化）时触发；纯光标移动不写 MySQL（有意为之，避免每 100ms 一行 upsert）。
3. 房间 UI 的高亮/「谁在编辑哪块」是 P2 客户端工作，本阶段只保证协议与数据通道。
4. 未做 per-room 连接数上限与限流（nginx 层可加 `limit_req`）；内网服务、当前单副本，风险低。
5. 根 `.env.example` 里的 `COLLAB_SECRET`/`COLLAB_WS_URL` 由 P1a 的 app 侧配置一并补齐（本任务写域不含根 `.env.example`）。部署前请确认：

   ```bash
   # 必须与 app 共用同一把（幂等：两边不一致时 collab-token 校验/内部端点都会 401）
   COLLAB_SECRET=$(openssl rand -hex 32)
   # app 返回给前端的 ws 地址（经 nginx 同源反代时用 wss://<域名>/collab）
   COLLAB_WS_URL=wss://travel-notes.yuanabd.cn/collab
   ```

6. 真实联调时发现并修复的 app 侧问题（与本服务无关，记录备查）：自研 Prisma driver adapter 曾把 Bytes 参数按 base64 文本写库（`lib/prisma-adapter.ts`），导致 `SpacePlanDoc.state` 双重编码、realtime 重启后 `applyUpdate` 失败；P1a 已在适配器层 `processArgs(argTypes)` 修复，联调 7/7 通过。
