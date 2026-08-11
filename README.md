# 个人博客系统

一个基于 Next.js 15 的现代化个人博客，包含旅行记录和学习笔记两大模块，采用服务层架构（SoA），支持 MySQL 数据库驱动、JWT 认证与后台管理系统。

## ✨ 功能特性

### 🗺️ 旅行记录模块
- **全屏滚动切换**：下拉切换页面，每页展示一篇旅行记录
- **渐变模糊效果**：图片从左侧文字区域模糊过渡到右侧清晰可见
- **交互式中国地图**：d3-geo + SVG 实现省份高亮、城市标记、虚线航线
- **地点标记**：每条旅行记录支持地点、日期、标签
- **图片自动生成**：根据标题和地点自动生成封面图
- **指示器导航**：右侧页面指示器 + 底部进度条
- **实时时钟与纪念日**：右侧信息面板动态展示

### 📖 学习笔记模块
- **技术博客**：Markdown 文章，支持代码高亮和 Mermaid 思维导图
- **思维导图**：Mermaid 驱动的知识图谱，分类整理知识体系
- **代码仓库**：类 GitHub 的在线代码浏览体验
  - 文件树导航
  - 行号显示
  - 一键复制
  - 多语言支持

### 🛠️ 后台管理系统
- **JWT 认证**：bcryptjs 密码哈希 + JWT Token 鉴权 + Token 黑名单注销
- **文章管理**：CRUD 操作，支持分类筛选和搜索
- **Markdown 编辑器**：在线编辑 + 实时预览
- **分类管理**：支持旅行记录、技术博客、思维导图三种类型
- **系统设置**：用户名/邮箱/密码管理、纪念日配置
- **密码找回**：邮箱验证码重置密码流程
- **首次初始化**：`/admin/setup` 页面引导配置管理员

### 🗄️ 数据库与内容管理
- **MySQL + Prisma ORM**：完整的数据库持久化，官方 MySQL 适配器
- **混合内容获取**：PostService 优先从数据库读取，数据库为空时自动从 Markdown 文件回退
- **图片二进制存储**：PostImage 表存储图片二进制数据（LongBlob），无需外部图床
- **弹幕系统**：Danmaku 表支持页面弹幕互动

### 🎨 通用特性
- 🌓 明暗主题切换
- 📱 完全响应式设计（含移动端底部 Tab 导航）
- ⚡ 静态生成 + 动态渲染，极速加载
- 🔍 SEO 友好
- 🎨 首页背景图 + 毛玻璃渐变效果
- ⌨️ 全局命令面板（Ctrl/⌘+K 快速搜索与导航）
- 🔎 静态全文搜索（本地索引即时检索，构建期生成，2C2G 友好）
- 💬 Giscus 评论（可选，基于 GitHub Discussions）
- ➗ KaTeX 数学公式渲染
- 📊 数据看板（旅行足迹地图 / 省份打卡排行 / 内容统计）
- 💬 碎碎念时间线（生活随记，后台可发布）
- ❤️ 点赞（免登录，浏览器访客 ID 去重）
- 🖼️ 相册升级：瀑布流缩略图 + 全屏灯箱 + EXIF 相机参数（懒加载）

## 🏗️ 架构概览

项目采用**分层架构**，实现业务逻辑、数据访问与协议转换的清晰分离：

```
┌──────────────────────────────────────────────────────────┐
│                   Next.js 15 App Router                    │
├──────────────┬───────────────────┬───────────────────────┤
│  Server      │   API Routes      │   Middleware           │
│  Components  │   (app/api/*)     │   (JWT 鉴权)           │
├──────────────┴───────────────────┴───────────────────────┤
│                  Service Layer (服务层)                    │
│  ┌────────────┬─────────────┬──────────────┬───────────┐ │
│  │ AuthService│ PostService │ SiteService  │TokenService│ │
│  └────────────┴─────────────┴──────────────┴───────────┘ │
├──────────────────────────────────────────────────────────┤
│              Data Access Layer (数据访问层)                │
│  ┌─────────────────────┬──────────────────────┐         │
│  │ PostRepository      │ UserRepository       │         │
│  │ (封装 db-posts.ts)   │ (封装 auth.ts)       │         │
│  └─────────────────────┴──────────────────────┘         │
├──────────────────────────────────────────────────────────┤
│            Infrastructure (基础设施层)                    │
│  CacheService │ StorageService │ Validators (Zod)        │
├──────────────────────────────────────────────────────────┤
│  Prisma (MySQL 适配器) │ Markdown 内容回退                │
└──────────────────────────────────────────────────────────┘
```

