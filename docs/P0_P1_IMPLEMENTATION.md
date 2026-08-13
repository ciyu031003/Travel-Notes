# Travel-Notes P0/P1 实施记录

> 依据《Travel-Notes_优化设计方案.md》中的 P0（安全止血）与 P1（架构收敛）优先级完成。
> 原则：不推倒重写，先安全、后架构、再数据模型。

## P0 安全止血（已完成 ✅）

| 优先级 | 工作 | 实施内容 |
|---|---|---|
| P0 | 升级 Next.js | `next` 15.0.0 → **15.5.23**（当前最新 15.x 安全版本），`eslint-config-next` 同步；顺带升级 `lucide-react`（兼容 React 19）、`mermaid` 10.9 → 11.x（修复原型污染/CSS 注入/DoS 漏洞）、`rehype-sanitize`、`sharp` |
| P0 | 删除默认管理员密码 | 移除 README/登录页/迁移脚本中的 `yuanabd` / `Abd123456.` 硬编码；`/admin/setup` 改为**直接创建管理员**（`POST /api/admin/setup`，未初始化才可用，带 IP 限流，完成后关闭入口）；登录页未初始化时自动显示初始化入口 |
| P0 | Auth / Session 加固 | 新增 **Database-backed Session**（`Session` 表）：登录创建会话并写入数据库，`requireAuth` 校验 JWT 签名 + 会话未撤销/未过期；退出删除会话；密码修改/重置撤销其它会话；每用户最多 8 个活跃会话；Cookie HttpOnly + Secure + SameSite=Lax |
| P0 | 上传安全 | 新增 `media-validation`：**Magic Number 校验**（不信任客户端 MIME）、仅允许 JPEG/PNG/WebP（**禁止 SVG/GIF**）、sharp **重新编码**并剥离 EXIF/GPS 元数据、大小（10MB）/尺寸（8000px）/数量（20 张/5 个视频）限制；视频上传同样按 Magic Number 校验（MP4/WebM/OGG） |
| P0 | Markdown XSS 防护 | `UnifiedMarkdownRenderer` 接入 `rehype-raw` + `rehype-sanitize`（白名单 schema：保留语法高亮 className、TOC id、GFM 任务列表、KaTeX MathML；剥离 `<script>`/`on*`/`javascript:`/`<iframe>`/`<object>`/`<svg>` 等）；Mermaid 渲染 `securityLevel` 由 `loose` 收紧为 `strict` |
| P0 | Rate Limit | 新增 `lib/infrastructure/rate-limit.ts`（内存固定窗口 + 登录失败指数退避锁定）；接入登录（IP 20 次/分、用户名 10 次/分）、忘记密码发送/验证/重置、邮箱验证码发送、图片/视频上传 |
| P0 | Security Headers | `middleware.ts` 统一注入 CSP、HSTS（生产）、X-Content-Type-Options、Referrer-Policy、Permissions-Policy、X-Frame-Options、Cross-Origin-Opener-Policy |

### 依赖审计
- `npm audit` 剩余 3 个 high 均为 Next.js 15.x 内置 `postcss` / `sharp` 的传递依赖，**仅在升级到 Next 16 后可修复**（设计方案明确：先 15.x 回归，再评估 16）。
- 已升级修复：`js-yaml`、`nanoid`、`mermaid`、`valibot`。

## P1 架构收敛（已完成 ✅）

| 优先级 | 工作 | 实施内容 |
|---|---|---|
| P1 | 删除学习笔记 | 彻底删除 `app/notes/*`、`app/api/notes`、`app/api/repos/*`、`app/api/blog/*`、`app/api/tags/*`、`app/api/stats/learning`、`app/admin/repos/*`、`components/mindmap/*`、`components/repo/*`、`components/blog/*`、`lib/repos.ts` 及 repo service/repository/validator；清理导航（Navbar/Footer/移动端/命令面板/首页/旅行页）与搜索（改为服务端 `/api/search`，聚焦旅行记录） |
| P1 | 删除旧 Post 架构依赖 | 删除 `lib/content.ts`、`lib/markdown.ts`、`lib/db-posts.ts`、`scripts/build-search-index.cjs`、`content/` 目录；`post-repository` **直接用 Prisma** 重写，移除 content/ 混合回退；`post-service` 移除 `getLearningStats`/`getAllTagsAcrossModules`/笔记类型映射 |
| P1 | 建立 Space | 新增 `Space` / `SpaceMember` / `SpaceInvite` 模型 + `lib/modules/space/`（repository/service/permissions）+ `app/api/spaces/*` + 后台 `/admin/spaces`（创建空间、管理成员与角色） |
| P1 | Travel / Memory 数据模型 | 新增 `Travel` / `TravelDay` / `Location` / `Memory` 模型（含枚举、索引、关系），随 `prisma db push` 或 `migrate-db.cjs` 落库 |
| P1 | Media 独立 | 新增 `Media` / `MediaVariant` / `Album` / `AlbumMedia` 模型，媒体从 Post 中独立 |
| P1 | Object Storage | `lib/infrastructure/storage.ts` 新增 **S3 兼容对象存储**（`@aws-sdk/client-s3`，支持 MinIO/R2/OSS），配置 `STORAGE_*` 后自动启用，未配置回退本地文件系统 |
| P1 | Permission / RBAC | `lib/modules/space/permissions.ts`：`requireSpaceMember` / `requireSpaceRole` / `requireSpaceOwner` / `canReadMemory` / `canEditMemory` / `canDeleteMedia`，统一 IDOR 防护 |
| P1 | AuditLog | 新增 `AuditLog` 模型 + `lib/modules/audit/` 服务；登录/退出/上传/改密/空间成员变更写入审计；后台 `/admin/audit` 查看 |

## 数据库迁移
```bash
# 权威方式（推荐）
npx prisma db push

# 或使用部署兜底脚本（新增表：Session/Space/SpaceMember/SpaceInvite/Travel/TravelDay/
#                      Location/Memory/Media/MediaVariant/Album/AlbumMedia/AuditLog）
node migrate-db.cjs
```

## 后续（不在本次范围）
- Next 16 大版本迁移（修复内置 postcss/sharp 审计项）
- Timeline / Album / Anniversary / Itinerary / Expense 等 P2 产品功能
- Space 邀请链接（SpaceInvite token 已建模，未实现 UI）
- AI 能力（P3）
