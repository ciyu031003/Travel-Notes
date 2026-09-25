#!/usr/bin/env node
/**
 * 回填 `SpaceMember.userId`（P0 修复的一次性数据脚本，幂等）。
 *
 * 背景：`PrismaSpaceRepository.addMember` 长期没有写 `userId`，而权限判定有
 * 「username」与「userId」两套键 —— `lib/modules/space/permissions.ts` 按 username，
 * 而 `lib/modules/access`、`album.service.canManageAlbum`、`travel.service.myActiveSpaceIds`、
 * `getUserCapabilities` 全部按 userId。结果是**用邀请码加入的成员在 userId 世界里不存在**：
 * 看不到也改不了空间内容，还会被 `getUserCapabilities` 误判成 OWNER。
 *
 * 修复分两步：① 写入侧补上 userId（已改代码）；② 本脚本回填历史行。
 *
 * 用法：
 *   node scripts/backfill-space-member-userid.cjs            # dry-run（默认，只报告）
 *   node scripts/backfill-space-member-userid.cjs --apply    # 真正写入
 *
 * 注意：本库 `spacemember.userId` **没有外键约束**（见方案 §1.3 的结构漂移），
 * 所以对不上的 username 不会被数据库拦住 —— 必须在这里显式报告，人工处理。
 */
const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

const APPLY = process.argv.includes('--apply')

function readEnvUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
    const m = raw.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m)
    if (m) return m[1]
  } catch {
    // 忽略：下面统一报错
  }
  throw new Error('未找到 DATABASE_URL（环境变量与 .env 都没有）')
}

;(async () => {
  const url = new URL(readEnvUrl())
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    charset: 'utf8mb4',
  })

  const [rows] = await conn.query(
    'SELECT id, spaceId, username, role, status FROM `SpaceMember` WHERE userId IS NULL ORDER BY id',
  )

  console.log(`\n[backfill-space-member-userid] 模式：${APPLY ? 'APPLY（会写库）' : 'DRY-RUN（只报告）'}`)
  console.log(`待回填的成员行：${rows.length}\n`)
  if (rows.length === 0) {
    console.log('✅ 没有 userId 为空的成员行，无需回填。\n')
    await conn.end()
    return
  }

  let filled = 0
  const unmatched = []

  for (const row of rows) {
    const [users] = await conn.query('SELECT id FROM `User` WHERE username = ? LIMIT 1', [row.username])
    if (!users.length) {
      unmatched.push(row)
      console.log(`  ⚠️  #${row.id} space=${row.spaceId} username=${row.username} → 找不到对应用户，跳过`)
      continue
    }
    const userId = users[0].id
    if (APPLY) {
      await conn.query('UPDATE `SpaceMember` SET userId = ? WHERE id = ?', [userId, row.id])
    }
    filled++
    console.log(`  ${APPLY ? '✔ 已回填' : '· 将回填'} #${row.id} space=${row.spaceId} ${row.username} → userId=${userId}`)
  }

  console.log(`\n合计：${APPLY ? '已回填' : '可回填'} ${filled} 行，未匹配 ${unmatched.length} 行`)
  if (unmatched.length) {
    console.log('\n未匹配的 username 需要人工处理（该库 userId 无外键，不会自动兜底）：')
    for (const r of unmatched) console.log(`  - SpaceMember#${r.id}  space=${r.spaceId}  username=${r.username}  role=${r.role}`)
  }
  if (!APPLY) console.log('\n加 --apply 才会真正写入。\n')
  else console.log('')

  await conn.end()
})().catch((e) => {
  console.error('[backfill-space-member-userid] 失败：', e.message)
  process.exitCode = 1
})
