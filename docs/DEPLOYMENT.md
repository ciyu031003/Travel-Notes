# Travel-Notes 部署与运维手册

> 本文件由原 5 份运维文档（DEPLOYMENT / SERVER_SETUP / DOCKER_DEPLOY / BACKUP_AND_MONITORING / EMAIL_SETUP）合并精简而来。
> 当前生产部署方式为 **Docker（MySQL 8.4 + Next.js）**，生产环境：IP `106.55.2.197`，域名 `travel-notes.yuanabd.cn`，应用监听内部 `3000` 端口，Nginx 反代。

---

## 一、架构与端口

| 组件 | 说明 |
|---|---|
| 应用容器 `travel-notes-app` | Next.js 15，监听容器内 `3000` |
| 数据库容器 `travel-notes-db` | MySQL 8.4（utf8mb4），named volume `mysql-data` |
| 上传文件 | **COS 存储桶**（cosfs 挂载宿主机 `/data`）→ bind mount `/data/travel-notes/uploads` → `/app/public/uploads`（2026-09-06 迁移，原 `uploads-data` 卷保留作回滚备份，未删除） |
| Nginx | 宿主机反代 `80/443` → `127.0.0.1:3000`；`8443` 端口 HTTPS 对外 |

数据持久化：数据库在 named volume `mysql-data`（**不可迁移到对象存储挂载**，COSFS 无块设备语义）；媒体在 COS 桶 `/data/travel-notes/uploads`。**`docker compose down -v` 不会清空媒体数据**（bind mount），但会清空数据库卷——仍然禁止执行。

---

## 二、Docker 一键部署（推荐 · 当前方式）

```bash
# 首次/更新部署（.env 必须先准备好，见下方「升级注意」）
cd /home/ubuntu/travel-notes
docker compose up -d --build app
```

首次启动会：
1. 校验并读取 `.env`（**compose 不再提供可用的默认 DB 口令/会话密钥**，`__SET_..._IN_ENV__` 是占位符，不是可用值）
2. 三阶段构建应用镜像（deps → builder → runner）：builder 里先跑**构建门禁**（`npm run typecheck` + lint 预算 + `npm test`，任一失败镜像构建失败），再 `npx prisma generate` + `next build`；runner 只拷 `.next/public/prisma/scripts` 并 `npm prune --omit=dev`
3. 启动 MySQL 8.4 + 应用（非 root，uid=1000），容器 entrypoint 依次执行 `wait-for-db` → `migrate-bootstrap` → **`prisma migrate deploy`**（失败即退出，不再 `prisma db push`）

启动后访问 http://localhost:3000，前往 `/admin/setup` 初始化管理员。

### 升级注意（P2-33 镜像与 compose 加固，2026-10）

1. **`.env` 必设三件套（缺一不可）**：`MYSQL_ROOT_PASSWORD`、`JWT_SECRET`、`SESSION_SECRET`。compose 不再提供可用默认值，缺省时读到的是 `__SET_..._IN_ENV__` 占位串；**生产环境会拒绝含 `__SET_` 的密钥 → 启动失败 / 登录失败**，不要等到部署完才发现。生成并写入 `.env`（示例）：

   ```bash
   MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)   # 已有 mysql-data 卷的部署不要改：必须与卷内已有 root 密码一致
   JWT_SECRET=$(openssl rand -hex 32)
   SESSION_SECRET=$(openssl rand -hex 32)
   ```

   > 注意：**首次补齐 JWT_SECRET/SESSION_SECRET 会让当前所有登录会话失效**（Web 重新登录、App 重登一次），属预期；之后不要再随意轮换。
   > 自检：`docker compose config | grep -n "__SET_"` 应无输出；`docker compose up -d` 后 `docker compose ps` 应显示 `healthy`。
