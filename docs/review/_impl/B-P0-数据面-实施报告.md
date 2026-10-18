# B · P0 数据面实施报告（task-12：P0-4 上传/图片归属与可见性 + P0-5 相册解锁限流）

实施人：impl-data ｜ 依据：评审报告 §4 P0-4/P0-5（S-4/S-5/S-8）

## 1. 改了哪些文件

| 文件 | 说明 |
|---|---|
| `lib/services/image-service.ts` | upload/delete 增加可选 `actor: { userId, isSiteOwner }`；新增 `MediaAccessError`（无权与不存在同错，防存在性探测）；归属读 `prisma.post.findUnique(select userId)`（PostRepository 的 select 不含 userId）；校验在写数据之前 |
| `app/api/upload/route.ts` | 从 withAuth ctx 取 userId + `isSiteOwner(ctx.userId)` 组成 actor；upload 无权 → 403 FORBIDDEN，delete 无权 → 404 NOT_FOUND（同「不存在」文案）；审计去静默 |
| `app/api/images/[id]/image-visibility.ts` | **新增**：图片读权限唯一口径（公开 = published && isPublic；作者/站长可读；其余 404） |
| `app/api/images/[id]/route.ts` | 加可见性校验；缓存头 `public, max-age=86400`（公开）/ `private, no-store`（本人/主人），不再发 immutable |
| `app/api/images/[id]/meta/route.ts` | 同一可见性口径；EXIF 只返回白名单；缓存只存白名单后的数据 |
| `lib/exif.ts` | 新增 `toPublicExif()` 白名单（width/height/orientation/dateTaken）+ 解析 Orientation(0x0112) |
| `app/api/verify-album-password/route.ts` | IP 10 次/15min + 全局 30 次/15min + 失败指数退避（key=album:<ip>，base 60s、max 30min）+ 成功清锁；超限 429 + retryAfterSeconds + Retry-After |
| `tests/security/image-access-control.test.ts` | 新增 11 例（服务层归属 + 路由可见性/缓存头） |
| `tests/security/upload-forbidden.test.ts` | 新增 3 例（403/404 映射 + actor 透传） |
| `tests/security/album-unlock-limit.test.ts` | 新增 6 例（IP/全局 429、锁 429、失败记录、成功/未设口令清锁） |
| `tests/unit/exif-public.test.ts` | 新增 4 例（EXIF 白名单） |

未改：`lib/modules/space/permissions.ts`、`lib/auth.ts`、`app/api/register`、scripts/CI、品牌名、schema。`lib/site-owner.ts` 由 A 交付，我只 import（`isSiteOwner`）。

## 2. 关键决策

1. **判权放在服务层**：`imageService.upload/delete` 接收 actor，不只依赖路由 —— 新调用方无法绕过。
2. **无权 = 不存在**：`MediaAccessError` 在路由层统一映射 403（上传）/404（删除/读取），文案不带归属信息，不给存在性探测。
3. **作者/站长可读草稿**：评审写的是 `published && (isPublic || 作者 || 站长)`；实现为「作者/站长始终可读，其他人必须 published && isPublic」。差异原因：后台编辑器需要预览未发布文章的图片（Post.published 默认 true，草稿是显式取消发布），若对作者也 404 会造成可见的功能回归。安全目标不变：匿名与非作者仍一律 404。
4. **缓存头按可见性分流**：公开 → `public, max-age=86400`（不再 immutable）；本人/主人 → `private, no-store`。
5. **EXIF 白名单而非黑名单**：只下发 width/height/orientation/dateTaken；make/model/曝光参数一并去掉（同样可用于指纹），GPS/序列号即使被塞进 ExifData 也会被过滤。
6. **相册限流三层**：IP 窗口 → 全局窗口 → 失败退避锁；成功与未设置纪念日都清锁。成功响应与 album_token 行为保持不变。
7. **actor 参数保持可选**：`app/api/admin/posts/import/publish/route.ts` 仍调用 `upload(postId, images)`（不在我的 writeScopes）。生产风险可控（该路由需登录且自己创建文章），但**建议下一批补** `actor: { userId: auth.payload.userId, isSiteOwner: true }`。

## 3. 验证

- `npx tsc --noEmit --incremental false` → **exit 0**
- `npx vitest run --reporter=dot` → **76 文件 / 679 用例全绿**（本轮新增 24 例）
- `npx eslint`（改动文件）→ 0 error（仅既有 any 类 warning）
- 未跑：`next build` / E2E（本机无 MySQL；E2E 由 CI 跑）。

## 4. Deferred

1. `app/api/admin/posts/import/publish/route.ts` 未传 actor（越界，见上）。
2. `/api/images/[id]` 若曾被 CDN/浏览器以 `immutable` 缓存过旧响应，**上线时需清一次 CDN 缓存**（旧缓存无法由代码撤回）。
3. 相册限流是单实例内存计数，多副本部署需切 Redis（与 P3-37 一致）。
4. PostImage 未加随机 publicId（评审给的替代方案），本轮按可见性校验收口。

## 5. 验收方式

- 自动：`npx tsc --noEmit --incremental false` + `npx vitest run tests/security/image-access-control.test.ts tests/security/upload-forbidden.test.ts tests/security/album-unlock-limit.test.ts tests/unit/exif-public.test.ts`。
- 手工（有环境时）：① 匿名 `curl -s -o /dev/null -w '%{http_code}' HOST/api/images/<草稿图>` → 404；公开图 → 200 且 `Cache-Control: public, max-age=86400`；作者本人带 Cookie → 200 且 `private, no-store`。② 账号 A 用账号 B 的 postId 调 POST /api/upload → 403；A 删 B 的图 → 404。③ 连续 11 次错误口令调 POST /api/verify-album-password → 第 11 次 429 + retryAfterSeconds。
