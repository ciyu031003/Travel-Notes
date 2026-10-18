# 系统架构（模块1）+ API 与数据（模块3）评审发现（arch-api）

## 结论速览

整体分层**做了一半**：118 个 API route 里 111 个已经把业务委托给 `lib/container|modules|services|repositories`（不是"路由里堆 SQL"的典型烂摊子），social 域的点赞/收藏/评论计数也确实用 `$transaction` + 唯一约束做了幂等——这部分是合格工程。
但**架构的真实风险不在分层，而在三处"默认值"**：①权限模型把"没有任何空间成员身份"默认当成 OWNER（任意注册用户即管理员）；②数据库 schema 没有 migration 历史，每次容器启动靠 `prisma db push` 现场对齐，失败还被吞掉；③Prisma 适配器在构造函数里劫持 SIGTERM 并 `process.exit(0)`，"优雅停机"与"断线重连"都是假的。
数据侧最需要 Lead 在总评点名的一条：**schema 索引是按"字段看起来像主键"建的，不是按真实查询建的**（`SpaceMember` 无 `userId/username` 单列索引，而鉴权/空间判定每个请求都在按这两个键 OR 查询）。

## 评审口径与统计（可复核）

统计脚本口径：`app/api/**/route.ts` 共 118 个；"鉴权入口"= 引用 `auth-middleware|current-user|requireAuth|requireCapability|requireUserId|album-auth|social-route-utils` 之一；"schema 校验"= 引用 `zod` 或 `@/lib/validators`。
复核命令：`(Get-ChildItem -Recurse -File app/api -Filter route.ts).Count`；各列可用 `Select-String -Path app/api/**/route.ts -Pattern '@/lib/db'` 等价抽查。

| 域 | route 数 | 直接 import @/lib/db | 走 container/modules/services/repositories | 有 zod/validators | 无 schema 校验 | 有鉴权入口 |
|---|---|---|---|---|---|---|
| admin | 39 | 2 | 36 | 3 | 34 | 37 |
| travel/space/content | 43 | 4 | 43 | 0 | 43 | 41 |
| auth/user/platform | 16 | 3 | 13 | 2 | 14 | 8 |
| social | 17 | 1 | 16 | 0 | 17 | 16 |
| upload/other | 3 | 0 | 3 | 0 | 3 | 3 |
| **合计** | **118** | **10** | **111** | **5** | **111** | **105** |

结论：**分层调用是主流（111/118）**，真正的债是**输入校验缺失（111/118 无 schema 校验，仅 5 个用 zod/validator）**与**4 条纯直写 prisma 的路由**（`admin/setup`、`admin/social`、`danmaku`、`health`）。
另据 `grep '\$transaction'`：全仓库仅 **7 处** `$transaction`（social.service 4、moderation.service 2、space.repository 1），`app/` 下 **0 处**；而"文件内 ≥2 次 prisma 写且无事务"的文件有 24 个（travel.service 16 次写、social.service 13 次、travel-post.service 11 次、album.service 11 次）。

**两条最典型的"绕 service 直写 prisma + 缺归属校验"路由（抽查）**

| 路由 | 证据 | 绕过了什么 | 后果 |
|---|---|---|---|
| `GET /api/images/[id]` | `app/api/images/[id]/route.ts:16-29`：匿名 `prisma.postImage.findUnique`，无任何登录/可见性判断；响应写 `public, max-age=31536000, immutable`（:28） | `lib/repositories/image-repository.ts` + `lib/services/image-service.ts` 已存在却未被使用；也不经过 `lib/modules/access` | 自增 id 可枚举：未发布/已私密文章的图片 BLOB 对匿名可读；一旦被浏览器/CDN 缓存 1 年，撤回可见性也收不回来 |
| `GET /api/anniversaries` | `app/api/anniversaries/route.ts:6-10`：`listAnniversaries()` 不传 userId；`lib/visibility.ts:10-11` 的 `scopedWhere(undefined)` 返回 `{}`（不过滤） | `getCurrentUserId()`、`scopedWhere(userId)` 的正确链路（同文件 :10 注释自述"向匿名返回全部纪念日"） | 匿名读全站所有用户的纪念日标题/日期/描述；多用户上线后是跨用户数据泄露，且被列入 `PUBLIC_READ_PATHS`（`lib/public-paths.ts:57`） |

