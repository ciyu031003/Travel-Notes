# 行迹 · Travel-Notes 个人旅行记忆空间

基于 **Next.js 15** 的私人旅行记忆系统：记录旅行足迹、照片、回忆、时间线与纪念日，
支持独旅 / 情侣 / 朋友 / 家庭 / 多人结伴等场景，并可多人共建**旅行空间**协作记录。
服务层架构（SoA）+ MySQL / Prisma + Database-backed Session 认证，内置完整安全基线；
移动端「**甜途**」App（Capacitor Android）支持本地离线记录与自动同步。

## ✨ 功能速览

- **旅行记录**：Travel → TravelDay → 行程项 → 花费完整模型，规划 / 上传 / 编辑 / 进行中→归档闭环；`/travel/[slug]` 全屏滚动画册 + 按天叙事时间线
- **交互式中国地图**：d3-geo + SVG，省份高亮 / 城市标记 / 虚线航线 / 足迹热点
- **相册**：复古像素风 + 银河星空双视觉（Three.js 粒子银河可切换），上传自动生成缩略图 / 预览 / 模糊占位变体
- **记忆档案**：`/me` 护照式个人档案；一键导出 JSON + Markdown + 原图 ZIP
- **旅行圈**：Masonry Feed（推荐 / 最新 / 热门 / 关注）+ 点赞 / 评论 / 收藏 / 举报（审核闭环）
- **旅行空间**：`/space` 多人协作空间（五类类型配色），RBAC（OWNER / MEMBER / VIEWER）+ 邀请码 + 空间动态
- **后台管理**：文章 / 旅行 / 相册 / 纪念日 / 碎碎念 / 空间 / 审计全后台，Markdown 编辑器（XSS 净化），邮箱验证码找回密码，首次 `/admin/setup` 初始化管理员（无默认账号，完成后入口自动关闭）
- **移动端**：甜途 App（Android），本地 SQLite 离线读写 + 同步队列自动上传，在线优先直写
- **安全基线**：上传 Magic Number 校验 + sharp 重编码（剥离 EXIF/GPS）、Markdown 白名单净化、登录限流 + 失败锁定、会话落库可撤销、CSP / HSTS 等安全头

## 🏗️ 技术架构

分层架构，业务逻辑 / 数据访问 / 协议转换清晰分离：

```
Next.js 15 App Router
├── 页面层      Server Components（app/*：travel / album / circle / space / me / timeline / dashboard）
├── 协议层      API Routes（app/api/*）+ Middleware（middleware.ts，JWT 鉴权）
├── 业务模块    lib/modules/*（travel / space / memory / social / album / offline / export …，access 统一权限域）
├── 服务与数据  lib/services · lib/repositories（会话 / 用户等落库访问）
├── 基础设施    lib/infrastructure（缓存 / 对象存储（本地 or S3 兼容）/ 限流 / 上传校验 / Zod 验证）
└── 数据层      Prisma + MySQL（lib/prisma-adapter.ts 自定义 mysql2 适配器）
```

依赖注入容器 `lib/container.ts` 提供单例 Service 工厂。移动端是同一前端的静态导出壳
（`scripts/build-mobile.cjs` → `www/`），API 走 `NEXT_PUBLIC_API_BASE` 指向服务端，
离线能力由本地 SQLite + 同步引擎提供。

## 🛠️ 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js（App Router）+ React | 15.5 / 19 |
| 语言 | TypeScript | 5.3+ |
| UI | Tailwind CSS + Lucide React | 3.4 / 1.31 |
| ORM / 数据库 | Prisma + MySQL / MariaDB | 7.9 / 8.0+ |
| 认证 | jose (JWT) + bcryptjs | 6.2 / 3.0 |
| 校验 | Zod | 4.4 |
| 媒体 | sharp（重编码 / 变体）+ 本地或 S3 兼容存储 | 0.35 |
| 可视化 | d3-geo + Three.js | 3.1 / 0.185 |
| 移动端 | Capacitor（Android，SQLite 离线层） | 8.5 |
| 邮件 | Nodemailer（SMTP） | 9.0 |
| 测试 | Vitest + Playwright | 4.1 / 1.63 |

## 🚀 部署方式

### 环境要求

- Node.js 18+（推荐 20 LTS），MySQL 8.0+ / MariaDB
- 可选：S3 兼容对象存储（配置 `STORAGE_*` 自动启用，否则使用本地 `public/uploads`）、SMTP（验证码 / 找回密码邮件）

### 本地开发

```bash
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
                            # 至少填写 DATABASE_URL 与 JWT_SECRET（openssl rand -hex 32）
npx prisma generate
npx prisma db push
npm run dev                 # http://localhost:3000，首次访问 /admin/setup 初始化管理员
```

### 生产部署（Docker · 推荐）

```bash
docker compose up -d --build   # 应用 + MySQL 一键启动
```

Nginx 反向代理与 HTTPS、备份与恢复、监控告警、磁盘清理、更新部署流程，
详见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

### 移动端（甜途 App · Android）

```bash
NEXT_PUBLIC_API_BASE=https://your-server.com node scripts/build-mobile.cjs
npx cap sync android
cd android && ./gradlew assembleRelease
```

- 发布分发：`scripts/publish-apk.cjs`（腾讯云 COS + CDN）或 `scripts/publish-apk-nginx.sh`（服务器 Nginx）
- 版本管理：`scripts/bump-version.cjs` 修改版本，`scripts/verify-version.cjs` 校验多处版本一致

## 📚 相关文档

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — 部署 / 运维 / 备份 / 监控手册
- [docs/design/改动记录.md](docs/design/改动记录.md) — 项目唯一改动记录（逐日追加）
- [docs/design/移动端设计规范.md](docs/design/移动端设计规范.md) — 移动端设计规范
- [CHANGELOG.md](CHANGELOG.md) — 版本变更

## 📄 License

MIT
