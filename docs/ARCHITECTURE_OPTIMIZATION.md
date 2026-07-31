# Travel-Notes 架构优化设计文档

> **文档版本**: v3.1  
> **最后更新**: 2026-07-31  
> **项目**: 个人旅行笔记系统 (Travel-Notes)  
> **目标读者**: 负责技术实施的工程师  
> **状态**: 阶段一~三已完成；阶段 A（架构治理）+ 阶段 B（编辑器重构+文档导入）为当前 P0 任务

---

## 0. 优化进度总览

### 0.1 通用架构演进

| 阶段 | 内容 | 状态 | 备注 |
|------|------|------|------|
| **阶段一** | 安全加固 | ✅ 已完成 | JWT 认证 + Token 黑名单 + 密码找回 |
| **阶段二** | 数据层重构 | ✅ 已完成 | 官方 MySQL 适配器 + 连接池优化 + PostImage/Danmaku 模型 |
| **阶段三** | 服务层引入 | ✅ 已完成 | Service/Repository/Validator/DI 容器 + 混合内容获取 |
| **阶段四** | 组件拆分与优化 | ⏳ 待开始（P2） | ChinaMap 拆分、TravelInfoPanel 拆分、Design Token |
| **阶段五** | 基础设施增强 | ⏳ 待开始（P2） | Redis、对象存储、监控 |

### 0.2 学习笔记模块专项优化（本轮重点）

| 阶段 | 内容 | 优先级 | 估算工期 | 负责人 |
|------|------|--------|---------|--------|
| **阶段 A** | 架构治理（修复分层违规） | **P0** | 1-2 天 | 后端工程师 |
| **阶段 B** | 编辑器重构 + 文档一键导入发布 | **P0** | 3-5 天 | 前端 + 后端工程师 |
| **阶段 C** | 博客阅读体验升级（TOC/代码高亮/上下篇） | P1 | 2-3 天 | 前端工程师 |
| **阶段 D** | 思维导图模块升级（markmap 交互） | P1 | 2-3 天 | 前端工程师 |
| **阶段 E** | 代码仓库模块后台可管理化 | P2 | 1-2 天 | 全栈 |
| **阶段 F** | 学习辅助功能（搜索/标签云/RSS/学习路线） | P2 | 按需 | 全栈 |

---

## 1. 项目概览

### 1.1 技术栈

| 类别 | 技术选型 | 版本 | 说明 |
|------|---------|------|------|
| 框架 | Next.js | 15.0.0 | App Router |
| 语言 | TypeScript | 5.3+ | 全量 TS |
| UI | React + Tailwind CSS | 19 / 3.4 | Server + Client Components |
| ORM | Prisma | 7.9 | 官方 MySQL 适配器 |
| 数据库 | MySQL / MariaDB | 8.0+ | 已完成迁移 |
| 认证 | jose (JWT) + bcryptjs | 6.2 / 3.0 | JWT Token + 黑名单注销 |
| 验证 | Zod | 4.4 | 运行时类型验证 |
| 地图 | d3-geo + SVG | 3.1 | 中国地图可视化 |
| Markdown | Remark + Gray Matter | - | 内容解析 |

### 1.2 核心功能

- **旅行地图**: 中国地图可视化，点击省份/城市查看旅行记录
- **博客系统**: 基于 Markdown 的技术博客，支持代码高亮和 Mermaid 思维导图
- **代码仓库展示**: 文件树 + 代码查看器
- **管理后台**: 内容管理、密码重置、系统设置、邮箱绑定
- **JWT 认证**: Token 签名/验证/黑名单注销、密码找回流程
- **混合内容获取**: 数据库优先 + Markdown 回退
- **弹幕系统**: 页面弹幕互动

---

## 2. 当前架构（已实施）

### 2.1 架构总览

```
┌──────────────────────────────────────────────────────────────┐
│                       Next.js 15 App Router                    │
├───────────────┬───────────────────┬──────────────────────────┤
│  Server       │   API Routes      │   Middleware              │
│  Components   │   (app/api/*)     │   (JWT 鉴权 + 路由守卫)    │
│  (app/*/)     │                   │                           │
├───────────────┴───────────────────┴──────────────────────────┤
│                   Service Layer (服务层)                       │
│  ┌────────────┬─────────────┬──────────────┬───────────────┐ │
│  │ AuthService│ PostService │ SiteService  │ TokenService  │ │
│  │ 登录/JWT/  │ CRUD/混合/  │ 设置/密码/   │ JWT签名/验证/ │ │
│  │ 密码/找回  │ 缓存        │ 邮箱/纪念日  │ 黑名单/刷新   │ │
│  └────────────┴─────────────┴──────────────┴───────────────┘ │
├──────────────────────────────────────────────────────────────┤
│                 Data Access Layer (数据访问层)                 │
│  ┌──────────────────────┬──────────────────────┐             │
│  │ PostRepository       │ UserRepository       │             │
│  │ 封装 db-posts.ts     │ 封装 auth.ts         │             │
│  └──────────────────────┴──────────────────────┘             │
├──────────────────────────────────────────────────────────────┤
│              Infrastructure (基础设施层)                      │
│  ┌──────────────┬──────────────┬────────────────────┐       │
│  │ CacheService │StorageService│ Validators (Zod)   │       │
│  │ 内存TTL+标签 │ 本地文件系统 │ 请求输入验证       │       │
│  └──────────────┴──────────────┴────────────────────┘       │
├──────────────────────────────────────────────────────────────┤
│  ┌─────────────────┬──────────────────┬─────────────────┐   │
│  │ Prisma (MySQL)  │ Markdown 内容    │ api-response    │   │
│  │ 官方适配器      │ 回退数据源       │ 统一响应工具    │   │
│  └─────────────────┴──────────────────┴─────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 依赖注入容器

`lib/container.ts` 提供单例 Service 工厂方法：

```typescript
// 获取 PostService 实例（PostRepository + CacheService）
getPostService()

// 获取 AuthService 实例（UserRepository + TokenService）
getAuthService()

