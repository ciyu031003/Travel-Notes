import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import mysql from 'mysql2/promise'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

/**
 * B：存量 db-push 库升级自动修复 —— 真实 MySQL 集成验证。
 *
 * 需要外部临时 MySQL（CI 的 mysql service 或本机临时实例），通过环境变量提供：
 *   TN_BOOTSTRAP_IT_DATABASE_URL=mysql://root@127.0.0.1:13307/tn_bootstrap_it
 * 未设置时整文件 skip（不拖慢普通单测/CI 之外的运行）。
 *
 * 覆盖：
 *  1) P3018 现场：init schema + P1 的 7 个对象都已存在（历史 db push 建过）→ bootstrap 自动补齐
 *     后续 schema（B4 表/updatedAt 索引）→ resolve 全部迁移 → migrate deploy 无待应用 → diff 0。
 *  2) 真正 partial：init schema + 仅部分 P1 对象 → 同样自动修复。
 */
const requireCjs = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bootstrap: any = requireCjs('../../scripts/migrate-bootstrap.cjs')

const IT_URL = process.env.TN_BOOTSTRAP_IT_DATABASE_URL
const itDescribe = IT_URL ? describe : describe.skip

const REPO_ROOT = process.cwd()
const INIT_SQL = path.join(REPO_ROOT, 'prisma/migrations/20261018000000_init/migration.sql')
const P1_SQL = path.join(REPO_ROOT, 'prisma/migrations/20261018120000_p1_indexes_and_site_role/migration.sql')

function prismaBin() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx'
}

function cfg() {
  return bootstrap.parseDatabaseUrl(IT_URL as string)
}

async function adminConn() {
  const c = cfg()
  return mysql.createConnection({ host: c.host, port: c.port, user: c.user, password: c.password })
}

async function dbConn(extra: Record<string, unknown> = {}) {
  const c = cfg()
  return mysql.createConnection({ host: c.host, port: c.port, user: c.user, password: c.password, database: c.database, ...extra })
}

async function resetDatabase() {
  const c = cfg()
  const admin = await adminConn()
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${c.database}\``)
    await admin.query(`CREATE DATABASE \`${c.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  } finally {
    await admin.end()
  }
}

/**
 * 模拟历史 db push 的索引命名：旧的 travelId 外键列会被 MySQL 以 `<Table>_<col>_fkey`
 * 自动建索引，而 Prisma schema 期望 `<Table>_<col>_idx`。db-push 库实际就是后者，
 * 所以模拟时把这两个外键索引改名，避免造出真实升级里不存在的 RENAME 差异。
 */
async function emulateDbPushIndexNames(conn: any) {
  const renames: Array<[string, string, string]> = [
    ['album', 'Album_travelId_fkey', 'Album_travelId_idx'],
    ['memory', 'Memory_travelId_fkey', 'Memory_travelId_idx'],
  ]
  for (const [table, from, to] of renames) {
    await conn.query(`ALTER TABLE \`${table}\` RENAME INDEX \`${from}\` TO \`${to}\``).catch(() => {})
  }
}

/**
 * 模拟 1.24.8 db-push 库：init 全量 schema + 指定数量的 P1 语句已应用（无 _prisma_migrations）。
 * @param mode 'all' = P1 语句全应用；'partial' = 除 Media_storageKey_idx 外都已存在（历史 db push 状态）
 */
async function setupLegacyDb(mode: 'all' | 'partial') {
  await resetDatabase()
  const conn = await dbConn({ multipleStatements: true })
  try {
    await conn.query(fs.readFileSync(INIT_SQL, 'utf8'))
    const p1Statements = bootstrap.splitSqlStatements(fs.readFileSync(P1_SQL, 'utf8'))
    if (mode === 'all') {
      for (const statement of p1Statements) await conn.query(statement)
      return
    }
    // partial：db push 已为 travelId 外键建出 *_idx（改名模拟），只有 Media_storageKey_idx 没建过
    await emulateDbPushIndexNames(conn)
    const alreadyPresent = ['Memory_travelId_idx', 'Album_travelId_idx', 'Media_storageKey_idx']
    for (const statement of p1Statements) {
      if (alreadyPresent.some((name) => statement.includes(name))) continue
      await conn.query(statement)
    }
  } finally {
    await conn.end()
  }
}

