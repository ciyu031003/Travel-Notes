# Travel-Notes 架构优化设计文档

> **文档版本**: v2.0  
> **最后更新**: 2026-07-29  
> **项目**: 个人旅行笔记系统 (Travel-Notes)  
> **目标读者**: 负责技术实施的工程师  
> **状态**: 数据层优化已完成，进入服务层与组件层优化阶段

---

## 0. 优化进度总览

| 阶段 | 内容 | 状态 | 负责人 | 备注 |
|------|------|------|--------|------|
| **阶段一** | 安全加固 | 🔄 进行中 | 后端 | JWT 改造待完成 |
| **阶段二** | 数据层重构 | ✅ 已完成 | 后端 | 数据库链接与模型已优化 |
| **阶段三** | 服务层引入 | ⏳ 待开始 | 全栈 | 本文档重点 |
| **阶段四** | 组件拆分与优化 | ⏳ 待开始 | 前端 | 本文档重点 |
| **阶段五** | 基础设施增强 | ⏳ 待开始 | DevOps | 按需实施 |

---

## 1. 项目概览

### 1.1 技术栈

| 类别 | 技术选型 | 版本 | 说明 |
|------|---------|------|------|
| 框架 | Next.js | 15.0.0 | App Router |
| 语言 | TypeScript | 5.3+ | 全量 TS |
| UI | React + Tailwind CSS | 19 / 3.4 | Server + Client Components |
| ORM | Prisma | 7.9 | 官方 MySQL 适配器 |
| 数据库 | MySQL / MariaDB | - | 已完成迁移 |
| 地图 | d3-geo + SVG | 3.1 | 中国地图可视化 |
| 认证 | bcryptjs + Cookie | 3.0 | 待升级 JWT |

### 1.2 已完成的数据层优化

根据后端团队反馈，以下优化已完成：

- ✅ 数据库连接池配置优化（连接数、超时、重试策略）
- ✅ Prisma 适配器升级（从自定义适配器迁移到官方 `@prisma/adapter-mysql`）
- ✅ 数据模型规范化（Post、User、SiteConfig 分离）
- ✅ 索引优化（查询性能提升）
- ✅ 日期格式统一（UTC 存储，应用层转换）

### 1.3 核心功能

- **旅行地图**: 中国地图可视化，点击省份/城市查看旅行记录
- **博客系统**: 基于 MDX 的 Markdown 博客
- **代码仓库展示**: 文件树 + 代码查看器
- **管理后台**: 内容管理、密码重置、系统设置
- **实时时钟与纪念日**: 右侧信息面板动态展示

---

## 2. 当前架构与目标架构

### 2.1 当前架构（优化后）

```
┌────────────────────────────────────────────────────────────┐
│                     Next.js 15 App Router                    │
├───────────────┬──────────────────┬────────────────────────┤
│  app/         │   API Routes      │   Server Components    │
│  (pages)      │   (app/api/*)     │                        │
├───────────────┴──────────────────┴────────────────────────┤
│              lib/auth.ts  │  lib/cache.ts                    │
├────────────────────────────────────────────────────────────┤
│              Prisma Client (官方 MySQL 适配器)               │
├────────────────────────────────────────────────────────────┤
│                    MySQL / MariaDB                           │
└────────────────────────────────────────────────────────────┘
```

### 2.2 目标架构

