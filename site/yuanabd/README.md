# site/yuanabd —— YUAN.ABD 主站（www.yuanabd.cn）增量资产

## 为什么有这个目录

主站 `www.yuanabd.cn` 的源码**不在本仓库**，实际部署在服务器 `/var/www/yuanabd/`
（单文件 `index.html`，样式内联，无 `css/`、`js/` 目录）。
这导致主站的改动没有版本控制、容易丢失。

本目录只存放**新增的增量资产**（不改主站既有结构），作为版本控制与部署来源：
改动从这里同步到服务器，而不是直接手改服务器文件。

## 部署目标

| 本目录文件 | 服务器目标路径 |
|---|---|
| `app-download.css` | `/var/www/yuanabd/css/app-download.css` |
| `app-download.js` | `/var/www/yuanabd/js/app-download.js` |

二维码图片复用甜途门户已有的静态图：
`/var/www/travel-landing/img/download-qr.png` → 复制到 `/var/www/yuanabd/img/download-qr.png`
（内容为 `https://travel-notes.yuanabd.cn/downloads/tiantu.apk`，APK 路径固定不变，故可长期使用。）

## `index.html` 需要配合的 5 处改动

> 主站 `index.html` 不在仓库，以下改动需在服务器上执行（已备份至 `/home/ubuntu/backups/`）。

1. **`<head>` 引入样式**（放在既有 `<style>` 之后）：
   ```html
   <link rel="stylesheet" href="./css/app-download.css" />
   ```

2. **首屏版本 chip 改为动态**（原为写死的 `v1.0.0 · LIVE`）：
   ```html
   <!-- 前 -->
   <span class="chip">v1.0.0 · LIVE</span>
   <!-- 后：内层 span 由 JS 填充；外层文案是拉取失败时的回退 -->
   <span class="chip"><span data-app-version>v1.7.0</span> · LIVE</span>
   ```

3. **下载按钮改为弹窗触发器**（保留 `href` 作为移动端/无 JS 回退）：
   ```html
   <!-- 前 -->
   <a class="btn btn--ghost" href="https://travel-notes.yuanabd.cn/download" target="_blank" rel="noopener">下载甜途 App</a>
   <!-- 后 -->
   <a class="btn btn--ghost" href="https://travel-notes.yuanabd.cn/download" rel="noopener" data-app-download aria-haspopup="dialog">下载甜途 App</a>
   ```
   去掉 `target="_blank"`：移动端直接在同一标签页进入下载页，体验更连贯。

4. **弹窗结构**（放在 `</body>` 前）：
   ```html
   <div class="dl-modal" id="dlModal" role="dialog" aria-modal="true" aria-labelledby="dlModalTitle" hidden>
     <div class="dl-modal__scrim" data-dl-close></div>
     <div class="dl-modal__panel">
       <button class="dl-modal__close" type="button" data-dl-close aria-label="关闭">✕</button>
       <span class="dl-modal__kicker">甜途 · TianTu</span>
       <h3 class="dl-modal__title" id="dlModalTitle">扫码下载甜途 App</h3>
       <p class="dl-modal__sub">电脑上请用手机扫码安装；手机上打开则直接下载。</p>
       <div class="dl-modal__qr">
         <img src="./img/download-qr.png" alt="甜途 App 下载二维码" width="188" height="188" />
       </div>
       <div class="dl-modal__meta">
         <span class="chip"><span data-app-version>v1.7.0</span></span>
         <span class="chip">Android</span>
       </div>
       <div class="dl-modal__actions">
         <a class="btn btn--travel" href="https://travel-notes.yuanabd.cn/downloads/tiantu.apk" download>直接下载安装包</a>
         <button class="btn btn--ghost" type="button" data-dl-copy data-copy="https://travel-notes.yuanabd.cn/downloads/tiantu.apk"><span>复制下载链接</span></button>
       </div>
       <p class="dl-modal__note">
         iOS 暂不支持 APK，可直接使用<a href="https://travel-notes.yuanabd.cn" target="_blank" rel="noopener">网页版</a>。
       </p>
     </div>
   </div>
   ```

5. **`</body>` 前引入脚本**：
   ```html
   <script src="./js/app-download.js" defer></script>
   ```

## 依赖：nginx 同源代理 `/api/version`

主站需能同源读取应用版本号（否则跨域被拦）。在 `www.yuanabd.cn` 的 443 server 块内：

```nginx
location = /api/version {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    add_header Cache-Control "no-cache" always;
}
```

`/api/version` 在应用侧本就是公开端点（无鉴权），此代理仅为避免跨域；GET 不触发 CSRF 校验。

## 行为契约

| 场景 | 行为 |
|---|---|
| 桌面（≥768px）点击下载 | 留在本页弹出二维码弹窗 |
| 移动端点击下载 | 不弹窗，直接进入应用下载页（含直装与原生识别） |
| 无 JS | 走 `href` 回退，进入应用下载页 |
| 版本号 | 页面加载即从 `/api/version` 拉取，填充所有 `[data-app-version]`；失败保留静态回退值 |
