#!/usr/bin/env node
/**
 * R1 增量迁移：**只**加「我的」页档案头图需要的三列。
 *
 * 为什么不直接跑 `apply-schema-migration.cjs`：
 * 那个脚本除了建表/加列，最后还有一段「归属回填」——把 Post/Album/Media/Moment/
 * PhotoMessage/Anniversary/TimelineItem 里所有 `userId IS NULL` 的行**一律改成第一个用户**。
 * 那是多用户改造期的一次性动作；现在再跑一次会把真实存在的数据错误归属给管理员
 * （本地试跑时它就把 10 行 Media 的 userId 从 NULL 改成了 #1）。
 * 生产上不能承担这种副作用，因此这里只做幂等 DDL。
 *
 * 幂等：列存在则跳过，可反复执行。
 * 用法（本地 / 服务器）：
 *   node scripts/migrate-r1-profile-cover.cjs
 */
const mysql = require('mysql2/promise')
const fs = require('fs')
const path = require('path')

async function getConn() {
  const envPath = path.join(process.cwd(), '.env')
  let databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl && fs.existsSync(envPath)) {
    const match = fs.readFileSync(envPath, 'utf8').match(/^DATABASE_URL="?([^"\n]+)"?$/m)
    if (match) databaseUrl = match[1]
  }
  if (!databaseUrl) {
    console.error('未找到 DATABASE_URL（请配置 .env 或环境变量）')
    process.exit(1)
  }
  return mysql.createConnection(databaseUrl)
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
    [table, column],
  )
  return rows.length > 0
}

async function addColumn(conn, table, column, ddl) {
  if (await columnExists(conn, table, column)) {
    console.log(`  [skip] ${table}.${column} 已存在`)
    return false
  }
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`)
  console.log(`  [add] ${table}.${column}`)
  return true
}

async function main() {
  const conn = await getConn()
  try {
    const [db] = await conn.query('SELECT DATABASE() AS db')
    console.log(`== R1 档案头图迁移（库: ${db[0].db}）==`)

    // coverUrl：用户上传的风景头图（/uploads/covers/xxx.webp）
    await addColumn(conn, 'User', 'coverUrl', 'coverUrl VARCHAR(500) NULL AFTER avatarUrl')
    // coverFocusX/Y：0-1 归一化焦点，渲染成 object-position；NULL = 居中
    await addColumn(conn, 'User', 'coverFocusX', 'coverFocusX DOUBLE NULL AFTER coverUrl')
    await addColumn(conn, 'User', 'coverFocusY', 'coverFocusY DOUBLE NULL AFTER coverFocusX')

    // 校验：三列都在
    const checks = await Promise.all(
      ['coverUrl', 'coverFocusX', 'coverFocusY'].map((c) => columnExists(conn, 'User', c)),
    )
    if (checks.some((v) => !v)) {
      console.error('✗ 校验失败：仍有列缺失')
      process.exit(1)
    }
    console.log('完成 ✅（未改动任何数据行）')
  } finally {
    await conn.end()
  }
}

main().catch((e) => {
  console.error('迁移失败:', e.message || e)
  process.exit(1)
})