### 依赖注入容器

`lib/container.ts` 提供单例 Service 工厂方法，统一管理依赖装配：

```typescript
getPostService()   // PostService (PostRepository + CacheService)
getAuthService()   // AuthService (UserRepository + TokenService)
getSiteService()   // SiteService (UserRepository + CacheService)
```

## 🚀 快速开始

### 环境要求
- Node.js 18+（推荐 20.x LTS）
- MySQL 8.0+ / MariaDB
- npm 或 yarn

### 1. 安装依赖

```bash
npm install --legacy-peer-deps
```

> `--legacy-peer-deps` 用于解决 `lucide-react` 与 React 19 的 peer dependency 冲突。

### 2. 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
# Windows PowerShell
Copy-Item .env.example .env
```

编辑 `.env` 文件：

```env
# 数据库连接
DATABASE_URL="mysql://root:密码@localhost:3306/Travel_And_Study"

# 管理员账号
ADMIN_USERNAME="yuanabd"
ADMIN_PASSWORD_HASH="（在 /admin/setup 页面生成后填入，注意 $ 符号需用 \$ 转义）"

# JWT 密钥（用于 Token 签名与验证）
JWT_SECRET="替换为随机密钥（可用 openssl rand -hex 32 生成）"

# Cookie 安全（生产环境设为 true）
COOKIE_SECURE=false
```

### 3. 初始化数据库

```bash
npx prisma generate
npx prisma db push
```

### 4. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000 查看效果

### 5. 初始化管理员

1. 访问 `/admin/setup` 页面
2. 设置用户名和密码（至少 6 位）
3. 复制生成的密码哈希到 `.env` 文件的 `ADMIN_PASSWORD_HASH`
4. 重启服务器

### 🔑 默认管理员账号

本项目已预配置以下管理员账号：

| 项目 | 值 |
|------|------|
| 用户名 | `yuanabd` |
| 密码 | `Abd123456.` |
| 登录地址 | http://localhost:3000/admin/login |

> ⚠️ **安全提示**：这是开发环境默认账号，部署到生产环境前请务必通过 `/admin/setup` 页面重新生成新的密码哈希并更新 `.env` 文件。

### 生产构建

```bash
npm run build
npm start
```

> **低内存服务器构建优化**：如果服务器内存 ≤ 2GB，构建时可能 OOM。建议添加 Swap 分区或设置 `NODE_OPTIONS=--max-old-space-size=512` 限制 Node.js 内存。

## 📁 项目结构

```
Travel-Notes/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # 全局布局
│   ├── page.tsx                  # 首页（PostService 获取最新文章）
│   ├── travel/                   # 旅行记录
│   │   ├── page.tsx              # 列表页（PostService 混合获取）
│   │   ├── TravelClient.tsx      # 客户端滚动组件
│   │   └── [slug]/page.tsx       # 详情页（PostService 混合获取）
│   ├── notes/                    # 学习笔记
│   │   ├── page.tsx              # 学习笔记首页
│   │   ├── blog/                 # 技术博客
│   │   ├── mindmap/              # 思维导图
│   │   └── repo/                 # 代码仓库
│   ├── admin/                    # 后台管理
│   │   ├── page.tsx              # 文章列表
│   │   ├── login/page.tsx        # 登录页
│   │   ├── setup/page.tsx        # 初始化页面
│   │   ├── settings/page.tsx     # 系统设置
│   │   ├── new/page.tsx          # 新建文章跳转
│   │   └── edit/[id]/page.tsx    # 编辑页面
│   ├── album/                    # 相册页面
│   ├── login/                    # 登录页
│   ├── forgot-password/          # 密码找回页
│   └── api/                      # API 路由
│       ├── admin/                # 管理后台 API
│       │   ├── login/            # 登录
│       │   ├── logout/           # 登出
│       │   ├── check/            # 状态检查
│       │   ├── posts/            # 文章 CRUD
│       │   ├── settings/         # 系统设置
│       │   ├── force-change-password/
│       │   └── videos/upload/    # 视频上传
│       ├── forgot-password/      # 密码重置流程
│       ├── check-auth/           # 认证检查
│       ├── album/                # 相册数据
│       ├── notes/                # 笔记聚合
│       ├── repos/                # 代码仓库
│       ├── images/[id]/          # 图片服务
│       ├── upload/               # 文件上传
│       └── video/[filename]/     # 视频流服务
├── components/                   # 组件
│   ├── layout/Navbar.tsx         # 导航栏
│   ├── mdx/MermaidRenderer.tsx   # Mermaid 渲染器
│   ├── VideoPlayer.tsx           # 视频播放器
│   └── repo/                     # 代码仓库组件
├── lib/                          # 工具库与架构层
│   ├── services/                 # 服务层（业务逻辑）
│   │   ├── auth-service.ts       # 认证服务（登录/JWT/密码管理/找回密码）
│   │   ├── post-service.ts       # 文章服务（CRUD + 混合获取 + 缓存）
│   │   ├── site-service.ts       # 系统设置服务
│   │   └── token-service.ts      # JWT Token 服务（签名/验证/黑名单）
│   ├── repositories/             # 数据访问层
│   │   ├── post-repository.ts    # 文章数据访问（封装 db-posts.ts）
│   │   └── user-repository.ts    # 用户数据访问（封装 auth.ts）
│   ├── infrastructure/           # 基础设施抽象
│   │   ├── cache.ts              # 缓存服务接口 + 内存实现
│   │   └── storage.ts            # 存储服务接口 + 本地实现
│   ├── validators/               # 输入验证（Zod）
│   │   ├── post.validator.ts     # 文章验证 Schema
│   │   └── auth.validator.ts     # 认证验证 Schema
│   ├── container.ts              # 依赖注入容器
│   ├── api-response.ts           # 统一 API 响应工具
│   ├── auth.ts                   # 认证工具（底层 Prisma 操作）
│   ├── auth-middleware.ts        # 鉴权中间件
│   ├── auth-utils.ts             # 密码哈希/验证工具
│   ├── cache.ts                  # 内存缓存（TTL + 标签失效）
│   ├── content.ts                # 内容层（兼容旧调用，已由 PostService 替代）
│   ├── db.ts                     # Prisma 客户端
│   ├── db-posts.ts               # 数据库文章操作
│   ├── markdown.ts               # Markdown 解析
│   ├── prisma-adapter.ts         # Prisma MySQL 适配器
│   ├── verification.ts           # 验证码生成与校验
│   └── utils.ts                  # 通用工具
├── content/                      # Markdown 内容源文件
│   ├── travel/                   # 旅行记录
│   └── tech/
│       ├── blog/                 # 技术博客
│       └── mindmaps/             # 思维导图
├── prisma/
│   └── schema.prisma             # 数据库 Schema
├── middleware.ts                 # Next.js 中间件（JWT 鉴权）
├── ecosystem.config.js           # PM2 进程配置
├── deploy.sh                     # 一键部署脚本
└── public/                       # 静态资源
    └── uploads/                  # 用户上传文件