```
┌──────────────────────────────────────────────────────────────┐
│                       Next.js 15 App Router                    │
├───────────────┬───────────────────┬──────────────────────────┤
│  Server       │   API Routes      │   Server Components      │
│  Components   │   (app/api/*)     │   (app/*/page.tsx)       │
├───────────────┴───────────────────┴──────────────────────────┤
│                   Service Layer ──────────────────────────────│
│  ┌─────────────┬─────────────┬─────────────┬──────────────┐ │
│  │ AuthService │ PostService │ SiteService │ UploadService │ │
│  └─────────────┴─────────────┴─────────────┴──────────────┘ │
├──────────────────────────────────────────────────────────────┤
│                 Data Access Layer ────────────────────────────│
│  ┌──────────────────┬──────────────────┬──────────────────┐ │
│  │ Repository 层    │   DTO / Validator │   CacheService   │ │
│  └──────────────────┴──────────────────┴──────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│                   Infrastructure Layer ───────────────────────│
│  Prisma (MySQL) │ Redis (可选) │ Object Storage (可选)        │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. 阶段三：服务层引入（当前重点）

> ⚠️ **前置条件说明**
> 
> 本文档中的 Service、Repository、DTO 代码示例均基于**阶段二（数据层优化）完成后的新 Prisma Schema**。
> 新 Schema 包含以下核心变更：
> 
> - **新增模型**: `User`（用户）、`SiteConfig`（系统设置）、`Location`（地点/城市/省份）、`Tag`（标签）、`PostImage`（文章图片）
> - **新增枚举**: `PostType`（TRAVEL/BLOG/REPO/NOTE）、`LocationLevel`（PROVINCE/CITY）
> - **拆分模型**: 原 `SiteSetting` 拆分为 `User` + `SiteConfig`
> - **关系映射**: `Post` 与 `Location`、`Tag`、`PostImage` 建立关联关系
> 
> 如当前代码库中的 `prisma/schema.prisma` 尚未同步以上变更，请先执行数据层迁移（`prisma db push` 或 `prisma migrate dev`），再实施本文档中的 Service 层代码。

### 3.1 目标

在 API Routes 和数据访问之间引入 Service 层，实现业务逻辑与数据访问的分离。

### 3.2 新增目录结构

```
lib/
├── services/              # 业务逻辑层
│   ├── auth-service.ts    # 认证业务逻辑
│   ├── post-service.ts    # 文章/旅行记录业务逻辑
│   ├── site-service.ts    # 系统设置业务逻辑
│   └── upload-service.ts  # 文件上传业务逻辑
├── repositories/          # 数据访问层
│   ├── post-repository.ts
│   ├── user-repository.ts
│   └── site-repository.ts
├── dto/                   # 数据传输对象
│   ├── auth.dto.ts
│   ├── post.dto.ts
│   └── site.dto.ts
├── validators/            # 输入验证
│   ├── auth.validator.ts
│   ├── post.validator.ts
│   └── upload.validator.ts
├── infrastructure/        # 基础设施
│   ├── cache.ts           # 缓存服务接口
│   └── storage.ts         # 存储服务接口
└── types/                 # 共享类型
    └── index.ts
```

### 3.3 Repository 层实施

#### 3.3.1 接口定义

```typescript
// lib/repositories/post-repository.ts
import { PrismaClient, Prisma } from '@prisma/client'

export interface PostRepository {
  findById(id: number): Promise<Post | null>
  findBySlug(type: string, slug: string): Promise<Post | null>
  findAll(params: FindAllParams): Promise<PaginatedResult<Post>>
  create(data: CreatePostInput): Promise<Post>
  update(id: number, data: UpdatePostInput): Promise<Post>
  delete(id: number): Promise<void>
}

export interface FindAllParams {
  type?: string
  published?: boolean
  page?: number
  pageSize?: number
  tagIds?: number[]
  locationId?: number
  search?: string
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export type Post = Prisma.PostGetPayload<{
  include: { images: true; tags: true; location: true }
}>
export type CreatePostInput = Prisma.PostUncheckedCreateInput
export type UpdatePostInput = Prisma.PostUncheckedUpdateInput
```

#### 3.3.2 Prisma 实现

```typescript
// lib/repositories/post-repository.ts (续)
export class PrismaPostRepository implements PostRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: number): Promise<Post | null> {
    return this.prisma.post.findUnique({
      where: { id },
      include: { images: true, tags: true, location: true },
    })
  }

  async findBySlug(type: string, slug: string): Promise<Post | null> {
    return this.prisma.post.findUnique({
      where: { type_slug: { type, slug } },
      include: { images: true, tags: true, location: true },
    })
  }

  async findAll(params: FindAllParams): Promise<PaginatedResult<Post>> {
    const { type, published, page = 1, pageSize = 20, tagIds, locationId, search } = params
    const skip = (page - 1) * pageSize

    const where: Prisma.PostWhereInput = {
      ...(type && { type }),
      ...(published !== undefined && { published }),
      ...(tagIds && tagIds.length > 0 && { tags: { some: { id: { in: tagIds } } } }),
      ...(locationId && { locationId }),
      ...(search && {
        OR: [
          { title: { contains: search } },
          { summary: { contains: search } },
          { content: { contains: search } },
        ],
      }),
    }

    const [data, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { date: 'desc' },
        include: { images: true, tags: true, location: true },
      }),
      this.prisma.post.count({ where }),
    ])

    return { data, total, page, pageSize }
  }

  async create(data: CreatePostInput): Promise<Post> {
    return this.prisma.post.create({
      data: {
        ...data,
        images: data.images
          ? { createMany: { data: data.images as any } }
          : undefined,
        tags: data.tags
          ? { connectOrCreate: (data.tags as any[]).map(t => ({
              where: { name: t.name },
              create: { name: t.name },
            })) }
          : undefined,
      },
      include: { images: true, tags: true, location: true },
    })
  }

  async update(id: number, data: UpdatePostInput): Promise<Post> {
    return this.prisma.post.update({
      where: { id },
      data,
      include: { images: true, tags: true, location: true },
    })
  }

  async delete(id: number): Promise<void> {
    await this.prisma.post.delete({ where: { id } })
  }
}
```

### 3.4 Service 层实施

#### 3.4.1 PostService

```typescript
// lib/services/post-service.ts
import { PostRepository } from '@/lib/repositories/post-repository'
import { CacheService } from '@/lib/infrastructure/cache'
import { PostDTO, CreatePostInput, UpdatePostInput } from '@/lib/dto/post.dto'

