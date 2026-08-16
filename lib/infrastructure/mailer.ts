/**
 * 邮件发送基础设施：基于 nodemailer 的 SMTP 实现。
 * 未配置 SMTP 时降级为仅输出服务端日志（本地调试），不向前端回显验证码。
 *
 * 环境变量：
 *   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_SECURE / MAIL_FROM
 * 配置说明见 docs/EMAIL_SETUP.md
 */
import nodemailer from 'nodemailer'

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT || 465) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
  return transporter
}

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  if (!isSmtpConfigured()) {
    // 未配置 SMTP：仅写服务端日志（本地调试），不回显给前端
    console.log(`[Mailer] SMTP 未配置，跳过真实发送。收件人: ${to} | 主题: ${subject}`)
    console.log(`[Mailer] 内容: ${text}`)
    return false
  }

  try {
    await getTransporter().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
    })
    return true
  } catch (error) {
    console.error('[Mailer] 发送失败:', error)
    return false
  }
}