```

## 🗄️ 数据库设计

### 数据库：`Travel_And_Study`

### 表结构

#### `Post`（文章表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Int (PK, Auto Increment) | 主键 |
| slug | VarChar(255) | URL 友好标识 |
| title | VarChar(255) | 文章标题 |
| content | Text | Markdown 正文内容 |
| date | DateTime | 发布日期 |
| cover | VarChar(500), Nullable | 封面图 URL |
| images | Text, Nullable | 图片 URL JSON 数组 |
| videos | Text, Nullable | 视频信息 JSON 数组 |
| tags | Text, Nullable | 标签 JSON 数组 |
| location | VarChar(255), Nullable | 地点（旅行记录用） |
| type | VarChar(50) | 文章类型（travel/blog/mindmap/repo） |
| summary | Text, Nullable | 摘要 |
| published | Boolean (Default: true) | 发布状态 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

> **唯一约束**: `(type, slug)` 联合唯一
> **索引**: `(type, published, date)`, `(published, date)`, `(location)`, `(createdAt)`

#### `PostImage`（图片二进制存储表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Int (PK, Auto Increment) | 主键 |
| postId | Int | 关联文章 ID |
| data | LongBlob | 图片二进制数据 |
| mimeType | VarChar(100) | MIME 类型 |
| order | Int (Default: 0) | 排序序号 |
| createdAt | DateTime | 创建时间 |

> **关系**: `PostImage.postId → Post.id`（级联删除）

#### `SiteSetting`（系统设置表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Int (PK) | 主键 |
| username | VarChar(255), Unique | 管理员用户名 |
| passwordHash | Text | 密码哈希 |
| email | VarChar(255), Nullable | 绑定邮箱 |
| emailVerified | Boolean (Default: false) | 邮箱验证状态 |
| resetToken | VarChar(255), Nullable | 密码重置令牌 |
| resetTokenExp | DateTime, Nullable | 重置令牌过期时间 |
| requirePasswordChange | Boolean (Default: false) | 是否需要修改密码 |
| anniversaryStart | VarChar(50), Nullable | 纪念日日期 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

#### `Danmaku`（弹幕表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Int (PK, Auto Increment) | 主键 |
| text | VarChar(255) | 弹幕内容 |
| color | VarChar(20) | 弹幕颜色 |
| createdAt | DateTime | 创建时间 |

### 文章类型

| 值 | 说明 |
|----|------|
| travel | 旅行记录 |
| blog | 技术博客 |
| mindmap | 思维导图 |
| repo | 代码仓库 |

## 📝 内容管理

### 混合内容获取

PostService 提供混合获取方法，优先从数据库读取，数据库无数据时自动回退到 Markdown 文件：

- `getPostsHybrid(directory)` - 获取文章列表（合并 DB + Markdown，按日期排序）
- `getPostBySlugHybrid(directory, slug)` - 获取单篇文章（优先 DB，回退 Markdown）

目录到数据库类型的映射：

| Markdown 目录 | 数据库 type |
|--------------|------------|
| `travel` | `travel` |
| `tech/blog` | `blog` |
| `tech/mindmaps` | `mindmap` |
| `tech/repos` | `repo` |

### 添加 Markdown 文章

在对应目录下创建 `.md` 文件：

```markdown
---
title: 文章标题
date: 2026-07-25
description: 文章描述
tags: [标签1, 标签2]
location: 地点（旅行记录可选）
cover: /images/cover.jpg
---

正文内容（支持 Markdown 和 Mermaid）...
```

### 通过后台管理发布

1. 访问 `/admin` 登录后台
2. 点击「新建文章」
3. 填写标题、Slug、分类等信息
4. 使用 Markdown 编辑器编写内容
5. 点击「保存」发布

## 🛠️ 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) | 15.0.0 |
| 语言 | TypeScript | 5.3+ |
| UI | React + Tailwind CSS | 19 / 3.4 |
| ORM | Prisma | 7.9 |
| 数据库 | MySQL / MariaDB | 8.0+ |
| 认证 | jose (JWT) + bcryptjs | 6.2 / 3.0 |
| 验证 | Zod | 4.4 |
| Markdown | Remark + Gray Matter + remark-gfm | - |
| 思维导图 | Mermaid.js | 10.9 |
| 代码高亮 | highlight.js + rehype-highlight | 11.9 |
| 地图 | d3-geo + SVG | 3.1 |
| 图标 | Lucide React | 0.344 |
| 进程管理 | PM2 | - |

## 📄 License

MIT
