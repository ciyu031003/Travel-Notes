# 甜途 API 写路由契约（P3-38）

> 范围：`app/api/**` 下全部**写方法**（POST / PUT / PATCH / DELETE），共 85 个路由文件 / 108 个写 handler（自动盘点自源码，2026-10-19）。
> 读接口不在本文档范围；不生成全量 OpenAPI（118 条 spec 的维护成本高于收益）。
> 事实来源：路由实现 + `lib/api/schemas/**` + 契约测试 `tests/unit/api-schema-contracts.test.ts`。改契约 = 改 schema + 改本文 + 改测试，三者同 PR。

## 1. 通用约定

**认证**：`admin_session` httpOnly Cookie（JWT + DB Session）。`/api/admin/**`、`/api/me/**` 与内容/空间写接口默认要求登录；公开写接口仅 register / login / logout / forgot-password/* / verify-album-password / danmaku / likes / photo-messages / diagnostics 等白名单。会话撤销（注销/改密/踢设备）即时生效。

**请求体**：JSON（`Content-Type: application/json`）。上传类为 `multipart/form-data`，路由内用 zod 对表单字段做 `safeParse`（不套 JSON parseBody）。

**成功响应**：不强制统一包裹层（历史契约，避免破坏 Web/App），常见形态为 `{ success:true, ... }`、`ok(data)`、分页 `{success,data,total,page,pageSize,hasMore}`。**成功响应的字段与状态码只增不删。**

**失败响应（统一形状，P1-17 起全量生效）**：

```json
{ "success": false, "error": "中文提示", "code": "VALIDATION_ERROR", "requestId": "…" }
```

| 字段 | 说明 |
|---|---|
| `success` | 恒为 `false` |
| `error` | 可直接展示给用户的中文提示（不泄露 SQL/堆栈/内部路径） |
| `code` | 稳定错误码，前端按 code 分支而不是匹配文案 |
| `requestId` | 取自 `X-Request-Id` 或服务端生成；响应头同名回传，便于对日志 |

**错误码表**：

| code | status | 含义 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | zod 校验失败（缺字段/类型错/越界），error 为第一条中文提示 |
| `INVALID_JSON` | 400 | body 不是合法 JSON |
| `INVALID_ID` | 400 | 路径/body 的 ID 不是正整数 |
| `INVALID_QUERY` | 400 | 分页/筛选 query 非法 |
| `UNAUTHORIZED` | 401 | 未登录或会话已撤销/过期 |
| `FORBIDDEN` | 403 | 已登录但无权限（能力位/归属/站点主人） |
| `NOT_FOUND` | 404 | 资源不存在或无权操作（不区分「不存在」与「别人的」） |
| `RATE_LIMITED` | 429 | 触发限流（响应含 `retryAfterSeconds`） |
| `AUTH_UNAVAILABLE` | 503 | 数据库不可用导致会话无法校验（fail-closed） |
| `INTERNAL_ERROR` | 500 | 未预期异常（error 恒为通用文案，原文只进服务端日志） |
| 业务码 | 400/409 | 如 `REGISTRATION_CLOSED`、`INVALID_DATE`、`SPACE_READONLY`、`CREATE_FAILED` 等 |

**数字参数**：路径/body/query 的 ID、page、pageSize 一律 `z.coerce.number().int().positive()`（URL 与表单来的值都是字符串）；`pageSize` 上限 100、`page` 上限 10000。

**无 body 的 DELETE/注销**：路径 ID 用 `IdSchema` 校验；确实没有输入的写接口在代码中标注 `reviewed-no-body-input`。

## 认证与账号（含注册开关）（10 个写 handler）

| 方法 | 路径 | 入参 | 成功响应 | 主要错误码 |
|---|---|---|---|---|
| POST | `/api/admin/login` | 无 body（Cookie/路径参数） | 200 {success:true}（登录另带 Set-Cookie） | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| POST | `/api/admin/logout` | 无 body（Cookie/路径参数） | 200 {success:true}（登录另带 Set-Cookie） | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 500 INTERNAL_ERROR |
| POST | `/api/admin/setup` | SetupSchema（lib/api/schemas 或路由内 schema） | 200 {success:true}（登录另带 Set-Cookie） | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 500 INTERNAL_ERROR |
| POST | `/api/forgot-password/reset` | ResetPasswordSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| POST | `/api/forgot-password/send-code` | SendCodeSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| POST | `/api/forgot-password/verify-code` | VerifyResetCodeSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| POST | `/api/login` | 无 body（Cookie/路径参数） | 200 {success:true}（登录另带 Set-Cookie） | 400 INVALID_JSON / VALIDATION_ERROR / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| POST | `/api/logout` | 无 body（Cookie/路径参数） | 200 {success:true}（登录另带 Set-Cookie） | 400 INVALID_JSON / VALIDATION_ERROR / 500 INTERNAL_ERROR |
| POST | `/api/register` | RegisterSchema（lib/api/schemas 或路由内 schema） | 200 {success:true, username} | 400 INVALID_JSON / VALIDATION_ERROR / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| POST | `/api/verify-album-password` | AlbumUnlockSchema（lib/api/schemas 或路由内 schema） | 200 {success:true} + Set-Cookie album_token | 400 INVALID_JSON / VALIDATION_ERROR / 404 NOT_FOUND / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |

## Admin · 旅行（10 个写 handler）

| 方法 | 路径 | 入参 | 成功响应 | 主要错误码 |
|---|---|---|---|---|
| POST | `/api/admin/travels` | CreateTravelSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 500 INTERNAL_ERROR |
| PUT / DELETE | `/api/admin/travels/[id]` | UpdateTravelSchema（lib/api/schemas 或路由内 schema） | 200 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST | `/api/admin/travels/[id]/days` | TravelDayCreateSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| PUT / DELETE | `/api/admin/travels/[id]/days/[dayId]` | TravelDayUpdateSchema（lib/api/schemas 或路由内 schema） | 200 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST | `/api/admin/travels/[id]/expenses` | ExpenseCreateSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| DELETE | `/api/admin/travels/[id]/expenses/[expenseId]` | 无 body（Cookie/路径参数） | 200 {success:true} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST | `/api/admin/travels/[id]/itinerary` | ItineraryItemCreateSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| DELETE | `/api/admin/travels/[id]/itinerary/[itemId]` | 无 body（Cookie/路径参数） | 200 {success:true} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |

## Admin · 相册 / 纪念日 / 碎碎念 / 文章（18 个写 handler）

| 方法 | 路径 | 入参 | 成功响应 | 主要错误码 |
|---|---|---|---|---|
| POST | `/api/admin/albums` | AlbumCreateSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 500 INTERNAL_ERROR |
| PUT / DELETE | `/api/admin/albums/[id]` | AlbumUpdateSchema（lib/api/schemas 或路由内 schema） | 200 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST / DELETE | `/api/admin/albums/[id]/media` | multipart: AlbumMediaDeleteSchema / AlbumMediaUploadSchema | 200/201 上传结果（url/文件信息） | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST | `/api/admin/anniversaries` | AnniversaryCreateSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 500 INTERNAL_ERROR |
| PUT / DELETE | `/api/admin/anniversaries/[id]` | AnniversaryUpdateSchema（lib/api/schemas 或路由内 schema） | 200 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST | `/api/admin/moments` | MomentCreateSchema / PaginationQuerySchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 500 INTERNAL_ERROR |
| DELETE | `/api/admin/moments/[id]` | 无 body（Cookie/路径参数） | 200 {success:true} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST | `/api/admin/posts` | 无 body（Cookie/路径参数） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 500 INTERNAL_ERROR |
| PUT / DELETE | `/api/admin/posts/[id]` | 无 body（Cookie/路径参数） | 200 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST / DELETE | `/api/admin/posts/[id]/share` | ShareToCircleSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST | `/api/admin/posts/import` | multipart: ImportFileSchema | 200/201 上传结果（url/文件信息） | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 500 INTERNAL_ERROR |
| POST | `/api/admin/posts/import/publish` | PublishImportSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 500 INTERNAL_ERROR |
| POST | `/api/admin/preview` | PreviewSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 500 INTERNAL_ERROR |

## Admin · 个人设置（8 个写 handler）

| 方法 | 路径 | 入参 | 成功响应 | 主要错误码 |
|---|---|---|---|---|
| POST | `/api/admin/settings` | SettingsUpdateSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| POST | `/api/admin/settings/anniversary` | AnniversaryStartSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| POST | `/api/admin/settings/bind-email` | BindEmailSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| DELETE | `/api/admin/settings/email` | EmailUnbindSchema（lib/api/schemas 或路由内 schema） | 200 {success:true} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| PUT | `/api/admin/settings/oil` | OilSettingsSchema（lib/api/schemas 或路由内 schema） | 200 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| POST | `/api/admin/settings/password` | 无 body（Cookie/路径参数） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| POST | `/api/admin/settings/send-code` | SendCodeSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| POST | `/api/admin/settings/username` | UsernameUpdateSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |

## Admin · 治理与媒体（4 个写 handler）

| 方法 | 路径 | 入参 | 成功响应 | 主要错误码 |
|---|---|---|---|---|
| POST | `/api/admin/social/reports` | ReportActionSchema / ReportListQuerySchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| POST | `/api/admin/videos/resumable` | multipart: ResumableJsonSchema / ResumableChunkFormSchema | 200/201 上传结果（url/文件信息） | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 500 INTERNAL_ERROR |
| POST / DELETE | `/api/admin/videos/upload` | multipart: VideoDeleteSchema / VideoUploadSchema | 200/201 上传结果（url/文件信息） | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 500 INTERNAL_ERROR |

## 个人资料（Me）（11 个写 handler）

| 方法 | 路径 | 入参 | 成功响应 | 主要错误码 |
|---|---|---|---|---|
| POST | `/api/me/avatar` | multipart: AvatarFormSchema | 200/201 上传结果（url/文件信息） | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 500 INTERNAL_ERROR |
| POST / PUT | `/api/me/cover` | multipart: CoverFocusSchema / CoverFormSchema | 200/201 上传结果（url/文件信息） | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 500 INTERNAL_ERROR |
| PATCH | `/api/me/preferences` | PreferencesSchema（lib/api/schemas 或路由内 schema） | 200 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 500 INTERNAL_ERROR |
| PATCH | `/api/me/profile` | UpdateProfileSchema（lib/api/schemas 或路由内 schema） | 200 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 500 INTERNAL_ERROR |
| POST | `/api/media/resumable` | multipart: JsonSchema / ChunkFormSchema | 200/201 上传结果（url/文件信息） | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 500 INTERNAL_ERROR |
| PATCH / DELETE | `/api/memories/[id]` | UpdateMemorySchema（lib/api/schemas 或路由内 schema） | 200 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST / DELETE | `/api/memories/[id]/media` | AttachMemoryMediaSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST | `/api/memories/[id]/photos` | multipart（表单字段校验） | 200/201 上传结果（url/文件信息） | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |

## 旅行前台与上传（15 个写 handler）

| 方法 | 路径 | 入参 | 成功响应 | 主要错误码 |
|---|---|---|---|---|
| PATCH / DELETE | `/api/travels/[id]` | UpdateTravelSchema（lib/api/schemas 或路由内 schema） | 200 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST | `/api/travels/[id]/confirm` | 无 body（Cookie/路径参数） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST | `/api/travels/[id]/days` | AddTravelDaySchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST | `/api/travels/[id]/expenses` | AddExpenseSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| DELETE | `/api/travels/[id]/expenses/[expenseId]` | 无 body（Cookie/路径参数） | 200 {success:true} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST | `/api/travels/[id]/itinerary` | AddItineraryItemSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| PATCH / DELETE | `/api/travels/[id]/itinerary/[itemId]` | UpdateItineraryItemSchema（lib/api/schemas 或路由内 schema） | 200 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST | `/api/travels/[id]/memories` | CreateTravelMemorySchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST | `/api/travels/[id]/photos` | multipart（表单字段校验） | 200/201 上传结果（url/文件信息） | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| PATCH | `/api/travels/[id]/space` | UpdateTravelSpaceSchema（lib/api/schemas 或路由内 schema） | 200 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| PUT | `/api/travels/by-slug/[slug]` | UpdateTravelInfoSchema（lib/api/schemas 或路由内 schema） | 200 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST / DELETE | `/api/upload` | multipart: DeleteImageSchema | 200/201 上传结果（url/文件信息） | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 500 INTERNAL_ERROR |

## 空间（Space）（12 个写 handler）

| 方法 | 路径 | 入参 | 成功响应 | 主要错误码 |
|---|---|---|---|---|
| POST | `/api/spaces` | CreateSpaceSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| PATCH / DELETE | `/api/spaces/[id]` | UpdateSpaceSchema（lib/api/schemas 或路由内 schema） | 200 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| POST | `/api/spaces/[id]/invites` | CreateInviteSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| DELETE | `/api/spaces/[id]/invites/[inviteId]` | 无 body（Cookie/路径参数） | 200 {success:true} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| POST | `/api/spaces/[id]/leave` | 无 body（Cookie/路径参数） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| POST / PATCH / DELETE | `/api/spaces/[id]/members` | AddSpaceMemberSchema / UpdateSpaceMemberRoleSchema / RemoveSpaceMemberSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| POST | `/api/spaces/[id]/memories` | CreateSpaceMemorySchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| POST | `/api/spaces/[id]/travels` | CreateSpaceTravelSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |
| POST | `/api/spaces/join` | JoinSpaceSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 429 RATE_LIMITED（按接口） / 500 INTERNAL_ERROR |

## 社交圈（Social）（15 个写 handler）

| 方法 | 路径 | 入参 | 成功响应 | 主要错误码 |
|---|---|---|---|---|
| DELETE | `/api/social/comments/[id]` | 无 body（Cookie/路径参数） | 200 {success:true} | 400 INVALID_JSON / VALIDATION_ERROR / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST / DELETE | `/api/social/comments/[id]/like` | 无 body（Cookie/路径参数） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| PATCH | `/api/social/notifications` | MarkNotificationsReadSchema（lib/api/schemas 或路由内 schema） | 200 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 500 INTERNAL_ERROR |
| PATCH | `/api/social/posts/[id]` | UpdatePostSchema（lib/api/schemas 或路由内 schema） | 200 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST | `/api/social/posts/[id]/comments` | CreateCommentSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST / DELETE | `/api/social/posts/[id]/favorite` | 无 body（Cookie/路径参数） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST / DELETE | `/api/social/posts/[id]/like` | 无 body（Cookie/路径参数） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST | `/api/social/posts/[id]/report` | ReportPostSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST / DELETE | `/api/social/users/[id]/block` | 无 body（Cookie/路径参数） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 404 NOT_FOUND / 500 INTERNAL_ERROR |
| POST / DELETE | `/api/social/users/[id]/follow` | 无 body（Cookie/路径参数） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 404 NOT_FOUND / 500 INTERNAL_ERROR |

## 其他公开写接口（5 个写 handler）

| 方法 | 路径 | 入参 | 成功响应 | 主要错误码 |
|---|---|---|---|---|
| POST / DELETE | `/api/danmaku` | DanmakuCreateSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 500 INTERNAL_ERROR |
| POST | `/api/diagnostics` | bodySchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 500 INTERNAL_ERROR |
| POST | `/api/likes` | LikeToggleSchema / LikeStateQuerySchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 500 INTERNAL_ERROR |
| POST | `/api/photo-messages` | AddPhotoMessageSchema（lib/api/schemas 或路由内 schema） | 200/201 {success:true, ...领域字段} | 400 INVALID_JSON / VALIDATION_ERROR / 500 INTERNAL_ERROR |

## 2. 分页与查询（写接口内的 query 校验）

- `PaginationQuerySchema`：`page` / `pageSize`（coerce 正整数，pageSize ≤ 100）。
- `ReportListQuerySchema` = 分页 + `status` 枚举；`LikeStateQuerySchema` 与 danmaku 删除走 query。
- 参数非法 → `400 INVALID_QUERY`，不静默回落默认值（避免「翻页翻错却以为没数据」）。

## 3. 兼容性承诺与变更流程

1. **成功响应字段/状态码只增不删**；新增字段必须可选，前端不得依赖字段顺序。
2. **失败响应统一为上面的形状**；旧客户端只读 `error` 仍然可用（`code`/`requestId` 为新增字段）。
3. 改 schema 必须同步三处：`lib/api/schemas/**` → 本文档 → `tests/unit/api-schema-contracts.test.ts`（每个 schema 至少覆盖 合法 / 缺字段 / 类型错 / 边界 四类样例 + 统一错误形状断言）。
4. multipart 上限：图片 5–12MB（按接口）、视频分片 24h 会话 + `uploadId` 必须 UUID 形态（防路径穿越）、单次上传数量按接口常量。

## 4. 已知不在本契约内的接口

- `GET` 读接口（含 `/api/home`、`/api/travels`、`/api/album` 等）——各自已有缓存/可见性规则，未纳入写契约。
- `/api/version`、`/api/diagnostics`（OTA 与崩溃上报，D 线维护）。
- 外部集成（S3/COS、SMTP、ffmpeg 转码）的第三方契约不在本文范围。