export class PostService {
  constructor(
    private readonly postRepo: PostRepository,
    private readonly cache: CacheService,
  ) {}

  private readonly CACHE_TTL = 300 // 5 分钟

  async getPublishedPosts(
    type: string,
    filters: { page?: number; pageSize?: number; tagIds?: number[]; locationId?: number; search?: string }
  ): Promise<PaginatedResult<PostDTO>> {
    const cacheKey = `posts:${type}:${JSON.stringify(filters)}`
    const cached = await this.cache.get<PaginatedResult<PostDTO>>(cacheKey)
    if (cached) return cached

    const result = await this.postRepo.findAll({
      ...filters,
      type,
      published: true,
    })
    const dto = { ...result, data: result.data.map(this.toDTO) }

    await this.cache.set(cacheKey, dto, this.CACHE_TTL, ['posts', `posts:${type}`])
    return dto
  }

  async getPostBySlug(type: string, slug: string): Promise<PostDTO | null> {
    const cacheKey = `post:${type}:${slug}`
    const cached = await this.cache.get<PostDTO>(cacheKey)
    if (cached) return cached

    const post = await this.postRepo.findBySlug(type, slug)
    if (!post) return null

    const dto = this.toDTO(post)
    await this.cache.set(cacheKey, dto, this.CACHE_TTL, ['posts'])
    return dto
  }

  async createPost(input: CreatePostInput, authorId: number): Promise<PostDTO> {
    const post = await this.postRepo.create({
      ...input,
      published: input.published ?? true,
    })
    await this.invalidateCache(input.type)
    return this.toDTO(post)
  }

  async updatePost(id: number, input: UpdatePostInput): Promise<PostDTO> {
    const post = await this.postRepo.update(id, input)
    await this.invalidateCache(post.type)
    return this.toDTO(post)
  }

  async deletePost(id: number): Promise<void> {
    const post = await this.postRepo.findById(id)
    if (!post) throw new NotFoundError('文章不存在')

    await this.postRepo.delete(id)
    await this.invalidateCache(post.type)
  }

  private async invalidateCache(type: string): Promise<void> {
    await this.cache.deleteByTag('posts')
    await this.cache.deleteByTag(`posts:${type}`)
  }

  private toDTO(post: Post): PostDTO {
    return {
      id: post.id,
      slug: post.slug,
      title: post.title,
      summary: post.summary,
      content: post.content,
      cover: post.cover,
      images: post.images.map(img => ({ id: img.id, url: img.url, sort: img.sort })),
      tags: post.tags.map(t => t.name),
      location: post.location ? {
        id: post.location.id,
        name: post.location.name,
        nameEn: post.location.nameEn,
        level: post.location.level,
      } : null,
      date: post.date.toISOString(),
      type: post.type,
      published: post.published,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    }
  }
}
```

#### 3.4.2 SiteService

```typescript
// lib/services/site-service.ts
export class SiteService {
  constructor(
    private readonly siteRepo: SiteRepository,
    private readonly cache: CacheService,
  ) {}

  async getSiteConfig(): Promise<SiteConfigDTO> {
    const cacheKey = 'site:config'
    const cached = await this.cache.get<SiteConfigDTO>(cacheKey)
    if (cached) return cached

    const config = await this.siteRepo.getConfig()
    const dto = this.toDTO(config)
    await this.cache.set(cacheKey, dto, 600, ['site'])
    return dto
  }

  async updateAnniversaryStart(date: string | null): Promise<void> {
    await this.siteRepo.updateConfig({ anniversaryStart: date })
    await this.cache.deleteByTag('site')
  }

