# 安全审计 评审发现（sec-auditor）

> 范围：认证/会话、授权（IDOR）、输入与注入、XSS/内容安全、上传与媒体、敏感数据与密钥、防刷、移动端安全。
> 方法：只读取证（`app/api/**` 共 118 条 route.ts 全量普查 + 关键 lib 逐行阅读）；本地无 MySQL/运行中服务，**所有利用链为代码级推演，未实弹打靶**，已在「未覆盖/待确认」注明。
> 分级：🔴 可被利用漏洞 / 🟡 真实缺陷或失效的安全控制 / 🟢 纵深与一致性提升。

## 结论速览

工程队对「已知攻击面」的防护做得相当细（Markdown 净化、上传魔数+重编码、路径穿越、SQL 注入面、安全响应头几乎都到位，且有 `tests/security/*` 回归）。**但这一版最大的问题不在单点，而在「多用户化」改造没有同步收紧三处旧的单用户假设**：①能力模型仍用「没有空间成员 = OWNER」推导主人身份；②多处 admin 服务仍用 `findFirst(id asc)` 取「第一个用户」；③会话/令牌体系里混入了唯一一个无 sid、无 username 的令牌类型（相册令牌），而 `requireAuth` 只要 JWT 签名有效就放行。

由此形成两条**零门槛账号接管链**，是本次评审最严重的发现：
- **链 A（无需任何账号）**：`/api/verify-album-password` 无速率限制地签发“相册令牌”（本质是同密钥、同 issuer 的 JWT，无 sid/username）→ 把该令牌塞进 `admin_session` Cookie → 调用**只校验登录、不校验旧密码/能力**的 `POST /api/admin/force-change-password` → 直接改掉 `id` 最小用户的密码并踢掉其全部会话（`P-01`+`P-02`）。
- **链 B（公开注册即可）**：`POST /api/register` 开放注册 → 新用户无空间成员身份 → `getUserCapabilities` 判定为 OWNER（`P-03`）→ 同一条改密接口即可接管站长账号；即使没有该接口，也能读全站审计/举报并对全站内容 TAKEDOWN/BAN。

另外两条独立的高危：任意登录用户可对**任意文章**增删图片（`/api/upload` 写删 IDOR，P-04）；私有/未发布文章的图片可按自增 ID **匿名枚举**（P-05）。若部署方直接用 `docker-compose.yml` 而未跑 `scripts/docker-deploy.sh`，默认的公开 JWT 密钥还可直接伪造会话（P-09）。

## 问题清单

### [🔴] P-01 相册令牌被当作登录会话：匿名 → 管理员改密 → 账号接管

- **位置**：`lib/album-auth.ts:9-17`、`lib/auth-utils.ts:12-22`、`app/api/verify-album-password/route.ts:42-74`、`lib/auth-middleware.ts:18-59`、`app/api/admin/force-change-password/route.ts:16-37`
- **问题描述**：相册令牌由 `signSession({ date, purpose: 'album', exp })` 生成（`album-auth.ts:11`），而 `signSession` 只取 `{username, exp}`（`auth-utils.ts:12-17`）——`username` 为 `undefined`，也没有 `sid`。验证侧 `verifyAlbumToken` 只做 `verifySession`（同密钥、同 issuer 的 JWT 校验），**不校验 `purpose`/`audience`**。反过来，登录校验 `requireAuth` 的流程是 `verifySession` → 若 `payload.sid` 存在才查 DB（`auth-middleware.ts:34-51`）；**无 sid 时直接返回 `authenticated: true`**，且从不要求 `username` 存在。于是相册令牌是一个合法的“无 sid 会话”。`/api/verify-album-password` 在 `lib/public-paths.ts:21` 是公开路径，且整个文件没有任何 `rateLimit`/`checkLoginLock` 调用。
- **风险影响**：攻击者是谁 = 任何能访问站点的人；前置条件 = 无需账号。若站点未设置纪念日，该接口直接发令牌（`route.ts:42-54`，注释写“直接放行解锁”）；若已设置，口令是“纪念日日期”（弱熵，约 2 万~3 万天），**无速率限制、无失败锁定**可在线爆破。拿到令牌后即可越过全部登录态。
- **验证步骤**（只需改这一处端点配合，失败也证明链路已断）：

