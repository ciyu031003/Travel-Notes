# 个人博客系统

一个基于 Next.js 15 的现代化个人博客，包含旅行记录和学习笔记两大模块，支持 MySQL 数据库驱动与后台管理系统。

## ✨ 功能特性

### 🗺️ 旅行记录模块
- **全屏滚动切换**：下拉切换页面，每页展示一篇旅行记录
- **渐变模糊效果**：图片从左侧文字区域模糊过渡到右侧清晰可见
- **地点标记**：每条旅行记录支持地点、日期、标签
- **图片自动生成**：根据标题和地点自动生成封面图
- **指示器导航**：右侧页面指示器 + 底部进度条
- **广州之旅**：已内置广州三日游示例

### � 学习笔记模块
- **技术博客**：Markdown 文章，支持代码高亮和 Mermaid 思维导图
- **思维导图**：Mermaid 驱动的知识图谱，分类整理知识体系
- **代码仓库**：类 GitHub 的在线代码浏览体验
  - 文件树导航
  - 行号显示
  - 一键复制
  - 多语言支持

### 🛠️ 后台管理系统
- **管理员认证**：密码哈希 + Session 鉴权
- **文章管理**：CRUD 操作，支持分类筛选和搜索
- **Markdown 编辑器**：在线编辑 + 实时预览
- **分类管理**：支持旅行记录、技术博客、思维导图、代码仓库四种类型
- **首次初始化**：`/admin/setup` 页面引导配置管理员

### 🗄️ 数据库支持
- **MySQL + Prisma ORM**：完整的数据库持久化
- **自动回退**：数据库为空时自动从 Markdown 文件加载
- **统一内容层**：`lib/content.ts` 提供统一数据接口

### 🎨 通用特性
- 🌓 明暗主题切换
- 📱 完全响应式设计
- ⚡ 静态生成，极速加载
- 🔍 SEO 友好
- �️ 首页背景图 + 毛玻璃渐变效果

## 🚀 快速开始

### 环境要求
- Node.js 18+
- MySQL 8.0+
- npm 或 yarn

### 1. 安装依赖

```bash
npm.cmd install --legacy-peer-deps
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
# Windows PowerShell
Copy-Item .env.example .env
```

编辑 `.env` 文件：

```
DATABASE_URL="mysql://root:密码@localhost:3306/Travel_And_Study"
ADMIN_USERNAME="yuanabd"
ADMIN_PASSWORD_HASH="（在 /admin/setup 页面生成后填入，注意 $ 符号需用 \$ 转义）"
SESSION_SECRET="替换为随机密钥"
```

### 3. 初始化数据库

```bash
npx.prisma.db push
```

### 4. 启动开发服务器

```bash
npm.cmd run dev
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
npm.cmd run build
npm.cmd start
```

## 📁 项目结构

```
personal-blog/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # 全局布局
│   ├── page.tsx                  # 首页（动态获取最新文章）
│   ├── travel/                   # 旅行记录
│   │   ├── page.tsx              # 列表页（全屏滚动）
│   │   ├── TravelClient.tsx      # 客户端滚动组件
│   │   └── [slug]/page.tsx       # 详情页
│   ├── notes/                    # 学习笔记
│   │   ├── page.tsx              # 学习笔记首页
│   │   ├── blog/                 # 技术博客
│   │   ├── mindmap/              # 思维导图
│   │   └── repo/                 # 代码仓库
│   ├── admin/                    # 后台管理
│   │   ├── page.tsx              # 文章列表
│   │   ├── login/page.tsx        # 登录页
│   │   ├── setup/page.tsx        # 初始化页面
│   │   ├── new/page.tsx          # 新建文章跳转
│   │   └── edit/[id]/page.tsx    # 编辑页面
│   └── api/admin/                # API 路由
│       ├── login/route.ts        # 登录
│       ├── logout/route.ts       # 登出
│       ├── check/route.ts        # 状态检查
│       ├── posts/route.ts        # 文章 CRUD
│       └── posts/[id]/route.ts   # 单篇文章 CRUD
├── components/                   # 组件
│   ├── layout/Navbar.tsx        # 导航栏
│   ├── mdx/MermaidRenderer.tsx   # Mermaid 渲染器
│   └── repo/                     # 代码仓库组件
├── content/                      # 内容源文件
│   ├── travel/                   # 旅行记录
│   │   ├── guangzhou-trip.md     # 广州之旅
│   │   └── urumqi-trip.md        # 乌鲁木齐之旅
│   └── tech/
│       ├── blog/                 # 技术博客
│       ├── mindmaps/             # 思维导图
│       └── repos/                # 代码项目
├── lib/                          # 工具函数
│   ├── auth.ts                   # 认证工具
│   ├── auth-middleware.ts        # 鉴权中间件
│   ├── content.ts                # 统一内容层（数据库 + Markdown）
│   ├── db.ts                     # Prisma 客户端
│   ├── db-posts.ts               # 数据库文章操作
│   ├── markdown.ts               # Markdown 解析
│   ├── repos.ts                  # 代码仓库工具
│   └── utils.ts                  # 通用工具
├── prisma/
│   └── schema.prisma             # 数据库 Schema
└── public/                       # 静态资源
```

## �️ 数据库设计

### 数据库：`Travel_And_Study`

### 表结构：`Post`（文章表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Int (PK, Auto Increment) | 主键 |
| slug | VarChar(255), Unique | URL 友好标识 |
| title | VarChar(255) | 文章标题 |
| content | Text | Markdown 正文内容 |
| date | DateTime | 发布日期 |
| cover | VarChar(500), Nullable | 封面图 URL |
| tags | Text, Nullable | 标签 JSON 数组 |
| location | VarChar(255), Nullable | 地点（旅行记录用） |
| type | PostType (Enum) | 文章类型 |
| summary | Text, Nullable | 摘要 |
| published | Boolean (Default: true) | 发布状态 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

### 枚举：`PostType`

| 值 | 说明 |
|----|------|
| travel | 旅行记录 |
| blog | 技术博客 |
| mindmap | 思维导图 |
| repo | 代码仓库 |

## 📝 内容管理

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

- **框架**: Next.js 15 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS 3
- **图标**: Lucide React
- **数据库**: MySQL 8.0 + Prisma ORM
- **认证**: bcryptjs + Session Cookie
- **Markdown**: Remark + Gray Matter + remark-gfm
- **思维导图**: Mermaid.js
- **代码高亮**: highlight.js + rehype-highlight

## 📄 License

MIT