  private toDTO(config: SiteConfig): SiteConfigDTO {
    return {
      anniversaryStart: config.anniversaryStart,
      siteTitle: config.siteTitle,
      siteDescription: config.siteDescription,
    }
  }
}
```

#### 3.4.3 AuthService

```typescript
// lib/services/auth-service.ts
export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenService: TokenService,
  ) {}

  async login(username: string, password: string): Promise<LoginResult> {
    const user = await this.userRepo.findByUsername(username)
    if (!user) throw new AuthError('用户名或密码错误')

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) throw new AuthError('用户名或密码错误')

    if (user.requirePasswordChange) {
      return { requirePasswordChange: true, userId: user.id }
    }

    const token = await this.tokenService.sign({
      sub: user.id.toString(),
      username: user.username,
      role: user.role,
    })

    return { token, user: this.toUserDTO(user) }
  }

  async verifyToken(token: string): Promise<TokenPayload | null> {
    return this.tokenService.verify(token)
  }

  async logout(token: string): Promise<void> {
    await this.tokenService.blacklist(token)
  }

  private toUserDTO(user: User): UserDTO {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    }
  }
}
```

### 3.5 验证层实施

```typescript
// lib/validators/post.validator.ts
import { z } from 'zod'

export const CreatePostSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug 只能包含小写字母、数字和连字符').max(255),
  title: z.string().min(1, '标题不能为空').max(255),
  content: z.string().min(1, '内容不能为空'),
  cover: z.string().url('封面地址格式错误').max(500).optional().or(z.literal('')),
  imageUrls: z.array(z.object({
    url: z.string().url('图片地址格式错误'),
    sort: z.number().int().nonnegative(),
  })).max(20).optional(),
  tagNames: z.array(z.string().max(50)).max(10).optional(),
  locationId: z.number().int().positive().optional(),
  date: z.string().datetime('日期格式错误').optional(),
  type: z.enum(['TRAVEL', 'BLOG', 'REPO', 'NOTE']),
  published: z.boolean().optional(),
})

export const UpdatePostSchema = CreatePostSchema.partial()

export function validateCreatePost(input: unknown): ValidationResult<CreatePostInput> {
  return CreatePostSchema.safeParse(input)
}

export function validateUpdatePost(input: unknown): ValidationResult<UpdatePostInput> {
  return UpdatePostSchema.safeParse(input)
}
```

### 3.6 基础设施抽象层

#### 3.6.1 缓存服务接口

```typescript
// lib/infrastructure/cache.ts
export interface CacheService {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttlSeconds?: number, tags?: string[]): Promise<void>
  delete(key: string): Promise<void>
  deleteByTag(tag: string): Promise<void>
  deleteByPrefix(prefix: string): Promise<void>
  clear(): Promise<void>
}

// 内存实现（开发/降级）
export class MemoryCacheService implements CacheService {
  private cache = new Map<string, { value: unknown; expireAt: number; tags: string[] }>()

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key)
    if (!entry || Date.now() > entry.expireAt) {
      if (entry) this.cache.delete(key)
      return null
    }
    return entry.value as T
  }

  async set<T>(key: string, value: T, ttlSeconds = 60, tags: string[] = []): Promise<void> {
    this.cache.set(key, { value, expireAt: Date.now() + ttlSeconds * 1000, tags })
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key)
  }

  async deleteByTag(tag: string): Promise<void> {
    for (const [key, entry] of this.cache) {
      if (entry.tags.includes(tag)) this.cache.delete(key)
    }
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key)
    }
  }

  async clear(): Promise<void> {
    this.cache.clear()
  }
}

// Redis 实现（生产环境，待 Redis 接入后启用）
export class RedisCacheService implements CacheService {
  constructor(private readonly redis: RedisClient) {}
  // ... Redis 实现细节
}
```

#### 3.6.2 存储服务接口

```typescript
// lib/infrastructure/storage.ts
export interface StoredFile {
  key: string
  url: string
  size: number
  contentType: string
}

export interface StorageService {
  upload(file: Buffer, key: string, contentType: string): Promise<StoredFile>
  delete(key: string): Promise<void>
  getUrl(key: string): Promise<string>
}

// 本地文件系统实现（当前使用）
export class LocalStorageService implements StorageService {
  private uploadDir: string

  constructor(uploadDir: string) {
    this.uploadDir = uploadDir
  }

  async upload(file: Buffer, key: string, contentType: string): Promise<StoredFile> {
    const path = `${this.uploadDir}/${key}`
    await fs.promises.mkdir(path.dirname(path), { recursive: true })
    await fs.promises.writeFile(path, file)
    return {
      key,
      url: `/uploads/${key}`,
      size: file.length,
      contentType,
    }
  }

  async delete(key: string): Promise<void> {
    const path = `${this.uploadDir}/${key}`
    await fs.promises.unlink(path).catch(() => {})
  }

  async getUrl(key: string): Promise<string> {
    return `/uploads/${key}`
  }
}