```bash
# 1) 取相册令牌（未设置纪念日时即使不传 date 也成功；已设置则爆破 date）
curl -si -X POST https://HOST/api/verify-album-password -H 'content-type: application/json' -d '{"date":"2020-05-20"}' | grep -i set-cookie
# 2) 把 album_token 的值当作 admin_session（后面接 P-02 的改密端点）
curl -si -X POST https://HOST/api/admin/force-change-password -H 'content-type: application/json' \
  -H "cookie: admin_session=<上一步 album_token 的值>" -d '{"newPassword":"Pwned123456"}'
# 3) 以站长身份登录
curl -si -X POST https://HOST/api/login -H 'content-type: application/json' \
  -d '{"username":"admin","password":"Pwned123456"}'
```

Playwright 等价：`context.addCookies([{ name:'admin_session', value: token, domain: HOST, path:'/' }])` 后直接请求 `/api/admin/force-change-password`。
- **改进方案**：
  1) `lib/album-auth.ts` 与 `lib/services/token-service.ts` 分域：相册令牌改用 `new SignJWT(...).setAudience('album')` 或独立 `ALBUM_TOKEN_SECRET`，`verifyAlbumToken` 用 `{ audience:'album', issuer:'travel-notes-album' }`；`tokenService.verify` 增加 `audience:'session'`（或校验 `purpose === 'session'`）。
  2) `lib/auth-middleware.ts:29-52`：`payload.username` 缺失、或 `sid` 缺失即 401（会话必须落库才可撤销，见 P-07）；删除“无 sid 跳过 DB”的分支。
  3) `/api/verify-album-password` 加 IP + 全局双维度限流与失败退避（复用 `lib/infrastructure/rate-limit.ts` 的 `checkLoginLock/recordLoginFailure`），未配置纪念日时返回“未上锁”而不是签发令牌。
  4) 测试：`tests/security/album-access.test.ts:7-11` 把 `verifyAlbumToken` 整个 mock 掉了，所以从没验证过“相册令牌不能当会话”——新增一个不 mock 的集成用例：`signSession({purpose:'album'})` 产出的 token 调 `requireAuth` 必须 401。

### [🔴] P-02 改密端点只校验登录且作用于“第一个用户”：注册即接管站长账号

- **位置**：`app/api/admin/force-change-password/route.ts:16-37`（仅 `requireAuth`）、`lib/services/auth-service.ts:216-223`、`lib/auth.ts:201-221`
- **问题描述**：`POST` 只做 `requireAuth`，**不校验旧密码、不校验 `canManageSettings`**，直接 `authService.adminChangePassword(newPassword, authResult.sessionId)`；后者 → `userRepo.forceChangePassword` → `lib/auth.ts:204` 的 `prisma.user.findFirst({ orderBy: { id: 'asc' } })`，改的是**全站第一个用户**（站长），并 `revokeAllForUser(settings.username, currentSid)` 把站长的其它会话全部撤销。
- **风险影响**：攻击者 = 任何能自助注册的人（`/api/register` 在 `lib/public-paths.ts:29` 公开，无邀请码/邮箱验证，注册即登录）；前置条件 = 不到 10 秒。后果 = 站长账号完全被接管（改密成功且原会话被踢下线，站长无法自救），全站私人内容、后台设置、成员管理尽失。
- **验证步骤**：

```bash
curl -s -c cj -X POST https://HOST/api/register -H 'content-type: application/json' -d '{"username":"evil01","password":"evil123"}'
curl -si -b cj -X POST https://HOST/api/admin/force-change-password -H 'content-type: application/json' -d '{"newPassword":"Pwned123456"}'
# 期望 403/401；当前返回 {"success":true}
```

- **改进方案**：
  1) 删除 `/api/admin/force-change-password` 的 POST，或改为“本人用旧密码改密”（复用 `/api/admin/settings/password` 的能力位+旧密码校验），仅保留 `GET` 给首登引导（并去掉公开路径白名单）。
  2) `lib/auth.ts` 不再提供“按 id 升序取用户”的隐式语义：`forceChangePassword(userId, newPassword)` 显式传 id；`updateEmail/updateCredentials/forceChangePassword/updateAnniversaryStart` 全部改为显式 userId，禁止 `findFirst` 兜底。
  3) 测试：两用户 A/B，A 调用必须 403；B 的密码不得变化。