（补充：`app/api/admin/social/route.ts:16-51` 同样直写 prisma，但它的真正风险在鉴权侧——见 P-1；`app/api/admin/setup/route.ts:51-62` 把初始化同时写入 `SiteSetting` 与 `User`，两处都不是事务，失败被 `:65` 的 `.catch(() => {})` 吞掉。）

## 问题清单

### [🔴] P-1 "没有空间成员身份 = OWNER"：任意注册用户直接获得管理能力
- **位置**：`lib/modules/space/permissions.ts:146-163`（关键在 :153 `const isOwner = memberships.length === 0 || ...`）；入口 `app/api/register/route.ts`（`lib/public-paths.ts:29` 公开）；能力校验 `lib/capability-guard.ts:10-17`
- **问题描述**：能力的推导是反的——"查不到任何成员身份"被当成"单用户模式 = 主人"。而项目已经开放注册（`/api/register` 在 PUBLIC_PATHS，`auth-service.register` 直接建 User），新用户天然没有任何 `SpaceMember` 行，于是 `getUserCapabilities` 返回 `isOwner/canManageSettings/canManageSocial/canViewAudit` 全 true。`requireCapability` 只做 `hasCapability(userId, key)`，没有任何 "该用户是否真的拥有空间" 的二次确认。
- **风险影响**：任何访客注册一个账号即可调用 `GET /api/admin/audit`（`app/api/admin/audit/route.ts:11-16`，读全站审计日志：用户名、ipHash、资源 id）、`GET /api/admin/social`（`app/api/admin/social/route.ts:13-51`，读全站帖子/评论/举报/统计）、`PUT/POST /api/admin/social/reports`（下架/隐藏他人内容）。多用户实例上线当天就是"人人皆管理员"。
- **改进方案**：①把默认值反过来：`isOwner = memberships.some(role==='OWNER')`，仅在"系统内 User 总数 === 1 且无任何 Space"时走"单用户兼容"分支；②`requireCapability` 增加 `username` 入参并复用 `lib/modules/access/space-scope.ts` 的双键查询；③补一条集成测试：注册新用户 → 期望 `/api/admin/*` 全部 403（现有 security 测试若没覆盖这条，等于没测）。验证：`npm test` 中新增用例 + 手工注册新号 curl 管理接口。

### [🔴] P-2 数据库没有 migration 历史：启动期 `db push` + 失败吞掉
- **位置**：`scripts/docker-entrypoint.sh:12-16`；`scripts/apply-schema-migration.cjs:437-440`（脚本自称"仅 DDL"却含 `INSERT IGNORE ... SELECT` 数据写入）；`prisma/` 下只有 `schema.prisma`（无 `migrations/`）；CI 同样用 `db push`（`.github/workflows/ci.yml:50`）
- **问题描述**：容器每次启动依次执行 `apply-schema-migration.cjs`（470 行手写 ALTER）、`migrate-r1-profile-cover.cjs`、`prisma db push`，三处都写成 `|| echo "[warn] ..."`，失败后继续启动。`db push` 的依据只有"当前 schema.prisma"，没有历史基线，因此：改一次字段类型/删一个字段，下一次发布在无人工 review 的情况下由容器自动执行 `ALTER TABLE`（或因为 `--accept-data-loss` 缺失而失败、留下"代码比库新"的半迁移状态），而失败信息只会出现在容器 stdout。
- **风险影响**：①无法回答"生产库到底跑过哪些 DDL"，回滚/新建环境不可复现；②一次 schema 改动 + 重启即可静默改表，数据丢失没有事前拦截；③新旧两个镜像同时在线（滚动/回滚期间）时 schema 不确定；④CI 用 `db push` 说明测试库结构也可能与生产不一致。
- **改进方案**（替代方案，可直接落地）：
  1. 生成基线：`npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/00000000000000_baseline/migration.sql`；
  2. 生产库标记已应用：`npx prisma migrate resolve --applied 00000000000000_baseline`（不执行 SQL，只写 `_prisma_migrations`）；
  3. 之后所有 schema 变更走 `npx prisma migrate dev --name xxx` 产出增量 SQL 并入库评审；
  4. `docker-entrypoint.sh` 改为 `npx prisma migrate deploy`（**失败即退出**，删掉 `|| echo`、删掉 `db push`、删掉两个手写迁移脚本；一次性回填脚本降级为运维手动任务）；
  5. CI 加漂移门禁：`npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --exit-code`（0 才通过），并把 `db push` 换成 `migrate deploy`；
  6. 验证：空 MySQL 容器跑 `migrate deploy` + `diff --exit-code` 通过；把 `schema.prisma` 改一行后该门禁应报错。

