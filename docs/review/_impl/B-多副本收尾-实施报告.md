# B · 多副本收尾实施报告（task-33）

实施人：impl-data ｜ 依据：task-33（①限流迁移 ②视频分片共享目录 ③feed 缓存一致性 ④文档更新）

## 1. 改动清单

### ① 34 处限流调用迁移（app/api）

未配 `REDIS_URL` 时与改造前**完全一致**（`*Shared` 在无 Redis 时直接委托原内存实现）。逐文件：

| 文件 | 迁移内容 |
|---|---|
| `app/api/login/route.ts` | 2× rateLimit、checkLoginLock、recordLoginFailure、clearLoginFailures |
| `app/api/admin/login/route.ts` | 同上（5 处） |
| `app/api/verify-album-password/route.ts` | 2× rateLimit + lock 检查/记录/2× 清除（6 处） |
| `app/api/upload/route.ts` | rateLimit |
| `app/api/register/route.ts` | rateLimit |
| `app/api/admin/setup/route.ts` | rateLimit |
| `app/api/forgot-password/send-code/route.ts` | 2× rateLimit（IP + 邮箱维度） |
| `app/api/forgot-password/verify-code/route.ts` | rateLimit |
| `app/api/forgot-password/reset/route.ts` | rateLimit |
| `app/api/admin/settings/send-code/route.ts` | rateLimit |
| `app/api/search/route.ts` | rateLimit |
| `app/api/diagnostics/route.ts` | rateLimit |
| `app/api/danmaku/route.ts` | rateLimit |
| `app/api/travel-book/oil/route.ts` | rateLimit（user 维度） |
| `app/api/admin/albums/[id]/media/route.ts` | rateLimit |
| `app/api/admin/videos/upload/route.ts` | rateLimit |
| `app/api/admin/videos/resumable/route.ts` | 2× rateLimit（vchunk / vinit） |
| `app/api/media/resumable/route.ts` | 2×（上一批已迁移，本次核对） |

**语义保持**：key 维度（IP / username / email / 资源）、limit、windowMs 原样保留；429 响应 body（`error`/`retryAfterSeconds`/`retryAfterSeconds` 字段）与 header 不变。

### ② 视频分片共享目录

- `app/api/admin/videos/resumable/route.ts`：`path.join(os.tmpdir(), 'tn-vuploads')` → `mediaTmpDir('tn-vuploads')`（`lib/media/tmp-dir`），删除 `os` 导入；与图片分片、转码共享 `MEDIA_TMP_DIR` 语义。

### ③ feed 缓存一致性

- **新增** `lib/modules/social/feed-cache.ts`：`SOCIAL_FEED_CACHE_TAG='social-feed'`、`getSocialFeedCache()`、`invalidateSocialFeedCache()`（失败只记日志、不阻断写）。
- `lib/modules/social/social.service.ts`：recommended feed 缓存从进程内 `appCache` 改走 `CacheService`（带 tag、TTL 60s）；以下写操作之后立即失效：`setPostLike`（仅状态真变化时）、`setPostFavorite`、`createPostComment`、`deletePostComment`、`updateSocialPost`、`blockUser` / `unblockUser`。
- `lib/modules/social/travel-post.service.ts`：`syncTravelPost`（发布/更新/取消公开三分支）、`unpublishTravelPost`、`syncPublicPostToCircle`、`unpublishPublicPost`、`sharePostToCircle`、`unsharePost` 之后失效。
- 因此「travel 创建/编辑/删除、circle 点赞/收藏/评论/屏蔽、post 改标题/分享/取消分享」都会立刻让 feed 重算；配 Redis 后跨副本生效，未配也消除了「自己刚写完还看到旧数据」。

### ④ 文档

- `docs/ops/多副本部署.md`：三项从「遗留」改为已完成（限流 34 处、图片+视频分片 `MEDIA_TMP_DIR`、feed 写后失效）；新增「剩余外部项」清单（Redis 服务配置、共享卷、调度去重、日志聚合、Nginx upstream、DB 连接数、ISR 一致性）；更新单例清单状态与迁移顺序。

### 测试

- 新增 `tests/unit/social-feed-cache.test.ts`（3 例）：缓存命中不查库 / 写后失效立即新数据 / tag 生效。
- 新增 `tests/unit/social-write-invalidation.test.ts`（6 例）：点赞、收藏、评论、删评、改标题、屏蔽 都触发失效。
- 改 `tests/security/album-unlock-limit.test.ts`、`tests/security/upload-forbidden.test.ts`、`tests/unit/register-switch.test.ts`、`tests/unit/write-routes-zod.test.ts` 的 mock：`@/lib/infrastructure/rate-limit` → `@/lib/infrastructure/rate-limit-factory`（`*Shared` 为 async）。
- `tests/unit/multi-replica-factories.test.ts` 增 1 例：未配 `REDIS_URL` 时 `rateLimitShared` 与同步语义一致（limit 2 第 3 次拒绝 + retryAfterSeconds）。

## 2. 验证

- `npx tsc --noEmit --incremental false` → **exit 0**
- `npx vitest run --reporter=dot` → **109 文件通过 | 1 skipped；988 用例通过 | 4 skipped**
- `npx eslint app/api lib/modules/social lib/modules/travel lib/infrastructure lib/media` → **0 error**（219 条既有 `any` warning）
- 迁移完整性：`rg "from '@/lib/infrastructure/rate-limit'" app` → 0；`await *Shared(` → 34 处；`app/api` 无 `os.tmpdir()` 调用残留（剩注释）。
- 未跑 `next build`（按 Lead 要求由 Lead 统一跑，避免抢 `.next`）。

## 3. 过程备注（环境）

- 开工时发现 `node_modules` 中 `@prisma/client` / `sharp` / `@aws-sdk/client-s3` 目录为空（其他并行线 npm 操作残留），导致全仓 tsc 误报「找不到模块」。执行一次 `npm install --no-audit --no-fund`（changed 3 packages）后恢复，`package.json` 依赖未变。

## 4. 遗留（均非本任务代码项）

1. **Redis 服务与 `REDIS_URL`**：部署侧配置（compose 已有 `--profile redis`），不配 = 单实例语义。
2. **`MEDIA_TMP_DIR` 指向共享卷**：代码已就绪，多副本部署必须配（文档 §2-3）。
3. **调度去重 / 日志聚合 / Nginx upstream / DB 连接数 / ISR 一致性**：外部运维项，文档「剩余外部项」列清。
4. **oil-paint `IN_FLIGHT` 去重、视频转码进程内队列**：多副本下可能重复调用外部 API / 重复转码（成本项，非正确性），文档单例清单保留说明。

## 5. 验收方式

- 自动：`npx tsc --noEmit --incremental false`；`npx vitest run --reporter=dot`；定向 `npx vitest run tests/unit/social-feed-cache.test.ts tests/unit/social-write-invalidation.test.ts tests/unit/multi-replica-factories.test.ts`。
- 手工（有 Redis/Docker）：
  1. 起 Redis + `REDIS_URL` → 副本 A 连打 11 次相册解锁，副本 B 立刻也 429（限流共享）；
  2. 副本 A 给帖子点赞 → 副本 B 拉 recommended feed 立即看到新 likeCount（feed tag 跨副本失效）；
  3. 视频分片：init 在 A、chunk 交替打 A/B，complete 成功（`MEDIA_TMP_DIR` 共享卷）。
