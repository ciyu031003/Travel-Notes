# B · 多副本准备实施报告（task-28）

实施人：impl-data ｜ 依据：task-28（B: 多副本准备）

## 1. 改了哪些文件

| 文件 | 说明 |
|---|---|
| `lib/infrastructure/redis.ts` | **新增**：可选 Redis 客户端（动态 import ioredis，懒连接；connectTimeout/ping 500ms；失败 60s 冷却 + 只告警一次；`RedisClient` 结构接口便于 fake 单测；SCAN 前缀扫描） |
| `lib/infrastructure/cache-redis.ts` | **新增**：`RedisCacheService implements CacheService`（JSON 值、PX TTL、`tn:cache:tag:*` Set 做跨副本 tag 失效、前缀清理、命令级 500ms 超时、失败降级内存） |
| `lib/infrastructure/cache-factory.ts` | **新增**：`getCacheService()` —— 未配 `REDIS_URL` 返回**原内存单例**（行为零变化），配置后返回 Redis 实现 |
| `lib/infrastructure/rate-limit.ts` | 追加 `RateLimiter` 接口 + `MemoryRateLimiter`（包装原有同步函数，语义不变）；原同步函数一字未改 |
| `lib/infrastructure/rate-limit-redis.ts` | **新增**：`RedisRateLimiter`（INCR+PEXPIRE 固定窗口；失败锁定 JSON + 指数退避，与内存实现一致；失败降级内存） |
| `lib/infrastructure/rate-limit-factory.ts` | **新增**：`getRateLimiter()` + `rateLimitShared/checkLoginLockShared/recordLoginFailureShared/clearLoginFailuresShared` |
| `lib/container.ts` | 缓存改用 cache-factory（未配 Redis = 原实例）；`resetServices()` 改调 `__resetCacheServiceForTest()`（修掉 `cacheServiceInstance` 未定义导致的 tsc 红） |
| `lib/media/tmp-dir.ts` | **新增**：`mediaTmpBaseDir()/mediaTmpDir()` —— `MEDIA_TMP_DIR` 优先，默认 `os.tmpdir()` |
| `app/api/media/resumable/route.ts` | 分片临时根目录改用 `mediaTmpDir('tn-iuploads')`（函数内取，便于测试/运行时改 env）；两处限流迁移到 `rateLimitShared`（该路由在写范围内，作为共享限流的首个接入点） |
| `lib/infrastructure/video-transcode.ts` | 转码临时文件改用 `mediaTmpBaseDir()`（顺手去掉不再使用的 `os` 导入） |
| `docker-compose.yml` | 新增可选 `redis` 服务（`profiles: ["redis"]`，只绑回环、不持久化、128MB allkeys-lru、healthcheck、日志轮转）；app 增加 `REDIS_URL` / `MEDIA_TMP_DIR` 透传 |
| `.env.example` | 增加 `REDIS_URL` / `MEDIA_TMP_DIR` / `REDIS_PORT` 注释示例 |
| `package.json`（+lock） | 新增依赖 `ioredis@^6.0.0`（唯一新增依赖） |
| `docs/ops/多副本部署.md` | **新增**：已满足项 / 仍需外部配置项 / compose scale 示例 / 验证命令 / 进程内单例清单 / 迁移顺序 / 回滚 |
| `tests/helpers/fake-redis.ts` | **新增**：可控时钟的内存 fake Redis（只实现用到的命令，支持 TTL/Set/SCAN 语义） |
| `tests/unit/cache-redis.test.ts` | **新增 8 例**：命中 / TTL 过期 / tag 失效 / 前缀清理 / clear / getOrSet / 降级内存 / 命令失败告警一次 |
| `tests/unit/rate-limit-redis.test.ts` | **新增 9 例**：窗口计数 / 超限 / 过期重置 / 不同 key 隔离 / 失败锁 + 指数退避 / 到期解锁 / 降级内存 / 告警一次 |
| `tests/unit/multi-replica-factories.test.ts` | **新增 8 例**：未配 REDIS_URL 返回原单例（行为零变化）/ 空白值不误连 / 配置后切 Redis 实现 / MEDIA_TMP_DIR 默认与覆盖 |

## 2. 关键决策

