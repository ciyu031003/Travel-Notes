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
| `APP_ENCRYPTION_KEY` | AppSecret 表（如 DASHSCOPE_API_KEY）的 AES-256-GCM 主密钥 | 空（未配置则敏感配置功能禁用） |
| `OIL_PAINT_ENABLED` | 油画生成（通义 API，按张计费）总开关，需为 `true` 才启用 | false |
| `SMTP_*` + `MAIL_FROM` | 邮件发送（可选） | 空 |
| `STORAGE_*` | S3 兼容对象存储（可选） | 空 |

> **APP_ENCRYPTION_KEY 强度要求**：至少 32 字节随机值（`openssl rand -hex 32`）。该值经 SHA-256 归一后直接作为 AES-256 密钥，弱口令会被无盐归一掩盖成"合法"密钥——务必使用随机值，且一旦投入使用不可更换（换钥后已有密文无法解密）。可用 `node scripts/seed-secret.cjs` 写入密钥类敏感配置。

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

---

## 4.3 IP 直连 `8443` 证书（保持 IP 可访问）

> **背景**：`8443` 端口面向 IP `106.55.2.197` 直连访问。原配置直接复用 Let's Encrypt 域名证书（`travel-notes.yuanabd.cn`），其 SAN 不包含 IP，导致浏览器访问 `https://106.55.2.197:8443` 时提示 **`NET::ERR_CERT_COMMON_NAME_INVALID`**（证书与访问的 IP 不匹配，无法进入）。域名 `travel-notes.yuanabd.cn` 走 `443` 不受影响。

**解决方案**：为 `8443` 单独签发一个本地 CA 自签证书，SAN 同时包含 `IP:106.55.2.197` 与 `DNS:travel-notes.yuanabd.cn`，并让 nginx `8443` 块使用该证书；`443` 域名块仍由 certbot 管理的 Let's Encrypt 证书服务（不改动）。

### 证书存放（服务器 `/etc/nginx/ssl/travel-notes-ip/`）

| 文件 | 说明 | 是否可分发 |
|---|---|---|
| `ca.crt` | 本地 CA（公开） | ✅ 可安装到各设备作为受信任根 |
| `server.key` | 叶子私钥 | ❌ 仅服务器保留，勿外传/入库 |
| `server.crt` | 叶子证书（SAN 含 IP） | ✅ |
| `chain.crt` | `server.crt` + `ca.crt` 拼接链 | ✅（nginx 实际引用） |

nginx `8443` 块关键行：

```nginx
server {
    listen 8443 ssl;
    listen [::]:8443 ssl;
    server_name 106.55.2.197;
    client_max_body_size 100m;

    location / { proxy_pass http://127.0.0.1:3000; /* … */ }

    ssl_certificate         /etc/nginx/ssl/travel-notes-ip/chain.crt;
    ssl_certificate_key     /etc/nginx/ssl/travel-notes-ip/server.key;
    ssl_trusted_certificate /etc/nginx/ssl/travel-notes-ip/ca.crt;
    include                 /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam             /etc/letsencrypt/ssl-dhparams.pem;
}
```

### 客户端处理

- **临时访问**：浏览器首次会提示「证书不受信任（自签名）」，点「高级 → 继续前往 …」即可（证书已与 IP 匹配，只是 CA 未受信任）。
- **消除提示（推荐）**：将本仓库 `docs/certs/travel-notes-ca.crt` 导入/安装为受信任根证书（每台设备一次）；之后访问 `https://106.55.2.197:8443` 将完全信任、无警告。

### 重新生成（私钥保留在服务器）

```bash
DIR=/etc/nginx/ssl/travel-notes-ip
sudo mkdir -p "$DIR" && cd "$DIR"
# CA
sudo openssl genrsa -out ca.key 4096
sudo openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -out ca.crt \
  -subj '/CN=Travel Notes Local CA' \
  -addext 'basicConstraints=critical,CA:TRUE' -addext 'keyUsage=critical,keyCertSign,cRLSign'
# 叶子证书（SAN 含 IP + 域名）
printf '%s\n' '[req]' 'distinguished_name=dn' '[dn]' '[v3_req]' 'subjectAltName=@alt_names' \
  '[alt_names]' 'IP.1=106.55.2.197' 'DNS.1=travel-notes.yuanabd.cn' | sudo tee server.cnf >/dev/null
sudo openssl genrsa -out server.key 2048
sudo openssl req -new -key server.key -out server.csr -config server.cnf -subj '/CN=106.55.2.197'
printf '%s\n' 'basicConstraints=critical,CA:FALSE' 'keyUsage=critical,digitalSignature,keyEncipherment' \
  'extendedKeyUsage=serverAuth' 'subjectAltName=@alt_names' '[alt_names]' 'IP.1=106.55.2.197' \
  'DNS.1=travel-notes.yuanabd.cn' | sudo tee chain.cnf >/dev/null
sudo openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 3650 -sha256 -extfile chain.cnf
sudo sh -c 'cat server.crt ca.crt > chain.crt'
sudo nginx -t && sudo systemctl reload nginx
```

> **注意**：`8443` 的自签证书**不会被 certbot 自动续期**（有效期 10 年），也不会被 `certbot renew` 覆盖；`443` 域名证书仍由 certbot 正常管理。