### [🔴] P-3 Prisma 适配器：构造即劫持 SIGTERM 并 `process.exit(0)`；reconnect 换 pool 但旧 adapter 仍持死连接
- **位置**：`lib/prisma-adapter.ts:136-158`（`process.on('SIGTERM'|'SIGINT', shutdown)`、`:153 process.exit(0)`）；`:160-176`、`:235`（`createAdapter(this.pool,...)` 闭包捕获 pool）；`:268-308`（`reconnect()` 只是 `this.pool = createPool(...)`）
- **问题描述**：①适配器在构造函数（即 `lib/db.ts:8` 模块加载）时注册进程级监听，收到 SIGTERM 后只 `pool.end()` 就 `process.exit(0)`——此时 Next.js 正在处理的请求、上传中的媒体、未 flush 的审计日志全部被硬切；exit code 0 还会让 Docker/K8s 认为"正常退出"而无法区分故障。②`reconnect()` 把 `this.pool` 换成新 pool，但已返回给 Prisma 引擎的 adapter 对象闭包捕获的是**旧的、已 `end()` 的 pool**（`:166/:235` 都是按值捕获）；若 Prisma 只在首次查询时 `connect()` 一次（driver-adapter 的常规实现，**推断**，依据是 `prisma.d.ts` 的 `SqlDriverAdapterFactory.connect` 语义），则该进程此后所有查询都会打到已关闭的 pool，健康检查"重连成功"但业务永久 500。
- **风险影响**：每次 `docker compose up -d`/`restart` 都会在 in-flight 请求上产生 502/写一半的数据；数据库网络抖动一次可能需要重启应用才能恢复；开发态 HMR 每加载一次 `lib/db.ts` 就多注册一组监听（第 11 次起 `MaxListenersExceededWarning`）。
- **改进方案**：①删除适配器内的 `process.on`/`process.exit`，改为在 `lib/db.ts` 导出 `shutdownPrisma()`，由 `instrumentation.ts`/`server.js` 的优雅停机钩子调用（先 `server.close()` 等 in-flight 完成，再 `prisma.$disconnect()`）；②`reconnect()` 改为"不替换 pool，而是重建 adapter 并让 Prisma 重建连接"——最简做法是在 pool 失效时标记 `this.pool=null` 并让 `connect()` 返回新 adapter，同时确认 Prisma 会重新调用 `connect`（用 integration test：kill MySQL 连接后断言下一次查询恢复）；③Docker Compose 给 app 加 `stop_grace_period: 30s` 与 `healthcheck: curl -f /api/health`。验证：`docker compose restart app` 期间持续压测应 0 个 5xx（当前实现必然有窗口）。

### [🟡] P-4 索引与真实查询不匹配（鉴权路径全表扫描）
- **位置**：`prisma/schema.prisma:379-393`（`SpaceMember` 只有 `@@unique([spaceId, username])` + `@@index([spaceId, role])`，**无 userId/username 单列索引**）；消费方 `lib/modules/access/space-scope.ts:50-54`、`lib/modules/space/permissions.ts:146-150`（均按 `OR: [{userId}, {username}]` 查）；同类：`:539-573` Media 无 `storageKey` 索引、`:496-522` Memory 单 `travelId` 查询只能走 `[spaceId, travelId]` 前缀、`:592-616` Album `travelId` 无索引
- **问题描述**：MySQL 无法用 `(spaceId, username)` 索引满足"仅 username 或仅 userId"的过滤，`OR` 两支都退化为全表扫描 + filesort（`orderBy joinedAt`）。而 `myActiveMemberships` / `getUserCapabilities` 是**每个鉴权请求、每个列表请求**都会调用的（前者被 `listTravels/getTravelBySlug/album.service` 复用，后者被所有 `requireCapability` 路由调用）。数据量小时无感，用户/空间一多就是最先崩的查询。
- **改进方案**：`SpaceMember` 加 `@@index([userId, status])`、`@@index([username, status])`；`Media` 加 `@@index([storageKey])`（删除/去重按 key 查）；`Memory` 加 `@@index([travelId])`、`Album` 加 `@@index([travelId])`；发布前用 `EXPLAIN` 抽查上述 5 条真实语句（`space-scope.ts:50`、`permissions.ts:146`、`travel.service.ts:433`），确认 `type≠ALL`。
- **风险影响**：单表 10 万行时上述任一查询 100ms+，且每个请求串行执行 1-3 次，P95 直接劣化。

