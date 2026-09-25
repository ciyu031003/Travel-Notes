#!/usr/bin/env node
/**
 * 重置**本地开发库**某个账号的密码（忘记本地密码时用）。
 *
 * 用法：
 *   node scripts/reset-local-password.cjs <username> <newPassword>
 *
 * 为什么需要它：
 *   · `.env` 的 `ADMIN_PASSWORD_HASH` **不能**重置已存在账号 —— `initializeDefaultAdmin()`
 *     只在 user 表为空时创建（见 lib/auth.ts:127），账号已存在就永远不会被覆盖；
 *   · `/admin/setup` 也已按 S2 策略移除了硬编码默认凭据，救不回密码。
 *
 * 安全护栏（任一不满足即拒绝执行）：
 *   1. `NODE_ENV=production` 直接拒绝；
 *   2. DATABASE_URL 的主机必须是 localhost / 127.0.0.1 / ::1（**只能改本机库**）；
 *   3. 必须显式给出用户名与新密码，不做默认值。
 *
 * 哈希参数与 `lib/auth-utils.ts` 保持一致：bcrypt、10 rounds。
 */
const { readFileSync } = require('node:fs')
const path = require('node:path')
const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')

const [, , username, newPassword] = process.argv

function fail(msg) {
  console.error('❌ ' + msg)
  process.exit(1)
}

if (!username || !newPassword) {
  fail('用法：node scripts/reset-local-password.cjs <username> <newPassword>')
}
if (process.env.NODE_ENV === 'production') {
  fail('拒绝执行：NODE_ENV=production。本脚本只用于本地开发库。')
}
if (newPassword.length < 6) {
  fail('拒绝执行：新密码太短（至少 6 位）。')
}

const envPath = path.join(process.cwd(), '.env')
let url = process.env.DATABASE_URL
if (!url) {
  try {
    const line = readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith('DATABASE_URL='))
    if (line) url = line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '')
  } catch {
    /* ignore */
  }
}
if (!url) fail('找不到 DATABASE_URL（环境变量与 .env 都没有）。')

const m = url.match(/^mysql:\/\/(?<user>[^:]+):(?<pass>[^@]*)@(?<host>[^:/]+)(?::(?<port>\d+))?\/(?<db>[^?]+)/)
if (!m) fail('DATABASE_URL 不是预期的 mysql:// 形式。')

const { user, pass, host, db } = m.groups
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
if (!LOCAL_HOSTS.has(host)) {
  fail(`拒绝执行：DATABASE_URL 的主机是 "${host}"，不是本机（只允许 ${[...LOCAL_HOSTS].join(' / ')}）。`)
}

async function main() {
  const conn = await mysql.createConnection({
    host,
    port: Number(m.groups.port || 3306),
    user,
    password: pass,
    database: db,
  })
  try {
    const [rows] = await conn.execute(
      'SELECT id, username FROM user WHERE username = ? LIMIT 1',
      [username],
    )
    if (rows.length === 0) {
      const [all] = await conn.execute('SELECT username FROM user ORDER BY id LIMIT 20')
      fail(
        `账号 "${username}" 不存在。库中现有账号：` +
          all.map((r) => r.username).join(', '),
      )
    }

    const hash = await bcrypt.hash(newPassword, 10)
    const [res] = await conn.execute(
      'UPDATE user SET passwordHash = ?, requirePasswordChange = 0 WHERE id = ?',
      [hash, rows[0].id],
    )
    if (res.affectedRows !== 1) fail(`更新失败（affectedRows=${res.affectedRows}）。`)

    console.log(`✅ 已重置账号 "${rows[0].username}"（id=${rows[0].id}）的密码。`)
    console.log('   库：' + db + ' @ ' + host)
    console.log('   顺带把 requirePasswordChange 置 0（避免登录后被强制改密）。')
  } finally {
    await conn.end()
  }
}

main().catch((e) => fail(e.message))
