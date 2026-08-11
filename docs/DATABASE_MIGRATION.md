# 数据库迁移与低内存构建指南

> 适用场景：2C2G 低配服务器构建优化、服务器迁移（数据库 + 附件 + 代码）。
> 文档版本：v1.0（2026-08-10）

---

## 一、数据库迁移脚本

项目内置数据库迁移脚本 `scripts/migrate-database.sh`，支持**备份、恢复、列表、校验**四个子命令，用于服务器迁移时导出旧库、导入新库并校验。

### 1.1 前置条件

- 脚本从项目根目录 `.env` 读取 `DATABASE_URL`（格式：`mysql://user:pass@host:port/dbname`）
- 需要 MySQL 客户端：
  - **旧服务器（导出）**：需要 `mysqldump`
  - **新服务器（导入）**：需要 `mysql`
  - 安装：
    ```bash
    # Ubuntu / Debian
    sudo apt-get install -y mysql-client
    # CentOS / RHEL
    sudo yum install -y mysql
    ```

### 1.2 子命令说明

```bash
./scripts/migrate-database.sh backup [DIR]                # 导出备份
./scripts/migrate-database.sh restore <file.sql|.sql.gz>    # 恢复（自动建库）
./scripts/migrate-database.sh list                          # 列出已有备份
./scripts/migrate-database.sh verify                        # 校验表结构与数据量
./scripts/migrate-database.sh help                          # 帮助
```

| 命令 | 说明 |
|------|------|
| `backup` | 用 `mysqldump --single-transaction --routines --triggers` 导出当前库，默认存到 `backups/db/<库名>_<时间戳>.sql`，可用 `--dir` 指定目录 |
| `restore <file>` | 自动创建数据库（utf8mb4），导入 `.sql` 或 `.sql.gz`，导入后自动执行 `verify` |
| `list` | 列出备份目录下所有备份文件 |
| `verify` | 连接当前库，列出全部表及行数，并检查 9 张关键表（Post / SiteSetting / PostImage / Danmaku / Repo / TokenBlacklist / Moment / Like / PhotoMessage）是否存在；缺失时提示运行 `node migrate-db.cjs` 自动建表/补列 |

### 1.3 使用示例

```bash
# 旧服务器：导出备份
cd /home/code/Travel-Notes
./scripts/migrate-database.sh backup
# 输出: backups/db/Travel_And_Study_20260810_120000.sql

# 将备份文件传输到新服务器
scp backups/db/Travel_And_Study_20260810_120000.sql user@新服务器:/home/code/Travel-Notes/backups/db/

# 新服务器：恢复 + 自动校验
cd /home/code/Travel-Notes
./scripts/migrate-database.sh restore backups/db/Travel_And_Study_20260810_120000.sql
```

---

## 二、服务器迁移完整流程

> 目标：把站点从旧服务器迁移到新服务器（含数据库、上传文件、代码、配置）。

### 2.1 旧服务器：备份

```bash
cd /home/code/Travel-Notes

# 1. 备份数据库
./scripts/migrate-database.sh backup

# 2. 打包上传目录（图片、视频）
tar -czf uploads-backup.tar.gz public/uploads

# 3. 如需保留内容/仓库目录（Markdown 文章与代码仓库快照）
tar -czf content-backup.tar.gz content

# 4. 确认备份文件
ls -lh backups/db/*.sql uploads-backup.tar.gz content-backup.tar.gz
```

### 2.2 传输到新服务器

```bash
# 任选一种：
scp backups/db/*.sql uploads-backup.tar.gz content-backup.tar.gz user@新服务器:/tmp/
# 或使用 rsync（大文件推荐）
rsync -avP backups/db/ uploads-backup.tar.gz content-backup.tar.gz user@新服务器:/tmp/
```

### 2.3 新服务器：部署 + 恢复

```bash
# 1. 拉取代码（或复制代码目录）
git clone git@github.com:ciyu031003/Travel-Notes.git /home/code/Travel-Notes
cd /home/code/Travel-Notes

# 2. 配置环境变量
cp .env.example .env
nano .env   # 修改 DATABASE_URL / JWT_SECRET / NEXT_PUBLIC_SITE_URL 等

# 3. 恢复数据库（自动建库 + 导入 + 校验）
./scripts/migrate-database.sh restore /tmp/Travel_And_Study_xxx.sql

# 4. 恢复上传文件与内容目录
mkdir -p public/uploads
tar -xzf /tmp/uploads-backup.tar.gz -C public/
tar -xzf /tmp/content-backup.tar.gz -C .

# 5. 一键部署（安装依赖 → 低内存构建 → PM2 启动 → 预热）
./deploy.sh --force
```