### [🔴] P-03 「无空间成员 = OWNER」+ 后台治理接口无租户过滤：注册用户可下架/封禁/读全站审计

- **位置**：`lib/modules/space/permissions.ts:146-163`（`isOwner = memberships.length === 0 || ...`）、`app/api/admin/social/route.ts:16-59`、`app/api/admin/social/reports/route.ts:15-51`、`lib/modules/audit/audit-log.service.ts:50-79`、`app/api/admin/settings/bind-email/route.ts:6-32` + `lib/services/site-service.ts:16-23,91-102`
- **问题描述**：`getUserCapabilities` 用「查不到任何 ACTIVE `SpaceMember`」反推「单用户 = OWNER」，于是**任何自助注册、尚未加入空间的用户**都拿到 `isOwner/canManageSettings/canManageSocial/canViewAudit = true`（`permissions.ts:153-162`）。而 `/api/admin/social` 的计数/帖子/评论/举报是**全站无过滤**查询，`/api/admin/social/reports` 的 `TAKEDOWN_POST/HIDE_COMMENT/BAN_USER` 作用对象也是全站，`/api/admin/audit` 读全站审计日志。另：`/api/admin/settings/bind-email` 连 `requireCapability` 都没有，且 `siteService.updateEmail(email, undefined, true)` **不传 username** → `findUserByUsername` 回退 `findFirst(id asc)` → 改写的是**站长**的绑定邮箱（为“忘记密码”链路做嫁衣；当前首次改写会把 `emailVerified` 置 false，属残留可利用面而非即时接管）。
- **风险影响**：任意注册用户可：下架他人旅行圈内容、隐藏评论、封禁用户、读取全站操作审计（含他人用户名/操作/IP 哈希/资源）、统计全站用户数；可篡改站长邮箱。这是**跨租户**影响，不是“多看一个页面”。
- **验证**：注册后 `curl -b cj https://HOST/api/admin/social`、`curl -b cj https://HOST/api/admin/audit`、`curl -b cj -X POST https://HOST/api/admin/social/reports -d '{"reportId":1,"action":"TAKEDOWN_POST"}'`，当前应分别返回 `success:true`。
- **改进方案**：
  1) 站点主人身份显式化：`User` 增加 `role`（`SITE_OWNER`/`USER`）或维护 `SiteMember` 表，`getUserCapabilities` 只认该字段，**删除“无成员=OWNER”**；默认新注册用户 caps 全 false（保留 `canManageContent` 仅作用于自己内容）。
  2) admin 治理接口加租户维度：`listReportsForAdmin/handleReport/listAuditLogs` 增加 `siteOwnerId` 或 `spaceId` 过滤 + 归属校验（404 语义）。
  3) `bind-email` 传 `authResult.username` 并要求能力位/旧密码；`lib/services/site-service.ts` 删除 `findFirst` 兜底，签名改为必传 username。
  4) 测试：新用户 caps 断言；report 处理在非 owner 下 403。此条与 `CHANGELOG.md:1142` 已修的“双键查询”是**残留**：那次修的是“成员查不到”，没改“查不到就是主人”的语义。

### [🔴] P-04 `/api/upload` 写/删 IDOR：任意登录用户可给他人文章塞图、删图

- **位置**：`app/api/upload/route.ts:8-66,68-95`、`lib/services/image-service.ts:20-86,88-120`
- **问题描述**：POST 仅 `requireAuth`（`route.ts:9-12`），入参 `postId` 直接进入 `imageService.upload(postId, …)`，而 `image-service.ts:28-31` **只校验“文章存在”**，从不比对 `post.userId`；DELETE 把任意 `url`（`/api/images/N`）交给 `image-service.delete`（`image-service.ts:88-120`），按 id 直接 `imgRepo.delete` 并回写该文章的 `images/cover`——同样无归属校验。
- **风险影响**：注册用户即可污染/破坏他人文章图片：给站长文章追加任意图片（内容投毒）、删除任意 `PostImage`（**不可逆数据丢失**）、并把他人文章封面改掉。配合 P-05 可先枚举再删除。
- **验证**：A、B 两账号；A 建文章得 `postId`；B `curl -b B -F 'files=@a.jpg' -F 'postId=<A 的 postId>' https://HOST/api/upload` 命中 200 且 A 文章多图；B `curl -b B -X DELETE https://HOST/api/upload -d '{"url":"/api/images/<A 的图 id>"}'` 命中 200。
- **改进方案**：`imageService.upload/delete` 增加 `actor: { userId, username }` 参数，内部校验 `post.userId === actor.userId || isSiteOwner(actor)`，否则 404（避免探测）；或直接下线这条 legacy 路由（现行媒体已走 `lib/modules/media/photo-upload.ts` 管线）。测试补 `tests/security/upload-auth.test.ts`：现在它把 `requireAuth` 与 `getImageService` 都 mock 了（`upload-auth.test.ts:4-10`），只测了 401，从未测归属。