### [🟡] P-5 多表写入无事务：全仓库仅 7 处 `$transaction`
- **位置**：`lib/modules/travel/travel.service.ts:558-585`（create + syncTravelPost + ensureTravelDays，后两步 `.catch(() => {})`）、`:681-690`（update + syncTravelPost + syncTravelDayDates）、`:831-834`（unpublishTravelPost 后 delete）、`:703-753`（逐天 UPDATE 循环，无事务）、`lib/modules/social/social.service.ts:411-425`（TravelPost/Post/Travel 三表更新，两处 `.catch(()=>{})`）
- **问题描述**：写路径普遍是"多次 prisma 调用 + 失败静默"，只有互动计数用了事务。`createTravel` 若 `ensureTravelDays` 失败，用户得到一本 0 天的旅行（详情页时间线直接 `return null`，见 `travel.service.ts:309` 后续语义），接口却返回成功；`updateSocialPost` 三表更新中任一步失败会让 feed 标题与详情标题长期不一致。
- **改进方案**：把 `createTravel`/`updateTravelInfo`/`deleteTravel`/`updateSocialPost` 包进 `prisma.$transaction(async tx => ...)`；`syncTravelPost` 增加 `tx?` 参数；`syncTravelDayDates` 的循环改为 `updateMany` CASE 或按批 `createMany`；禁止再用 `.catch(() => {})` 吞掉同步失败（至少 `console.error` + 写入 `lastError` 类字段），让"部分失败"可被发现。

### [🟡] P-6 权限/可见性仍是"多套实现并存"，且存在危险默认值
- **位置**：`lib/modules/travel/travel.service.ts:1038-1054`（`canManageTravel` 是 `canActOnContent` 的又一份实现，且只认 userId 不认 username）；`lib/modules/access/index.ts` 声称唯一入口但仅 9 个调用点；全仓库仍有 **36 处** 直接写 `visibility: 'PUBLIC'|isPublic: true` 的 ad-hoc 判断；`lib/visibility.ts:10-11`（`scopedWhere(undefined) = {}` 即**不过滤**）；`app/api/anniversaries/route.ts:10`（`listAnniversaries()` 不传 userId → 匿名拿到全站纪念日）；`app/api/images/[id]/route.ts:16-29`（无鉴权直读 `PostImage` BLOB，绕过 `lib/repositories/image-repository`）
- **问题描述**：`scopedWhere` 的 `undefined` 语义是"不限制"，与"未登录/构建期只返回公开"（同函数 :12-13）相邻，任何调用方漏传参数就从"过滤"变成"全量"。`/api/anniversaries` 正是漏传：它被列在 `PUBLIC_READ_PATHS`（`lib/public-paths.ts:57`），匿名即可读到所有用户的纪念日标题/日期/描述。`/api/images/[id]` 又绕开了已有的 repository/service，任何知道自增 id 的人可读未发布文章的图片（并带 `immutable` 缓存头，见 P-8）。
- **改进方案**：①`scopedWhere` 的 `undefined` 改为抛错或显式 `scopedWhereAll()`，强制调用方表态；②`/api/anniversaries` 改为 `getCurrentUserId()` + `listAnniversaries(userId)`（匿名只返回 `isPublic`），并复核 LoginDoor 的产品规则；③`/api/images/[id]` 走 `ImageService` 并增加 `Post.published && Post.isPublic` 校验（或签名 URL）；④补一条门禁测试：所有 `PUBLIC_READ_PATHS` 的 GET 在匿名下不得返回 `userId/ownerId` 之外的用户私有行。