// 获取 SiteService 实例（UserRepository + CacheService）
getSiteService()
```

所有 Service 实例为单例，共享同一个 `MemoryCacheService` 实例。`resetServices()` 方法用于测试重置。

---

## 3. 阶段一：安全加固（已完成）

### 3.1 JWT 认证

- **Token 服务**: [lib/services/token-service.ts](file:///f:/CodeFiles/Travel-Notes/lib/services/token-service.ts)
  - 使用 `jose` 库实现 JWT 签名与验证
  - HS256 算法，5 小时过期
  - Token 黑名单支持（内存 Map，最大 10000 条，LRU 淘汰）
  - `sign()` / `verify()` / `verifyWithoutBlacklist()` / `blacklistToken()` / `refresh()`

- **中间件**: [middleware.ts](file:///f:/CodeFiles/Travel-Notes/middleware.ts)
  - JWT Token 验证
  - 公开路径白名单（登录、注册、API 公开接口等）
  - 无效 Token 自动清除 Cookie 并重定向

### 3.2 密码管理

- bcryptjs 密码哈希（salt rounds: 10）
- 密码修改需要验证当前密码
- 密码找回流程（邮箱验证码）
- 强制密码修改（`requirePasswordChange` 标志）

### 3.3 安全措施

- 所有敏感操作（修改用户名/邮箱/密码）均需验证当前密码
- 邮箱绑定需验证码验证
- Cookie `httpOnly` + `secure` 配置
- API 路由统一使用 `requireAuth()` 中间件

---

## 4. 阶段二：数据层重构（已完成）

### 4.1 Prisma 配置

- [lib/db.ts](file:///f:/CodeFiles/Travel-Notes/lib/db.ts): PrismaClient 使用官方 `@prisma/adapter-mysql`
- [lib/prisma-adapter.ts](file:///f:/CodeFiles/Travel-Notes/lib/prisma-adapter.ts): 自定义 `PrismaMariaDB` 适配器
- 连接池配置: limit=25, queue=50
- 全局单例模式，防止热重载创建多个连接

### 4.2 数据库 Schema

> **设计决策**: Post 表使用 JSON 字段（images、videos、tags）而非规范化关联表。
> 这是基于项目实际需求的权衡——文章数量不大，JSON 字段简化了数据访问层逻辑。

#### Post 表
- `(type, slug)` 联合唯一约束
- 复合索引: `(type, published, date)` 优化按类型查询已发布文章
- 索引: `(published, date)`, `(location)`, `(createdAt)`
- JSON 字段: `images`（图片URL数组）、`videos`（视频信息数组）、`tags`（标签数组）

#### PostImage 表
- 二进制图片存储（LongBlob），无需外部图床
- `postId` 外键级联删除
- `(postId, order)` 复合索引

#### SiteSetting 表
- 单行配置表（`username` 唯一）
- 包含密码哈希、邮箱、重置令牌、纪念日等

#### Danmaku 表
- 弹幕系统数据存储

---

## 5. 阶段三：服务层引入（已完成）

### 5.1 目录结构

```
lib/
├── services/              # 服务层（业务逻辑）
│   ├── auth-service.ts    # 认证服务
│   ├── post-service.ts    # 文章服务
│   ├── site-service.ts    # 系统设置服务
│   └── token-service.ts   # JWT Token 服务
├── repositories/          # 数据访问层
│   ├── post-repository.ts # 文章数据访问
│   └── user-repository.ts # 用户数据访问
├── infrastructure/        # 基础设施抽象
│   ├── cache.ts           # 缓存服务接口 + 内存实现
│   └── storage.ts         # 存储服务接口 + 本地实现
├── validators/            # 输入验证（Zod）
│   ├── post.validator.ts  # 文章验证 Schema
│   └── auth.validator.ts  # 认证验证 Schema
├── container.ts           # 依赖注入容器
└── api-response.ts        # 统一 API 响应工具
```

### 5.2 Repository 层

#### PostRepository

[lib/repositories/post-repository.ts](file:///f:/CodeFiles/Travel-Notes/lib/repositories/post-repository.ts)

封装 `lib/db-posts.ts` 的数据访问逻辑，提供接口：

| 方法 | 说明 |
|------|------|
| `findById(id)` | 按 ID 查询文章详情 |
| `findBySlug(type, slug)` | 按类型和 slug 查询 |
| `findAll(params)` | 分页查询（支持类型、搜索过滤） |
| `findAllByType(type)` | 按类型查询全部 |
| `findByLocation(location)` | 按地点查询 |
| `create(data)` | 创建文章 |
| `update(id, data)` | 更新文章（自动处理 Date 转换） |
| `delete(id)` | 删除文章 |
| `countByType(type)` | 按类型统计 |
| `getDistinctLocations()` | 获取所有不同地点 |

#### UserRepository

[lib/repositories/user-repository.ts](file:///f:/CodeFiles/Travel-Notes/lib/repositories/user-repository.ts)

封装 `lib/auth.ts` 的系统设置数据访问逻辑，提供接口：

| 方法 | 说明 |
|------|------|
| `getSettings()` | 获取系统设置 |
| `updateCredentials(...)` | 更新用户名/密码/邮箱 |
| `updateAnniversaryStart(date)` | 更新纪念日 |
| `updateEmail(email, verified)` | 更新邮箱 |
| `forceChangePassword(newPassword)` | 强制修改密码 |
| `initializeFromEnv()` | 从环境变量初始化 |

### 5.3 Service 层

#### PostService

[lib/services/post-service.ts](file:///f:/CodeFiles/Travel-Notes/lib/services/post-service.ts)

核心文章业务逻辑，包含：

- **缓存策略**: TTL 300 秒，标签化失效（`posts`、`posts:{type}`）
- **混合内容获取**: 
  - `getPostsHybrid(directory)` - 合并数据库 + Markdown 文章，去重后按日期排序
  - `getPostBySlugHybrid(directory, slug)` - 优先数据库，回退 Markdown
- **DTO 转换**: `toDetailDTO()` 将 `PostDB` 转换为 `PostDetailDTO`
- **缓存失效**: 创建/更新/删除时按标签批量失效

核心方法列表：

| 方法 | 说明 |
|------|------|
| `getPublishedPosts(type, filters)` | 分页获取已发布文章 |
| `getAllPosts(type?)` | 获取全部文章 |
| `getPostBySlug(type, slug)` | 按 slug 获取文章 |
| `getPostById(id)` | 按 ID 获取文章 |
| `getPostsByLocation(location)` | 按地点获取文章 |
| `getPostCountByType(type)` | 按类型统计数量 |
| `getDistinctLocations()` | 获取所有地点 |
| `getPostsHybrid(directory)` | **混合获取**（DB + Markdown） |
| `getPostBySlugHybrid(directory, slug)` | **混合获取单篇** |
| `createPost(input)` | 创建文章 |
| `updatePost(id, input)` | 更新文章 |
| `deletePost(id)` | 删除文章 |

#### AuthService

[lib/services/auth-service.ts](file:///f:/CodeFiles/Travel-Notes/lib/services/auth-service.ts)

认证业务逻辑：

| 方法 | 说明 |
|------|------|
| `login(username, password)` | 登录验证，返回 JWT Token |
| `verifyToken(token)` | 验证 Token（检查黑名单） |
| `verifyTokenWithoutBlacklist(token)` | 验证 Token（不检查黑名单） |
| `logout(token)` | 注销（加入黑名单） |
| `changePassword(current, new)` | 修改密码（需验证当前密码） |
| `adminChangePassword(new)` | 管理员强制修改密码 |
| `sendResetCode(email)` | 发送密码重置验证码 |
| `verifyResetCode(email, code)` | 验证重置验证码 |
| `resetPassword(email, code, new)` | 重置密码 |

#### SiteService

[lib/services/site-service.ts](file:///f:/CodeFiles/Travel-Notes/lib/services/site-service.ts)

系统设置业务逻辑：

| 方法 | 说明 |
|------|------|
| `getSiteConfig()` | 获取站点配置（缓存 600 秒） |
| `getSiteSettings()` | 获取原始设置 |
| `updateAnniversaryStart(date)` | 更新纪念日 |
| `updateUsername(username, password)` | 修改用户名（需密码验证） |
| `updatePassword(current, new)` | 修改密码（需密码验证） |
| `updateEmail(email, password?, skip?)` | 修改邮箱（可选密码验证） |
| `verifyPassword(password)` | 验证当前密码 |

#### TokenService

[lib/services/token-service.ts](file:///f:/CodeFiles/Travel-Notes/lib/services/token-service.ts)

JWT Token 管理：

| 方法 | 说明 |
|------|------|
| `sign(payload, ttl?)` | 签发 JWT Token |
| `verify(token)` | 验证 Token（含黑名单检查） |
| `blacklistToken(token)` | 加入黑名单 |
| `refresh(token, ttl?)` | 刷新 Token |

### 5.4 基础设施层

#### CacheService

[lib/infrastructure/cache.ts](file:///f:/CodeFiles/Travel-Notes/lib/infrastructure/cache.ts)

异步缓存接口，封装现有 `lib/cache.ts` 同步内存缓存：

```typescript
interface CacheService {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttlSeconds?: number, tags?: string[]): Promise<void>
  delete(key: string): Promise<void>
  deleteByTag(tag: string): Promise<void>
  deleteByPrefix(prefix: string): Promise<void>
  clear(): Promise<void>
  getOrSet<T>(key: string, fetcher: () => Promise<T>, ttlSeconds?: number, tags?: string[]): Promise<T>
}
```

- `MemoryCacheService` 实现该接口，内部委托给 `appCache`（同步内存缓存）
- 支持标签化批量失效
- 未来可替换为 `RedisCacheService` 实现

#### StorageService

[lib/infrastructure/storage.ts](file:///f:/CodeFiles/Travel-Notes/lib/infrastructure/storage.ts)

文件存储抽象接口：

```typescript
interface StorageService {
  upload(file: Buffer, key: string, contentType: string): Promise<StoredFile>
  delete(key: string): Promise<void>
  getUrl(key: string): Promise<string>
}
```

- `LocalStorageService` 实现本地文件系统存储
- 未来可替换为 S3/OSS/COS 实现

### 5.5 验证层

#### Post Validator

[lib/validators/post.validator.ts](file:///f:/CodeFiles/Travel-Notes/lib/validators/post.validator.ts)

Zod Schema 定义：
- `CreatePostSchema` - 创建文章验证（slug 格式、标题、内容、图片/视频/标签数组限制）
- `UpdatePostSchema` - 更新文章验证（全部可选）
- `LoginSchema` / `ChangePasswordSchema` / `UpdateUsernameSchema` / `UpdateEmailSchema` / `UpdateAnniversarySchema`

#### Auth Validator

[lib/validators/auth.validator.ts](file:///f:/CodeFiles/Travel-Notes/lib/validators/auth.validator.ts)

- `LoginSchema` - 登录验证
- `ChangePasswordSchema` - 密码修改验证

### 5.6 API 响应工具

[lib/api-response.ts](file:///f:/CodeFiles/Travel-Notes/lib/api-response.ts)

统一 API 响应格式：

```typescript
ok(data?, message?)           // 200 成功响应
fail(error, status?)          // 错误响应
notFound(message?)            // 404
unauthorized(message?)        // 401
forbidden(message?)           // 403
serverError(message?)         // 500
paginatedResponse(data, ...)  // 分页响应
```

### 5.7 API Route 迁移

所有 API 路由已迁移到 Service 层调用模式：

**迁移前**（直接调用数据层）:
```typescript
import { getPosts } from '@/lib/content'
const posts = await getPosts('travel')
```

**迁移后**（通过 Service 层）:
```typescript
import { getPostService } from '@/lib/container'
const postService = getPostService()
const posts = await postService.getPostsHybrid('travel')
```

已迁移的页面和路由：

| 文件 | 使用的 Service 方法 |
|------|-------------------|
| `app/page.tsx` | `getPostsHybrid('travel')`, `getPostsHybrid('tech/blog')` |
| `app/travel/page.tsx` | `getPostsHybrid('travel')` |
| `app/travel/[slug]/page.tsx` | `getPostBySlugHybrid('travel', slug)` |
| `app/notes/blog/page.tsx` | `getPostsHybrid('tech/blog')` |
| `app/notes/blog/[slug]/page.tsx` | `getPostBySlugHybrid('tech/blog', slug)` |
| `app/notes/mindmap/page.tsx` | `getPostsHybrid('tech/mindmaps')` |
| `app/notes/mindmap/[slug]/page.tsx` | `getPostBySlugHybrid('tech/mindmaps', slug)` |
| `app/api/album/route.ts` | `getPostsHybrid('travel')` |
| `app/api/notes/route.ts` | `getPostsHybrid('tech/blog')`, `getPostsHybrid('tech/mindmaps')` |
| `app/api/admin/posts/route.ts` | `createPost()` + Zod 验证 |
| `app/api/admin/posts/[id]/route.ts` | `getPostById()`, `updatePost()`, `deletePost()` |
| `app/api/admin/login/route.ts` | `authService.login()` |
| `app/api/admin/logout/route.ts` | `authService.logout()` |
| `app/api/admin/settings/*` | `siteService` 各方法 |
| `app/api/forgot-password/*` | `authService.sendResetCode()` 等 |
| `app/api/check-auth/route.ts` | `requireAuth()` 中间件 |

---

## 5A. 学习笔记模块架构评估

### 5A.1 模块现状

| 模块 | 实现位置 | 现状 | 问题 |
|------|---------|------|------|
| 笔记首页 | [app/notes/page.tsx](file:///f:/CodeFiles/Travel-Notes/app/notes/page.tsx) | 客户端组件，3 模块入口 + 最新 4 篇 | 无统计图表、无学习进度可视化 |
| 技术博客 | [app/notes/blog/](file:///f:/CodeFiles/Travel-Notes/app/notes/blog) | 服务端渲染 + 标签筛选 | 无 TOC、无代码高亮、无上下篇、无搜索、无分页 |
| 思维导图 | [app/notes/mindmap/](file:///f:/CodeFiles/Travel-Notes/app/notes/mindmap) | Markdown 文章列表 + Mermaid 渲染 | 非真正交互思维导图、无缩放/折叠/节点跳转 |
| 代码仓库 | [app/notes/repo/](file:///f:/CodeFiles/Travel-Notes/app/notes/repo) | 文件系统读取 | 无后台管理、仓库元数据无持久化、无语法高亮 |
| 后台编辑器 | [app/admin/edit/[id]/page.tsx](file:///f:/CodeFiles/Travel-Notes/app/admin/edit/[id]/page.tsx) | **997 行巨型组件** | **纯 textarea、无富文本、视频管理区重复渲染（Bug）、无文档导入** |

### 5A.2 当前架构违规问题（阶段 A 治理目标）

依据 §2.1 分层规范「严禁在 API Route 中直接处理数据库连接，必须通过 Service 层封装」：

| # | 违规点 | 文件 | 影响 | 修复方案 |
|---|--------|------|------|---------|
| 1 | **API 直连 Prisma** | [app/api/upload/route.ts#L32-L96](file:///f:/CodeFiles/Travel-Notes/app/api/upload/route.ts#L32-L96) | 绕过 Service/Repository 层，数据访问逻辑耦合在路由 | 新增 `ImageRepository` + `ImageService`，迁移调用 |
| 2 | **数据源不统一** | [app/api/notes/route.ts#L10](file:///f:/CodeFiles/Travel-Notes/app/api/notes/route.ts#L10) | `getAllRepos()` 直接调文件系统 vs 博客/思维导图走 `postService` | 新增 `RepoService` 统一所有数据源入口 |
| 3 | **Repository 缺失** | [app/api/repos/route.ts](file:///f:/CodeFiles/Travel-Notes/app/api/repos/route.ts) | `getAllRepos()` 无 Repository 抽象、无缓存 | 新增 `RepoRepository` + `RepoService` |
| 4 | **Markdown 渲染重复** | [lib/markdown.ts#L55-L82](file:///f:/CodeFiles/Travel-Notes/lib/markdown.ts#L55-L82) + [lib/db-posts.ts#L226-L244](file:///f:/CodeFiles/Travel-Notes/lib/db-posts.ts#L226-L244) | 两份 remark 处理逻辑，违反 DRY | 抽取 `MarkdownRenderer` 基础设施 |
| 5 | **重复渲染 Bug** | [app/admin/edit/[id]/page.tsx#L597-L827](file:///f:/CodeFiles/Travel-Notes/app/admin/edit/[id]/page.tsx#L597-L827) | 「旅行视频管理」区块在 travel 分支内渲染了两次 | 删除第 716-827 行重复块 |

---

## 5B. 阶段 A：架构治理（P0 · 后端优先）

### 5B.1 A.1 ImageRepository + ImageService

#### 目标

将 `app/api/upload/route.ts` 中直接操作 Prisma 的逻辑抽取到 Service/Repository 层。

#### 文件清单

```typescript
// lib/repositories/image-repository.ts
export interface ImageRepository {
  create(postId: number, data: Buffer, mimeType: string, order: number): Promise<{ id: number }>
  findById(id: number): Promise<{ id: number; postId: number; data: Buffer; mimeType: string; order: number } | null>
  delete(id: number): Promise<void>
  getMaxOrder(postId: number): Promise<number>
  findByPostId(postId: number): Promise<Array<{ id: number; order: number }>>
}

// lib/services/image-service.ts
export class ImageService {
  constructor(
    private readonly imgRepo: ImageRepository,
    private readonly postRepo: PostRepository,
  ) {}
  async upload(postId: number, files: Array<{ name: string; buffer: Buffer; mimeType: string }>): Promise<{ urls: string[] }>
  async delete(url: string): Promise<void>
}
```

#### 迁移步骤

1. 创建 `PrismaImageRepository` 实现
2. 创建 `ImageService`（调用 Repository，管理 Post.images 字段同步 + Cover 自动更新）
3. 重构 [app/api/upload/route.ts](file:///f:/CodeFiles/Travel-Notes/app/api/upload/route.ts) → 调用 `getImageService()`
4. 在 `lib/container.ts` 注册 `getImageService()` 工厂方法

### 5B.2 A.2 RepoRepository + RepoService

#### 目标

统一代码仓库模块的数据源访问，消除 [app/api/notes/route.ts](file:///f:/CodeFiles/Travel-Notes/app/api/notes/route.ts) 与 [app/api/repos/route.ts](file:///f:/CodeFiles/Travel-Notes/app/api/repos/route.ts) 中 `getAllRepos()` 直调文件系统的问题。

#### 文件清单

```typescript
// lib/repositories/repo-repository.ts
export interface RepoMeta { name: string; displayName?: string; description?: string; readmePath?: string }
export interface FileNode { name: string; path: string; type: 'file' | 'dir'; children?: FileNode[]; language?: string; size?: number }
export interface RepoRepository {
  getAll(): Promise<RepoMeta[]>
  getFileTree(repo: string): Promise<FileNode>
  getFileContent(repo: string, filePath: string): Promise<{ content: string; language: string } | null>
}

// lib/services/repo-service.ts
export class RepoService {
  constructor(private readonly repoRepo: RepoRepository, private readonly cache: CacheService) {}
  async getAllRepos(): Promise<RepoMeta[]>   // 缓存 600s
  async getRepoFiles(repo: string): Promise<FileNode>
  async getRepoFile(repo: string, filePath: string): Promise<{ content: string; language: string } | null>
}
```

#### 迁移步骤

1. `FsRepoRepository` 实现（封装现 `lib/repos.ts`）
2. `RepoService` + 缓存层
3. 重构 `app/api/repos/route.ts` 与 `app/api/repos/[repo]/files/route.ts` → 调 `getRepoService()`
4. 重构 `app/api/notes/route.ts` 中 repoCount 部分 → 调 `getRepoService()`

### 5B.3 A.3 统一 Markdown 渲染基础设施

#### 目标

消除 [lib/markdown.ts](file:///f:/CodeFiles/Travel-Notes/lib/markdown.ts) 与 [lib/db-posts.ts](file:///f:/CodeFiles/Travel-Notes/lib/db-posts.ts) 中两份重复的 remark 处理逻辑，为后续 TOC 抽取、代码高亮、slug 化铺路。

#### 文件清单

```typescript
// lib/infrastructure/markdown.ts
export interface TocItem { level: number; text: string; id: string }
export interface RenderedContent { html: string; toc: TocItem[]; headings: TocItem[]; wordCount: number; readMinutes: number }

export interface MarkdownRenderer {
  render(content: string, options?: { extractToc?: boolean }): Promise<RenderedContent>
  extractToc(html: string): TocItem[]
  extractFrontMatter(content: string): { data: Record<string, any>; content: string }
}
```

#### 迁移步骤

1. 新增 `UnifiedMarkdownRenderer`（统一 remark → rehype → shiki 管线）
2. 修改 `PrismaPostRepository.findById/findBySlug`：返回 `content: string` 原文，**HTML 渲染交给 Service 层**调用 `MarkdownRenderer`
3. 修改 `PostService.toDetailDTO`：注入 `MarkdownRenderer`，计算 `contentHtml`、`readMinutes`、`toc`
4. 废弃 `lib/markdown.ts` 中的渲染函数，保留 `getAllPosts/getPostBySlug` 仅作为文件系统读取（或直接迁移到 `MarkdownRenderer.extractFrontMatter`）

### 5B.4 A.4 PostService 增加系列方法（为阶段 B/C 铺路）

```typescript
// PostService 新增方法
async getAdjacentPosts(type: string, date: string): Promise<{ prev?: PostMetaDB; next?: PostMetaDB }>
async getPostsByTag(tag: string, type?: string): Promise<PostMetaDB[]>
async getAllTags(type?: string): Promise<Array<{ name: string; count: number }>>
async searchPosts(keyword: string, type?: string): Promise<PostMetaDB[]>
```

---

## 5C. 阶段 B：编辑器重构 + 文档一键导入发布（P0 · 核心诉求）

### 5C.1 B.0 紧急 Bug 修复（前端 · 立即可做）

| # | Bug | 文件 | 修复方式 |
|---|-----|------|---------|
| 1 | 旅行视频管理区块重复渲染 | [app/admin/edit/[id]/page.tsx#L716-L827](file:///f:/CodeFiles/Travel-Notes/app/admin/edit/[id]/page.tsx#L716-L827) | 删除 `travel` 分支下**第二份**「旅行视频管理」卡片（保留第 597-714 行，删除第 716-827 行重复块） |

### 5C.2 B.1 后台编辑器组件拆分（前端）

#### 目标

将 997 行巨型组件拆分为 ≤ 200 行的小组件，职责单一。

#### 拆分目录

```
components/admin/editor/
├── PostEditor.tsx              # 主容器 ~150 行（状态装配、事件分发）
├── PostEditorHeader.tsx        # 顶部操作栏（返回/预览/保存）
├── PostTitleInput.tsx          # 标题 + Slug 生成 + 日期
├── PostMetaPanel.tsx           # 右侧元数据面板（分类/标签/封面/摘要/发布状态）
├── MarkdownEditor.tsx          # 左：textarea 输入 + 工具栏 + 快捷键
├── MarkdownToolbar.tsx         # 编辑工具栏（加粗/链接/代码块/表格/Mermaid）
├── MarkdownPreview.tsx         # 右：实时预览（调用后端 /api/admin/preview）
├── ImageUploader.tsx           # 图片上传（拖拽 + 粘贴 + 排序 + 预览）
├── VideoUploader.tsx           # 视频上传（拖拽 + 排序 + 缩略图）
├── DocumentImporter.tsx        # ★ 文档导入器（拖拽/点击 .md/.docx/.html/.txt）
├── LintReport.tsx              # 格式审查报告（errors/warnings 列表）
├── PostPublishBar.tsx          # 草稿/预览/发布操作栏
└── hooks/
    ├── usePostForm.ts          # 表单状态 + 变更追踪
    ├── useAutoSave.ts          # localStorage 自动草稿（30s debounce）
    ├── useEditorShortcuts.ts   // Ctrl+S/Ctrl+B/Ctrl+I/Ctrl+K
    └── useImagePaste.ts        // 剪贴板粘贴图片自动上传
```

#### 关键交互

- **分屏布局**：`flex` 左右 1:1 布局，可切换 `编辑|分屏|预览` 三种视图
- **工具栏命令**：按钮点击即插入 Markdown 语法到光标位置（如 `**加粗**`、`[链接]()`）
- **粘贴图片**：`useImagePaste` 监听 `paste` 事件，若剪贴板含图片 → 自动调 `/api/upload`
- **自动草稿**：表单变更 30s 后写入 `localStorage.admin.draft.{id?}`，页面加载时提示「恢复草稿？」

### 5C.3 B.2 Markdown 编辑器实时预览实现（后端 + 前端）

```typescript
// app/api/admin/preview/route.ts
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getMarkdownRenderer } from '@/lib/container'
import { ok, fail, unauthorized } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) return unauthorized()
  const { content } = await request.json()
  if (!content) return fail('缺少 content', 400)
  const renderer = getMarkdownRenderer()
  const rendered = await renderer.render(content, { extractToc: true })
  return ok(rendered)
}
```

前端 `MarkdownPreview` 通过 `useEffect` + `useDeferredValue`（500ms debounce）调用预览接口，避免频繁请求。

### 5C.4 B.3 ★ 文档导入 + 格式审查 + 一键发布（后端）

#### 工作流

```
用户上传 .md/.docx/.html/.txt
    │  格式识别（扩展名 + mime 双重校验）
    ▼  转换器：.md→直读；.html→turndown；.docx→mammoth→turndown；.txt→直读
    ▼  gray-matter 解析 front matter → 字段补全（title/slug/date/tags）
    ▼  提取 docx 内嵌图片 → 待上传队列
    ▼  Lint：slug 合规/H1 唯一/标题层级无跳级/代码块语言标注/内容长度
    ▼  返回 { isValid, issues[], doc, embeddedImages }
          │            │
      通过            失败
       │               │
   预览确认      展示问题清单
       │            要求修正
       ▼
  一键发布（入库 + 图片批量上传）
```

#### 新增依赖

```bash
npm install mammoth turndown gray-matter --legacy-peer-deps
```

#### 文件清单

```typescript
// lib/services/document-import-service.ts
export interface LintIssue { severity: 'error' | 'warn' | 'info'; field: string; message: string }
export interface EmbeddedImage { name: string; buffer: Buffer; mimeType: string }
export interface ImportedDocument {
  title: string
  slug: string
  date: string
  content: string
  tags: string[]
  description?: string
  cover?: string
  frontMatter: Record<string, any>
  embeddedImages: EmbeddedImage[]
  issues: LintIssue[]
  isValid: boolean
}

export class DocumentImportService {
  constructor(private readonly markdownRenderer: MarkdownRenderer) {}
  async import(file: { name: string; buffer: Buffer; mimeType: string }): Promise<ImportedDocument>
  private async convertToMarkdown(ext: string, file: { buffer: Buffer }): Promise<string>
  private async lint(content: string, meta: { title: string; slug: string; date: string }): Promise<LintIssue[]>
  private generateSlug(title: string): string
}
```

#### API 路由

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/admin/posts/import` | POST | 上传文件 → 解析 + 审查 → 返回 `ImportedDocument` |
| `/api/admin/posts/import/publish` | POST | 接收审查通过的 `ImportedDocument` → 入库 + 上传内嵌图片 → 返回文章 ID |
| `/api/admin/preview` | POST | 实时预览 Markdown 渲染结果（见 B.2） |

### 5C.5 B.4 DocumentImporter 前端组件（前端）

```tsx
// components/admin/editor/DocumentImporter.tsx
功能点：
  1. 拖拽区 / 点击选择文件（accept=".md,.markdown,.docx,.html,.htm,.txt"）
  2. 上传中状态：loading spinner + 文件名 + 进度
  3. 解析完成 → 返回 ImportedDocument → 渲染 LintReport：
     - errors: 红色 X，不可发布
     - warnings: 黄色 !，可发布但提示
     - infos: 灰色 i
  4. 元数据编辑区（title/slug/date/tags/description）—— 预填充导入值但允许修改
  5. 内容预览（与 MarkdownPreview 复用）
  6. 两个操作按钮：
     - 「填充到编辑器」（onImported: (doc) => 填充到父组件 formData）
     - 「一键发布」（disabled={!isValid} → 调 /import/publish → 跳转 /admin）
```

---

## 5D. 阶段 C：博客阅读体验升级（P1 · 前端）

### 5D.1 详情页增强（`app/notes/blog/[slug]/page.tsx`）

布局：
```
┌─────────────────────────────────────┬──────────────┐
│  顶部：阅读进度条（sticky，视口滚动）  │              │
├─────────────────────────────────────┤   TOC 目录    │
│  H1 标题 + 日期 + 标签 + 阅读时长     │  sticky top  │
│  + 位置 + 系列导航                   │ H2/H3 可点   │
├─────────────────────────────────────┤ 滚动高亮当前  │
│                                     │              │
│         文章正文                     │              │
│   - 代码块：复制按钮 + 语言标签       │              │
│   - 图片：lightbox 预览              │              │
│   - Mermaid：markmap 渲染            │              │
│                                     │              │
├─────────────────────────────────────┴──────────────┤
│ 上一篇 / 下一篇 导航卡片                              │
├────────────────────────────────────────────────────┤
│ 相关文章（按标签匹配 Top 3）                          │
├────────────────────────────────────────────────────┤
│ 分享 / 复制链接 / 返回列表                           │
└────────────────────────────────────────────────────┘
```

#### 新增组件

```
components/blog/
├── ReadingProgress.tsx     // 顶部 1px 渐变进度条（基于 scrollY / scrollHeight）
├── TableOfContents.tsx     // 从 renderedContent.toc 生成，IntersectionObserver 高亮当前章节
├── CodeBlock.tsx           // rehype 挂载 class → querySelectorAll('pre>code') → 替换为此组件（复制按钮+语言标签）
├── ImageLightbox.tsx       // 点击图片全屏预览（左/右切换）
├── PostNavigation.tsx      // 上一篇 / 下一篇 卡片
├── ReadingTime.tsx         // 基于 wordCount / 200 估算
└── RelatedPosts.tsx        // 按相同标签交集数量排序取 Top 3
```

### 5D.2 列表页增强（`app/notes/blog/page.tsx`）

```
左侧边栏（sticky）              右侧主内容
┌─────────────────────┐    ┌─────────────────────┐
│ 🔍 全站搜索框（debounce）│    │ 排序：最新 / 最多阅读   │
│ 🏷  标签云（按数量字号） │    │ 文章卡片网格           │
│ 📅 时间归档（2026>7月） │    │  + 封面缩略图          │
│ 📚 系列列表             │    │  + 标题 + 摘要         │
└─────────────────────┘    │  + 标签 + 阅读时长      │
                           │  分页（Load More 按钮）  │
                           └─────────────────────┘
```

**全文搜索实现**（当前 < 500 篇，用 MySQL LIKE + 缓存即可）：
```sql
SELECT * FROM Post
WHERE type='blog' AND published=true
  AND (title LIKE ? OR summary LIKE ? OR content LIKE ?)
ORDER BY (title LIKE ?) DESC, date DESC
LIMIT 20
```
PostService 新增 `searchPosts(keyword, type)` 封装。

---

## 5E. 阶段 D：思维导图模块升级（P1 · 前端）

### 5E.1 方案：markmap-lib

当前 MermaidRenderer 用 DOM querySelector 替换 `<pre><code class="language-mermaid">` 为 `<div class="mermaid">` 的方式存在：(1) 路由切换后重复执行、(2) 仅静态 SVG 无可交互。

**升级为 `markmap-lib`**：直接从 Markdown 文本生成可交互思维导图（节点折叠/展开/缩放/平移/节点点击事件）。

#### 新增组件

```
components/mindmap/
├── MindmapViewer.tsx        # 主容器：transform Markdown → markmap JSON → SVG
├── MindmapToolbar.tsx       # 缩放控制 / 重置视图 / 全屏 / 导出 PNG
├── MarkmapMindmap.tsx       # markmap 渲染器（推荐默认）
├── MermaidMindmap.tsx       # Mermaid 兼容渲染器（保留旧文章兼容）
└── MindmapAutoSwitch.tsx    # 根据 front-matter 里的 renderer: markmap|mermaid 自动切换
```

### 5E.2 节点跳转（扩展功能）

Markdown 链接语法：`## [网络安全](/notes/blog/network-security-overview)` → 生成的节点支持点击跳转到对应笔记，构建知识网状结构。

---

## 5F. 阶段 E：代码仓库模块增强（P2 · 全栈）

### 5F.1 数据库 Schema 扩展

```prisma
model Repo {
  id          Int      @id @default(autoincrement())
  name        String   @unique        // 目录名（URL slug）
  displayName String                  // 展示名
  description String?  @db.Text       // 简介
  language    String?  @db.VarChar(50)// 主语言
  stars       Int      @default(0)    // 星标数
  cover       String?  @db.VarChar(500)
  tags        String?  @db.Text       // JSON 数组
  repoPath    String   @db.VarChar(500) // 磁盘路径，兼容 content/tech/repos/
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([name])
}
```

### 5F.2 后台管理

`app/admin/repos/` 页面：仓库列表 + 新建（选择目录后自动拉取 README） + 编辑（元数据表单）。

### 5F.3 前端 CodeViewer 增强

```
components/repo/
├── CodeViewer.tsx（增强）
│   ├── 接入 shiki / prism-react-renderer 语法高亮
│   ├── 行号显示
│   ├── 复制 / 原始文本下载按钮
│   └── 语言图标（VS Code 同款颜色）
├── FileTree.tsx（增强）
│   ├── 搜索过滤框
│   └── 空状态图标
└── ReadmeRenderer.tsx（新增）：根目录 README.md → 用 MarkdownRenderer 渲染
```

---

## 5G. 阶段 F：学习辅助功能（P2 · 按需）

### 5G.1 知识体系树 / 学习路线图

```
app/notes/roadmap/[slug]/page.tsx
  - 用 react-flow 或增强版 Mermaid 渲染技术学习路线（如：网络安全→Web安全→渗透测试）
  - 每个节点绑定相关笔记，点击即跳转
  - 完成度标记（该主题下笔记数量 / 目标数量）
```

### 5G.2 全站搜索

`app/search/page.tsx`：统一搜索博客/思维导图/代码仓库/旅行记录，结果分 Tab 展示，关键词高亮。

### 5G.3 标签云 & 标签页

```
app/notes/tags/page.tsx          // 全部标签（按文章数量字号不同，词云效果）
app/notes/tags/[tag]/page.tsx    // 该标签下所有文章（跨模块聚合）
```

### 5G.4 RSS / Atom Feed

```
app/feed.xml/route.ts → GET 200
  生成 RSS 2.0 feed：最新 20 篇已发布博客
  Content-Type: application/rss+xml
```

### 5G.5 阅读统计 & 学习仪表盘

```
Post.viewCount Int @default(0)
Post.readMinutes Int @default(1)

// 笔记首页：学习仪表盘
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ 累计文章数     │ 累计阅读时长   │ 本月新增      │ 连续学习天数   │
│    128       │   42h 30m   │    15        │     23d      │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

---

## 6. 阶段四：组件拆分与优化（P2 · 待开始）

### 6.1 目标

将巨型组件拆分为可维护的小组件，实现 UI 与业务逻辑的分离。

### 6.2 ChinaMap.tsx 拆分方案

#### 当前问题

- 单文件 883 行
- 包含 10+ 个子组件（全部内联）
- 地图投影、交互、渲染、数据处理高度耦合

#### 拆分后目录结构

```
components/map/
├── index.ts                    # 导出入口
├── ChinaMap.tsx                # 主容器 (~150 行)
├── MapProvinceLayer.tsx        # 省份 SVG 渲染层
├── MapCityMarker.tsx           # 城市标记点
├── MapDashLine.tsx             # 虚线航线
├── MapInfoPanel.tsx            # 省份详情面板
├── MapCityModal.tsx            # 城市记录弹窗
├── MapNavigation.tsx           # 缩放/导航控件
├── MapTooltip.tsx              # 悬浮提示框
├── MapLegend.tsx               # 图例组件
├── MapColors.ts                # 颜色常量
└── hooks/
    ├── useMapInteraction.ts    # 缩放/拖拽/选中逻辑
    ├── useMapViewBox.ts        # viewBox 计算
    └── useProvincePosts.ts     # 省份-文章关联
```

#### 验收标准

- [ ] 主组件 `ChinaMap.tsx` ≤ 150 行
- [ ] 每个子组件 ≤ 200 行
- [ ] 所有子组件有明确的 Props 接口
- [ ] 地图功能无退化
- [ ] 类型检查通过

### 6.3 TravelInfoPanel 拆分

```
components/travel/
├── TravelInfoPanel.tsx         # 主容器 (~80 行)
├── TravelClock.tsx             # 实时时钟
├── TravelAnniversary.tsx       # 纪念日计数器
├── TravelStats.tsx             # 旅行统计
└── TravelProgressBar.tsx       # 进度条
```

### 6.4 Design Token 系统

建立统一的颜色、字体、动画设计令牌：

```typescript
// tailwind.config.js theme.extend
colors: {
  warm: { 50: '#FFFBF7', ... 900: '#3D2A13' },
  cherry: { 50: '#FFF5F7', ... 500: '#D493A0' },
  sky: { 50: '#F5FAFC', ... 500: '#5B8AAA' },
  ink: { DEFAULT: '#5A6670', light: '#8A96A0', dark: '#3A4650' },
}
```

### 6.5 通用 UI 组件库

```
components/ui/
├── Card.tsx          # 通用卡片容器
├── Button.tsx        # 通用按钮
├── Modal.tsx         # 通用弹窗
├── Input.tsx         # 通用输入框
├── Badge.tsx         # 通用标签
└── Skeleton.tsx      # 通用加载骨架
```

---

## 7. 阶段五：基础设施增强（可选）

### 7.1 Redis 集成

当需要以下能力时引入 Redis：
- JWT 会话黑名单持久化
- 分布式验证码存储
- 多实例缓存共享
- API 速率限制

替换 `MemoryCacheService` 为 `RedisCacheService`，只需实现 `CacheService` 接口。

### 7.2 对象存储迁移

当需要 CDN 加速或多服务器部署时：
- 替换 `LocalStorageService` 为 `S3StorageService` / `OSSStorageService`
- 只需实现 `StorageService` 接口

### 7.3 监控与日志

```typescript
// app/api/health/route.ts
export async function GET() {
  const checks = await Promise.all([checkDatabase(), checkSiteConfig()])
  return Response.json({
    status: checks.every(c => c.ok) ? 'ok' : 'degraded',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    checks,
  })
}
```

### 7.4 Next.js ISR

启用增量静态再生，利用 Next.js 的 tag-based revalidation：

```typescript
export const revalidate = 3600
// 失效时调用 revalidateTag('posts')
```

---

## 8. 构建与部署

### 8.1 低内存服务器优化

针对 2GB RAM 服务器构建 OOM 问题：
- 添加 Swap 分区（2GB）
- 设置 `NODE_OPTIONS=--max-old-space-size=512`
- 使用 `deploy.sh` 脚本自动检测和配置

### 8.2 依赖说明

- `--legacy-peer-deps` 必须用于 `npm install`（lucide-react 与 React 19 冲突）
- 构建前需执行 `npx prisma generate` 生成 Prisma Client 类型

### 8.3 环境变量

```env
DATABASE_URL="mysql://用户:密码@localhost:3306/Travel_And_Study"
ADMIN_USERNAME="管理员用户名"
ADMIN_PASSWORD_HASH="密码哈希"
JWT_SECRET="JWT签名密钥（openssl rand -hex 32）"
SESSION_SECRET="备用密钥"
COOKIE_SECURE=false  # 生产环境设为 true
```

---

## 9. 关键文件索引

### 核心架构文件

| 文件路径 | 用途 | 阶段 |
|---------|------|------|
| [lib/container.ts](file:///f:/CodeFiles/Travel-Notes/lib/container.ts) | 依赖注入容器（需新增 getImageService/getRepoService/getDocumentImportService/getMarkdownRenderer 工厂） | 阶段A |
| [lib/services/post-service.ts](file:///f:/CodeFiles/Travel-Notes/lib/services/post-service.ts) | 文章服务（CRUD + 混合获取 + 相邻文章/标签/搜索扩展） | 阶段A.4 |
| [lib/services/auth-service.ts](file:///f:/CodeFiles/Travel-Notes/lib/services/auth-service.ts) | 认证服务 | 已完成 |
| [lib/services/site-service.ts](file:///f:/CodeFiles/Travel-Notes/lib/services/site-service.ts) | 系统设置服务 | 已完成 |
| [lib/services/token-service.ts](file:///f:/CodeFiles/Travel-Notes/lib/services/token-service.ts) | JWT Token 服务 | 已完成 |
| [lib/services/image-service.ts](file:///f:/CodeFiles/Travel-Notes/lib/services/image-service.ts) | ★ 图片服务（上传+删除+排序+Cover自动更新） | 阶段A.1 |
| [lib/services/repo-service.ts](file:///f:/CodeFiles/Travel-Notes/lib/services/repo-service.ts) | ★ 代码仓库服务（文件系统+缓存） | 阶段A.2 |
| [lib/services/document-import-service.ts](file:///f:/CodeFiles/Travel-Notes/lib/services/document-import-service.ts) | ★ 文档导入服务（格式转换+Front Matter提取+格式审查） | 阶段B.3 |
| [lib/repositories/post-repository.ts](file:///f:/CodeFiles/Travel-Notes/lib/repositories/post-repository.ts) | 文章数据访问 | 已完成 |
| [lib/repositories/user-repository.ts](file:///f:/CodeFiles/Travel-Notes/lib/repositories/user-repository.ts) | 用户数据访问 | 已完成 |
| [lib/repositories/image-repository.ts](file:///f:/CodeFiles/Travel-Notes/lib/repositories/image-repository.ts) | ★ 图片数据访问（PostImage CRUD） | 阶段A.1 |
| [lib/repositories/repo-repository.ts](file:///f:/CodeFiles/Travel-Notes/lib/repositories/repo-repository.ts) | ★ 代码仓库文件系统访问 | 阶段A.2 |
| [lib/infrastructure/cache.ts](file:///f:/CodeFiles/Travel-Notes/lib/infrastructure/cache.ts) | 缓存服务接口 | 已完成 |
| [lib/infrastructure/storage.ts](file:///f:/CodeFiles/Travel-Notes/lib/infrastructure/storage.ts) | 存储服务接口 | 已完成 |
| [lib/infrastructure/markdown.ts](file:///f:/CodeFiles/Travel-Notes/lib/infrastructure/markdown.ts) | ★ 统一 Markdown 渲染（remark→rehype→shiki+TOC） | 阶段A.3 |
| [lib/validators/post.validator.ts](file:///f:/CodeFiles/Travel-Notes/lib/validators/post.validator.ts) | 文章验证 Schema | 已完成 |
| [lib/api-response.ts](file:///f:/CodeFiles/Travel-Notes/lib/api-response.ts) | 统一 API 响应 | 已完成 |
| [middleware.ts](file:///f:/CodeFiles/Travel-Notes/middleware.ts) | JWT 鉴权中间件 | 已完成 |

### API 路由索引（学习笔记模块扩展）

| 路由 | 方法 | 用途 | 阶段 |
|------|------|------|------|
| [app/api/upload/route.ts](file:///f:/CodeFiles/Travel-Notes/app/api/upload/route.ts) | POST/DELETE | 图片上传/删除（重构→ImageService） | 阶段A.1 |
| [app/api/repos/route.ts](file:///f:/CodeFiles/Travel-Notes/app/api/repos/route.ts) | GET | 仓库列表（重构→RepoService） | 阶段A.2 |
| [app/api/notes/route.ts](file:///f:/CodeFiles/Travel-Notes/app/api/notes/route.ts) | GET | 笔记首页聚合数据（重构→RepoService统一） | 阶段A.2 |
| [app/api/admin/preview/route.ts](file:///f:/CodeFiles/Travel-Notes/app/api/admin/preview/route.ts) | POST | ★ Markdown 实时预览（MarkdownRenderer） | 阶段B.2 |
| [app/api/admin/posts/import/route.ts](file:///f:/CodeFiles/Travel-Notes/app/api/admin/posts/import/route.ts) | POST | ★ 文档导入解析+格式审查 | 阶段B.3 |
| [app/api/admin/posts/import/publish/route.ts](file:///f:/CodeFiles/Travel-Notes/app/api/admin/posts/import/publish/route.ts) | POST | ★ 一键发布（入库+批量上传内嵌图） | 阶段B.3 |

### 后台编辑器组件索引（阶段B）

| 组件路径 | 用途 | 阶段 |
|---------|------|------|
| `components/admin/editor/PostEditor.tsx` | ★ 主容器（状态装配，997行→~150行） | 阶段B.1 |
| `components/admin/editor/PostEditorHeader.tsx` | ★ 顶部操作栏 | 阶段B.1 |
| `components/admin/editor/PostTitleInput.tsx` | ★ 标题+Slug生成+日期 | 阶段B.1 |
| `components/admin/editor/PostMetaPanel.tsx` | ★ 右侧元数据面板 | 阶段B.1 |
| `components/admin/editor/MarkdownEditor.tsx` | ★ 编辑textarea+工具栏+快捷键 | 阶段B.1 |
| `components/admin/editor/MarkdownToolbar.tsx` | ★ Markdown工具栏（加粗/链接/代码/表格） | 阶段B.1 |
| `components/admin/editor/MarkdownPreview.tsx` | ★ 实时预览（/api/admin/preview） | 阶段B.2 |
| `components/admin/editor/ImageUploader.tsx` | ★ 图片上传（从admin/edit拆分） | 阶段B.1 |
| `components/admin/editor/VideoUploader.tsx` | ★ 视频上传（从admin/edit拆分） | 阶段B.1 |
| `components/admin/editor/DocumentImporter.tsx` | ★ 文档导入器（拖拽+格式审查+一键发布） | 阶段B.4 |
| `components/admin/editor/LintReport.tsx` | ★ 格式审查报告展示 | 阶段B.4 |
| `components/admin/editor/PostPublishBar.tsx` | ★ 发布操作栏 | 阶段B.1 |
| `components/admin/editor/hooks/usePostForm.ts` | ★ 表单状态管理Hook | 阶段B.1 |
| `components/admin/editor/hooks/useAutoSave.ts` | ★ 自动草稿Hook | 阶段B.1 |
| `components/admin/editor/hooks/useEditorShortcuts.ts` | ★ 快捷键Hook | 阶段B.1 |
| `components/admin/editor/hooks/useImagePaste.ts` | ★ 粘贴图片上传Hook | 阶段B.1 |

### 配置文件

| 文件路径 | 用途 |
|---------|------|
| [prisma/schema.prisma](file:///f:/CodeFiles/Travel-Notes/prisma/schema.prisma) | 数据库 Schema（阶段E扩展Repo模型） |
| [next.config.js](file:///f:/CodeFiles/Travel-Notes/next.config.js) | Next.js 配置 |
| [ecosystem.config.js](file:///f:/CodeFiles/Travel-Notes/ecosystem.config.js) | PM2 进程配置 |
| [deploy.sh](file:///f:/CodeFiles/Travel-Notes/deploy.sh) | 一键部署脚本 |
| [.env.example](file:///f:/CodeFiles/Travel-Notes/.env.example) | 环境变量模板 |

---

## 10. 验收检查清单

### 服务层验收（已完成）

- [x] `lib/services/` 下 4 个 Service 类
- [x] `lib/repositories/` 下 2 个 Repository 类
- [x] `lib/infrastructure/` 下 CacheService + StorageService
- [x] `lib/validators/` 下 Zod Schema
- [x] `lib/container.ts` 依赖注入容器
- [x] 所有 API Route 迁移到 Service 层
- [x] 所有页面迁移到 PostService 混合获取
- [x] `npm run build` 无错误
- [x] 核心页面功能正常

### 阶段 A：架构治理验收（P0 · 后端）

- [ ] A.1 `lib/repositories/image-repository.ts` 接口定义完整，`PrismaImageRepository` 实现通过
- [ ] A.1 `lib/services/image-service.ts` 实现，`/api/upload` 路由改为调用 `getImageService()`
- [ ] A.2 `lib/repositories/repo-repository.ts` 接口与 `FsRepoRepository` 实现
- [ ] A.2 `lib/services/repo-service.ts` 带缓存，`/api/repos` 与 `/api/notes` 调用 `getRepoService()`
- [ ] A.3 `lib/infrastructure/markdown.ts` 新增，`PostService.toDetailDTO` 注入 `MarkdownRenderer`
- [ ] A.3 消除 `lib/markdown.ts` 与 `lib/db-posts.ts` 重复的 remark 处理逻辑
- [ ] A.4 `PostService` 新增 `getAdjacentPosts/getPostsByTag/getAllTags/searchPosts`
- [ ] A. 所有 API Route 不再直接调用 `prisma.postImage.*/getAllRepos()`（用 `grep` 验证）

### 阶段 B：编辑器与文档导入验收（P0 · 前端+后端）

- [ ] B.0 `app/admin/edit/[id]/page.tsx` 旅行视频管理重复区块已删除（用浏览器验证无重复渲染）
- [ ] B.1 `components/admin/editor/` 目录下所有拆分组件存在，单个文件 ≤ 200 行
- [ ] B.1 编辑页支持「编辑」「分屏」「预览」三种视图切换
- [ ] B.1 剪贴板粘贴图片自动上传（`useImagePaste` 生效）
- [ ] B.1 自动草稿功能：30s 写入 localStorage，页面刷新后提示恢复
- [ ] B.2 `/api/admin/preview` 路由可用，MarkdownPreview 500ms debounce 实时更新
- [ ] B.3 `lib/services/document-import-service.ts` 支持 `.md/.docx/.html/.txt` 转换
- [ ] B.3 格式审查覆盖：slug合规/H1唯一/标题层级无跳级/代码块语言标注/内容长度
- [ ] B.3 `/api/admin/posts/import` 返回 `{ isValid, issues, doc, embeddedImages }` 结构完整
- [ ] B.3 `/api/admin/posts/import/publish` 一键发布成功，内嵌图片已自动上传关联
- [ ] B.4 DocumentImporter 组件：拖拽上传正常 + LintReport 展示正常 + 一键发布按钮仅 isValid 时可用

### 组件层验收（阶段四 · P2 · 待完成）

- [ ] `ChinaMap.tsx` ≤ 150 行
- [ ] 所有组件 ≤ 200 行
- [ ] 组件 Props 接口定义完整
- [ ] Client Component 不直接调用数据库
- [ ] Design Token 系统建立
- [ ] 通用 UI 组件库

---

## 11. 变更记录（v3.0 → v3.1）

| 日期 | 版本 | 变更内容 | 变更章节 |
|------|------|---------|---------|
| 2026-07-31 | v3.1 | 新增 §0.2：学习笔记模块专项优化进度表（阶段 A~F，P0/P1/P2 分级） | §0.2 |
| 2026-07-31 | v3.1 | 新增 §5A：学习笔记模块现状与 5 项架构违规问题清单 | §5A |
| 2026-07-31 | v3.1 | 新增 §5B：阶段 A 架构治理（ImageService/RepoService/MarkdownRenderer/PostService 扩展方法） | §5B |
| 2026-07-31 | v3.1 | 新增 §5C：阶段 B 编辑器重构 + 文档一键导入发布（核心诉求，含拆分目录/导入工作流/Lint 规则/新增依赖） | §5C |
| 2026-07-31 | v3.1 | 新增 §5D：阶段 C 博客阅读体验升级（TOC/代码高亮/搜索/上下篇/分页） | §5D |
| 2026-07-31 | v3.1 | 新增 §5E：阶段 D 思维导图模块升级（markmap-lib 方案 + 节点跳转） | §5E |
| 2026-07-31 | v3.1 | 新增 §5F：阶段 E 代码仓库模块增强（Repo Schema/后台管理/CodeViewer 增强） | §5F |
| 2026-07-31 | v3.1 | 新增 §5G：阶段 F 学习辅助功能（学习路线图/全站搜索/标签云/RSS/学习仪表盘） | §5G |
| 2026-07-31 | v3.1 | 更新 §9：关键文件索引 → 扩展 Service/Repository/Infrastructure/API 路由/编辑器组件索引表，标注阶段归属 | §9 |
| 2026-07-31 | v3.1 | 更新 §10：验收检查清单 → 新增阶段 A 架构治理与阶段 B 编辑器/文档导入两套验收条目 | §10 |
| 2026-07-31 | v3.1 | 新增 §11：变更记录章节，形成文档更新可追溯闭环 | §11 |

---

*— 文档 v3.1 结束 —*  
*本文档将随实施进度持续更新*
