# Travel-Notes 服务器部署配置文档

> 基于阿里云 Ubuntu 20.04+ 系统，记录完整的从零部署流程及常见问题解决方案。

---

## 一、环境要求

| 组件 | 最低版本 | 推荐版本 |
|------|---------|---------|
| 操作系统 | Ubuntu 20.04 / CentOS 7 | Ubuntu 22.04 |
| Node.js | 18.x | 20.x LTS |
| MySQL | 8.0+ | 8.0+ |
| 内存 | 2GB | 4GB+ |
| 带宽 | 1Mbps | 3Mbps+ |

---

## 二、服务器端口配置

在阿里云控制台「安全组」中开放以下端口：

| 端口 | 用途 | 必开 |
|------|------|------|
| 22 | SSH 远程连接 | ✅ |
| 80 | HTTP 访问（Nginx） | ✅ |
| 443 | HTTPS 访问 | 推荐 |
| 3306 | MySQL（仅远程管理时需要） | 可选 |

---

## 三、Node.js 安装（重点）

### ⚠️ 常见坑：Ubuntu 默认源安装的 Node.js 版本过旧

Ubuntu 默认 `apt install nodejs` 安装的是 v12.x，**无法运行 Next.js 15**，必须使用以下方法安装 v20。

### 方法一：NodeSource 源安装（推荐）

```bash
# 1. 卸载系统自带的旧版本
sudo apt remove -y nodejs npm libnode-dev libnode72 2>/dev/null
sudo apt autoremove -y

# 2. 清理残留文件
sudo rm -rf /usr/include/node
sudo rm -f /usr/bin/node /usr/bin/npm /usr/bin/npx

# 3. 安装 NodeSource 仓库
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# 4. 安装 Node.js 20
sudo apt install -y nodejs

# 5. 验证
node -v   # 应显示 v20.x.x
npm -v    # 应显示 10.x.x 或 12.x.x
```

### 方法二：nvm 版本管理（更灵活）

```bash
# 1. 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# 2. 加载 nvm
source ~/.bashrc

# 3. 安装并切换到 Node 20
nvm install 20
nvm use 20
nvm alias default 20

# 4. 验证
node -v
```

### 安装 PM2 进程管理器

```bash
npm install -g pm2

# 设置开机自启（执行后按提示复制命令再执行）
pm2 startup
```

---

## 四、MySQL 数据库配置

### 4.1 安装 MySQL

```bash
# Ubuntu
sudo apt update
sudo apt install -y mysql-server

# 启动并设置开机自启
sudo systemctl start mysql
sudo systemctl enable mysql

# 验证
sudo systemctl status mysql
```

### 4.2 安全初始化

```bash
# 运行安全向导
sudo mysql_secure_installation
```

按提示设置：
- 设置 root 密码
- 移除匿名用户：Y
- 禁止 root 远程登录：Y（安全考虑）
- 移除测试数据库：Y
- 重新加载权限表：Y

### 4.3 创建项目数据库和用户

```bash
# 登录 MySQL
mysql -u root -p

# 执行以下 SQL
```

```sql
-- 创建数据库
CREATE DATABASE Travel_And_Study
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 创建专用用户（推荐使用，不要用 root）
CREATE USER 'travel'@'localhost'
  IDENTIFIED BY '你的强密码';

-- 授权
GRANT ALL PRIVILEGES ON Travel_And_Study.*
  TO 'travel'@'localhost';

-- 刷新权限
FLUSH PRIVILEGES;

-- 退出
exit
```

### 4.4 验证连接

```bash
mysql -u travel -p
# 输入密码后执行：
USE Travel_And_Study;
SHOW TABLES;
exit
```

---

## 五、项目部署

### 5.1 获取代码

```bash
# 创建项目目录
sudo mkdir -p /home/code
cd /home/code

# 克隆代码
git clone https://github.com/ciyu031003/Travel-Notes.git
cd Travel-Notes
```

### 5.2 配置环境变量

```bash
# 复制模板
cp .env.example .env

# 编辑配置
nano .env
```

写入以下内容（**根据实际情况修改**）：

```env
# 数据库连接（使用上面创建的用户和密码）
DATABASE_URL="mysql://travel:你的强密码@localhost:3306/Travel_And_Study"

# 管理员账号
ADMIN_USERNAME="yuanabd"

# 管理员密码 Hash（下一步生成）
ADMIN_PASSWORD_HASH=""

# Session 密钥（用 openssl rand -hex 32 生成）
SESSION_SECRET="替换为随机字符串"
```

#### 生成密码 Hash