2. **容器改为非 root（uid=1000）**：媒体目录必须可写，升级前执行一次 `sudo chown -R 1000:1000 /data/travel-notes/uploads`；否则上传/转码会 EACCES。（`.next/cache` 等镜像内目录构建时已 chown 给 node，无需处理。）
3. **端口只绑回环**：改为 `127.0.0.1:${APP_PORT:-3000}:3000`，公网入口仍由 Nginx 反代；直接访问 `IP:3000` 不再可用（本就不该暴露）。
4. **日志轮转**：db/app 都配了 json-file `20m × 5`，`docker compose logs` 用法不变，但不会再无限增长占盘。
5. **健康检查**：compose 每 30s 请求 `/api/health`（DB 挂 → 503 → unhealthy），`docker compose ps` 会显示 healthy/unhealthy；镜像内也有同款 `HEALTHCHECK`。
6. **版本默认值单一来源**：compose 的 `APP_VERSION`/`APP_BUILD_NUMBER` 默认值由 `scripts/bump-version.cjs` 同步、`scripts/verify-version.cjs` 校验；发版只走这两个脚本，不要手改 compose。

### 数据库迁移（Prisma Migrate，P0-8）

**唯一真相是 `prisma/migrations/`，禁止再用 `prisma db push`。** 目前有三条迁移：

| 迁移 | 内容 | 谁用 |
|---|---|---|
| `20261018000000_init` | 存量库基线 = P1 之前的 schema（`CREATE TABLE` 全量） | 存量库由 bootstrap 标记为已应用；全新库直接执行 |
| `20261018120000_p1_indexes_and_site_role` | P1 新增索引 + P0 `User.siteRole` 列（`ALTER TABLE` / `CREATE INDEX`） | 所有库都会执行 |
| `20261019190000_sync_idempotency_and_tombstones` | B4：`ClientMutation` / `SyncTombstone` + 4 个 `updatedAt` 索引 | 所有库都会执行 |

**容器启动流程**（`scripts/docker-entrypoint.sh`，已无任何 `|| echo [warn]` 吞错）：

```text
wait-for-db → node scripts/migrate-bootstrap.cjs → npx prisma migrate deploy → npm run start
```

`migrate-bootstrap.cjs` 的分支：
1. 已有 `_prisma_migrations` 表 → 跳过（Migrate 已接管）；
2. 无 `_prisma_migrations` 且无 `User` 表 → 全新库：bootstrap 跳过，`migrate deploy` 从基线开始建表；
3. 无 `_prisma_migrations` 但有 `User` 表 → **存量库**：
   a. `prisma migrate resolve --applied 20261018000000_init` 把基线标记为已应用；
   b. 探测 P1 的 7 个对象（`User.siteRole` 列 + 6 个索引）：
      - **全部不存在** → 交给 deploy 正常应用增量迁移（原行为，零变化）；
      - **部分/全部已存在**（历史 `db push` 建过，典型 1061 现场）→ **自动修复**：
        1) `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` 计算 live → schema 缺失 SQL；
        2) 只应用**加法语句**（`CREATE TABLE` / `CREATE [UNIQUE] INDEX` / `ALTER TABLE ... ADD COLUMN`）；
           出现 `DROP` / `RENAME` / `MODIFY` / 数据语句时**中止**（绝不删数据），转手工兜底；
        3) 复核 diff 已为空后，把 `prisma/migrations` 里尚未记录的迁移逐个 `prisma migrate resolve --applied`；
        4) 返回 0，由 entrypoint 的 `migrate deploy` 收尾（应无待应用）。
   c. 任一步失败：**非 0 退出**并打印手工恢复指引（见下文「存量 db-push 库升级到 Migrate」），entrypoint 的 `set -e` 会阻止应用带不确定 schema 启动。

> 升级前仍建议先备份数据库（`scripts/backup-db.sh`）并保留旧镜像以便回滚。自动修复只做加法、不删除任何数据；
> 日志出现 `[migrate-bootstrap] ✅ 自动修复完成` 表示已自动对齐，无需人工介入。
> 本次增强的集成验证：临时 MySQL 上模拟 1.24.8 db-push 现场（无 `_prisma_migrations` + P1 对象已存在），
> 断言 bootstrap 成功、schema diff 0、迁移全部 applied（见 `tests/unit/migrate-bootstrap.integration.test.ts`，需 `TN_BOOTSTRAP_IT_DATABASE_URL`）。

**开发/CI 的漂移门禁**：

```bash
# 影子库必须先存在（CI 里由步骤 CREATE DATABASE IF NOT EXISTS 创建）
export SHADOW_DATABASE_URL="mysql://root:root@127.0.0.1:3306/travel_notes_shadow"
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code
```