### [🟡] P-7 API 规范不统一：无 schema 校验、三种响应形态、错误码语义错位、非幂等端点
- **位置**：`app/api/likes/route.ts:29-43`（匿名 POST + 客户端传 `visitorId` + `likeService.toggle` 切换语义）；`lib/api-response.ts:80-89`（`parseBody` 把 body 键原样拷入对象）；`app/api/danmaku/route.ts:75-93`（任何登录用户可删任意弹幕）、`:26-29`（异常时返回 200 + `{danmakus: []}`）；响应形态三种并存：`ok()` 的 `{success,data}`、`NextResponse.json({posts})` 裸对象（`app/api/travels/route.ts:51`）、`{error}`（`app/api/memories/[id]/route.ts:8`）
- **问题描述**：111/118 路由没有 schema 校验，`parseBody` 直接做键拷贝，等于把"mass assignment 是否危险"交给每个服务方法自己 `if (input.x !== undefined)`；同一种"业务失败"有的返回 400 有的 403（`app/api/memories/[id]/media/route.ts:31` 把 service 异常统一映射 403），客户端无法按状态码分流（`lib/client/api.ts:103-108` 只能按 `error` 字段显示）。`/api/likes` 与 `/api/social/posts/[id]/like` 是两套点赞：前者匿名 + toggle（重放会翻转状态），后者登录 + 确保目标状态（注释明确说明这是刻意修的坑）——旧端点留着，App 旧版本离线队列一旦重放就会"点了的赞自己消失"。
- **改进方案**：①抽 `lib/api/schema.ts`，每个写路由 `const body = schema.safeParse(await request.json())`，失败统一 `fail('参数错误', 422)`；②`parseBody` 删除或改成白名单；③冻结 `/api/likes`（返回 410 或改为 `setLike(targetType,targetId,liked)`），App 端读 `/api/version` 做灰度；④`danmaku` 删除加 `owner` 校验；⑤`api-response.ts` 增加 `fail(error, status, code)`，所有路由统一 `{success:false,error,code}`，并补一条 OpenAPI/契约测试。

### [🟡] P-8 缓存：服务端 MemoryCache 多实例不一致 + 无防击穿；HTTP 缓存经核查**无串号**
- **位置**：`lib/cache.ts:139-168`（进程内 `Map` + 本地 tag 失效）、`lib/infrastructure/cache.ts:13-40`；`lib/services/post-service.ts:44-172`（8 组 key 均带 `u${userId|anon}`）；`lib/modules/social/social.service.ts:187-203`（recommended feed 缓存 500 条含 `POST_INCLUDE` 关联对象，key 维度 = 用户 × travelType）；`app/api/images/[id]/route.ts:28`（`public, max-age=31536000, immutable`）
- **问题描述**：①缓存全部在进程内，失效也只在进程内——多副本/滚动发布时，A 副本写库后 B 副本继续返回旧列表，最多 `CACHE_TTL=300s`；②`getOrSet` 不做 in-flight 合并（`lib/cache.ts:51-60`），缓存过期瞬间 N 个请求同时回源（击穿）；③recommended feed 单条缓存是 500 条完整帖子对象 × 用户 × 7 种类型，`maxSize=2000` 只是条数不是字节，`evict()` 每次全表扫描找最早过期（`:117-136`），热门站会把内存打满；④`/api/images/[id]` 无鉴权却标 1 年 immutable，私人图片一旦经 CDN/浏览器缓存就无法"收回"。
- **改进方案**：①缓存键/失效策略不变的前提下，先把 `MemoryCacheService` 抽象成接口并预留 Redis 实现（现在已经是接口，改动量小），部署多副本前必须切到 Redis pub/sub 失效；②`getOrSet` 增加 `inflight: Map<key, Promise>` 合并回源；③feed 缓存只存 `postIds + score`，出缓存后再查库（体积降一个数量级）；④`/api/images/[id]` 改为鉴权 + `private, max-age=0` 或签名 URL。
- **【专项】HTTP 缓存串号核查结论：无串号。** 12 处 `applyCacheControl` 调用点：album(private)、danmaku(public)、dashboard/home/moments/search/social/posts/social/users/timeline/travel-book/travels(user)。依据 `lib/http-cache.ts:37-58`：`scope='user'` 时登录态返回 `private`，未登录返回 `public` 但**始终追加 `Vary: Cookie`**（:55-58），且未登录响应体经 `scopedWhere`/`spaceScopedWhere` 只剩公开子集（`lib/visibility.ts:12-13`、`access/space-scope.ts:117`），因此共享缓存即使命中匿名响应也不会带出他人私有数据；登录态响应 `private` 不进共享缓存。客户端 `lib/client/api.ts` 的内存缓存按 `path` 作 key（:61），本身是串号隐患，但全仓库只有 `app/download/page.tsx:44` 对 `/api/version` 用了 `ttlMs`（公开数据），**当前无实际串号**；建议给 key 加 userId 前缀，防止未来给私有接口加 TTL 时踩雷。