// 对象存储实现（未来迁移）
export class S3StorageService implements StorageService {
  // ... S3/OSS/COS 实现
}
```

### 3.7 API Route 改造

#### 3.7.1 改造原则

1. **Route 层只做协议转换**：HTTP 请求 → Service 调用 → HTTP 响应
2. **统一错误处理**：使用 `ApiResponse` 工具类
3. **输入验证**：使用 Zod Validator
4. **认证检查**：使用 `requireAuth()` 中间件

#### 3.7.2 示例：旅行记录 API

```typescript
// app/api/travel/posts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { PostService } from '@/lib/services/post-service'
import { requireAuth } from '@/lib/auth-middleware'
import { validateCreatePost } from '@/lib/validators/post.validator'
import { ApiResponse } from '@/lib/api-response'

const postService = getPostService()

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '12')
  const tagIds = searchParams.get('tagIds')?.split(',').map(Number)
  const locationId = searchParams.get('locationId') ? Number(searchParams.get('locationId')) : undefined
  const search = searchParams.get('search') || undefined

  try {
    const result = await postService.getPublishedPosts('TRAVEL', {
      page, pageSize, tagIds, locationId, search,
    })
    return ApiResponse.success(result)
  } catch (error) {
    return ApiResponse.error(error)
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) return ApiResponse.unauthorized()

  try {
    const body = await request.json()
    const validation = validateCreatePost({ ...body, type: 'TRAVEL' })
    if (!validation.success) return ApiResponse.validationError(validation.error)

    const post = await postService.createPost(validation.data, auth.userId)
    return ApiResponse.success(post, 201)
  } catch (error) {
    return ApiResponse.error(error)
  }
}
```

#### 3.7.3 示例：单条记录 API

```typescript
// app/api/travel/posts/[slug]/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const post = await postService.getPostBySlug('TRAVEL', params.slug)
    if (!post) return ApiResponse.notFound('文章不存在')
    return ApiResponse.success(post)
  } catch (error) {
    return ApiResponse.error(error)
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) return ApiResponse.unauthorized()

  try {
    const body = await request.json()
    const validation = validateUpdatePost(body)
    if (!validation.success) return ApiResponse.validationError(validation.error)

    const post = await postService.updateBySlug('TRAVEL', params.slug, validation.data)
    return ApiResponse.success(post)
  } catch (error) {
    return ApiResponse.error(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) return ApiResponse.unauthorized()

  try {
    await postService.deleteBySlug('TRAVEL', params.slug)
    return ApiResponse.success(null, 204)
  } catch (error) {
    return ApiResponse.error(error)
  }
}
```

### 3.8 Service 容器与依赖注入

```typescript
// lib/container.ts
import { PrismaClient } from '@prisma/client'
import { PrismaPostRepository } from '@/lib/repositories/post-repository'
import { PrismaUserRepository } from '@/lib/repositories/user-repository'
import { PrismaSiteRepository } from '@/lib/repositories/site-repository'
import { PostService } from '@/lib/services/post-service'
import { AuthService } from '@/lib/services/auth-service'
import { SiteService } from '@/lib/services/site-service'
import { MemoryCacheService } from '@/lib/infrastructure/cache'
import { LocalStorageService } from '@/lib/infrastructure/storage'

// 单例 Service 实例
let postServiceInstance: PostService | null = null
let authServiceInstance: AuthService | null = null
let siteServiceInstance: SiteService | null = null

export function getPostService(): PostService {
  if (!postServiceInstance) {
    const prisma = getPrismaClient()
    const cache = new MemoryCacheService(1000, 300)
    const postRepo = new PrismaPostRepository(prisma)
    postServiceInstance = new PostService(postRepo, cache)
  }
  return postServiceInstance
}

export function getAuthService(): AuthService {
  if (!authServiceInstance) {
    const prisma = getPrismaClient()
    const userRepo = new PrismaUserRepository(prisma)
    authServiceInstance = new AuthService(userRepo, getTokenService())
  }
  return authServiceInstance
}

export function getSiteService(): SiteService {
  if (!siteServiceInstance) {
    const prisma = getPrismaClient()
    const cache = new MemoryCacheService(200, 600)
    const siteRepo = new PrismaSiteRepository(prisma)
    siteServiceInstance = new SiteService(siteRepo, cache)
  }
  return siteServiceInstance
}