Prisma 7 的 `--exit-code`：0 = 无漂移，2 = 有漂移（CI 红灯），1 = 命令本身出错。改了 `schema.prisma` 却忘了生成迁移，这个门禁会挡住。

> 注意：Prisma 7 的 `migrate diff --from-migrations` 不再接受 `--shadow-database-url` 参数，影子库地址由 `prisma.config.ts` 的 `datasource.shadowDatabaseUrl`（读 `SHADOW_DATABASE_URL` 环境变量）提供；本地不设该变量时普通 `migrate deploy` 不受影响。

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
| `MYSQL_ROOT_PASSWORD` | MySQL root 密码 | **必须设置**（无可用默认值） |
| `JWT_SECRET` / `SESSION_SECRET` | 会话签名密钥 | **必须设置**（无可用默认值） |
| `ADMIN_USERNAME` | 初始化管理员用户名 | admin |
| `ADMIN_PASSWORD_HASH` | 预置管理员密码哈希（可选） | 空 |
| `COOKIE_SECURE` | Cookie Secure（https 设 true；App 端登录已代码固定 SameSite=None+Secure） | false |
| `CORS_ALLOWED_ORIGINS` | 额外允许的跨域来源（英文逗号分隔、必须带协议）。App 本地壳的 `https://localhost`(Android) / `capacitor://localhost`(iOS) 已默认放行；自定义域名/端口才需要追加完整 origin | 空 |
| `NEXT_PUBLIC_SITE_URL` | 站点 URL | http://localhost:3000 |
| `NEXT_PUBLIC_SITE_TITLE` | 站点标题 | 甜途 |
| `APP_ENCRYPTION_KEY` | AppSecret 表（如 DASHSCOPE_API_KEY）的 AES-256-GCM 主密钥 | 空（未配置则敏感配置功能禁用） |
| `APP_VERSION` / `APP_BUILD_NUMBER` | OTA 版本（/api/version 供 App 检查更新；默认值由 `scripts/bump-version.cjs` 同步，`verify-version.cjs` 校验） | 1.24.8 / 54 |
| `APP_DOWNLOAD_URL` | 新版 APK 下载地址（COS/CDN 公开地址，可用 scripts/publish-apk.cjs 发布；nginx /downloads/ 仅作回退） | https://travel-notes.yuanabd.cn/downloads/tiantu.apk |
| `COS_ENDPOINT` / `COS_REGION` / `COS_BUCKET` / `COS_ACCESS_KEY_ID` / `COS_SECRET_ACCESS_KEY` / `COS_CDN_BASE_URL` | APK 上传腾讯云 COS 的发布配置（scripts/publish-apk.cjs） | 空 |
| `OIL_PAINT_ENABLED` | 油画生成（通义 API，按张计费）总开关，需为 `true` 才启用 | false |
| `SMTP_*` + `MAIL_FROM` | 邮件发送（可选） | 空 |
| `STORAGE_*` | S3 兼容对象存储（可选） | 空 |

> **CORS_ALLOWED_ORIGINS 怎么填（App 本地壳与自定义域名）**：App 本地壳（Capacitor）发出的请求带 `Origin: https://localhost`（Android WebView）或 `Origin: capacitor://localhost`（iOS）；新代码**默认始终放行这两个精确 origin**，不需要在 `.env` 里配置。只有当你用**自定义域名或非默认端口**访问 Web/App（例如 `https://photo.example.com:8443`）时，才需要把**完整 origin（协议 + 域名 + 端口）**写进 `CORS_ALLOWED_ORIGINS`，多个用英文逗号分隔：
>
> ```bash
> CORS_ALLOWED_ORIGINS=https://photo.example.com,https://photo.example.com:8443
> ```
>
> 注意：origin 是精确匹配，**不能写 `*`、也不能只写域名不带协议**；改完需重启 app 容器。

> **APP_ENCRYPTION_KEY 强度要求**：至少 32 字节随机值（`openssl rand -hex 32`）。该值经 SHA-256 归一后直接作为 AES-256 密钥，弱口令会被无盐归一掩盖成"合法"密钥——务必使用随机值，且一旦投入使用不可更换（换钥后已有密文无法解密）。可用 `node scripts/seed-secret.cjs` 写入密钥类敏感配置。