### [🔴] P-05 私有/未发布文章的图片可匿名枚举（PostImage 直出 + EXIF 端点）

- **位置**：`app/api/images/[id]/route.ts:16-30`、`app/api/images/[id]/meta/route.ts:25-49`、`lib/public-paths.ts:59`
- **问题描述**：`GET /api/images/[id]` 按自增 id 直接返回 `postImage.data`，**没有任何登录/归属/发布态校验**（`route.ts:16-28`）；`/api/images` 在 `PUBLIC_READ_PATHS`（`public-paths.ts:59`），中间件对匿名 GET 放行。`/api/images/[id]/meta` 同样无校验地返回 EXIF（含 GPS，`lib/exif.ts`）。
- **风险影响**：匿名者可顺序遍历 1..N 拉取全站历史文章图片，包括 `Post.published=false` 的草稿与 `Post.isPublic=false` 的私人文章（`prisma/schema.prisma:22-26`）；`/meta` 进一步泄露拍摄地 GPS 坐标（隐私/位置推断）。
- **验证**：`for i in $(seq 1 200); do curl -so /dev/null -w "%{http_code} " https://HOST/api/images/$i; done`；`curl https://HOST/api/images/12/meta`。
- **改进方案**：路由内按 `image.postId` 查 `Post`，校验 `published && (isPublic || userId===当前用户)`；或给 `PostImage` 增加 `publicId`（随机）并改为 `/api/images/<publicId>`；`/meta` 默认不返回 gps/`Make` 等字段（在 `lib/exif.ts` 白名单化），并要求同一校验。缓存头改为 `private`。

### [🟡] P-06 `X-Forwarded-For` 首段可伪造 → 全站 IP 限流/登录锁定形同虚设

- **位置**：`lib/request-utils.ts:2-10`（取 XFF 第一段）、`docs/nginx.conf.example:46`（`$proxy_add_x_forwarded_for`）、`app/api/login/route.ts:20-22,37-60`、`app/api/register/route.ts:14-21`、`lib/infrastructure/rate-limit.ts:85-113`
- **问题描述**：应用信任客户端可写的 XFF 首段；而示例 nginx 用 `$proxy_add_x_forwarded_for`（保留客户端自带的 XFF 再追加 `$remote_addr`）→ 攻击者每个请求换一个 `X-Forwarded-For` 即得到新 IP。登录失败锁定键是 `login:<ip>:<username>`（`login/route.ts:20-22`），换 IP 即无锁定；`login:ip`/`register:ip`/`upload:ip`/`reset-code:ip`/`danmaku:ip`/`search:ip` 全部失效。仅 `login:user`（按用户名的全局 10 次/分）仍有效。
- **风险影响**：单账号爆破被削弱为 10 次/分（14400 次/天）；注册/上传/搜索/验证码发送的防刷失效（配合 `P-13` 可无限刷首页弹幕）。**注：生产 nginx 实际配置未见，此结论基于 `docs/nginx.conf.example:46` 推断。**
- **改进方案**：`getClientIp` 改为读 `X-Real-IP`（nginx 用 `$remote_addr` 覆盖写）或引入 `TRUSTED_PROXY_HOPS` 取 XFF 倒数第 N 段并拒绝非法 IP；nginx 模板改为 `proxy_set_header X-Forwarded-For $remote_addr`；锁定键去掉 IP 维度（只按 username + 全局滑窗），限流器迁到 Redis 以支持多副本（当前内存 `Map` 重启即清空，`rate-limit.ts:33,85`）。