// 重置（测试用）
export function resetServices(): void {
  postServiceInstance = null
  authServiceInstance = null
  siteServiceInstance = null
}
```

### 3.9 交付物清单

- [ ] Repository 层实现（Post、User、Site）
- [ ] Service 层实现（PostService、AuthService、SiteService）
- [ ] DTO 定义（PostDTO、UserDTO、SiteConfigDTO）
- [ ] Validator 实现（zod schema）
- [ ] 基础设施抽象层（CacheService、StorageService）
- [ ] API Route 改造（全部迁移到 Service 层）
- [ ] Service 容器与依赖注入

---

## 4. 阶段四：组件拆分与优化

### 4.1 目标

将巨型组件拆分为可维护的小组件，实现 UI 与业务逻辑的分离。

### 4.2 ChinaMap.tsx 拆分方案

#### 当前问题

- 883 行单文件
- 包含 10+ 个子组件（全部内联）
- 地图投影、交互、渲染、数据处理高度耦合

#### 拆分后目录结构

```
components/map/
├── index.ts                    # 导出入口
├── ChinaMap.tsx                # 主容器 (~150 行)
├── MapProvinceLayer.tsx        # 省份 SVG 渲染层 (~120 行)
├── MapCityMarker.tsx           # 城市标记点 (~80 行)
├── MapDashLine.tsx             # 虚线航线 (~40 行)
├── MapInfoPanel.tsx            # 省份详情面板 (~150 行)
├── MapCityModal.tsx            # 城市记录弹窗 (~100 行)
├── MapNavigation.tsx           # 缩放/导航控件 (~60 行)
├── MapTooltip.tsx              # 悬浮提示框 (~50 行)
├── MapLegend.tsx               # 图例组件 (~40 行)
├── MapColors.ts                # 颜色常量
└── hooks/
    ├── useMapInteraction.ts    # 缩放/拖拽/选中逻辑
    ├── useMapViewBox.ts        # viewBox 计算
    └── useProvincePosts.ts     # 省份-文章关联
```

#### 组件接口设计

```typescript
// components/map/ChinaMap.tsx
interface ChinaMapProps {
  posts: PostMeta[]
  width?: number
  height?: number
}

// components/map/MapProvinceLayer.tsx
interface MapProvinceLayerProps {
  paths: ProvincePath[]
  hoveredId: string | null
  selectedId: string | null
  onHover: (id: string | null) => void
  onClick: (id: string) => void
  hoverPosition: { x: number; y: number } | null
}

// components/map/MapCityMarker.tsx
interface MapCityMarkerProps {
  postsByCity: Map<string, PostMeta[]>
  selectedProvince: string | null
  onCityClick: (city: City) => void
}

// components/map/MapInfoPanel.tsx
interface MapInfoPanelProps {
  province: ProvincePath | null
  posts: PostMeta[]
  onCityClick: (city: City) => void
  onClose: () => void
}
```

#### 拆分实施步骤

1. **提取常量与工具函数** → `MapColors.ts`
2. **提取 hooks** → `useMapInteraction.ts`, `useMapViewBox.ts`
3. **拆分 SVG 渲染层** → `MapProvinceLayer.tsx`, `MapCityMarker.tsx`, `MapDashLine.tsx`
4. **拆分 UI 组件** → `MapInfoPanel.tsx`, `MapCityModal.tsx`, `MapNavigation.tsx`, `MapTooltip.tsx`
5. **组装主组件** → `ChinaMap.tsx` 只负责数据协调和状态管理

#### 验收标准

- [ ] 主组件 `ChinaMap.tsx` ≤ 150 行
- [ ] 每个子组件 ≤ 200 行
- [ ] 所有子组件有明确的 Props 接口
- [ ] 地图功能无退化
- [ ] 类型检查通过

### 4.3 客户端组件优化

#### 4.3.1 数据获取上移

**现状**: `TravelClient.tsx` 在客户端获取数据。

**目标**: Server Component 获取数据，Client Component 只负责渲染。

```typescript
// app/travel/page.tsx (Server Component)
import { getSiteService } from '@/lib/container'

export const revalidate = 3600

export default async function TravelPage() {
  const [postsResult, siteConfig] = await Promise.all([
    fetch('/api/travel/posts?pageSize=100').then(r => r.json()),
    getSiteService().getSiteConfig(),
  ])

  const posts = postsResult.data

  return (
    <TravelClient
      posts={posts}
      siteConfig={siteConfig}
    />
  )
}

