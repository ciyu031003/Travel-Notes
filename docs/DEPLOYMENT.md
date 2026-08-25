# Travel-Notes 部署与运维手册

> 本文件由原 5 份运维文档（DEPLOYMENT / SERVER_SETUP / DOCKER_DEPLOY / BACKUP_AND_MONITORING / EMAIL_SETUP）合并精简而来。
> 当前生产部署方式为 **Docker（MySQL 8.4 + Next.js）**，生产环境：IP `106.55.2.197`，域名 `travel-notes.yuanabd.cn`，应用监听内部 `3000` 端口，Nginx 反代。

---

## 一、架构与端口

| 组件 | 说明 |
|---|---|
| 应用容器 `travel-notes-app` | Next.js 15，监听容器内 `3000` |
| 数据库容器 `travel-notes-db` | MySQL 8.4（utf8mb4），named volume `mysql-data` |
| 上传文件 | named volume `uploads-data` → `/app/public/uploads` |
| Nginx | 宿主机反代 `80/443` → `127.0.0.1:3000`；`8443` 端口 HTTPS 对外 |

数据持久化在两个命名卷：`mysql-data`（数据库）与 `uploads-data`（上传文件），**删除容器不丢数据，`docker compose down -v` 才会清空**。

---

## 二、Docker 一键部署（推荐 · 当前方式）

```bash
# 首次/更新部署
cd /home/ubuntu/travel-notes
docker compose up -d --build app
```

首次启动会自动：
1. 从 `.env.example` 生成 `.env`（若不存在）
2. 生成 `JWT_SECRET` / `SESSION_SECRET` / `MYSQL_ROOT_PASSWORD`
3. 构建应用镜像（`npm ci` + `prisma generate` + `next build`）
4. 启动 MySQL 8.4 + 应用，容器内自动 `prisma db push` 建表

启动后访问 http://localhost:3000，前往 `/admin/setup` 初始化管理员。

### 常用命令

```bash
docker compose ps                      # 查看容器状态
docker compose logs -f app             # 查看应用日志
docker compose down                    # 停止（保留数据卷）
docker compose down -v                 # 停止并清空数据卷（危险）
docker compose up -d --build app       # 更新代码后重建
```

### 磁盘清理（重要）

每次 `--build` 会累积 docker build cache，曾导致磁盘 100% 打满、部署失败。已配置 cron **每周日 04:30** 自动清理：

```bash
bash /home/ubuntu/travel-notes/scripts/disk-clean.sh   # 手动执行清理
crontab -l                                              # 查看 cron
# 清理内容：docker builder prune -af / image prune -af / apt clean / journalctl vacuum
```

---

## 三、环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| `APP_PORT` | 宿主机映射端口 | 3000 |
| `MYSQL_ROOT_PASSWORD` | MySQL root 密码 | 自动生成 |
| `JWT_SECRET` / `SESSION_SECRET` | 会话签名密钥 | 自动生成 |
| `ADMIN_USERNAME` | 初始化管理员用户名 | admin |
| `ADMIN_PASSWORD_HASH` | 预置管理员密码哈希（可选） | 空 |
| `COOKIE_SECURE` | Cookie Secure（https 设 true） | false |
| `NEXT_PUBLIC_SITE_URL` | 站点 URL | http://localhost:3000 |
| `NEXT_PUBLIC_SITE_TITLE` | 站点标题 | Travel-Notes |
| `SMTP_*` + `MAIL_FROM` | 邮件发送（可选） | 空 |
| `STORAGE_*` | S3 兼容对象存储（可选） | 空 |

---

## 四、Nginx 反向代理与 HTTPS

### 4.1 反向代理

应用监听内部 `3000`，Nginx 反代（域名 `travel-notes.yuanabd.cn`，另有 `8443` 端口 HTTPS 直连）：

```nginx
server {
    listen 443 ssl;
    server_name travel-notes.yuanabd.cn;
    # ssl_certificate / ssl_certificate_key 由 certbot 自动生成

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    client_max_body_size 100m;   # 上传大小限制
}
```

> **注意**：中间件 CSRF 校验基于 `request.nextUrl.hostname`，走 IP 直连（`106.55.2.197:8443`）需确认 Nginx 正确透传 `Host` 头；历史已修复"反代透传 Host"以支持 IP 直连登录。

