#!/usr/bin/env node
/**
 * 多用户归属回填：把 userId 为空的存量内容（历史数据）归到第一个用户。
 * 幂等，可重复执行。用法：node scripts/backfill-owners.cjs
 */
const mysql = require('mysql2/promise')
const fs = require('fs')
const path = require('path')

async function main() {
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

  const conn = await mysql.createConnection(databaseUrl)

  const [users] = await conn.query('SELECT id, username FROM User ORDER BY id ASC LIMIT 1')
  if (users.length === 0) {
    console.log('用户表为空，跳过回填（请先创建管理员账号）')
    await conn.end()
    return
  }
  const admin = users[0]
  console.log(`归属目标用户: #${admin.id} ${admin.username}`)

  const tables = [
    ['Post', 'userId'],
    ['Travel', 'ownerId'],
    ['Album', 'userId'],
    ['Media', 'userId'],
    ['Moment', 'userId'],
    ['PhotoMessage', 'userId'],
    ['Anniversary', 'userId'],
    ['TimelineItem', 'userId'],
  ]

  for (const [table, col] of tables) {
    try {
      const [res] = await conn.query(
        `UPDATE \`${table}\` SET \`${col}\` = ? WHERE \`${col}\` IS NULL`,
        [admin.id]
      )
      console.log(`  \`${table}\`.\`${col}\`: 回填 ${res.affectedRows} 行`)
    } catch (e) {
      // 表/列可能不存在（旧库），忽略
      console.log(`  \`${table}\`.\`${col}\`: 跳过（${e.code || e.message}）`)
    }
  }

  await conn.end()
  console.log('完成 ✅')
}

main().catch((e) => {
  console.error('回填失败:', e.message || e)
  process.exit(1)
})
