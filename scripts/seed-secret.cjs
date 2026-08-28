#!/usr/bin/env node
/**
 * 把敏感配置（如通义 DASHSCOPE_API_KEY）以 AES-256-GCM 加密后写入 AppSecret 表。
 *  - 密钥来自环境变量 APP_ENCRYPTION_KEY（不落代码）
 *  - 待存值来自环境变量（如 DASHSCOPE_API_KEY，运行时传入，不落代码/不经打印）
 * 用法：
 *   APP_ENCRYPTION_KEY=<...> DASHSCOPE_API_KEY=<sk-...> node scripts/seed-secret.cjs
 */
const mysql = require('mysql2/promise')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

function encKey() {
  const raw = process.env.APP_ENCRYPTION_KEY
  if (!raw) {
    console.error('未设置 APP_ENCRYPTION_KEY（请先配置服务器 .env）')
    process.exit(2)
  }
  return crypto.createHash('sha256').update(raw).digest()
}

function encrypt(plain) {
  const key = encKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    valueEnc: Buffer.concat([enc, tag]).toString('base64'),
    iv: iv.toString('base64'),
  }
}

function getDatabaseUrl() {
  let url = process.env.DATABASE_URL
  if (!url) {
    const envPath = path.join(process.cwd(), '.env')
    if (fs.existsSync(envPath)) {
      const m = fs.readFileSync(envPath, 'utf8').match(/^DATABASE_URL="?([^"\n]+)"?$/m)
      if (m) url = m[1]
    }
  }
  if (!url) {
    console.error('未找到 DATABASE_URL')
    process.exit(2)
  }
  return url
}

async function main() {
  const name = process.env.SECRET_NAME || 'DASHSCOPE_API_KEY'
  const value = process.env.DASHSCOPE_API_KEY
  if (!value) {
    console.error('未设置 DASHSCOPE_API_KEY（运行时传入，勿写入代码）')
    process.exit(2)
  }

  const { valueEnc, iv } = encrypt(value)
  const conn = await mysql.createConnection(getDatabaseUrl())
  await conn.query(
    `INSERT INTO AppSecret (name, valueEnc, iv, createdAt, updatedAt)
     VALUES (?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE valueEnc=VALUES(valueEnc), iv=VALUES(iv), updatedAt=NOW()`,
    [name, valueEnc, iv]
  )
  await conn.end()
  console.log(`已加密写入 AppSecret: ${name}（密文 ${valueEnc.length} 字符, iv ${iv.length}）——明文未落库/未打印`)
}

main().catch((e) => {
  console.error('写入失败:', e.message)
  process.exit(1)
})