// 或直接调用 Service
// const posts = await getPostService().getPublishedPosts('TRAVEL', { pageSize: 100 })
```

#### 4.3.2 TravelInfoPanel 拆分

```typescript
// components/travel/
├── TravelInfoPanel.tsx         # 主容器 (~80 行)
├── TravelClock.tsx             # 实时时钟 (~40 行)
├── TravelAnniversary.tsx       # 纪念日计数器 (~60 行)
├── TravelWeather.tsx           # 天气展示 (~50 行)
├── TravelStats.tsx             # 旅行统计 (~80 行)
└── TravelProgressBar.tsx       # 进度条 (~30 行)
```

#### 4.3.3 TravelImageCarousel 优化

```typescript
// components/travel/
├── TravelImageCarousel.tsx     # 主容器 (~60 行)
├── TravelImageSlide.tsx        # 单张图片 (~40 行)
├── TravelImageDots.tsx         # 指示点 (~30 行)
└── hooks/
    └── useImageCarousel.ts     # 轮播逻辑 (5s 自动切换, 动画控制)
```

### 4.4 样式系统优化

#### 4.4.1 Design Token

```typescript
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        warm: {
          50: '#FFFBF7', 100: '#FFF5EC', 200: '#FFE8D6',
          300: '#FFD4B2', 400: '#F5A25D', 500: '#E08C3A',
          600: '#B87333', 700: '#8B5E2A', 800: '#5E3F1D', 900: '#3D2A13',
        },
        cherry: {
          50: '#FFF5F7', 100: '#FFE4E9', 200: '#FFC9D3',
          300: '#F5DCE0', 400: '#E8B8C2', 500: '#D493A0',
        },
        sky: {
          50: '#F5FAFC', 100: '#E6F1F7', 200: '#D6E8F0',
          300: '#A8C8DC', 400: '#7AA8C4', 500: '#5B8AAA',
        },
        ink: {
          DEFAULT: '#5A6670',
          light: '#8A96A0',
          dark: '#3A4650',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.8s ease-out',
        'scale-up': 'scaleUp 1.5s ease-out forwards',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        scaleUp: { '0%': { transform: 'scale(0.2)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        slideUp: { '0%': { transform: 'translateY(20px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
      },
    },
  },
}
```

#### 4.4.2 复用样式模式

```typescript
// components/ui/
├── Card.tsx             # 通用卡片容器
├── Button.tsx           # 通用按钮
├── Modal.tsx            # 通用弹窗
├── Input.tsx            # 通用输入框
├── Badge.tsx            # 通用标签
└── Skeleton.tsx         # 通用加载骨架
```

### 4.5 交付物清单

- [ ] ChinaMap 拆分为 8+ 个子组件
- [ ] TravelInfoPanel 拆分为 5 个子组件
- [ ] TravelImageCarousel 优化
- [ ] Design Token 系统建立
- [ ] 通用 UI 组件库（Card、Button、Modal 等）

---

## 5. 阶段五：基础设施增强（可选）

### 5.1 Redis 集成（未来）

当需要以下能力时引入 Redis：
- JWT 会话黑名单
- 分布式验证码存储
- 多实例缓存共享
- API 速率限制

```typescript
// lib/infrastructure/redis.ts
import { createClient } from 'redis'

export const redis = createClient({
  url: process.env.REDIS_URL,
})

redis.on('error', (err) => console.error('Redis error:', err))
```

### 5.2 对象存储迁移（未来）

当需要 CDN 加速或多服务器部署时迁移：
- 阿里云 OSS / 腾讯云 COS / AWS S3
- 或自建 MinIO

### 5.3 监控与日志

```typescript
// app/api/health/route.ts
export async function GET() {
  const checks = await Promise.all([
    checkDatabase(),
    checkSiteConfig(),
  ])
  const healthy = checks.every(c => c.ok)
  return Response.json({
    status: healthy ? 'ok' : 'degraded',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    checks,
  })
}
```

### 5.4 Next.js ISR

```typescript
// 启用增量静态再生
export const revalidate = 3600

// 在 fetch 中使用 tags
const posts = await fetch('/api/travel/posts', {
  next: { revalidate: 3600, tags: ['posts'] },
})

// 失效时调用
await revalidateTag('posts')
```

---

## 6. 实施路线图

### 6.1 时间线

```
Week 1-2: 阶段三（服务层）
├── Day 1:   基础设施抽象层（CacheService, StorageService）
├── Day 2-3: Repository 层（Post, User, Site）
├── Day 4-5: Service 层（PostService, AuthService, SiteService）
├── Day 6:   DTO + Validator 层
├── Day 7-8: API Route 改造
└── Day 9-10: 测试与联调

