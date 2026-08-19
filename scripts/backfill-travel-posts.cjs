#!/usr/bin/env node
/**
 * Stage 2 存量回填：为已公开（visibility='PUBLIC' 或 isPublic=1）的旅行生成 TravelPost。
 * 幂等：travelId 唯一，已存在则更新标题/摘要/封面，不重复插入。
 * 用法：node scripts/backfill-travel-posts.cjs
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

async function resolveAuthorId(conn, spaceId, ownerId) {
  if (ownerId) return ownerId
  if (spaceId) {
    const [rows] = await conn.query(
      "SELECT userId FROM SpaceMember WHERE spaceId = ? AND role = 'OWNER' AND status = 'ACTIVE' ORDER BY id ASC LIMIT 1",
      [spaceId]
    )
    if (rows.length && rows[0].userId) return rows[0].userId
  }
  const [users] = await conn.query('SELECT id FROM User ORDER BY id ASC LIMIT 1')
  return users.length ? users[0].id : null
}

async function main() {
  const conn = await getConn()
  try {
    const [travels] = await conn.query(
      "SELECT id, spaceId, ownerId, title, description, coverMediaId FROM Travel WHERE visibility = 'PUBLIC' OR isPublic = 1"
    )
    console.log('待回填公开旅行:', travels.length)

    let created = 0
    let skipped = 0
    for (const t of travels) {
      const authorId = await resolveAuthorId(conn, t.spaceId, t.ownerId)
      if (!authorId) {
        console.log('  [skip] #' + t.id + ' 无法解析作者')
        skipped++
        continue
      }
      try {
        await conn.query(
          "INSERT INTO TravelPost (travelId, authorId, visibility, title, summary, coverMediaId, publishedAt, likeCount, commentCount, favoriteCount, createdAt, updatedAt) " +
          "VALUES (?, ?, 'PUBLIC', ?, ?, ?, NOW(3), 0, 0, 0, NOW(3), NOW(3)) " +
          "ON DUPLICATE KEY UPDATE title = VALUES(title), summary = VALUES(summary), coverMediaId = VALUES(coverMediaId)",
          [t.id, authorId, t.title, t.description || null, t.coverMediaId || null]
        )
        created++
      } catch (e) {
        console.log('  [skip] #' + t.id + ' ' + (e.code || e.message))
        skipped++
      }
    }
    console.log('完成：新增/更新 ' + created + '，跳过 ' + skipped)
  } finally {
    await conn.end()
  }
}

main().catch((e) => {
  console.error('回填失败:', e.message || e)
  process.exit(1)
})