function runNode(scriptPath: string, args: string[], timeout = 120_000) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: IT_URL as string },
    timeout,
  })
}

function runPrisma(args: string[], timeout = 120_000) {
  return spawnSync(prismaBin(), ['prisma', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: IT_URL as string },
    // Windows 下 spawn .cmd 需要 shell；容器/CI（Linux）不加
    shell: process.platform === 'win32',
    timeout,
  })
}

async function assertMigrationState() {
  // 1) schema 与 schema.prisma 无差异（0 = 无漂移；2 = 有漂移；1 = 命令错误）
  const diff = runPrisma(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'])
  expect(diff.status, diff.stdout + diff.stderr).toBe(0)

  // 2) 所有迁移都已记录且成功
  const expected = bootstrap.listMigrationNames()
  const conn = await dbConn()
  try {
    const [rows] = await conn.query(
      'SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name',
    )
    const applied = (rows as Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>).filter(
      (row) => row.finished_at != null && row.rolled_back_at == null,
    )
    expect(applied.map((row) => row.migration_name)).toEqual(expected)
  } finally {
    await conn.end()
  }

  // 3) entrypoint 的下一步 migrate deploy 应无待应用
  const deploy = runPrisma(['migrate', 'deploy'])
  expect(deploy.status, deploy.stdout + deploy.stderr).toBe(0)
  expect(deploy.stdout + deploy.stderr).toMatch(/No pending migrations|没有待应用|Already in sync/i)
}

itDescribe('migrate-bootstrap 自动修复 · 真实 MySQL', () => {
  beforeAll(async () => {
    await resetDatabase()
  })

  afterAll(async () => {
    const admin = await adminConn()
    try {
      const c = cfg()
      await admin.query(`DROP DATABASE IF EXISTS \`${c.database}\``)
    } finally {
      await admin.end()
    }
  })

  it('P3018 现场（P1 的 7 个对象全部已存在）→ 自动修复成功、diff 0、迁移全部 applied', async () => {
    const p1Count = bootstrap.splitSqlStatements(fs.readFileSync(P1_SQL, 'utf8')).length
    expect(p1Count).toBe(7)
    await setupLegacyDb('all') // 7 个对象全在 = 历史 db push 已把 P1 建完

    const result = runNode(path.join(REPO_ROOT, 'scripts/migrate-bootstrap.cjs'), [])
    expect(result.status, result.stdout + result.stderr).toBe(0)
    expect(result.stdout).toContain('自动修复完成')

    await assertMigrationState()
  }, 180_000)

  it('真正 partial（仅缺 Media_storageKey_idx）→ 自动补齐缺的索引并 resolve', async () => {
    await setupLegacyDb('partial')

    const result = runNode(path.join(REPO_ROOT, 'scripts/migrate-bootstrap.cjs'), [])
    expect(result.status, result.stdout + result.stderr).toBe(0)
    expect(result.stdout).toContain('自动修复完成')

    await assertMigrationState()
  }, 180_000)

  it('修复完成后再次运行 bootstrap → 走「已有 _prisma_migrations 跳过」分支（幂等、零行为变化）', async () => {
    const result = runNode(path.join(REPO_ROOT, 'scripts/migrate-bootstrap.cjs'), [])
    expect(result.status, result.stdout + result.stderr).toBe(0)
    expect(result.stdout).toContain('跳过 bootstrap')
  }, 60_000)

  it('全新空库 → 走「无 User 表」分支，不做任何修复（交给 migrate deploy）', async () => {
    await resetDatabase()
    const result = runNode(path.join(REPO_ROOT, 'scripts/migrate-bootstrap.cjs'), [])
    expect(result.status, result.stdout + result.stderr).toBe(0)
    expect(result.stdout).toContain('全新库')
    expect(result.stdout).not.toContain('自动修复')
  }, 60_000)
})