```bash
cd /home/code/Travel-Notes

# ⚠️ 必须先执行 npm install 才能使用 bcryptjs
node -e "const b=require('bcryptjs');b.hash('你的管理员密码',10).then(h=>console.log(h))"
```

将输出的 Hash 值填入 `.env` 的 `ADMIN_PASSWORD_HASH` 字段。

### 5.3 安装依赖

```bash
cd /home/code/Travel-Notes

# ⚠️ 重要：使用 --legacy-peer-deps 避免 React 19 依赖冲突
npm install --legacy-peer-deps
```

> **为什么需要 `--legacy-peer-deps`？**
> `lucide-react@0.344.0` 的 peer dependency 声明只支持 React 16/17/18，
> 但项目使用 React 19，会导致 `npm install` 报 `ERESOLVE` 错误。
> 使用此参数可跳过 peer dependency 检查，不影响运行。

### 5.4 数据库同步

```bash
# 生成 Prisma Client
npx prisma generate

# 同步数据库表结构
npx prisma db push
```

### 5.5 构建项目

```bash
npm run build
```

> **注意**：构建可能需要 2-5 分钟。如果服务器内存不足，可添加 Swap：
> ```bash
> sudo fallocate -l 2G /swapfile
> sudo mkswap /swapfile
> sudo swapon /swapfile
> echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
> ```

### 5.6 启动项目

```bash
# 使用 PM2 启动
pm2 start npm --name "travel-notes" -- start

# 查看状态（应显示 online）
pm2 status

# 查看日志（确认无错误）
pm2 logs travel-notes

# 保存开机自启
pm2 save
```

### 5.7 PM2 常用命令

```bash
pm2 list              # 查看所有进程
pm2 restart travel-notes   # 重启
pm2 stop travel-notes      # 停止
pm2 delete travel-notes    # 删除
pm2 logs travel-notes      # 查看日志
pm2 monit                  # 监控面板
```

---

## 六、Nginx 配置

### 6.1 安装 Nginx

```bash
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 6.2 创建站点配置

```bash
sudo nano /etc/nginx/conf.d/travel-notes.conf
```

写入以下内容（**替换域名**）：

```nginx
server {
    listen 80;
    server_name 你的域名或服务器IP;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/javascript application/json image/svg+xml;

    # 静态资源长期缓存
    location /_next/static/ {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 200 7d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # 主站反向代理
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }
}
```

### 6.3 检查并重载

```bash
# 检查配置语法
sudo nginx -t

# 重载配置
sudo systemctl reload nginx
```

### 6.4 验证

```bash
# 本机测试
curl http://localhost:3000
curl http://localhost

# 外部访问
# 浏览器打开 http://你的服务器IP
```

---

## 七、HTTPS 配置（推荐）

### 7.1 使用 certbot 获取免费证书

```bash
# 安装 certbot
sudo apt install -y certbot python3-certbot-nginx

# 自动获取并配置证书（替换为你的域名）
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# 测试自动续期
sudo certbot renew --dry-run
```

### 7.2 域名解析

在阿里云控制台「云解析 DNS」添加：

| 记录类型 | 主机记录 | 记录值 |
|---------|---------|--------|
| A | @ | 服务器公网 IP |
| A | www | 服务器公网 IP |

---

## 八、日常更新部署

### 8.1 手动更新（了解原理即可，推荐使用 8.2 一键脚本）

```bash
cd /home/code/Travel-Notes

# 拉取最新代码
git pull

# 安装新依赖（如有）
npm install --legacy-peer-deps

# 生成 Prisma Client（每次都执行，避免 TypeScript 类型错误）
npx prisma generate

# 同步数据库变更（如有表结构修改）
npx prisma db push

# 重新构建
npm run build

# 重启服务
pm2 restart travel-notes
```

### 8.2 一键部署脚本（推荐）

项目根目录已内置 `deploy.sh` 脚本，自动完成环境检测、代码拉取、依赖安装、Prisma Client 生成、数据库结构同步、项目构建、PM2 重启、Nginx 检查和健康检查。

#### 基本用法

```bash
cd /home/code/Travel-Notes
git pull          # 先拉取最新代码（含 deploy.sh 本身的更新）
chmod +x deploy.sh  # 首次使用需赋执行权限
./deploy.sh
```

#### 命令选项

| 选项 | 说明 |
|------|------|
| `--clean` | 清理 node_modules 后重新安装（解决依赖损坏问题） |
| `--skip-pull` | 跳过 git pull（已手动拉取代码时使用） |
| `--no-backup` | 跳过数据库备份（首次部署可用） |
| `--skip-build` | 跳过构建步骤（仅重启服务时使用） |
| `--force` | 跳过所有确认提示，直接执行 |
| `--help` | 显示帮助信息 |

#### 常见场景

```bash
# 标准部署（最常用）
./deploy.sh