### [🟡] P-9 认证链每请求 3-4 次 DB 查询；单管理员 auth 层与多用户模型并存
- **位置**：`lib/auth-middleware.ts:24-46`（`verifySession` → `getFullSessionPayload` 两次 `verifyToken`，再 `session.findUnique` + `touchLastUsed` 内部又一次 `findUnique`）；`lib/services/token-service.ts:127-137`（内存未命中即查 `TokenBlacklist`，**活跃 token 每次必查库**）；`lib/auth.ts:72,170,204,225,235,252,264`（登录凭据/改密/邮箱/纪念日全部作用于 `findFirst({orderBy:{id:'asc'}})` = 首个用户）；`lib/services/site-service.ts:16-23` 有正确的 `findUserByUsername`，但两套并存
- **问题描述**：鉴权热路径上 JWT 被验证两次、`TokenBlacklist`/Session/touchLastUsed 各一次 DB 往返，且 `requireAuth` 在 DB 故障时"退化为 JWT-only"（:47-50）——等于一次数据库抖动就让会话撤销失效。另一方面 `lib/auth.ts` 的 `getSiteSettings/updateCredentials/forceChangePassword/updateEmail/isRequirePasswordChange` 全部以"id 最小的用户"为目标，这是单管理员时代的设计；虽然新写入路径（`site-service`）已按 username 定位，但 `auth-service.changePassword`（:195-214）仍走 `userRepo.getSettings()`，一旦被新路由复用就会改到别人的密码。同时 `SiteSetting.resetToken` 旧重置链路（`lib/auth.ts:260-326`）与 `verification.ts` 新链路并存，旧链路写的是登录已不再读取的表。
- **改进方案**：①`requireAuth` 合并成一次 `verifyToken` + 一次 session 查询（`verifySession` 与 `getFullSessionPayload` 二选一），Session 行加 30s 进程内缓存并在 revoke 时失效；`TokenBlacklist` 只在 `jti` 疑似注销时查；②对 `lib/auth.ts` 的"首个用户"函数统一加 `@deprecated` 并改由 `site-service`/`user-repository` 按 id 定位，删除 `changePassword` 旧实现；③删除 `SiteSetting` 旧重置链路与 `SiteSetting` 表（先迁移数据），补一条测试："用户 B 改密码不影响用户 A"。