### [🟡] P-07 会话撤销只对一半路由生效 + DB 故障 fail-open + App 会话 1 年

- **位置**：`lib/current-user.ts:46-75`（只 `verifyToken`，不查 session 表）、`lib/auth-middleware.ts:34-51`（`if (payload.sid)` 才查库；catch 后 fail-open）、`lib/services/auth-service.ts:42,210-211,304`、`app/api/me/**`、`app/api/travels/[id]/expenses/route.ts` 等
- **问题描述**：全仓 22 个 API 文件用 `getCurrentUser(Id)` 鉴权，它只做 JWT 校验+黑名单，**不检查 `Session.revokedAt`**；而“改密/重置密码后撤销全部会话”（`auth-service.ts:210-211`）只写 session 表。因此被撤销的 token 在这些路由上继续有效（含 `PATCH /api/me/profile`、`POST /api/me/avatar`、`POST /api/me/cover`、`POST /api/travels/:id/expenses` 等写接口）。同时 `requireAuth` 在 DB 异常时 catch 后继续以 JWT 放行（`auth-middleware.ts:47-50`），被撤销会话在 DB 故障期间复活。App 端会话 TTL = 365 天（`auth-service.ts:42`），使问题长期化。
- **风险影响**：用户“改密码/重置密码后其它设备立即下线”的承诺只在 `requireAuth` 路由成立；token 泄露窗口被拉长到 1 年，且无法通过改密自救。
- **改进方案**：抽出唯一入口 `getSessionUser()`（内部调 `requireAuth`，含 DB 会话校验）替换 `lib/current-user.ts` 的 JWT-only 实现；DB 异常改为 fail-closed（500 + 告警，或仅放行无副作用 GET 并把 TTL 降到分钟级）；App 会话改为可续期的短 token（如 30 天 + 每次启动静默续期），并绑定设备指纹。测试：撤销 session 后 `/api/me` 必须 401。

### [🟡] P-08 “相册锁”是 UI 级门禁：日期口令无速率限制、图片直链公开

- **位置**：`app/api/verify-album-password/route.ts:7-77`（无 rateLimit）、`lib/album-auth.ts:9-22`、`lib/public-paths.ts:32-33`、`docs/nginx.conf.example:75-76`
- **问题描述**：相册解锁口令是“纪念日日期”（`route.ts:24,56-63`），无失败次数限制、无退避；解锁后只保护 `/api/album` 的**列表**，图片本身仍由 `/uploads/**` 与 `/api/uploads/**` 公开直出（`public-paths.ts:32-33`），nginx 注释也明确“不依赖媒体 URL 保密”。`verifyAlbumToken` 不校验 token 的 `purpose`（同 P-01）。
- **风险影响**：相册的“亲密内容”实际保护强度 = 列表接口 + URL 不可猜（部分媒体名为 `Date.now()-uuid`，但 `/api/images/<自增 id>` 与旧 `/uploads` 路径可枚举）。攻击者可通过暴力日期解锁或直接枚举图片。
- **改进方案**：限流+失败锁定；令牌加 `audience:'album'` 并把 `albumId` 写入 payload，图片访问改为签名 URL（过期时间 + HMAC）或由服务端代理时校验 album cookie；媒体目录不要对外裸放（nginx 用 `internal` + X-Accel-Redirect，见 `UPLOAD_X_ACCEL` 分支 `app/api/uploads/[...path]/route.ts:99-107`）。

### [🟡] P-09 默认弱 JWT 密钥 + 只做“非空”校验（非 fail-closed）

