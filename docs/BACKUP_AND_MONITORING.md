# 备份与监控运维指南

旅行照片与回忆属于高价值数据。本指南覆盖 Phase 7 的备份、恢复演练与监控接入建议。

## 1. 数据库备份

项目已内置 `scripts/migrate-database.sh`（备份/恢复/列表/校验）。

### 每日定时备份（cron）

```bash
# 编辑 crontab
crontab -e

# 每天凌晨 2:30 备份数据库（脚本会把 SQL 输出到 backups/db/）
30 2 * * * cd /home/code/Travel-Notes && ./scripts/migrate-database.sh backup >> logs/backup.log 2>&1
```

建议保留策略：最近 7 天每日、最近 4 周每周、之后按月，定期清理过期备份。

## 2. 媒体备份

- 本地存储：`public/uploads/`（相册、视频、导出后的 Media 文件）
- 对象存储（S3/MinIO/R2/OSS）：依赖桶自带版本控制与生命周期策略

```bash
# 每日增量同步到异地（示例：rclone 或 rsync）
rclone sync public/uploads remote:trip-media --checksum
```

## 3. 环境配置备份

`.env` 包含 JWT_SECRET / DATABASE_URL / SMTP 密码等敏感信息，建议：

- 使用密码管理器保存（Bitwarden/1Password）
- 或加密后异地保存：`gpg -c .env`（不要明文提交到 Git）

## 4. 恢复演练（必须定期做）

至少每季度做一次真实恢复演练：

```bash
# 1) 准备一台干净服务器或本地临时目录
# 2) 恢复数据库
./scripts/migrate-database.sh restore backups/db/Travel_And_Study_xxx.sql

# 3) 恢复媒体
mkdir -p public/uploads
rclone copy remote:trip-media public/uploads

# 4) 启动并校验
npm run start
curl -I http://localhost:3000/
pm2 logs travel-notes --lines 50
```

验收标准：登录、旅行列表/详情、相册图片、时间线均正常；无 500/空白页。

## 5. 监控与错误追踪

### 5.1 进程监控

- PM2 自带 `pm2 monit` 与异常自动重启
- 可接入 Uptime Kuma 做 HTTP 探活（建议每 1 分钟 GET `/` 与 `/api/check-auth`）

### 5.2 错误追踪

当前服务端错误写 `console.error`，PM2 日志位于 `~/.pm2/logs/`。生产环境建议接入 Sentry：

```bash
npm install @sentry/nextjs
npx @sentry/wizard -i nextjs
```

接入后在 `instrumentation.ts` / `next.config.js` 按向导配置 DSN，即可捕获前端异常与服务端 API 错误。

### 5.3 日志检查

```bash
pm2 logs travel-notes --lines 200 --err
grep -i "error" ~/.pm2/logs/travel-notes-error.log | tail -50
```

## 6. 告警建议

- 磁盘使用率 > 80%
- 数据库备份连续失败
- 首页 / API 探活连续失败
- 登录失败率异常升高（审计日志 `AuditLog` 中 LOGIN 动作增多）