### 2.4 迁移后校验

```bash
./scripts/migrate-database.sh verify          # 表结构与数据量
curl -I http://localhost:3000/                 # 首页可访问
pm2 logs travel-notes --lines 50               # 无报错日志
```

---

## 三、2C2G 低内存构建优化

Next.js 15 在 2G 内存服务器上 `npm run build` 容易 OOM（内存峰值可达 3-4GB）。项目已内置以下三重优化：

### 3.1 低内存构建脚本（推荐）

```bash
./scripts/build-production.sh
```

脚本做了 4 件事：

1. **限制 Node 堆内存**：`NODE_OPTIONS=--max-old-space-size=1536`（可用 `BUILD_NODE_MAX_OLD_SPACE=1024` 自定义更小值）
2. **构建期跳过数据库读取**：设置 `SKIP_DB_ON_BUILD=1`，`next build` 阶段页面预渲染为轻量壳（不连数据库），运行时由 ISR（`revalidate=300`）按需生成真实内容 → 内存峰值与构建时间大幅下降
3. **构建前清理 `.next` 缓存**，失败后自动清理并重试一次
4. **内存检测**：内存不足且无 Swap 时给出创建 Swap 的提示

> 说明：`deploy.sh` 已自动调用该脚本，无需手动执行。

### 3.2 Swap 交换分区（强烈建议）

2G 内存 + 2~4G Swap 是 Next.js 构建的稳妥组合。`deploy.sh` 会自动检测并引导创建；手动创建：

```bash
sudo fallocate -l 4G /swapfile      # 2G 内存建议 4G；内存更大可用 2G
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl -w vm.swappiness=60
```

### 3.3 构建选项参考

| 环境变量 | 作用 | 默认 |
|---------|------|------|
| `BUILD_NODE_MAX_OLD_SPACE` | Node 堆内存上限（MB） | `1536` |
| `SKIP_DB_ON_BUILD` | 构建期跳过数据库读取 | `1`（构建脚本内设置） |
| `SKIP_TSC` | 跳过 TypeScript 类型检查（极端低内存，不推荐） | 未设置 |

### 3.4 部署后 ISR 预热

由于低内存构建时页面是"空壳"，`deploy.sh` 在健康检查后会自动**预热**首页/旅行/博客/思维导图/标签/RSS 等 ISR 页面，让真实内容立即生成，避免用户首访看到空白。

### 3.5 静态全文搜索索引

项目前端 /search 页与命令面板（Ctrl/⌘+K）默认使用**本地静态索引**即时检索，避免每次搜索都打数据库 LIKE 查询：

- 部署时 deploy.sh 在构建完成后自动运行 
ode scripts/build-search-index.cjs，直连数据库 + 读取 content/ 下的 Markdown 文章，生成 public/search-index.json
- 索引不可用（未生成 / 加载失败）时，前端自动回退到服务端 /api/search
- 手动重新生成：
pm run search:index
- 该文件已在 .gitignore 中，不会提交到仓库

### 3.6 运行期内存

- 运行期（PM2 单实例）占用远低于构建期，2C2G 足够
- 项目使用内存缓存 + ISR，普通个人站流量下无需 Redis（后续升级服务器后可再引入）

---

## 四、相关文件索引

| 文件 | 说明 |
|------|------|
| `scripts/migrate-database.sh` | 数据库迁移脚本（备份/恢复/列表/校验） |
| `scripts/build-production.sh` | 低内存构建脚本 |
| `scripts/build-search-index.cjs` | 静态全文搜索索引生成脚本（部署后自动执行，生成 `public/search-index.json`） |
| `deploy.sh` | 一键部署脚本（已集成低内存构建 + Swap 检测 + ISR 预热） |
| `migrate-db.cjs` | 建表/补列脚本（Post/SiteSetting/TokenBlacklist/Moment/Like/PhotoMessage 等，幂等可重复执行） |
| `docs/SERVER_SETUP.md` | 服务器初始化与手动部署指南 |
| `docs/DEPLOYMENT.md` | 阿里云 ECS 部署指南 |
