# 甜途 · 实时协同服务（P1b）

Yjs WebSocket 服务：`/collab/plan-<planId>?token=...` → 鉴权、presence 转发、800ms 防抖持久化回传。

- 主文档：[`../docs/realtime-collab.md`](../docs/realtime-collab.md)（契约/环境变量/部署/回滚/限制）
- nginx 片段：[`../docs/realtime-nginx.conf`](../docs/realtime-nginx.conf)

```bash
npm i
COLLAB_SECRET=dev node server.mjs   # http://127.0.0.1:1234/health
npm test                            # vitest 单测
npm run selftest                    # 双客户端同步自测（10 步）
npm run compose:check               # 无 docker 环境下的 compose 结构校验
# 真实 app 端点冒烟（需 app + MySQL + 一次性计划 id）
PLAN_ID=10 APP_INTERNAL_URL=http://127.0.0.1:3111 npm run app:smoke
```

目录：

- `server.mjs` — HTTP(/health,/rooms) + WS 升级、鉴权、房间管理、优雅退出
- `lib/room.mjs` — 单房间：协议转发、awareness、防抖保存、断连 flush
- `lib/materialize.mjs` — Y.Doc → 物化 JSON（Y.Text→string、mediaIds→number[]）
- `lib/persistence.mjs` — 内部端点 POST（含重试）与 GET 快照
- `lib/token.mjs` — collab-token 签发/校验（与 app 侧 `lib/modules/space/plan-collab-token.ts` 同算法）
- `lib/config.mjs` / `lib/logger.mjs` — 环境变量与日志
- `test/`、`scripts/sync-selftest.mjs` — 单测与双客户端自测
