# 邮件服务（SMTP）配置指南

密码找回、绑定邮箱的验证码默认通过 SMTP 邮件发送。未配置 SMTP 时，验证码仅输出到服务器日志（本地调试），不会回显给前端。

## 1. 配置环境变量

编辑项目根目录的 `.env`（参考 `.env.example`），填入以下变量：

```dotenv
# 是否真实发送邮件（配置齐全后自动启用）
SMTP_HOST="smtp.qq.com"
SMTP_PORT="465"
SMTP_USER="you@example.com"
SMTP_PASS="your-smtp-authorization-code"
SMTP_SECURE="true"
MAIL_FROM="you@example.com"
```

## 2. 各邮箱服务商示例

| 服务商 | SMTP_HOST | SMTP_PORT | SMTP_SECURE | 说明 |
|---|---|---|---|---|
| QQ 邮箱 | smtp.qq.com | 465 | true | 使用「授权码」而非邮箱密码 |
| 163 邮箱 | smtp.163.com | 465 | true | 开启 SMTP 后使用授权码 |
| Gmail | smtp.gmail.com | 465 | true | 需开启两步验证并使用「应用专用密码」 |
| 阿里企业邮 | smtp.qiye.aliyun.com | 465 | true | 使用企业邮箱账号 |
| 自定义服务器 | 你的 SMTP 地址 | 587 | false | 通常用 STARTTLS |

## 3. 获取授权码

- QQ 邮箱：设置 → 账号 → 开启 POP3/IMAP/SMTP 服务 → 生成授权码。
- 163 邮箱：设置 → POP3/SMTP/IMAP → 开启 SMTP 服务 → 生成授权码。
- Gmail：开启两步验证后，访问 Google 账号安全页生成「应用专用密码」。

## 4. 重启生效

修改 `.env` 后重启应用：

```bash
# 若使用 PM2
pm2 restart travel-notes
```

## 5. 验证

访问忘记密码页，输入已绑定邮箱并发送验证码；若收到邮件则配置成功。若未收到，查看服务器日志确认验证码回退输出与 SMTP 报错信息。
