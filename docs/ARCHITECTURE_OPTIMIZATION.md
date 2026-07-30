# Travel-Notes 架构优化设计文档

> **文档版本**: v3.0  
> **最后更新**: 2026-07-31  
> **项目**: 个人旅行笔记系统 (Travel-Notes)  
> **目标读者**: 负责技术实施的工程师  
> **状态**: 阶段一~三已完成，阶段四~五为后续规划

---

## 0. 优化进度总览

| 阶段 | 内容 | 状态 | 备注 |
|------|------|------|------|
| **阶段一** | 安全加固 | ✅ 已完成 | JWT 认证 + Token 黑名单 + 密码找回 |
| **阶段二** | 数据层重构 | ✅ 已完成 | 官方 MySQL 适配器 + 连接池优化 + PostImage/Danmaku 模型 |
| **阶段三** | 服务层引入 | ✅ 已完成 | Service/Repository/Validator/DI 容器 + 混合内容获取 |
| **阶段四** | 组件拆分与优化 | ⏳ 待开始 | ChinaMap 拆分、TravelInfoPanel 拆分、Design Token |
| **阶段五** | 基础设施增强 | ⏳ 待开始 | Redis、对象存储、监控 |

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

## 6. 阶段四：组件拆分与优化（待开始）

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

| 文件路径 | 用途 |
|---------|------|
| [lib/container.ts](file:///f:/CodeFiles/Travel-Notes/lib/container.ts) | 依赖注入容器 |
| [lib/services/post-service.ts](file:///f:/CodeFiles/Travel-Notes/lib/services/post-service.ts) | 文章服务（CRUD + 混合获取） |
| [lib/services/auth-service.ts](file:///f:/CodeFiles/Travel-Notes/lib/services/auth-service.ts) | 认证服务 |
| [lib/services/site-service.ts](file:///f:/CodeFiles/Travel-Notes/lib/services/site-service.ts) | 系统设置服务 |
| [lib/services/token-service.ts](file:///f:/CodeFiles/Travel-Notes/lib/services/token-service.ts) | JWT Token 服务 |
| [lib/repositories/post-repository.ts](file:///f:/CodeFiles/Travel-Notes/lib/repositories/post-repository.ts) | 文章数据访问 |
| [lib/repositories/user-repository.ts](file:///f:/CodeFiles/Travel-Notes/lib/repositories/user-repository.ts) | 用户数据访问 |
| [lib/infrastructure/cache.ts](file:///f:/CodeFiles/Travel-Notes/lib/infrastructure/cache.ts) | 缓存服务接口 |
| [lib/infrastructure/storage.ts](file:///f:/CodeFiles/Travel-Notes/lib/infrastructure/storage.ts) | 存储服务接口 |
| [lib/validators/post.validator.ts](file:///f:/CodeFiles/Travel-Notes/lib/validators/post.validator.ts) | 文章验证 Schema |
| [lib/api-response.ts](file:///f:/CodeFiles/Travel-Notes/lib/api-response.ts) | 统一 API 响应 |
| [middleware.ts](file:///f:/CodeFiles/Travel-Notes/middleware.ts) | JWT 鉴权中间件 |

### 底层数据文件

| 文件路径 | 用途 |
|---------|------|
| [lib/db.ts](file:///f:/CodeFiles/Travel-Notes/lib/db.ts) | Prisma 客户端 |
| [lib/prisma-adapter.ts](file:///f:/CodeFiles/Travel-Notes/lib/prisma-adapter.ts) | MySQL 适配器 |
| [lib/db-posts.ts](file:///f:/CodeFiles/Travel-Notes/lib/db-posts.ts) | 数据库文章操作 |
| [lib/auth.ts](file:///f:/CodeFiles/Travel-Notes/lib/auth.ts) | 认证底层操作 |
| [lib/auth-utils.ts](file:///f:/CodeFiles/Travel-Notes/lib/auth-utils.ts) | 密码哈希工具 |
| [lib/cache.ts](file:///f:/CodeFiles/Travel-Notes/lib/cache.ts) | 内存缓存实现 |
| [lib/markdown.ts](file:///f:/CodeFiles/Travel-Notes/lib/markdown.ts) | Markdown 解析 |
| [lib/content.ts](file:///f:/CodeFiles/Travel-Notes/lib/content.ts) | 旧内容层（已被 PostService 替代） |

### 配置文件

| 文件路径 | 用途 |
|---------|------|
| [prisma/schema.prisma](file:///f:/CodeFiles/Travel-Notes/prisma/schema.prisma) | 数据库 Schema |
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

### 组件层验收（待完成）

- [ ] `ChinaMap.tsx` ≤ 150 行
- [ ] 所有组件 ≤ 200 行
- [ ] 组件 Props 接口定义完整
- [ ] Client Component 不直接调用数据库
- [ ] Design Token 系统建立
- [ ] 通用 UI 组件库

---

*— 文档 v3.0 结束 —*  
*本文档将随实施进度持续更新*