1. **默认行为零变化**：未配置 `REDIS_URL` 时 `getCacheService()` 返回**改造前那个 MemoryCacheService 实例**，`getRateLimiter()` 返回包装同步函数的 `MemoryRateLimiter`；同步 `rateLimit()`/`checkLoginLock()` 等函数一字未改。
2. **降级策略**：连接/命令都包 500ms 超时；任何失败 → 本次操作回退内存实现，并且**全进程只打一条** `console.warn`，随后 60s 冷却不再尝试重连（避免每请求重连刷屏/拖慢）。
3. **限流调用点迁移是分批的**：现有 34 处路由仍用同步内存版（app/api/** 大多不在本任务写范围）；本任务提供 `*Shared` API 并把**写范围内的 `app/api/media/resumable/route.ts` 两处**接入作为示范，其余清单写进 `docs/ops/多副本部署.md`（含逐条命令）。未迁移时：单实例正确，多副本限额按副本数放大 —— 文档已写明。
4. **缓存 tag 失效跨副本**：`tn:cache:<key>` 值 + `tn:cache:tag:<tag>` Set（TTL = 数据 TTL + 60s），`deleteByTag` SMEMBERS→DEL，实现「一处写、全副本失效」；清空前缀/clear 用 SCAN（禁用 KEYS）。
5. **媒体临时目录**：`MEDIA_TMP_DIR` 用函数读取（不是模块级常量），测试与运行时都能生效；分片/转码各自子目录（`tn-iuploads`、`tn-transcode-*`）避免互相清扫。视频断点续传路由（`app/api/admin/videos/resumable`）不在写范围，仍在 `os.tmpdir()` —— 已列入文档的共享卷待办。
6. **Redis 只做限流/缓存**：compose 里不持久化（重启清空可接受）、只绑回环、LRU 上限 128MB，不默认启动（`profiles: ["redis"]`），现有部署零影响。

## 3. 验证

- `npx tsc --noEmit --incremental false` → **exit 0**
- `npx vitest run --reporter=dot` → **107 文件 / 978 用例通过（4 skipped）**；本任务新增 25 例
- `SKIP_DB_ON_BUILD=1 npx next build` → **exit 0**（首次重试失败是并发构建抢 `.next`：`ENOENT .next/server/pages-manifest.json`，等待 45s 重跑通过；类型检查与代码无关）
- `npx eslint`（改动文件）→ 0 error（4 条既有 warning：`any`/未使用变量）
- 未跑：真实 Redis 联通测试（本机无 Redis/Docker）；用 fake client 覆盖了命中/计数/过期/tag/降级全部语义。

## 4. 遗留 / deferred

1. **限流调用点迁移**：34 处 `rateLimit()`/`checkLoginLock()` 仍在 app/api/**（本任务写范围外）。迁移方式与验证命令已写入 `docs/ops/多副本部署.md` §2-2 / §4；未配 REDIS_URL 时迁移与否行为一致，可分批做。
2. **视频分片临时目录**：`app/api/admin/videos/resumable/route.ts` 仍用 `os.tmpdir()`（不在写范围）；多副本时该路由需同样接 `mediaTmpDir()`。
3. **feed 缓存直连 appCache**：`lib/modules/social/social.service.ts:188` 仍用 `appCache`（不走 CacheService），多副本最多 60s 不一致；已列入文档 §5-3。
4. **调度去重 / 日志聚合 / ISR 一致性**：外部配置类，文档 §2-4/6/8 给出方案，代码层未动。
5. **/api/health 未加 Redis 检查**：本轮 health 归 B10（已含 db/migrations/storage）；Redis 连通性可用 `redis-cli ping`（文档 §4）或后续加一个 `redis` 字段。

## 5. 验收方式

- 自动：`npx tsc --noEmit --incremental false`；`npx vitest run --reporter=dot`；定向 `npx vitest run tests/unit/cache-redis.test.ts tests/unit/rate-limit-redis.test.ts tests/unit/multi-replica-factories.test.ts`；`SKIP_DB_ON_BUILD=1 npx next build`。
- 手工（有 Redis/Docker 时）：
  1. `docker compose --profile redis up -d` + `.env` `REDIS_URL=redis://127.0.0.1:6379` → `redis-cli ping` PONG；`redis-cli --scan --pattern 'tn:cache:*'` 能看到缓存键；
  2. 停掉 Redis → 应用仍正常（500ms 内降级内存），日志只有一条 `[redis] 共享后端不可用…`；
  3. 多副本跨实例限流：对副本 A 连打 11 次相册解锁 → 第 11 次 429；立刻请求副本 B 也 429；
  4. 分片上传：init 在 A、chunk 交替打 A/B，complete 成功（`MEDIA_TMP_DIR` 指向共享卷）；
  5. 跨副本缓存失效：A 改旅行标题 → B 立刻读到新标题。