# 依赖损坏，清理后重新安装
./deploy.sh --clean

# 已手动 git pull，仅构建+重启
./deploy.sh --skip-pull

# 全自动部署（CI/CD 场景）
./deploy.sh --force

# 首次部署（无需备份已有数据库）
./deploy.sh --no-backup --force
```

#### 脚本功能说明

1. **操作系统检测**：自动识别 Ubuntu/Debian/CentOS/RHEL 等，选择正确的包管理器
2. **Node.js 检查**：版本过低时自动提示升级（需要 >= v18，推荐 v20）
3. **PM2 检查**：未安装时自动提示安装并配置开机自启
4. **Git 拉取**：自动处理本地未提交修改（stash → pull → pop）
5. **数据库备份**：部署前自动 `mysqldump` 备份，保留最近 10 份
6. **依赖安装**：使用 `--legacy-peer-deps` 解决 React 19 依赖冲突
7. **Prisma 同步**：先 `prisma generate`（生成类型），再 `prisma db push`（同步表结构）
8. **资源检测与交换分区配置**：构建前自动检测服务器内存，物理内存不足 2GB 且无交换分区时，自动提示创建 2GB 交换分区，确保构建顺利进行
9. **项目构建**：失败时提供常见原因排查建议
10. **PM2 重启**：自动识别首次启动或重启，使用 ecosystem.config.js
11. **Nginx 检查**：验证配置语法、检查 `client_max_body_size`、自动重载
12. **健康检查**：部署后轮询 `http://localhost:3000` 确认应用正常
13. **失败回滚**：构建失败时自动回退到上一个 Git 版本并重新构建
14. **部署日志**：所有输出记录到 `logs/deploy-YYYYMMDD-HHMMSS.log`

---

## 九、常见问题排查

### 9.1 `npm install` 报 ERESOLVE 错误

**现象**：
```
ERESOLVE could not resolve
peer react@"^16.5.1 || ^17.0.0 || ^18.0.0" from lucide-react@0.344.0
```

**原因**：`lucide-react` 版本不兼容 React 19

**解决**：
```bash
npm install --legacy-peer-deps
```

---

### 9.2 `node -e "require('bcryptjs')"` 报 MODULE_NOT_FOUND

**现象**：
```
Error: Cannot find module 'bcryptjs'
```

**原因**：尚未执行 `npm install`，依赖未下载

**解决**：
```bash
cd /home/code/Travel-Notes
npm install --legacy-peer-deps
```

---

### 9.3 MySQL 安装后无法连接

**排查步骤**：
```bash
# 1. 检查服务状态
sudo systemctl status mysql

# 2. 如果未启动，启动它
sudo systemctl start mysql

# 3. 检查是否能登录
mysql -u root -p

# 4. 忘记密码时重置：
sudo mysqld-safe --skip-grant-tables &
mysql -u root
FLUSH PRIVILEGES;
ALTER USER 'root'@'localhost' IDENTIFIED BY '新密码';
FLUSH PRIVILEGES;
exit
```

---

### 9.4 访问网站显示 502 Bad Gateway

**排查步骤**：
```bash
# 1. 检查 PM2 进程状态
pm2 status

# 2. 查看 PM2 错误日志
pm2 logs travel-notes --err

# 3. 检查 Next.js 是否正常运行
curl http://localhost:3000

# 4. 重启服务
pm2 restart travel-notes
```

---

### 9.5 `npm run build` 失败

**常见原因**：
1. **Node.js 版本过低**：确保 `node -v` 显示 v18+
2. **内存不足**：添加 Swap 或升级内存
3. **依赖损坏**：删除 `node_modules` 重新安装

```bash
# 清理并重新安装
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run build
```

---

### 9.6 MySQL 端口被占用

```bash
# 查看占用进程
sudo lsof -i :3306

# 或查看所有 MySQL 相关进程
ps aux | grep mysql
```

---

### 9.7 服务器内存不足（OOM）

```bash
# 添加 2GB Swap
sudo fallocate -l 2G /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 设为开机自启
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 验证
free -h
```

---

## 十、项目文件结构

```
/home/code/Travel-Notes/
├── .env                    # 环境变量（不提交到 Git）
├── .env.example            # 环境变量模板
├── package.json            # 项目依赖
├── next.config.js          # Next.js 配置
├── ecosystem.config.js     # PM2 进程配置
├── deploy.sh               # 一键部署脚本（★ 核心部署工具）
├── prisma/
│   └── schema.prisma       # 数据库 Schema
├── app/                    # Next.js App Router 页面
├── components/             # 组件
├── lib/                    # 工具库（数据库、认证等）
├── content/                # Markdown 内容
├── public/                 # 静态资源
│   └── uploads/            # 用户上传的图片（不提交到 Git）
├── logs/                   # PM2 及部署日志（自动生成）
├── .deploy-backup/         # 部署备份（数据库备份等，自动生成）
└── docs/                   # 文档
```