### [🟡] P-10 App 离线同步的失败模式：SYNCING 永久卡死、无幂等键、拉取全量无游标/无删除同步
- **位置**：`lib/modules/offline/sync-engine.ts:125-131`（`markSyncing` 后崩溃无恢复）、`:112-121`（`requeueDue` 只处理 FAILED，SYNCING 永不回队）、`lib/modules/offline/sync-queue.ts:44-56`（`pending()` 只取 PENDING）；`lib/modules/offline/sync-dispatcher.ts:113-145`（创建请求无幂等键，`:135-140 fetch 无超时/AbortSignal）、`:59-63`（写接口指向 `/api/admin/*`）；`lib/modules/offline/pull-dispatcher.ts:43-45`（拉取失败 `return []` 全静默）、`:49-121`（每次拉 200 条 moment / 全量 travels/albums/50 条 feed，无 `since` 游标）；`lib/modules/offline/pull.ts:46-72`（只 upsert，不处理"远端已删"）；`lib/modules/offline/sync-engine.ts:53`（30s 定时全量拉）
- **问题描述**：①上传中进程被杀 → 队列项停在 `SYNCING`，`pending()` 与 `requeueDue()` 都不会再捡它，**用户内容永久不同步且 UI 无告警**；②POST 创建请求丢了响应（服务端已建）→ 退避重试再建一次，产生重复旅行（`travel.service.ts:594-609` 会加 `-2` 后缀，用户看到两本）；③删除是"本地墓碑 + 服务端硬删"：设备 A 删除后，设备 B 拉取只 upsert 返回行，不会删除本地行，Web 端也看不到墓碑；④拉取走 `/api/admin/travels|moments|albums`，非管理员账号离线缓存永远是空；⑤拉取/上传的 fetch 都没有超时，弱网下 `sync()` 的 `syncing` 锁会长期占用。
- **改进方案**：①启动时 `UPDATE sync_queue SET status='PENDING' WHERE status='SYNCING'`，并给 SYNCING 加 `startedAt` 超时回收；②创建类请求加客户端生成 `clientRequestId` 并在服务端建唯一索引/幂等表（重复请求直接返回已有 id）；③拉取接口支持 `updatedSince`，服务端提供 `deletedAt` 墓碑列表（或至少 `/api/sync/changes` 统一增量端点），本地按"远端删除集合"清行；④新增 `/api/sync` 普通用户端点，不再复用 admin 接口；⑤所有 fetch 加 `AbortSignal.timeout(15000)`，失败类别区分"可重试/需重新登录"（403/401 直接 dead-letter 而不是无限退避）。

### [🟡] P-11 取消公开会级联删除全部互动数据；`TravelPost.visibility` 会被同步覆盖成 PUBLIC
- **位置**：`lib/modules/social/travel-post.service.ts:53-56,97-99,258-260`（`deleteMany({travelId|postId})`）；级联定义 `prisma/schema.prisma:780-782,794-796,812-814,877-879`（PostLike/PostFavorite/Comment/Report 均 `onDelete: Cascade`）；`travel-post.service.ts:64-73,78-88`（`syncTravelPost` 恒写 `visibility:'PUBLIC'`），但 `:206-255 sharePostToCircle` 允许写 `'SPACE'`，`social.service.ts:346` 又把非 PUBLIC 帖对非作者返回 null
- **问题描述**：用户把旅行从公开切回私密再公开，`syncTravelPost` 先 `delete TravelPost`，级联把该帖的赞/收藏/评论/举报全部物理删除；再公开时是全新帖子，计数归零。这是"改一个可见性开关导致互动数据丢失"的真实数据丢失路径。另外 `sharePostToCircle({visibility:'SPACE'})` 写入的行，在下一次 Travel 编辑触发 `syncTravelPost` 时被覆盖回 PUBLIC（越权公开）；而 SPACE 帖当前只有作者能看（space 成员看不到），语义自相矛盾。
- **改进方案**：①`TravelPost` 增加 `unpublishedAt` 软下架字段，取消公开用 `update({unpublishedAt})`，feed/详情用 `unpublishedAt: null` 过滤，保留互动记录；②`syncTravelPost` 不要覆盖手工设置的 `visibility`（或明确"同步 = 公开"并禁止 SPACE 值）；③若必须保留 SPACE，则 `getSocialPost` 改用 `canViewResource` 判定（space 成员可读）；④补测试：公开→私密→公开后 like/comment 数不丢。

### [🟡] P-12 金额/时区/时间字段模型不统一
- **位置**：`prisma/schema.prisma:438`（`Travel.budget Float?` 元）vs `:719`（`Expense.amountCents Int` 分）；`lib/modules/travel/travel.service.ts:883-894`（行程时间用 `Date.UTC(1970,0,1,h,m)` 承载"墙上时间"）、`:716-721,768-773`（`new Date('YYYY-MM-DD')` 按 UTC 解析后用 `getFullYear/getDate()` 按本地时区取日期）；`lib/prisma-adapter.ts:342-352+354-368`（写库用 `getHours()` 本地时间格式化）；`docker-compose.yml:9`（db 容器 `TZ: Asia/Shanghai`）vs `:23-28`（app 容器未设 `TZ`）
- **问题描述**：①预算用浮点元、流水用整数分，两套单位在 API 层来回换算，任何一处漏转就是 100 倍误差；②"墙上时间"与"真实时间点"混用同一个 `DateTime(3)` 类型，排序/区间查询无法区分；③app 容器默认 UTC 而 MySQL 容器 `Asia/Shanghai`：`createdAt @default(now())` 由 DB 时钟写入（UTC+8），`updatedAt @updatedAt` 由 Node 发值（UTC），**同一行的两列相差 8 小时**（推断，依据 schema :27-28 + adapter :342-352 的本地格式化 + compose 的 TZ 差异；建议直接在库上 `SELECT createdAt, updatedAt FROM Travel ORDER BY id DESC LIMIT 5` 验证）；日期与"天"的对齐在 `TZ` 非 UTC 的部署下会错一天。
- **改进方案**：①`budget` 迁移为 `budgetCents Int`（沿用 `scripts/apply-schema-migration.cjs` 的元→分回填模式，一次性脚本 + 事务）；②墙上时间单独建 `TIME` 列或明确 `startTimeMinutes Int`，不要复用 DateTime；③app 容器显式 `TZ=Asia/Shanghai` 并在 adapter 里 `SET time_zone='+08:00'`（或统一全链路 UTC，DB 与 Node 同时改），在 CI 加一条"同一行 createdAt 与 updatedAt 差值 < 5s"的集成断言。

### [🟢] P-13 可观测性与横向扩展的具体阻碍点
- **位置**：`lib/infrastructure/rate-limit.ts:33`（进程内 `Map` 计数）、`lib/cache.ts:139`（进程内缓存）、`lib/infrastructure/storage.ts:124-133`（未配 S3 时回落本地盘 `public/uploads`）、`app/api/health/route.ts:12-31`（只 `SELECT 1`）、全仓库 127 处 `.catch(() => {})` 静默吞错
- **问题描述**：限流/缓存/上传/媒体转码（`lib/infrastructure/video-transcode.ts` 依赖宿主机 ffmpeg）都是单实例假设，直接加第二个副本会：限流形同虚设（各副本独立计数）、缓存互相不可见（见 P-8）、本地上传落到不同容器、ffmpeg 只挂了宿主机路径。`/api/health` 返回 ok 不代表 schema 已迁移/存储可用/队列可用；127 处静默 catch 让"降级"与"故障"在日志里无法区分。
- **改进方案**：①多副本前把限流/缓存切 Redis（接口已抽象，见 P-8），上传强制 S3（生产已用 COS，但代码仍保留本地盘 fallback 作为默认路径）；②`/api/health` 增加 `migrations`（查 `_prisma_migrations` 是否有未完成项）、`storage`（head 一个对象）、`queue`（可选）三个子检查，返回 `503` 直到全部就绪；③把静默 catch 收敛为 `safeCall(tag, fn)`，统一落结构化日志（现有的 `lib/infrastructure/logger.ts` 已有入口），至少让 P-5/P-10 的部分失败可告警。

## 优势（有证据）

1. **API 层没有变成"SQL 堆"**：118 个 route 中 111 个委托给 `lib/container|modules|services|repositories`（统计表见上），路由平均行数 < 60（最大 270 行的 `app/api/admin/videos/resumable/route.ts` 是分片上传协议，属合理例外）。
2. **互动接口的幂等设计是有意识做的，且有注释解释踩过的坑**：`lib/modules/social/social.service.ts:435-466`（POST=确保已赞、DELETE=确保未赞）、`app/api/social/posts/[id]/like/route.ts:8-13` 明确写出"toggle 语义会被离线队列重放翻转"；计数更新包在 `$transaction` 里（`social.service.ts:448-463,478-493,567-571`）。
3. **权限收敛有真实进展**：`lib/modules/access/index.ts` + `access/space-scope.ts` 把"列表可见性与详情可见性口径不一致"的历史缺陷（列表看不到、直链又能看）收口成 `spaceScopedWhere`（`space-scope.ts:100-129`），并写了清晰的原因注释；`travel/api-guard.ts:6-12` 把 5 条写路由的 IDOR 门禁收敛成一个函数。
4. **迁移脚本对"启动期改数据"有正确的警惕**：`scripts/apply-schema-migration.cjs:454-462` 把会改数据的回填移出启动路径、要求 `--yes-i-backed-up` 显式执行，并记录了"每次重启把 userId IS NULL 划给第一个用户"的真实事故——这个判断力高于多数同规模项目。
5. **离线同步的"部分失败"教训被写进代码结构**：`sync-engine.ts:79-103` 分阶段隔离 + `write-through.ts:11-15` 明确 write-through 契约（本地/服务端/两边都失败三态），并说明"把本地队列当唯一真相"导致的历史 bug；`local-write.ts:30-44` 对老设备 SQLite 列漂移做了自省式降级。

## 未覆盖/待确认

- 未跑起真实 MySQL/Next 服务（仓库无运行实例），**索引收益与"createdAt/updatedAt 相差 8 小时"两条为静态推理 + 设计约束推断**，需 Lead/后续用 `EXPLAIN` 与 SQL 抽查确认。
- `lib/modules/space/space.service.ts`(438)、`space.repository.ts`(429)、`album.service.ts`(393)、`memory.service.ts`(167) 只做了调用面抽查，未逐条核对权限分支；`photo-upload.ts`/`media-variants.ts` 的本地盘与 ffmpeg 细节留给性能/工程化模块。
- 移动端 `offline/*` 只在 Web 端代码层面审阅，未在 Android 实机验证 SYNCING 卡死与墓碑行为（结论基于 `sync-engine/sync-queue/pull` 的代码路径）。
- 未覆盖：`/api/admin/videos/*` 分片上传协议、`export/archive|card`、`oil-paint`、`secret` 模块；`Space` 单空间假设（`spaceScopedWhere` 支持多空间，但 UI/产品是否允许多空间未核）。
- `req.url`/`apiUrl` 的 App 跨域路径与 OTA 兼容性只看了 `lib/api-base.ts` + `app-version.ts`，未核对 APK 内置 API base 与老版本 App 的接口契约。