> **APK 分发（COS + CDN）**：新版 APK 先经 `node --env-file=.env scripts/publish-apk.cjs` 上传腾讯云 COS，脚本会输出 `APP_DOWNLOAD_URL`；未设置 `COS_OBJECT_KEY` 时对象 key 自动带版本号（如 `downloads/tiantu-1.5.0.apk`），避免 CDN 一年长缓存。生产 `.env` 填入脚本输出的 CDN 地址并 `docker compose up -d --build app` 后，`/api/version` 与 App 内更新入口即指向 CDN。`nginx /downloads/` 目录可保留作回退，需支持 `Range` 请求。

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
        # 安全（S-7）：用 $remote_addr 覆盖，绝不追加客户端自带的 XFF（见下方说明）
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    client_max_body_size 100m;   # 上传大小限制
}
```

> **注意**：中间件 CSRF 校验基于 `request.nextUrl.hostname`，走 IP 直连（`106.55.2.197:8443`）需确认 Nginx 正确透传 `Host` 头；历史已修复"反代透传 Host"以支持 IP 直连登录。

> **X-Forwarded-For 必须覆盖，不能追加**：应用侧限流/登录失败计数依赖 `getClientIp()`（`lib/request-utils.ts`）解析真实客户端 IP。若用 `$proxy_add_x_forwarded_for` 把客户端自带的 XFF 透传进来，攻击者每个请求伪造一个 IP 就能绕过按 IP 的限流（相册解锁爆破、登录爆破）；`X-Real-IP` 同理必须是 `$remote_addr`。
> 正确写法：`proxy_set_header X-Forwarded-For $remote_addr;`（已同步到 `docs/nginx.conf.example`）。改完 `sudo nginx -t && sudo systemctl reload nginx`，并用 `curl -H 'X-Forwarded-For: 1.2.3.4'` 验证应用日志里记录的仍是真实来源 IP。

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

### 6.1 数据库备份（cron，P0-9）

备份脚本：`scripts/backup-db.sh`（走 `docker compose exec -T db mysqldump --single-transaction --routines --triggers --events` → `backups/db/travel_notes-<时间戳>.sql.gz`，写完立刻 `gzip -t` 校验，默认保留 30 天）。

```bash
crontab -e
# 每天凌晨 2:30 备份（已写入 scripts/crontab.travel-notes）
30 2 * * * cd /home/ubuntu/travel-notes && bash scripts/backup-db.sh >> /home/ubuntu/travel-notes/logs/backup.log 2>&1
```

常用模式：

```bash
bash scripts/backup-db.sh                 # 立即备份
bash scripts/backup-db.sh --check         # 最近备份是否 <26h（部署脚本会调用）
bash scripts/backup-db.sh --list          # 列出备份
BACKUP_VERIFY_DB=travel_notes_verify bash scripts/backup-db.sh --verify   # 恢复演练
```

可选环境变量：`BACKUP_REMOTE=cos:bucket/travel-notes-db`（备份后 `rclone copy` 到远端，需先装 rclone）、`RETENTION_DAYS`（默认 30）、`MAX_AGE_HOURS`（默认 26）。

> 密码从 `.env` 的 `MYSQL_ROOT_PASSWORD` 读取；cron 环境的 PATH 要能找到 `docker`（默认 root crontab 有 `/usr/bin`，如用 ubuntu 用户请确认 docker 权限）。

### 6.2 媒体备份

- **当前：媒体已在 COS 存储桶**（cosfs 挂载 `/data/travel-notes/uploads`）——桶本身即云端持久化，按桶的版本控制/生命周期策略保护；回滚备份为迁移日快照 `/home/ubuntu/backups/uploads-data-20260906-014607.tar.gz`（216M，对应迁移前 named volume 全量）。
- 旧 `uploads-data` 卷仍在宿主机 `/var/lib/docker/volumes/travel-notes_uploads-data/`（未删除）。**确认 COS 运行稳定一段时间后可 `docker volume rm travel-notes_uploads-data` 回收**，删除前可再打一次 tar。

```bash
rclone sync public/uploads remote:trip-media --checksum   # 异地增量同步（示例）
```

### 6.3 环境配置备份

`.env` 含密钥，用密码管理器保存或 `gpg -c .env` 加密异地保存，**不要明文提交 Git**。

### 6.4 恢复演练（每季度一次，P0-9）

```bash
# 1) 把最近备份恢复到一个临时库（绝不指向生产库 travel_notes）
BACKUP_VERIFY_DB=travel_notes_verify bash scripts/backup-db.sh --verify
# 输出形如：verify_result=travel_notes_verify User=<行数>

