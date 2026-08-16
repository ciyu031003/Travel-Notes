# Docker 一键部署

## 快速开始

```bash
# Linux / macOS
bash scripts/docker-deploy.sh

# 或手动执行
docker compose up -d --build
```

首次启动会自动：
1. 从 `.env.example` 生成 `.env`（若不存在）
2. 自动生成 `JWT_SECRET` / `SESSION_SECRET` / `MYSQL_ROOT_PASSWORD`
3. 构建 Next.js 应用镜像
4. 启动 MySQL 8.4 + 应用
5. 应用容器内自动执行 `prisma db push` 初始化表结构

启动完成后访问 http://localhost:3000，并前往 /admin/setup 完成管理员初始化。

## 常用命令

```bash
docker compose ps                 # 查看容器状态
docker compose logs -f app        # 查看应用日志
docker compose down               # 停止并删除容器（保留数据卷）
docker compose down -v            # 停止并删除容器与数据卷（清空数据库/上传文件）
docker compose up -d --build      # 重新构建并启动
```

## 环境变量

在项目根目录 `.env` 中配置（Docker Compose 自动读取用于变量替换）：

| 变量 | 说明 | 默认 |
|---|---|---|
| APP_PORT | 宿主机映射端口 | 3000 |
| MYSQL_ROOT_PASSWORD | MySQL root 密码 | 自动生成 |
| JWT_SECRET / SESSION_SECRET | JWT 签名密钥 | 自动生成 |
| ADMIN_USERNAME | 初始化管理员用户名 | admin |
| ADMIN_PASSWORD_HASH | 预置管理员密码哈希（可选） | 空 |
| COOKIE_SECURE | Cookie Secure 标记（https 时设 true） | false |
| NEXT_PUBLIC_SITE_URL | 站点 URL | http://localhost:3000 |
| SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_SECURE / MAIL_FROM | 邮件发送（可选） | 空 |
| STORAGE_ENDPOINT / STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY / STORAGE_BUCKET / STORAGE_REGION / STORAGE_PUBLIC_BASE_URL | S3 兼容对象存储（可选） | 空 |

> 数据持久化在两个命名卷：`mysql-data`（数据库）与 `uploads-data`（上传文件）。
