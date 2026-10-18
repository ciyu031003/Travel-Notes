#!/usr/bin/env node
/**
 * P0-8 迁移基线兼容脚本（entrypoint 在 prisma migrate deploy 之前调用）
 *
 * 背景：项目此前没有 Prisma Migrate 历史，生产库是靠 hand-written DDL + prisma db push
 * 长出来的。现在以 prisma/migrations/20261018000000_init 为基线（= P1 之前的 schema），
 * 之后紧跟 20261018120000_p1_indexes_and_site_role 增量迁移（P1 索引 + P0 User.siteRole）。
 * 存量库不能直接 migrate deploy 基线（基线 SQL 是 CREATE TABLE，会撞上已存在的表）。
 *
 * 三种情况：
 *   ① 已有 _prisma_migrations 表  → 说明已经是 Migrate 管理的库，什么都不做；
 *   ② 没有 _prisma_migrations 但有 User 表 → 存量库：把基线标记为「已应用」
 *      （prisma migrate resolve --applied 20261018000000_init），随后 migrate deploy
 *      会应用增量迁移（补 siteRole 列与 P1 索引）；
 *   ③ 两者都没有 → 全新库：什么都不做，交给 migrate deploy 从基线建表。
 *
 * 失败必须非 0 退出（entrypoint 有 set -e，会阻止带不确定 schema 的应用启动）。
 *
 * 注意：情况 ② 假设存量库 schema 与「P1 之前」的 schema.prisma 一致。若历史上手工 DDL / db push
 * 已经加过 P1 索引或 siteRole，增量迁移会因「列/索引已存在」失败 —— 升级前先跑一次
 *   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
 * 核对真实漂移（见 docs/DEPLOYMENT.md「数据库迁移」）。
 */
const { spawnSync } = require('node:child_process')
const mysql = require('mysql2/promise')

const BASELINE_MIGRATION = '20261018000000_init'

function parseDatabaseUrl(raw) {
  const url = new URL(raw.replace('mysql://', 'http://'))
  return {
    host: url.hostname,
    port: parseInt(url.port || '3306', 10),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
  }
}

async function tableExists(conn, database, table) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1',
    [database, table],
  )
  return rows.length > 0
}

function resolveBaseline() {
  // 容器内是 Linux；本地 Windows 调试时 npx -> npx.cmd
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const result = spawnSync(npx, ['prisma', 'migrate', 'resolve', '--applied', BASELINE_MIGRATION], {
    stdio: 'inherit',
    env: process.env,
  })
  if (result.error) {
    console.error('[migrate-bootstrap] 启动 prisma migrate resolve 失败:', result.error.message)
    return 1
  }
  return result.status === null ? 1 : result.status
}

async function main() {
  const raw = process.env.DATABASE_URL
  if (!raw) {
    console.error('[migrate-bootstrap] 缺少 DATABASE_URL，无法判断迁移状态')
    return 1
  }
  const cfg = parseDatabaseUrl(raw)
  const conn = await mysql.createConnection({ ...cfg, connectTimeout: 10000 })
  try {
    const hasMigrationTable = await tableExists(conn, cfg.database, '_prisma_migrations')
    if (hasMigrationTable) {
      console.log('[migrate-bootstrap] 检测到 _prisma_migrations，跳过 bootstrap（交给 migrate deploy）')
      return 0
    }

    const hasLegacyTables = await tableExists(conn, cfg.database, 'User')
    if (!hasLegacyTables) {
      console.log('[migrate-bootstrap] 全新库（无 User 表），跳过 bootstrap（由 migrate deploy 建表）')
      return 0
    }

    console.log(
      `[migrate-bootstrap] 存量库（有 User 表、无 _prisma_migrations）：把基线 ${BASELINE_MIGRATION} 标记为已应用...`,
    )
    console.log('[migrate-bootstrap] 若存量库 schema 与 schema.prisma 不一致，migrate deploy 不会自动修复，请按 DEPLOYMENT.md 先做一次 diff 核对。')
    const status = resolveBaseline()
    if (status !== 0) {
      console.error(`[migrate-bootstrap] prisma migrate resolve 失败（exit ${status}）`)
      return 1
    }
    console.log('[migrate-bootstrap] 基线已标记为已应用。')
    return 0
  } finally {
    await conn.end().catch(() => {})
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[migrate-bootstrap] 失败:', err && err.stack ? err.stack : err)
    process.exit(1)
  })