# 2) 人工核对几组关键行数（User/Travel/Memory/Media 与生产对比量级）
docker compose exec -T db mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e \
  "SELECT (SELECT COUNT(*) FROM travel_notes.User) AS prod_users, (SELECT COUNT(*) FROM travel_notes_verify.User) AS verify_users;"

# 3) 确认后清理临时库
docker compose exec -T db mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e 'DROP DATABASE travel_notes_verify'
```

> 恢复演练失败（解压/导入/行数异常）必须当作真实故障处理：说明现有备份不可用，立即排查备份链路。

---

## 七、监控与告警

- **进程**：`docker compose ps` 确认两容器 Up/healthy（compose 已内置 app healthcheck，DB 挂会自动转 unhealthy）；可再接 Uptime Kuma 每 1 分钟 GET `/` 与 `/api/health`
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

> ⚠️ **构建前必须先清盘（强制）**：2026-09-15 磁盘被 containerd 泄漏快照打满（100%），
> 构建在导出镜像阶段失败（`no space left on device`），并波及同机另一项目容器被终止重启。
> 因此重建流程已脚本化为 `scripts/server-rebuild.sh`，**清盘是它的第一步**，不要再手工裸跑 `docker compose build`。

```bash
# 1) 本地打包源码（git archive 只含已提交内容，最干净）
#    有 tag 时优先 git archive <tag>（可追溯到具体发版，回滚同一 tag 即可）
git archive --format=tar.gz -o /tmp/tn-deploy.tar.gz HEAD

# 2) 上传
scp /tmp/tn-deploy.tar.gz ubuntu@106.55.2.197:/tmp/

