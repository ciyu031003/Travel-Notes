#!/usr/bin/env node
/**
 * 一次性「归属回填」——**只手动执行，不进启动路径**。
 *
 * 这是多用户改造期（单管理员 → 多用户）的迁移动作：把历史上没有归属的内容
 * 全部划给第一个用户（生产上是 admin）。它**会改数据**，因此必须：
 *   ① 先备份数据库；
 *   ② 确认此时确实"只有一个真实用户"；
 *   ③ 手动执行，而不是每次容器重启都跑一遍。
 *
 * ⚠️ 为什么单独摘出来：
 * 这段逻辑原先写在 `apply-schema-migration.cjs` 末尾，而那个脚本在
 * `scripts/docker-entrypoint.sh` 里**每次容器启动都会执行**。
 * 结果是：任何人只要让容器重启，`Post / Travel / Album / Media / Moment /
 * PhotoMessage / Anniversary / TimelineItem` 里所有 `userId IS NULL` 的行
 * 都会被静默改成第一个用户的——在已经有第二个真实用户之后，这就是数据错误。
 *
 * 用法（务必先备份）：
 *   node scripts/backfill-ownership-once.cjs --yes-i-backed-up
 */
const mysql = require('mysql2/promise')
const fs = require('fs')
const crypto = require('crypto')
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

/** 账号 ID 回填（admin 固定 01230821；纪念日用户 = 2 位随机前缀 + YYYYMMDD；其余随机 8 位） */
async function backfillUserAccountIds(conn) {
  const [allUsers] = await conn.query('SELECT id, username, anniversaryStart, accountId FROM User')
  const used = new Set((allUsers || []).filter((u) => u.accountId).map((u) => String(u.accountId)))
  for (const u of allUsers || []) {
    if (u.accountId) continue
    let accountId = ''
    if (u.username === 'admin') {
      accountId = '01230821'
    } else {
      const date = String(u.anniversaryStart || '').replace(/\D/g, '')
      for (let attempt = 0; attempt < 100; attempt++) {
        if (date.length === 8) {
          const prefix = String(crypto.randomInt(0, 100)).padStart(2, '0')
          accountId = prefix + date
        } else {
          accountId = String(crypto.randomInt(10000000, 100000000))
        }
        if (!used.has(accountId)) break
      }
    }
    used.add(accountId)
    await conn.query('UPDATE User SET accountId = ? WHERE id = ?', [accountId, u.id])
    console.log(`  [accountId] #${u.id} ${u.username} -> ${accountId}`)
  }
}

async function main() {
  if (!process.argv.includes('--yes-i-backed-up')) {
    console.error('拒绝执行：这会修改数据行（把无归属内容划给第一个用户）。')
    console.error('请先备份数据库，然后加 --yes-i-backed-up 重跑：')
    console.error('  node scripts/backfill-ownership-once.cjs --yes-i-backed-up')
    process.exit(1)
  }

  const conn = await getConn()
  try {
    const [db] = await conn.query('SELECT DATABASE() AS db, (SELECT COUNT(*) FROM User) AS users')
    console.log(`== 归属回填（库: ${db[0].db}，用户数: ${db[0].users}）==`)
    if (Number(db[0].users) > 1) {
      console.warn('⚠️ 当前不止一个用户 —— 回填会把无归属内容划给第一个用户，请确认这正是你要的。')
    }

    await backfillUserAccountIds(conn)

    // 存量公开文章回填到旅行圈（Post -> TravelPost，postId 唯一幂等）
    try {
      const [userCheck] = await conn.query('SELECT id FROM User ORDER BY id ASC LIMIT 1')
      if (userCheck.length > 0) {
        const fallbackUserId = userCheck[0].id
        const [res] = await conn.query(
          `INSERT INTO TravelPost (postId, authorId, visibility, title, summary, publishedAt, createdAt, updatedAt)
           SELECT p.id, COALESCE(p.userId, ?), 'PUBLIC', p.title, p.summary, p.date, NOW(3), NOW(3)
           FROM Post p
           WHERE p.type = 'travel' AND p.published = 1 AND p.isPublic = 1
           ON DUPLICATE KEY UPDATE title = VALUES(title), summary = VALUES(summary), publishedAt = VALUES(publishedAt)`,
          [fallbackUserId],
        )
        console.log(`  [publicPosts] 回填公开文章 ${res.affectedRows} 行`)
      }
    } catch (e) {
      console.log('  [publicPosts] 回填跳过（' + (e.code || e.message) + '）')
    }

    const [users] = await conn.query('SELECT id, username FROM User ORDER BY id ASC LIMIT 1')
    if (users.length === 0) {
      console.log('用户表为空，跳过归属回填')
    } else {
      const admin = users[0]
      console.log(`归属目标用户: #${admin.id} ${admin.username}`)
      for (const [table, col] of [
        ['Post', 'userId'],
        ['Travel', 'ownerId'],
        ['Album', 'userId'],
        ['Media', 'userId'],
        ['Moment', 'userId'],
        ['PhotoMessage', 'userId'],
        ['Anniversary', 'userId'],
        ['TimelineItem', 'userId'],
      ]) {
        try {
          const [res] = await conn.query(`UPDATE \`${table}\` SET \`${col}\` = ? WHERE \`${col}\` IS NULL`, [admin.id])
          console.log(`  ${table}.${col} 回填 ${res.affectedRows} 行`)
        } catch (e) {
          console.log(`  ${table}.${col} 跳过（${e.code || e.message}）`)
        }
      }
    }

    console.log('完成 ✅（如非预期，请用备份恢复）')
  } finally {
    await conn.end()
  }
}

main().catch((e) => {
  console.error('回填失败:', e.message || e)
  process.exit(1)
})
