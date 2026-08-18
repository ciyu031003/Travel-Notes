# Stage 1 截图回归清单

> 状态：**阻塞**（dev server DB 健康检查超时 + 需要登录/相册解锁凭据 + 未安装 Playwright）

## 阻塞项

1. dev server 当前请求超时（`PrismaMariaDB Health check failed` 后进入重连循环）。
2. 首页/旅行/相册等页面需要登录态，相册还需纪念日解锁 token。
3. 项目未安装 Playwright。

## 执行步骤（解除阻塞后）

1. 恢复 dev server 与数据库健康（重启 dev server 或修复 DB 连接）。
2. 安装 Playwright：
   ```bash
   npm i -D playwright
   npx playwright install chromium
   ```
3. 设置凭据环境变量：
   ```bash
   TN_USER=<用户名>
   TN_PASSWORD=<密码>
   TN_ALBUM_DATE=<恋爱纪念日，如 2023-06-20>
   ```
4. 运行截图脚本：
   ```bash
   node scripts/stage0-screenshots.mjs
   ```
5. 对照 Stage 0 审计清单，检查以下回归点：
   - 相册/旅行圈不再有硬编码色
   - 星点透明度降低
   - 小字号与低对比度改善
   - 像素字体只在符号处出现
   - 双相册只有一个入口 `/album`
   - 纪念相册区在像素模式正常渲染

## 截图清单（桌面 1440 + 移动 390）

| 页面 | 桌面 | 移动 | 明 | 暗 |
| --- | --- | --- | --- | --- |
| /login | ☐ | ☐ | ☐ | ☐ |
| / | ☐ | ☐ | ☐ | ☐ |
| /travel | ☐ | ☐ | ☐ | ☐ |
| /timeline | ☐ | ☐ | ☐ | ☐ |
| /album space | ☐ | ☐ | - | ☐ |
| /album pixel | ☐ | ☐ | - | ☐ |
| /moments | ☐ | ☐ | ☐ | ☐ |
| /search | ☐ | ☐ | ☐ | ☐ |

## 截图产物目录

`docs/design/screenshots/`