# 3) 一键：清盘 → 空间校验 → 备份检查 → 解包 → 重建（镜像内跑 typecheck/lint/test） → 健康检查
ssh ubuntu@106.55.2.197 "bash /home/ubuntu/travel-notes/scripts/server-rebuild.sh"
```

`server-rebuild.sh` 的关键保障（P0-7/P0-9）：
- **① 先清盘**：调用 `scripts/disk-clean.sh`（只清 docker 构建缓存、dangling 镜像、
  `/tmp` 本项目历史部署包、containerd 泄漏挂载点、apt/journal），
  **不含 `docker volume prune`**，不使用 `docker image prune -a` —— 绝不触碰数据卷与其他项目的镜像。
- **② 空间闸门**：可用空间 < `MIN_FREE_MB`（默认 8000MB）直接中止，避免重现「磁盘打满 → 构建失败 → 波及同机项目」。
- **③ 备份闸门**：最近数据库备份必须 < 26h，否则中止并提示先跑 `bash scripts/backup-db.sh`；紧急情况可 `SKIP_BACKUP_CHECK=1` 显式跳过（会打印警告）。
- **④ 解包**：只清理归档中已不存在的源码，再覆盖解包。
- **⑤ 重建**：先记录部署前镜像 id 并另存为 `travel-notes-app:previous`，再 `docker compose up -d --build app`（镜像构建门禁失败则整个部署失败，旧容器继续跑）。
- **⑥ 健康检查**：`curl -fsS`（保留 Host 头）轮询 `/api/health` 最多 60s；失败时打印 `docker compose logs --tail 80 app`、打印回滚命令并 `exit 1`，**不会再打印「完成」**。

**回滚**（健康检查失败时脚本会直接打印这两条）：

```bash
sudo docker tag travel-notes-app:previous <部署前镜像 tag>   # 脚本输出里有具体 tag
sudo docker compose up -d --no-build --force-recreate app
```

> 服务器源码目录非 git 仓库，用「打包 → scp → 解包覆盖」方式同步。
> 若手工打包，**务必排除 `.env`/`data`/`content` 以免覆盖生产数据**；用 `git archive` 则自动只含已提交内容。

### 磁盘排障速查（磁盘异常时）

```bash
df -h /                                   # 看还剩多少
docker system df                          # docker 视角（Images / Build Cache / Volumes）
du -sh /var/lib/containerd /var/lib/docker /tmp
mount | grep containerd-mount             # ★ 失败构建泄漏的只读 overlay 挂载点
```

- 泄漏挂载点**不能直接 `rm`**（会报 `Read-only file system`），必须先 `umount`：
  ```bash
  sudo umount <mountpoint> || sudo umount -l <mountpoint>
  sudo rm -rf <mountpoint>
  ```
  卸载后空间由 containerd GC 回收（实测 98% → 68%，回收约 17G）。
- **失败构建会持续吞磁盘**：每失败一次都会新增 build cache 并再留泄漏点 —— 磁盘紧张时**不要反复重试构建**，先清空间。
- 常规清理：`bash scripts/disk-clean.sh`（支持 `DRY_RUN=1` 只报告不删除）。

---

## 十、主站（www.yuanabd.cn）增量资产

主站源码不在本仓库（实际在服务器 `/var/www/yuanabd/`，单文件 `index.html`）。
其新增资产已纳入版本控制，见 **`site/yuanabd/`**（含部署目标、`index.html` 需配合的 5 处改动、
nginx `/api/version` 同源代理配置、以及行为契约）。改主站请从该目录同步，不要直接手改服务器文件。

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

---

## 十二、媒体直出（可选 · 阶段 A A4）

> 背景：默认架构下所有媒体（/uploads 原图 + /api/uploads 变体）都经 Next.js Node 进程流式返回，
> 视频 seek 与按需 sharp 变体生成也占用 Node 事件循环。并发看图/视频时会拖高动态 API 延迟。
> 本方案把媒体从 Node 卸到 nginx 直出，**代码已就绪（UPLOAD_X_ACCEL=1 开关），按需启用**。

### 12.1 操作步骤（宿主机 + Docker）

1. 把上传卷从 named volume 改为 bind mount（便于 nginx 读盘），在 docker-compose.yml 的 app 服务下：

   ```yaml
   volumes:
     - /srv/travel-notes/uploads:/app/public/uploads   # 替换原来的 uploads-data:/app/public/uploads
   ```

   迁移旧数据（一次性）：`docker run --rm -v travel-notes_uploads-data:/src -v /srv/travel-notes/uploads:/dst alpine sh -c 'cp -a /src/. /dst/'`

2. 在 .env 增加 `UPLOAD_X_ACCEL=1`，重启应用：`docker compose up -d app`。

3. Nginx 增加内部直出 location（示例见 docs/nginx.conf.example）：

   ```nginx
   location ^~ /uploads/ {
       alias /srv/travel-notes/uploads/;
       access_log off;
       expires 7d;
       add_header Cache-Control "public, max-age=604800";
       add_header X-Content-Type-Options nosniff;
   }
   location ^~ /internal-uploads/ {
       internal;
       alias /srv/travel-notes/uploads/;
       access_log off;
       expires 1y;
       add_header Cache-Control "public, max-age=31536000, immutable";
   }
   ```

   `sudo nginx -t && sudo systemctl reload nginx`

4. 验证：请求任意媒体，响应头出现 X-Accel-Redirect 时由 nginx 直出；`curl -I` 确认不再经 Node 流式路径。

> 更彻底的方案（推荐后续做）：启用对象存储 + CDN（STORAGE_* 配置即启用），媒体 URL 直指 CDN，Node 零负担。


## 存量 db-push 库升级到 Migrate：自动修复 + 手工兜底（2026-10-19 实测 / 同日增强）

从 1.24.8 及更早版本（schema 由 prisma db push 维护）首次升级到含 Prisma Migrate 的版本时，
entrypoint 会把基线 `20261018000000_init` 标记为已应用，随后 `migrate deploy` 应用
`20261018120000_p1_indexes_and_site_role`。如果历史 db push 已经创建过其中某个索引
（典型：`Album_travelId_idx`），迁移会在该语句上报 P3018 / MySQL 1061（Duplicate key name），
容器退出（历史版本的表现；当前 bootstrap 会自动修复，见下）。

### 自动修复（默认路径，无需人工）

`scripts/migrate-bootstrap.cjs` 在标记基线后会探测 P1 的 7 个对象；只要发现**部分/全部已存在**，
就自动执行与人工恢复等价的修复（数据无损，只做加法）：

1. `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
   算出「库里还缺什么」；
