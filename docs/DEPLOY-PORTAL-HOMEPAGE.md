# Web 首页被门户遮蔽 · 修复记录与回滚参考

> 状态：**已于 2026-09-13 在服务器 106.55.2.197 完成修改并经端到端验证**。
> 目标：让「甜途 Web 端首页（`app/page.tsx` → `/`）」可被访问，门户迁至 `/portal`，登录后直接进入应用首页，不再回落门户打转。

---

## 一、问题根因（原始状态）

生产环境 `travel-notes.yuanabd.cn/`（**根路径 `/`**）被 Nginx **静态门户**遮蔽：

- 门户静态目录：`/var/www/travel-landing/`（含 `travel.html`、`css/`、`js/`、`img/`、`vendor/`，**不在本仓库**）
- Nginx `location = / { try_files /travel.html =404; }` 让 `/` 永远命中门户的 `travel.html`
- 应用跑在 Docker 容器 `3000` 端口，`app/page.tsx` 是 Web 端应用首页，但 `/` 被门户遮蔽后无法访问

导致：
1. 门户「登录/进入空间」跳 `/login`，登录后 `router.push('/')` → 回到的仍是门户 → 感知「没进入 Web 端」
2. 在 Web 端任意页面点「首页」(`/`) 也回到门户 → 活锁
3. 门户 `js/project.js` 中已登录用户「进入空间」目标设为 `/travel`，同样回落门户

---

## 二、目标状态（当前已生效）

| 路径 | 改前 | **改后（当前）** |
|---|---|---|
| `/portal` | 404 | **甜途门户**（`/var/www/travel-landing/`，alias） |
| `/` | 甜途门户（被遮蔽） | **Web 端应用首页**（`app/page.tsx`，反代 Next.js） |
| `/login` | Web 端登录页 | Web 端登录页（不变） |
| `/travel` 等 | Web 端页面 | Web 端页面（不变） |
| `/downloads` `/uploads` | 静态/APK | 不变 |

门户与 Web 端应用**共存于同一域名**，靠路径区分：门户 `/portal`，应用占根 `/`。

---

## 三、本次改动明细

### 服务器 `/etc/nginx/sites-enabled/travel-notes`（生效配置）

把 `location = /` 从「服务门户 travel.html」改为**反代 Next.js 应用**，并新增 `/portal` 两个 location：

```nginx
# Web 端应用首页：/ 由 Next.js 应用（app/page.tsx）接管
location = / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

# 甜途门户（原根落地页，现迁至 /portal 子路径；资源为相对路径经 alias 解析）
location = /portal { return 301 /portal/; }
location ^~ /portal/ {
    alias /var/www/travel-landing/;
    index travel.html;
    try_files $uri $uri/ =404;
}
```

其余 location（`/downloads/` `/uploads/` `\.bak` 静态资源、`location /`+`@app`）均未改动。

### 服务器 `/var/www/travel-landing/js/project.js`

已登录用户「进入空间」目标由 `/travel` 改为 `/`（应用首页）：

```diff
- var target = appUrl(isLearn ? "/dashboard" : "/travel");
+ var target = appUrl(isLearn ? "/dashboard" : "/");
```

门户「登录」入口仍为 `loginUrl()` = `/login`，登录成功后经登录页默认 `redirect=/` 落到应用首页。

### 本仓库（配合代码）

- **`app/login/page.tsx`**：登录/注册后的 `redirect` 参数加白名单校验（仅接受以 `/` 开头、非 `//` 的站内相对路径），默认落地 `/`（应用首页）。防开放重定向 + 保证从门户进来默认进应用首页。
- **`.travel-portal.html`**（门户 HTML 源文件副本）：登录按钮 /「Web 版」按钮指向 `https://travel-notes.yuanabd.cn/login?redirect=/`。

---

## 四、端到端验证结果（2026-09-13，真实公网/本机）

使用临时账号走完整链路，验证后已删除该账号：

| 场景 | 结果 |
|---|---|
| `/portal/` | HTTP 200，返回甜途门户 ✅ |
| `/portal`（无斜杠） | HTTP 301 → `/portal/` ✅ |
| `/login` | HTTP 200 ✅ |
| 未登录访问 `/` | HTTP 307 → `/login?redirect=/`（应用 middleware 登录门禁）✅ |
| **登录后访问 `/`** | **HTTP 200，title=`行迹 | 旅行记忆空间`（应用首页，非门户）** ✅ |
| 已登录访问 `/portal/` | HTTP 200，门户正常 ✅ |
| `/api/health` | HTTP 200 ✅ |
| `/downloads/tiantu.apk` | HTTP 200 ✅ |
| `/portal/css|js|img|vendor/*` | 全部 200 ✅ |

---

## 五、回滚方法

备份位置：`/home/ubuntu/backups/`

- nginx 生效配置：`travel-notes-fix-<TS>/ngx-sites-enabled-travel-notes.conf`（或 `ngx-before-replace.conf`）
- 门户 JS：`travel-notes-fix-<TS>/project.js`、`/var/www/travel-landing/js/project.js.bak-20260913-homefix`

如需回滚：

```bash
# 恢复 nginx 配置并 reload
sudo cp /home/ubuntu/backups/travel-notes-fix-<TS>/ngx-sites-enabled-travel-notes.conf /etc/nginx/sites-enabled/travel-notes
sudo nginx -t && sudo systemctl reload nginx
# 恢复门户 JS
sudo cp /home/ubuntu/backups/travel-notes-fix-<TS>/project.js /var/www/travel-landing/js/project.js
```

---

## 六、说明

- 门户 `travel.html` 的 `<link rel="canonical">` 仍指向 `travel-notes.yuanabd.cn/`（现在是应用首页）。若追求门户 SEO，可改为 `https://travel-notes.yuanabd.cn/portal/`（本次未改，属门户细节）。
- `location / { try_files $uri @app }` 仍保留原静态优先语义，门户迁走后其根级静态目录已基本闲置，不影响应用；门户资源只经 `/portal/` alias 暴露。
- 若门户另有独立子域名规划，也可把 `/portal` 替换为独立域名（如 `portal.yuanabd.cn`）并在 nginx 单独 server 块实现，原理相同。