- **位置**：`docker-compose.yml:35-36`、`.env.example:8,11`、`middleware.ts:5-16`、`lib/services/token-service.ts:4-15`
- **问题描述**：compose 给 `JWT_SECRET`/`SESSION_SECRET` 兜底值 `change-me-to-a-long-random-secret`，`.env.example` 给 `change-this-to-a-random-secret-key`；而 `resolveJwtSecret` 只判断“非空”，生产环境**只要变量存在就接受**。若直接 `docker compose up`（不跑 `scripts/docker-deploy.sh`），密钥＝公开常量 → 可离线签出任意 `username/userId` 的 JWT；由于无 `sid` 时 `requireAuth` 跳过会话校验（P-01/P-07），伪造 token 即等于全站已登录。
- **风险影响**：条件性但后果为全站接管。**已核验**：`scripts/docker-deploy.sh:39-40` 会 `ensure_secret JWT_SECRET` 生成随机值（`docs/DEPLOYMENT.md:65` 也写“自动生成”），所以按文档部署的实例不可利用；本地 `.env`（4 行）只有 `SESSION_SECRET`、没有 `JWT_SECRET`。
- **验证**（若有测试实例）：用上述常量签一个 `{"username":"admin","userId":1,"iss":"travel-notes"}` 的 HS256 token，直接 `GET /api/me`。
- **改进方案**：`resolveJwtSecret` 增加黑名单：值等于示例/兜底串即 `throw`；删除 compose 中的兜底值（改为 `${JWT_SECRET:?...}` 形式强制必填）；启动时校验长度 ≥ 32 且非弱口令；`SESSION_SECRET` 只作迁移用途并告警。

### [🟡] P-10 密码策略与凭证保护偏弱且不一致

- **位置**：`lib/validators/auth.validator.ts:22-26`（注册 6 位）、`lib/services/auth-service.ts:121-123,284-285`、`lib/auth-utils.ts:4-6`（bcrypt cost 10）、`app/api/admin/setup/route.ts:37-42`（8 位）、`app/api/login/route.ts:53-60`
- **问题描述**：注册/重置密码下限 6 位、无复杂度/弱口令库校验；`/admin/setup` 要求 8 位（不一致）；bcrypt cost 10；登录锁定按 (IP,username)（P-06 可绕）；`/api/login` 与 `/api/admin/login` 各实现一遍限流参数（重复实现易漂移）。
- **风险影响**：结合邮箱枚举（`/api/forgot-password/send-code` 会区分“未绑定/未验证”，`auth-service.ts:236-247`）与 P-06，弱口令账号被撞库/爆破的概率显著上升。
- **改进方案**：统一最小 8 位（推荐 10）+ 弱口令黑名单（如 zxcvbn 或 top-1000 表）；bcrypt cost 12；把登录/注册/重置的限流与锁定抽到 `lib/modules/auth/login-guard.ts` 单一实现并加单测；忘记密码接口统一返回“如果该邮箱已绑定，验证码将发送”（防枚举）。

### [🟡] P-11 移动端安全（结论级，细节见 mobile-app 报告）

- **位置**：`android/app/src/main/AndroidManifest.xml:5-6`（`usesCleartextTraffic="true"`、`allowBackup="true"`）、`capacitor.config.ts:13-22`（`allowMixedContent: true`、`androidIsEncryption: false`）、`android/app/build.gradle:3-8,36-43`（缺 keystore 时回退 debug 签名、`minifyEnabled false`）、`android/app/src/main/res/xml/config.xml:3`（`<access origin="*">`）、`app/api/version/route.ts:13-22` + `hooks/use-app-update.ts:88-102`
- **问题描述**：允许明文流量 + 混合内容，且无 `network_security_config` 收紧；`allowBackup=true` 让应用私有目录（含明文 SQLite、WebView Cookie 库）进入系统/云备份；SQLite 不加密（`androidIsEncryption:false`）；OTA 只比较 `buildNumber` 大小并直接 `downloadAndInstall(downloadUrl)`，**无签名/哈希校验、无降级保护**；`downloadUrl` 由公开的 `/api/version` 下发。
- **风险影响**：物理接触/备份提取可拿到全部离线内容与会话；release 若在无 `keystore.properties` 的机器上构建则为 debug 签名（debug keystore 是公开默认文件）→ 任何人可签“同名同包”更新覆盖安装；OTA 链路被劫持/篡改即可投递任意 APK（已申请 `REQUEST_INSTALL_PACKAGES`）。
- **改进方案**：加 `res/xml/network_security_config.xml` 仅允许 `travel-notes.yuanabd.cn` 的 https；`allowMixedContent:false`、媒体统一 https；`allowBackup=false` + `dataExtractionRules`；SQLite 开启加密（`androidIsEncryption:true` + 密钥存 Android Keystore）；release 构建在缺 `keystore.properties` 时 `throw`；`/api/version` 返回 `sha256` 与签名指纹，客户端安装前校验且拒绝低于当前版本。