2. **只应用加法语句**：`CREATE TABLE` / `CREATE [UNIQUE] INDEX` / `ALTER TABLE ... ADD COLUMN`。
   一旦 diff 里出现 `DROP` / `RENAME` / `MODIFY` / 数据语句 → **立即中止**（绝不删数据），转手工兜底；
3. 复核 diff 已为空后，把 `prisma/migrations/` 中尚未记录的迁移逐个 `prisma migrate resolve --applied`
   （若某条待 resolve 的迁移 SQL 含 `INSERT/UPDATE/DELETE` 数据回填 → 中止，避免跳过数据步骤）；
4. 交给 entrypoint 的 `migrate deploy` 收尾（应显示无待应用）。

成功标志（`docker compose logs app | grep migrate-bootstrap`）：

```text
[migrate-bootstrap] 检测到历史 db-push 已部分/全部创建 P1 对象（partial|all）→ 进入自动修复：
[migrate-bootstrap] ✅ 自动修复完成：缺失 DDL 已补齐、迁移已标记，migrate deploy 将无待应用。
```

修复失败时脚本**非 0 退出**（entrypoint `set -e` 阻止应用启动），并打印下面手工步骤；
所有分支都不会删除/回滚任何数据。再次运行是幂等的（已有 `_prisma_migrations` → 直接跳过）。

### 手工兜底（仅当自动修复中止/失败）

触发条件：diff 含破坏性语句（DROP/RENAME/MODIFY）、待 resolve 的迁移含数据回填、DDL 执行报错。
此时脚本 stderr 会给出同样的指引。步骤（数据无损，改造前已手工验证）：
1. 先确认失败迁移：`docker exec travel-notes-db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot travel_notes -e "SELECT migration_name,finished_at,rolled_back_at FROM _prisma_migrations"' `
2. 计算「库里还缺什么」：`docker compose run --rm --no-deps --entrypoint sh app -c 'cd /app && npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script' > /tmp/diff.sql`
3. **审阅** `/tmp/diff.sql`（自动修复中止时通常含 RENAME/DROP，需人工判断）：先备份（`scripts/backup-db.sh`），
   确认后执行：`docker cp /tmp/diff.sql travel-notes-db:/tmp/ && docker exec travel-notes-db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot travel_notes < /tmp/diff.sql'`
4. 把失败的 P1 与后续迁移标记为已应用：
   `docker compose run --rm --no-deps --entrypoint sh app -c 'cd /app && npx prisma migrate resolve --applied 20261018120000_p1_indexes_and_site_role && npx prisma migrate resolve --applied 20261019190000_sync_idempotency_and_tombstones'`
5. 清理失败历史行（可选，否则 /api/health 会因「已回滚」行报 pending）：
   `DELETE FROM _prisma_migrations WHERE migration_name='20261018120000_p1_indexes_and_site_role' AND finished_at IS NULL;`
6. 重启：`docker compose up -d --no-build app`，确认 `/api/health` 200 且 migrations=ok。

### 验证

- 单测：`npx vitest run tests/unit/migrate-bootstrap.test.ts`（SQL 加法过滤 / 对象探测 / 迁移目录 / CLI 快速失败）。
- 集成（需临时 MySQL；CI 的 mysql service 或本机实例）：

  ```bash
  export TN_BOOTSTRAP_IT_DATABASE_URL="mysql://root@127.0.0.1:13307/tn_bootstrap_it"
  npx vitest run tests/unit/migrate-bootstrap.integration.test.ts
  ```

  覆盖两种历史现场：①P1 的 7 个对象全部已存在（P3018 现场）；②仅缺 `Media_storageKey_idx`
  （真正 partial）。断言 bootstrap 成功、schema diff 0、迁移全部 applied、再次运行走跳过分支、
  全新空库零行为变化。

> 升级前仍建议：备份数据库（`scripts/backup-db.sh`）、保留旧镜像以便回滚。
