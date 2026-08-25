# 行迹 · Travel-Notes 个人旅行记忆空间

一个基于 Next.js 15 的私人旅行记忆系统：记录你（与旅伴）的旅行足迹、照片、回忆、时间线与纪念日。
采用服务层架构（SoA），MySQL + Prisma 驱动，Database-backed Session 认证，内置完整安全基线（P0/P1）。

品牌名「行迹」，定位为**个人旅行记忆空间**（独旅 / 情侣 / 朋友 / 家庭 / 多人 / 长期记录均可）。

## ✨ 功能特性

### 🗺️ 旅行记录
- **全屏滚动画册**：`/travel/[slug]` 下拉切换每页旅行媒体，海报文字 + 胶片颗粒质感
- **交互式中国地图**：d3-geo + SVG，省份高亮 / 城市标记 / 虚线航线 / 足迹热点
- **旅行规划**：Travel → TravelDay → 行程项 → 花费 完整数据模型，后台可编排每日行程
- **按天叙事时间线**：旅行详情内按天回顾行程 / 回忆 / 照片

### 🏠 旅行空间（Space）与权限（RBAC）
- **Space 数据模型**：多人共同旅行空间（Space / SpaceMember / SpaceInvite）
- **角色体系**：OWNER / MEMBER / VIEWER，统一权限方法（requireSpaceMember / requireSpaceRole / canRead* / canEdit*）
- **IDOR 防护**：所有资源访问统一走 Space 成员校验

### 📸 相册与记忆
- **相册**：复古像素风 + 银河星空双视觉（Three.js 粒子银河可切换）
- **记忆档案**：`/me` 个人旅行档案（护照式统计 + 最近旅行 + 照片化记忆入口）
- **记忆档案导出**：`/api/export/archive` 一键导出 JSON + Markdown + 原图 ZIP

### 🌐 旅行圈（轻社交）
- **Travel Discovery**：旅行圈 Masonry Feed（推荐 / 最新 / 热门 / 关注）
- **互动**：点赞 / 评论 / 收藏 / 举报（审核闭环）

### 🛠️ 后台管理系统
- **Database-backed Session**：登录会话落库，可撤销 / 过期 / 多端管理
- **首次初始化**：`/admin/setup` 直接创建管理员（无默认账号），完成后自动关闭入口
- **文章 / 旅行 / 相册 / 纪念日 / 碎碎念 / 空间 / 社交 / 审计**：全套管理后台
- **Markdown 编辑器**：在线编辑 + 实时预览（内容经 XSS 净化）
- **密码找回**：邮箱验证码重置流程（带限流）

### 🔒 安全基线（P0）
- 升级 Next.js 15.5（最新 15.x 安全版本）
- 删除默认管理员密码（首次启动引导初始化）
- 上传安全：Magic Number 校验 + sharp 重新编码（剥离 EXIF/GPS），仅 JPEG/PNG/WebP
- Markdown XSS 防护：rehype-sanitize 白名单
- 登录安全：IP/用户名限流 + 连续失败锁定（指数退避）
- Security Headers：CSP / HSTS / X-Content-Type-Options / Referrer-Policy 等
- 会话安全：HttpOnly + Secure + SameSite=Lax Cookie，密码变更自动撤销其它会话

### 🎨 设计系统
- 暖陶土 `travel.*` 语义色（主强调 `#A85F3A`）+ 羊皮纸背景
- 双主题：亮色（暖米）+ 暗色（档案 / 旅行圈极黑暖金）
- `ui/` 基础组件（Button / Badge / SectionHeader）+ `admin/ui`（Input / Textarea / Button / Card）
- 明暗主题切换、响应式（含移动端底部 Tab 导航）、`prefers-reduced-motion` 支持

## 🏗️ 架构概览

分层架构，业务逻辑 / 数据访问 / 协议转换清晰分离：