### [🟡] P-12 CSRF/CORS 边界：`Origin: null` 放行 + 凭据 CORS 白名单过宽 + `COOKIE_SECURE` 默认 false

- **位置**：`middleware.ts:160-180`（`origin === 'null'` 直接放行、解析失败也放行）、`middleware.ts:74-97`（回显 Origin + `Allow-Credentials: true`，白名单按 hostname 且含 `localhost/127.0.0.1` 与服务器 IP）、`app/api/login/route.ts:92-101`（Web 端 `secure` 取决于 `COOKIE_SECURE`）、`.env.example:13` / `docker-compose.yml:38`（默认 false）
- **问题描述**：CSRF 正向校验依赖“Origin 与 Host 同源”，但对 `Origin: null`（sandbox iframe / 部分 WebView）与不可解析 Origin 一律放行，仅靠 `SameSite=Lax` 兜底；而 App 登录走 `SameSite=None`（`login/route.ts:96-98`），Web 端若被改成 `None` 或使用旧浏览器则兜底失效。CORS 凭据放行按 hostname 匹配、忽略协议/端口，`localhost` 永远在白名单里 → 本机任意端口页面可发凭据请求。
- **风险影响**：在当前默认（Web=Lax、App 的 Cookie 只在 WebView 域内）下难以直接利用，属“防线单薄+配置敏感”；一旦 `COOKIE_SECURE=false` 的实例被 http 降级访问，会话 Cookie 可被中间人窃取。
- **改进方案**：`rejectCrossOrigin` 对 `null` 与解析失败改为拒绝并记日志（对已知 WebView UA 加显式白名单）；CORS 白名单改为完整 origin（`https://host:port`）、默认空、`localhost` 仅 `NODE_ENV!=='production'`；生产启动校验 `COOKIE_SECURE=true` 且 `NEXT_PUBLIC_SITE_URL` 为 https，否则拒绝启动（已有 HSTS 条件逻辑可复用 `middleware.ts:29,59-64`）。

### [🟢] P-13 公开写入口与公开读路径的边界可以再收一格

- **位置**：`lib/public-paths.ts:11-35`（`PUBLIC_PATHS` 不区分方法）、`app/api/danmaku/route.ts:33-58`
- **问题描述**：`/api/danmaku` 只出现在 `PUBLIC_PATHS`，于是 **POST 匿名可写**（文本 50 字、颜色不限），GET 公开返回最近 200 条；`color` 未做格式白名单。另 `/api/health`、`/api/version` 公开暴露版本/构建号/DB 状态（对 OTA/运维有用，但等同指纹）。
- **风险影响**：首页弹幕可被匿名刷屏（配合 P-06 限流可绕）；`color` 若被前端拼进内联样式，存在 CSS 注入/内容伪装（需结合渲染实现确认，本报告未逐行核对弹幕组件）。
- **改进方案**：`PUBLIC_PATHS` 拆为 `PUBLIC_READ_PATHS` 与 `PUBLIC_WRITE_PATHS`，弹幕写入要求登录或图形验证码；`color` 用 `/^#[0-9a-f]{6}$/i` 校验；`/api/version` 考虑按 `?channel=app` 或 UA 收窄。

### [🟢] P-14 编辑器预览用 `remark-html{sanitize:false}` + CSP `unsafe-inline` 削弱纵深

- **位置**：`components/TravelPreviewModal.tsx:63-77,322`、`app/admin/edit/[id]/page.tsx:329`、`middleware.ts:35`（`script-src 'self' 'unsafe-inline'`）
- **问题描述**：预览弹窗在前端用 `remark().use(remarkHtml, { sanitize: false })` 渲染并 `dangerouslySetInnerHTML`，与服务端 `lib/infrastructure/markdown.ts:99-110` 的已净化链路是**两套实现**；当前仅 `/admin/edit` 使用，属自 XSS。CSP 保留 `'unsafe-inline'`，一旦出现 HTML 注入点，内联事件处理器可直接执行。
- **改进方案**：预览复用服务端渲染（已有 `POST /api/admin/preview`，`app/api/admin/preview/route.ts:6-20`）或前端接 `rehype-sanitize` 同 schema；CSP 采用 Next 15 的 nonce 方案去掉 `'unsafe-inline'`（`style-src` 可保留）。

