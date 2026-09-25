#!/usr/bin/env node
/**
 * 一次性回填：把存量旅行标记为"已归档"（confirmedAt = createdAt）。
 *
 * 为什么要回填：本次新增 `Travel.confirmedAt`，语义是"为空 = 进行中的草稿"。
 * 存量旅行在旧版本里本来就已经出现在「最近旅行 / 画册」里，如果不回填，
 * 新版本一上线它们会集体从首页与画册消失（用户视角＝数据丢了）。
 *
 * ⚠️ **只能跑一次**，且必须在任何"新建草稿"出现之前跑完 ——
 * 之后再跑会把用户正在进行中的旅行也标记成已归档。
 * 因此与其他一次性数据脚本一致：必须显式传 --yes-i-backed-up 才执行。
 *
 * 用法：
 *   node --env-file=.env scripts/backfill-travel-confirmed-once.cjs --yes-i-backed-up
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

async function main() {
  if (!process.argv.includes('--yes-i-backed-up')) {
    console.error('拒绝执行：这是一次性数据回填，请先备份数据库并显式加 --yes-i-backed-up')
    process.exit(1)
  }
  const conn = await getConn()
  try {
    const [cols] = await conn.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Travel' AND column_name = 'confirmedAt'"
    )
    if (cols.length === 0) {
      console.error('Travel.confirmedAt 不存在 —— 请先跑 scripts/apply-schema-migration.cjs')
      process.exit(1)
    }
    const [res] = await conn.query('UPDATE Travel SET confirmedAt = createdAt WHERE confirmedAt IS NULL')
    console.log(`[backfill] 已把 ${res.affectedRows} 本存量旅行标记为已归档`)
    const [rows] = await conn.query('SELECT COUNT(*) AS c FROM Travel WHERE confirmedAt IS NULL')
    console.log(`[backfill] 剩余进行中（草稿）数量：${rows[0].c}`)
  } finally {
    await conn.end()
  }
}

main().catch((e) => {
  console.error('[backfill] 失败:', e.message)
  process.exit(1)
})