```
Next.js 15 App Router
├── Server Components / API Routes (app/api/*) / Middleware (JWT 鉴权)
├── Service Layer  (AuthService / PostService / Travel / Space / Memory / Social)
├── Data Access    (PostRepository / SessionRepository / UserRepository)
├── Infrastructure (CacheService / StorageService / Validators(Zod) / RateLimit)
└── Prisma (MySQL 适配器 lib/prisma-adapter.ts)
```

依赖注入容器 `lib/container.ts` 提供单例 Service 工厂。

## 🚀 快速开始

### 环境要求
- Node.js 18+（推荐 20 LTS）
- MySQL 8.0+ / MariaDB

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
```bash
Copy-Item .env.example .env   # Windows PowerShell
# 编辑 .env，填 DATABASE_URL / JWT_SECRET
```

### 3. 初始化数据库
```bash
npx prisma generate
npx prisma db push
```

### 4. 启动开发服务器
```bash
npm run dev
# 访问 http://localhost:3000，首次访问 /admin/setup 初始化管理员
```

### 5. 生产构建
```bash
npm run build
npm start
```

### 🐳 Docker 一键部署（推荐）

```bash
docker compose up -d --build
```

> 详见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)（部署 / 运维 / 备份 / 监控 / 邮件 / 磁盘清理合并手册）。

## 📁 项目结构

```
Travel-Notes/
├── app/                    # Next.js App Router
│   ├── page.tsx            # 首页（足迹地图 + 最近旅行）
│   ├── travel/             # 旅行记录（列表 / 详情 / 行程记录）
│   ├── album/              # 相册
│   ├── timeline/           # 时间线
│   ├── circle/             # 旅行圈
│   ├── me/                 # 个人档案
│   ├── dashboard/          # 数据看板（旅行记忆空间）
│   ├── admin/              # 后台管理
│   └── api/                # API 路由
├── components/             # 组件
│   ├── layout/             # Navbar / Footer / MobileBottomNav
│   ├── ui/                 # 基础组件（Button/Badge/SectionHeader）
│   ├── admin/              # 后台组件（ui.tsx 基础组件 + 编辑器）
│   ├── album/ china-map/ social/ travel/ timeline/ ... # 业务组件
├── lib/                    # 工具库与架构层
│   ├── modules/            # 业务模块（travel/space/memory/social/album）
│   ├── services/           # 服务层
│   ├── repositories/       # 数据访问层
│   ├── infrastructure/     # cache/storage/rate-limit/upload 校验
│   ├── container.ts        # 依赖注入容器
│   └── prisma-adapter.ts   # Prisma MySQL 适配器（utf8mb4）
├── prisma/schema.prisma    # 数据库 Schema
├── middleware.ts           # 鉴权中间件
├── docker-compose.yml      # Docker 部署
└── scripts/                # 部署 / 备份 / 磁盘清理脚本
```

## 🗄️ 数据模型

核心表：`Post`（文章/旅行）、`Travel` / `TravelDay` / `ItineraryItem` / `Expense`（旅行规划）、`Memory` / `Media`（记忆）、`Album`（相册）、`Space` / `SpaceMember` / `SpaceInvite`（空间）、`Session`（会话）、`AuditLog`（审计）、`Danmaku`（弹幕）、`SiteSetting`（设置）。

## 🛠️ 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) | 15.5 |
| 语言 | TypeScript | 5.3+ |
| UI | React + Tailwind CSS | 19 / 3.4 |
| ORM | Prisma | 7.9 |
| 数据库 | MySQL / MariaDB | 8.0+ |
| 认证 | jose (JWT) + bcryptjs | 6.2 / 3.0 |
| 验证 | Zod | 4.4 |
| 地图 | d3-geo + SVG | 3.1 |
| 图标 | Lucide React | 1.31 |
| 3D 相册 | Three.js | 0.185 |
| 测试 | Vitest | 4.1 |

## 📄 License

MIT