### 4.2 HTTPS 证书（Let's Encrypt）

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d travel-notes.yuanabd.cn
sudo certbot renew --dry-run          # 测试自动续期
# crontab 已内置自动续期：0 0 1 * * certbot renew --quiet
```

---

## 五、邮件服务（SMTP，可选）

在 `.env` 配置齐全后自动启用密码找回/邮箱验证：

| 变量 | 示例 |
|---|---|
| `SMTP_HOST` | smtp.qq.com |
| `SMTP_PORT` | 465 |
| `SMTP_USER` | 你的邮箱 |
| `SMTP_PASS` | 授权码（非登录密码） |
| `SMTP_SECURE` | true |
| `MAIL_FROM` | 你的邮箱 |

配置后重启应用生效。验证：走一遍 `/forgot-password` 发送验证码流程。

---

## 六、备份与恢复

### 6.1 数据库备份（cron）

```bash
crontab -e
# 每天凌晨 2:30 备份（SQL 输出到 backups/db/）
30 2 * * * cd /home/ubuntu/travel-notes && ./scripts/migrate-database.sh backup >> logs/backup.log 2>&1
```

保留策略：近 7 天每日、近 4 周每周、之后按月。

### 6.2 媒体备份

- 本地：`uploads-data` 卷（相册/视频）
- 对象存储：桶自带版本控制/生命周期

```bash
rclone sync public/uploads remote:trip-media --checksum   # 异地增量同步（示例）
```

### 6.3 环境配置备份

`.env` 含密钥，用密码管理器保存或 `gpg -c .env` 加密异地保存，**不要明文提交 Git**。

### 6.4 恢复演练（每季度一次）

```bash
./scripts/migrate-database.sh restore backups/db/xxx.sql
# 恢复媒体后 docker compose up -d，校验登录/列表/详情/相册/时间线正常
```

---

## 七、监控与告警

- **进程**：`docker compose ps` 确认两容器 Up/healthy；可接 Uptime Kuma 每 1 分钟 GET `/` 与 `/api/health`
- **健康检查**：`/api/health` 返回 `{"status":"ok","db":"ok","version":...}`（含 DB ping）
- **日志**：`docker compose logs -f app`；错误写 `console.error`
- **告警阈值**：磁盘 >80%、备份连续失败、探活连续失败、登录失败率异常升高（`AuditLog` LOGIN 动作增多）

---

## 八、常见问题排查

| 现象 | 排查 |
|---|---|
| 502 Bad Gateway | `docker compose ps` 看容器是否 Up；`docker compose logs app` 看 Next.js 是否启动失败 |
| 构建 OOM | 2C2G 服务器 `next build` 可能 OOM，加 Swap 或 `NODE_OPTIONS=--max-old-space-size=512` |
| 磁盘打满 | 跑 `bash scripts/disk-clean.sh`；已配 cron 每周自动清 |
| 登录 403 | 检查 Nginx 是否透传 `Host`/`X-Forwarded-Host`（middleware CSRF 依赖） |
| 域名 443 连接重置 | 检查 Nginx/certbot 证书与 443 端口放行（与前端无关的历史观察项） |

---

## 九、更新部署（当前流程）

```bash
# 1) 本地打包源码（排除构建/数据目录）
tar -czf /tmp/tn-deploy.tar.gz --exclude=node_modules --exclude=.next --exclude=data \
  --exclude=content --exclude=.env --exclude=docs --exclude=android --exclude=www \
  --exclude=mysql-data --exclude=.git --exclude=tsconfig.tsbuildinfo .

# 2) 上传 + 解包（保留 .env/data/content）
scp /tmp/tn-deploy.tar.gz ubuntu@106.55.2.197:/tmp/
ssh ubuntu@106.55.2.197 "cd /home/ubuntu/travel-notes && tar -xzf /tmp/tn-deploy.tar.gz -C ."

# 3) 重建应用容器（数据库不动）
ssh ubuntu@106.55.2.197 "cd /home/ubuntu/travel-notes && docker compose up -d --build app"
```

> 服务器源码目录非 git 仓库，用「打包 → scp → 解包覆盖」方式同步，**务必排除 `.env`/`data`/`content` 以免覆盖生产数据**。