---

## 十一、服务管理速查表

| 操作 | 命令 |
|------|------|
| 启动项目 | `pm2 start npm --name "travel-notes" -- start` |
| 查看状态 | `pm2 status` |
| 查看日志 | `pm2 logs travel-notes` |
| 重启项目 | `pm2 restart travel-notes` |
| 停止项目 | `pm2 stop travel-notes` |
| 重载 Nginx | `sudo systemctl reload nginx` |
| 重启 MySQL | `sudo systemctl restart mysql` |
| 重启服务器 | `sudo reboot` |

---

## 十二、安全建议

1. **MySQL 不要用 root 账号**，创建专用的 `travel` 用户
2. **Session Secret 使用随机字符串**：`openssl rand -hex 32`
3. **`.env` 文件禁止提交到 Git**（已在 `.gitignore` 中配置）
4. **生产环境不要开放 3000 端口**，只通过 Nginx 的 80/443 访问
5. **定期备份数据库**：
   ```bash
   mysqldump -u travel -p Travel_And_Study > backup_$(date +%Y%m%d).sql
   ```
6. **配置 HTTPS**，避免数据传输被窃听

---

## 十三、迭代记录

### [2026-07-26] 修复 Next.js 构建错误：客户端组件引入服务端模块

#### 问题描述

在执行 `npm run build` 时，出现以下 Webpack 编译错误：
```
Module not found: Can't resolve 'fs'
UnhandledSchemeError: Reading from "node:buffer" is not handled by plugins
Module not found: Can't resolve 'net'
Module not found: Can't resolve 'tls'
```

#### 根本原因

在 Next.js App Router 中，**客户端组件**（Client Components，带有 `'use client'` 指令或被客户端组件引用的模块）不能直接引入 Node.js 专属模块（如 `fs`、`mysql2`、`net`、`tls`），因为这些模块在浏览器环境中不可用。

本次错误涉及文件：
- `app/notes/repo/page.tsx`：直接导入了 `lib/repos.ts`（包含 `fs`）
- `app/notes/page.tsx`：直接导入了 `lib/repos.ts`
- `app/admin/setup/page.tsx`：间接导入了 `lib/auth.ts` → `lib/db.ts` → `mysql2`

#### 修复策略

1.  **服务端逻辑隔离**：将数据库查询、文件系统操作等逻辑保留在服务端组件或 API 路由中。
2.  **客户端数据获取**：客户端组件改为通过 `fetch` 请求 API 路由获取数据。
3.  **循环依赖解除**：`lib/auth-middleware.ts` 改为从 `lib/auth-utils.ts`（纯函数）导入，而非 `lib/auth.ts`（依赖 Prisma）。

#### 修改清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `lib/auth-utils.ts` | 编辑 | 添加 `requireAuth` 等纯函数，供客户端组件安全导入 |
| `lib/auth-middleware.ts` | 编辑 | 改为从 `auth-utils` 导入，打破 `db.ts` -> `mysql2` 依赖链 |
| `lib/db.ts` | 编辑 | 修复 Prisma 适配器类型断言 |
| `lib/prisma-adapter.ts` | 编辑 | 修复 `execute` 方法参数类型错误 |
| `app/notes/page.tsx` | 重写 | 转为客户端组件，使用 `fetch('/api/notes')` 获取数据 |
| `app/notes/repo/page.tsx` | 重写 | 转为客户端组件，使用 `fetch('/api/repos')` 获取数据 |
| `app/notes/repo/[repo]/page.tsx` | 编辑 | 修复 `params` 类型为 Next.js 15 的 `Promise` 形式 |
| `app/login/page.tsx` | 编辑 | 添加 `Suspense` 包裹修复 `useSearchParams` 错误 |
| `app/travel/[slug]/page.tsx` | 编辑 | 修复 TypeScript 类型错误 |
| `app/api/notes/route.ts` | **新建** | 聚合 API，返回学习笔记首页所需数据 |
| `app/api/repos/route.ts` | 已验证 | 提供仓库列表 API |
| `app/api/repos/[repo]/route.ts` | 编辑 | 修复 `params` 类型 |
| `app/api/repos/[repo]/files/route.ts` | 编辑 | 修复 `params` 类型 |

#### 验证结果

```bash
npm run build
```
✅ 构建成功：`✓ Compiled successfully`，`✓ Generating static pages (38/38)`