## 优势（有证据）

1. **Markdown 净化链路正确且有回归测试**：`remarkRehype(allowDangerousHtml)` → `rehypeRaw` → `rehypeSanitize(sanitizeSchema)` 的顺序正确（`lib/infrastructure/markdown.ts:99-110`），schema 在默认白名单上只额外放行 KaTeX/highlight/TOC/GFM 必要项（`:41-83`），并配 `tests/unit/markdown-xss.test.ts`；搜索高亮先 `escapeHtml` 再插 `<mark>`（`app/search/page.tsx:30-47`）。
2. **图片上传做对了关键几步**：魔数识别 → 声明 MIME 与真实类型比对 → 尺寸/大小/数量限制 → sharp 重新编码剥离 EXIF/GPS、禁 GIF/SVG（`lib/infrastructure/media-validation.ts:79-151`）；缩略图变体也走同一函数。
3. **`/uploads` 路径穿越防护是双保险**：逐段拒绝 `..`、含斜杠段 + `path.resolve` 前缀校验 + 扩展名白名单（`.sql/.env` 等一律 404）+ SVG 明确不放行（`app/api/uploads/[...path]/route.ts:46-59,86-90`），并有 `tests/security/uploads-path-traversal.test.ts`。
4. **会话可撤销、注销可落库**：`requireAuth` 在 `sid` 存在时查 DB 会话有效性与过期（`lib/auth-middleware.ts:34-46`），token 黑名单同时有内存与持久化两层（`lib/services/token-service.ts:121-144`），改密撤销其它会话（`lib/services/auth-service.ts:210-211`）——方向正确，问题只在覆盖面（P-07）。
5. **注入面干净、密钥不入库**：全仓唯一 `$queryRaw` 是 `SELECT 1`（`app/api/health/route.ts:16`），自定义 Prisma 适配器走参数化 `SqlQuery`（`lib/prisma-adapter.ts:61-62,407-413`），无字符串拼接 SQL；`.env` 已被 gitignore 且未入库（本地仅 4 行），仓库内无硬编码第三方密钥；安全响应头（CSP/XFO/HSTS/nosniff/Referrer/Permissions）配置完整（`middleware.ts:27-66`）；旅行子资源写接口统一 `guardTravelWrite` 并做了“子资源 id 反查父旅行”的归属校验（`lib/modules/travel/api-guard.ts:29-69`），`/api/travel-book/oil` 有同源双重 SSRF 校验（`app/api/travel-book/oil/route.ts:29-40` + 测试）。

## 未覆盖/待确认

- **未实弹验证**：本地无 MySQL、127.0.0.1:3000 未监听，P-01/P-02/P-03/P-04 的 curl 步骤均为按代码路径推演，**建议 Lead 在有环境的实例上按 P-01 三步复核**（该链只依赖 3 个公开端点，风险可控）。
- **生产配置未知**：生产 nginx 实际配置（XFF 透传方式，影响 P-06 定级）、生产 `.env` 是否设置了强 `JWT_SECRET`（本地仅有 `SESSION_SECRET`）、是否用 `scripts/docker-deploy.sh` 部署（影响 P-09）——均只能基于仓库内样例/脚本推断，已逐条标注。
- **未逐行审计**：视频上传/转码（`videos/resumable`、`lib/infrastructure/video-transcode.ts`、ffmpeg 输入与磁盘配额）、对象存储/COS 凭证与预签名 URL、导出 ZIP 的路径处理（`lib/modules/export/archive.service.ts`）、弹幕/评论的前端渲染实现（P-13 的 CSS 注入面）、邮件模板注入（主题为固定串，未深入）。
- **未运行测试**：`tests/security/*`（7 个文件）未执行（依赖 DB/环境）；从代码看 `upload-auth` 与 `album-access` 把关键依赖 mock 掉，无法防住 P-01/P-04，建议新增不 mock 的集成用例。
- **未覆盖**：Web 端 CSP 违规采集、依赖漏洞（npm audit，属工程化模块）、反序列化/原型链（未发现 `JSON.parse` 后直接 merge 的高危点，但未穷举）、限流键碰撞与内存泄漏（`rate-limit.ts:40-47` 只在 >5000 键时清扫）。