Week 3-4: 阶段四（组件优化）
├── Day 1-3: ChinaMap 拆分
├── Day 4-5: TravelInfoPanel 拆分 + TravelImageCarousel 优化
├── Day 6:   数据获取上移（Server Component）
├── Day 7:   Design Token + UI 组件库
└── Day 8-10: 测试与优化
```

### 6.2 优先级排序

| 序号 | 任务 | 预计时间 | 价值 |
|------|------|---------|------|
| 1 | 基础设施抽象层 | 1 天 | 解耦存储实现 |
| 2 | Repository 层 | 2 天 | 数据访问统一 |
| 3 | PostService | 1 天 | 核心业务逻辑 |
| 4 | AuthService | 1 天 | 安全认证 |
| 5 | SiteService | 0.5 天 | 系统设置 |
| 6 | Validator 层 | 0.5 天 | 输入验证 |
| 7 | API Route 改造 | 2 天 | 架构落地 |
| 8 | ChinaMap 拆分 | 3 天 | 可维护性 |
| 9 | 其他组件优化 | 2 天 | 代码质量 |
| 10 | Design Token | 1 天 | 样式统一 |

### 6.3 验收检查清单

#### 服务层验收

- [ ] `lib/services/` 下至少 3 个 Service 类
- [ ] `lib/repositories/` 下至少 3 个 Repository 类
- [ ] `lib/dto/` 下有完整的 DTO 定义
- [ ] `lib/validators/` 下有 zod Schema
- [ ] 所有 Service 方法有类型签名
- [ ] 无 `as any` 类型断言

#### 组件层验收

- [ ] `ChinaMap.tsx` ≤ 150 行
- [ ] 所有组件 ≤ 200 行
- [ ] 组件 Props 接口定义完整
- [ ] Client Component 不直接调用数据库
- [ ] 无内联样式（使用 Tailwind class）

#### 构建与测试

- [ ] `npm run build` 无错误
- [ ] `npm run lint` 无警告
- [ ] 核心页面功能正常
- [ ] API 接口响应格式统一

---

## 7. 新增依赖

| 包名 | 用途 | 阶段 |
|------|------|------|
| `zod` | 运行时类型验证 | 阶段三 |
| `jose` | JWT 签名与验证 | 阶段一（已规划） |

> 注：Redis、对象存储 SDK 等在阶段五按需引入。

---

## 8. 关键文件索引

### 需要修改的文件

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `lib/db.ts` | 已优化 | 官方适配器已接入 |
| `prisma/schema.prisma` | 已优化 | 模型已规范化 |
| `lib/auth.ts` | 重构 | 迁移到 AuthService |
| `lib/cache.ts` | 重构 | 实现 CacheService 接口 |
| `middleware.ts` | 重构 | JWT 验证 |
| `components/ChinaMap.tsx` | 拆分 | 883→150 行 |
| `components/TravelInfoPanel.tsx` | 拆分 | 300→80 行 |
| `app/api/*/route.ts` | 重构 | 迁移到 Service 层 |
| `app/travel/TravelClient.tsx` | 优化 | 数据获取上移 |

### 新增的文件

| 文件路径 | 用途 |
|---------|------|
| `lib/services/post-service.ts` | 文章业务逻辑 |
| `lib/services/auth-service.ts` | 认证业务逻辑 |
| `lib/services/site-service.ts` | 系统设置业务逻辑 |
| `lib/repositories/post-repository.ts` | 文章数据访问 |
| `lib/repositories/user-repository.ts` | 用户数据访问 |
| `lib/repositories/site-repository.ts` | 站点设置数据访问 |
| `lib/dto/post.dto.ts` | 文章 DTO |
| `lib/dto/auth.dto.ts` | 认证 DTO |
| `lib/validators/post.validator.ts` | 文章验证 |
| `lib/infrastructure/cache.ts` | 缓存服务接口 |
| `lib/infrastructure/storage.ts` | 存储服务接口 |
| `lib/container.ts` | 依赖注入容器 |
| `components/map/` | 地图子组件目录 |
| `components/travel/` | 旅行相关子组件目录 |
| `components/ui/` | 通用 UI 组件目录 |

---

## 附录：快速实施路径

如果希望快速看到效果，建议按以下顺序：

### 第一周：最小服务层

1. 创建 `lib/infrastructure/cache.ts`（CacheService 接口 + 内存实现）
2. 创建 `lib/repositories/post-repository.ts`（Prisma 实现）
3. 创建 `lib/services/post-service.ts`（核心 CRUD）
4. 创建 `lib/validators/post.validator.ts`（zod 验证）
5. 改造 2-3 个核心 API Route

### 第二周：组件拆分

1. 提取 `ChinaMap.tsx` 中的 hooks
2. 提取 SVG 渲染为独立组件
3. 组装新的 `ChinaMap.tsx`
4. 优化 `TravelInfoPanel.tsx`

---

*— 文档 v2.0 结束 —*  
*本文档将随实施进度持续更新*
