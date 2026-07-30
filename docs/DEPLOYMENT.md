# 阿里云 ECS 部署指南

本文档详细介绍如何将个人博客项目部署到阿里云 ECS 服务器。

## 一、前期准备

### 1.1 服务器要求
- 操作系统：CentOS 7+ / Ubuntu 20.04+
- 配置建议：2核2G 起步（2G 内存需配合 Swap 分区）
- 带宽：1M 以上

### 1.2 安全组配置
在阿里云控制台开放以下端口：
- **22**：SSH 远程连接
- **80**：HTTP 访问
- **443**：HTTPS 访问
- **3000**：Next.js 开发调试（可选，生产环境建议只开80/443）

## 二、服务器环境配置

### 2.1 连接服务器

```bash
ssh root@你的服务器公网IP
```

### 2.2 安装 Node.js（CentOS 示例）

```bash
# 安装 NodeSource 仓库
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -

# 安装 Node.js
sudo yum install -y nodejs

# 验证安装
node -v
npm -v
```

### 2.3 安装 PM2 进程管理器

```bash
npm install -g pm2

# 设置开机自启
pm2 startup
```

### 2.4 安装 Nginx

```bash
# CentOS
sudo yum install -y nginx

# 启动 Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# 验证
sudo systemctl status nginx
```

### 2.5 安装 Git（可选，用于拉取代码）

```bash
sudo yum install -y git
```

## 三、部署项目

### 方式一：Git 拉取（推荐）

1. **将代码推送到 GitHub/Gitee**

2. **服务器上克隆项目**
```bash
cd /www/wwwroot/
git clone 你的仓库地址 blog
cd blog
```

3. **安装依赖**
```bash
npm install --legacy-peer-deps
```

4. **构建项目**
```bash
npm run build
```

> **低内存服务器（2GB）**：构建前添加 Swap 分区，防止 OOM：
> ```bash
> sudo fallocate -l 2G /swapfile
> sudo mkswap /swapfile
> sudo swapon /swapfile
> echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
> ```
> 或限制 Node.js 内存：`NODE_OPTIONS=--max-old-space-size=512 npm run build`

### 方式二：本地上传

1. **本地构建**
```bash
npm run build
```

2. **打包上传**
```bash
# 本地打包（排除 node_modules）
tar -czf blog.tar.gz --exclude=node_modules .

# 上传到服务器
scp blog.tar.gz root@服务器IP:/www/wwwroot/
```

3. **服务器解压安装**
```bash
cd /www/wwwroot/
mkdir blog && tar -xzf blog.tar.gz -C blog
cd blog
npm install --legacy-peer-deps
npx prisma generate
```

## 四、启动项目

### 4.1 使用 PM2 启动

```bash
# 启动项目
pm2 start npm --name "blog" -- start

# 查看状态
pm2 status

# 查看日志
pm2 logs blog

# 保存进程列表（开机自启）
pm2 save
```

### 4.2 PM2 常用命令

```bash
pm2 list              # 查看所有进程
pm2 restart blog      # 重启
pm2 stop blog         # 停止
pm2 delete blog       # 删除
pm2 logs blog         # 查看日志
pm2 monit             # 监控面板
```

## 五、配置 Nginx 反向代理

### 5.1 创建配置文件

```bash
sudo vi /etc/nginx/conf.d/blog.conf
```

写入以下内容：

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript application/json;

    # 静态资源缓存
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
    }
}
```

### 5.2 检查并重载 Nginx

```bash
# 检查配置语法
sudo nginx -t

# 重载配置
sudo systemctl reload nginx
```

## 六、配置 HTTPS（推荐）

### 6.1 使用 Let's Encrypt 免费证书

```bash
# 安装 certbot（CentOS）
sudo yum install -y certbot python3-certbot-nginx

# 自动获取并配置证书
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

### 6.2 证书自动续期

Let's Encrypt 证书有效期90天，配置自动续期：

```bash
# 测试续期
sudo certbot renew --dry-run

# 添加定时任务
sudo crontab -e
# 添加：0 0 1 * * /usr/bin/certbot renew --quiet
```

## 七、域名解析

1. 登录阿里云控制台 → 云解析 DNS
2. 添加两条解析记录：
   - `@` → 服务器公网IP（A记录）
   - `www` → 服务器公网IP（A记录）
3. 等待生效（通常几分钟到几小时）

## 八、更新部署

### 8.1 常规更新流程

```bash
# 1. 拉取最新代码
cd /www/wwwroot/blog
git pull

# 2. 安装新依赖（如有）
npm install

# 3. 重新构建
npm run build

# 4. 重启服务
pm2 restart blog
```

### 8.2 自动化部署脚本

创建 `deploy.sh` 脚本：

```bash
#!/bin/bash
cd /www/wwwroot/blog

echo ">>> 拉取最新代码..."
git pull

echo ">>> 安装依赖..."
npm install

echo ">>> 构建项目..."
npm run build

echo ">>> 重启服务..."
pm2 restart blog

echo ">>> 部署完成！"
pm2 status
```

使用：
```bash
chmod +x deploy.sh
./deploy.sh
```

## 九、常见问题

### 9.1 访问 502 Bad Gateway
- 检查 Next.js 是否正常启动：`pm2 status`
- 检查端口是否正确：默认3000
- 查看错误日志：`pm2 logs blog`

### 9.2 内存不足
- 增加 Swap 分区
- 升级服务器配置
- 使用 `NODE_OPTIONS=--max-old-space-size=512` 限制内存

### 9.3 构建失败
- 确保 Node.js 版本 >= 18
- 删除 node_modules 重新安装
- 检查磁盘空间：`df -h`

### 9.4 图片加载慢
- 使用阿里云 OSS 存储图片
- 配置 CDN 加速
- 图片压缩优化

## 十、性能优化建议

1. **开启 Brotli 压缩**（Nginx 额外模块）
2. **配置 CDN 加速**静态资源
3. **使用 Redis 缓存**热门页面（替换 MemoryCacheService）
4. **图片懒加载**和 WebP 格式
5. **数据库优化**（索引已优化，可按需添加）

## 十一、环境变量说明

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `DATABASE_URL` | MySQL 数据库连接字符串 | `mysql://user:pass@localhost:3306/Travel_And_Study` |
| `ADMIN_USERNAME` | 管理员用户名 | `yuanabd` |
| `ADMIN_PASSWORD_HASH` | 管理员密码哈希（bcrypt） | `$2a$10$...` |
| `JWT_SECRET` | JWT Token 签名密钥 | `openssl rand -hex 32` 生成 |
| `SESSION_SECRET` | 备用密钥（兼容旧配置） | 同上 |
| `COOKIE_SECURE` | Cookie 安全标志（生产设为 true） | `false` / `true` |
