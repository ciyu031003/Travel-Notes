#!/usr/bin/env node
/**
 * P0-8 / B 迁移基线兼容脚本（entrypoint 在 prisma migrate deploy 之前调用）
 *
 * 背景：项目此前没有 Prisma Migrate 历史，生产库是靠 hand-written DDL + prisma db push
 * 长出来的。现在以 prisma/migrations/20261018000000_init 为基线（= P1 之前的 schema），
 * 之后紧跟 20261018120000_p1_indexes_and_site_role（P1 索引 + P0 User.siteRole）等增量迁移。
 * 存量库不能直接 migrate deploy 基线（基线 SQL 是 CREATE TABLE，会撞上已存在的表）。
 *
 * 分支（跑在 entrypoint 的 migrate deploy 之前）：
 *   ① 已有 _prisma_migrations 表 → Migrate 已接管：跳过（零行为变化）；
 *   ② 无 _prisma_migrations 且无 User 表 → 全新库：跳过，交给 deploy 从基线建表；
 *   ③ 无 _prisma_migrations 但有 User 表 → 存量库：
 *      ③a. 先把基线标记为已应用（prisma migrate resolve --applied 20261018000000_init）；
 *      ③b. 探测 P1 的 7 个对象（siteRole 列 + 6 个索引）：
 *          · 全部不存在 → 正常交给 deploy（旧行为）；
 *          · 部分/全部已存在（历史 db push 加过）→ **自动修复**：
 *            - npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
 *              计算「live → schema」缺失 SQL；
 *            - 只保留加法语句（CREATE TABLE / CREATE [UNIQUE] INDEX / ALTER TABLE ... ADD COLUMN），
 *              出现 DROP / RENAME / MODIFY 等破坏性语句立即中止（绝不删数据）；
 *            - 用 mysql2 逐条执行；
 *            - 复核 diff 已为空后，把 prisma/migrations 里尚未记录的迁移逐个 resolve --applied
 *              （若待 resolve 的迁移 SQL 含数据回填语句则中止，避免"跳过数据步骤"）；
 *            - 返回 0，由 entrypoint 的 migrate deploy 收尾（应无待应用）。
 *
 * 失败：任一步非 0 退出并打印手工恢复指引（docs/DEPLOYMENT.md「存量 db-push 库升级到 Migrate」）。
 * entrypoint 有 set -e，会阻止带不确定 schema 的应用启动；本脚本不会删除/回滚任何数据。
 *
 * 注意：容器内是 Linux；本地 Windows 调试时 npx -> npx.cmd。
 */
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const mysql = require('mysql2/promise')

const BASELINE_MIGRATION = '20261018000000_init'
/** 自动修复时探测的 P1 对象（顺序与 20261018120000_p1_indexes_and_site_role 一致） */
const P1_OBJECTS = [
  { kind: 'column', table: 'User', name: 'siteRole', label: 'User.siteRole 列' },
  { kind: 'index', table: 'User', name: 'User_siteRole_idx', label: 'User_siteRole_idx' },
  { kind: 'index', table: 'SpaceMember', name: 'SpaceMember_userId_status_idx', label: 'SpaceMember_userId_status_idx' },
  { kind: 'index', table: 'SpaceMember', name: 'SpaceMember_username_status_idx', label: 'SpaceMember_username_status_idx' },
  { kind: 'index', table: 'Memory', name: 'Memory_travelId_idx', label: 'Memory_travelId_idx' },
  { kind: 'index', table: 'Media', name: 'Media_storageKey_idx', label: 'Media_storageKey_idx' },
  { kind: 'index', table: 'Album', name: 'Album_travelId_idx', label: 'Album_travelId_idx' },
]

const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations')
const DEPLOYMENT_DOC = 'docs/DEPLOYMENT.md'

// ============================================================
// 纯函数（可单测；集成测试通过 child_process 跑本脚本的 CLI）
// ============================================================

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

/**
 * 把一段 SQL 脚本切成语句：去掉 `--`、`#` 行注释；
 * 拆分时跳过单引号 / 双引号 / 反引号内的分号（DEFAULT ';' 之类不会被误切）。
 */
function splitSqlStatements(sql) {
  const statements = []
  let current = ''
  let quote = null
  let i = 0
  while (i < sql.length) {
    const ch = sql[i]
    const next = sql[i + 1]
    if (quote) {
      current += ch
      if (ch === '\\') {
        // 转义字符：连同下一个字符一起保留
        if (i + 1 < sql.length) {
          current += sql[i + 1]
          i += 2
          continue
        }
      } else if (ch === quote) {
        quote = null
      }
      i++
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      current += ch
      i++
      continue
    }
    if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i++
      continue
    }
    if (ch === '#') {
      while (i < sql.length && sql[i] !== '\n') i++
      continue
    }
    if (ch === ';') {
      const trimmed = current.trim()
      if (trimmed) statements.push(trimmed)
      current = ''
      i++
      continue
    }
    current += ch
    i++
  }
  const tail = current.trim()
  if (tail) statements.push(tail)
  return statements
}

function normalizeStatement(statement) {
  return statement.replace(/\s+/g, ' ').trim()
}

/** 是否是允许自动执行的「加法 DDL」：CREATE TABLE / CREATE [UNIQUE] INDEX / ALTER TABLE ... ADD COLUMN */
function isAdditiveStatement(statement) {
  const s = normalizeStatement(statement)
  if (/^CREATE\s+TABLE\b/i.test(s)) return true
  if (/^CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(s)) return true
  if (/^ALTER\s+TABLE\s+[^;]+?\s+ADD\s+COLUMN\b/i.test(s)) return true
  return false
}

/**
 * 过滤出可安全自动执行的加法语句。
 * @returns {{ statements: string[], rejected: string[] }}
 */
function filterAdditiveStatements(statements) {
  const accepted = []
  const rejected = []
  for (const raw of statements) {
    const statement = raw.trim()
    if (!statement) continue
    // 多条 ALTER 子句用逗号连接时逐段判定，避免 "ADD COLUMN a, ADD COLUMN b" 被误判
    if (isAdditiveStatement(statement)) {
      accepted.push(statement)
    } else {
      rejected.push(statement)
    }
  }
  return { statements: accepted, rejected }
}

/** 对整段 SQL 做同样的过滤（供 diff 输出直接使用） */
function filterAdditiveSql(sql) {
  return filterAdditiveStatements(splitSqlStatements(sql))
}

/**
 * 对象探测结果评估：全部不存在 / 部分存在 / 全部存在。
 * @param {Array<{kind:string,table:string,name:string,label:string}>} objects
 * @param {Record<string, boolean>} existsMap key = kind:table:name
 */
function evaluateObjects(objects, existsMap) {
  const present = []
  const missing = []
  for (const object of objects) {
    const key = objectKey(object)
    if (existsMap[key]) present.push(object)
    else missing.push(object)
  }
  const state = present.length === 0 ? 'none' : missing.length === 0 ? 'all' : 'partial'
  return { state, present, missing }
}

function objectKey(object) {
  return object.kind + ':' + object.table + ':' + object.name
}

/** 迁移 SQL 是否包含数据回填语句：含则不能自动 resolve（会跳过数据步骤） */
function hasDataStatements(sql) {
  const statements = splitSqlStatements(sql)
  return statements.some((statement) => /^(INSERT|UPDATE|DELETE|REPLACE|TRUNCATE)\b/i.test(statement.trim()))
}

// ============================================================
// 环境/DB 辅助
// ============================================================

function npxCommand() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx'
}

async function tableExists(conn, database, table) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1',
    [database, table],
  )
  return rows.length > 0
}

/** 探测 P1 的 7 个对象是否存在（列查 columns，索引查 statistics） */
async function detectP1Objects(conn, database, objects = P1_OBJECTS) {
  const existsMap = {}
  for (const object of objects) {
    let rows
    if (object.kind === 'column') {
      ;[rows] = await conn.query(
        'SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1',
        [database, object.table, object.name],
      )
    } else {
      ;[rows] = await conn.query(
        'SELECT 1 FROM information_schema.statistics WHERE table_schema = ? AND table_name = ? AND index_name = ? LIMIT 1',
        [database, object.table, object.name],
      )
    }
    existsMap[objectKey(object)] = rows.length > 0
  }
  return existsMap
}

function runPrisma(args, options = {}) {
  // Windows 下 spawn .cmd 需要 shell（否则 Node 22 抛 EINVAL）；容器内（Linux）保持原样
  const isWindows = process.platform === 'win32'
  const result = spawnSync(npxCommand(), ['prisma', ...args], {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 50 * 1024 * 1024,
    shell: isWindows,
    ...options,
  })
  return {
    status: result.status === null ? 1 : result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
  }
}

/** live → schema 的缺失 SQL（Prisma 输出到 stdout；stderr 是日志） */
function computeMissingSchemaSql() {
  return runPrisma(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--script'])
}

/** 复核 diff 是否为空：0 = 无差异，2 = 有差异，1 = 命令出错 */
function verifyNoSchemaDrift() {
  return runPrisma(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'])
}

function listMigrationNames(dir = MIGRATIONS_DIR) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d{8,}/.test(entry.name))
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

function readMigrationSql(name, dir = MIGRATIONS_DIR) {
  const file = path.join(dir, name, 'migration.sql')
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

async function appliedMigrationNames(conn) {
  const [rows] = await conn.query(
    'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
  )
  return new Set(rows.map((row) => row.migration_name))
}

function resolveMigrationApplied(name) {
  return runPrisma(['migrate', 'resolve', '--applied', name], { stdio: 'inherit' })
}

async function applyAdditiveStatements(conn, statements) {
  for (let index = 0; index < statements.length; index++) {
    const statement = statements[index]
    console.log(`[migrate-bootstrap]   [${index + 1}/${statements.length}] ${statement.replace(/\s+/g, ' ').slice(0, 160)}`)
    await conn.query(statement)
  }
}

/** 手工恢复指引（失败时打印；与 DEPLOYMENT.md 章节保持一致） */
function printManualRecoveryGuide(reason) {
  console.error('')
  console.error('[migrate-bootstrap] ❌ 自动修复失败：' + reason)
  console.error('[migrate-bootstrap] 数据库没有被本脚本删除或回滚任何数据；请按下面的手工步骤恢复：')
  console.error('  详见 ' + DEPLOYMENT_DOC + '「存量 db-push 库升级到 Migrate」')
  console.error('  1) 确认失败的迁移：')
  console.error("     docker exec travel-notes-db sh -c 'MYSQL_PWD=\"$MYSQL_ROOT_PASSWORD\" mysql -uroot travel_notes -e \"SELECT migration_name,finished_at,rolled_back_at FROM _prisma_migrations\"'")
  console.error('  2) 计算「库里还缺什么」：')
  console.error("     docker compose run --rm --no-deps --entrypoint sh app -c 'cd /app && npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script' > /tmp/diff.sql")
  console.error('  3) 审阅 /tmp/diff.sql（只应含新增表/索引/列），备份数据库后执行：')
  console.error("     docker cp /tmp/diff.sql travel-notes-db:/tmp/ && docker exec travel-notes-db sh -c 'MYSQL_PWD=\"$MYSQL_ROOT_PASSWORD\" mysql -uroot travel_notes < /tmp/diff.sql'")
  console.error('  4) 把尚未记录的迁移逐个标记为已应用（按 prisma/migrations 目录名）：')
  console.error('     docker compose run --rm --no-deps --entrypoint sh app -c \'cd /app && npx prisma migrate resolve --applied <迁移目录名>\'')
  console.error('  5) 清理失败历史行（可选）：')
  console.error("     DELETE FROM _prisma_migrations WHERE finished_at IS NULL;")
  console.error('  6) 重启并确认 /api/health 200 且 migrations=ok')
}

// ============================================================
// 主流程
// ============================================================

async function repairLegacyDatabase(conn, cfg) {
  const existsMap = await detectP1Objects(conn, cfg.database)
  const evaluation = evaluateObjects(P1_OBJECTS, existsMap)
  console.log(
    `[migrate-bootstrap] P1 对象探测：已有 ${evaluation.present.length}/${P1_OBJECTS.length}` +
      (evaluation.present.length > 0 ? '（' + evaluation.present.map((o) => o.label).join('、') + '）' : ''),
  )

  if (evaluation.state === 'none') {
    console.log('[migrate-bootstrap] P1 对象均不存在 → 历史库即基线 schema，交给 migrate deploy 正常应用增量迁移。')
    return 0
  }

  console.log(`[migrate-bootstrap] 检测到历史 db-push 已部分/全部创建 P1 对象（${evaluation.state}）→ 进入自动修复：`)
  console.log('[migrate-bootstrap] 计算 live → schema.prisma 的缺失 SQL...')
  const diff = computeMissingSchemaSql()
  if (diff.error || diff.status !== 0) {
    console.error('[migrate-bootstrap] prisma migrate diff 执行失败：', diff.error ? diff.error.message : diff.stderr)
    printManualRecoveryGuide('无法计算 schema 差异（migrate diff 失败）')
    return 1
  }

  const filtered = filterAdditiveSql(diff.stdout)
  if (filtered.rejected.length > 0) {
    console.error('[migrate-bootstrap] diff 中包含**非加法**语句，自动修复不做破坏性变更：')
    for (const statement of filtered.rejected.slice(0, 20)) {
      console.error('  ✗ ' + statement.replace(/\s+/g, ' ').slice(0, 200))
    }
    printManualRecoveryGuide('存在需要人工审阅的 DROP/RENAME/MODIFY 等破坏性差异')
    return 1
  }

  if (filtered.statements.length === 0) {
    console.log('[migrate-bootstrap] diff 为空：live schema 已与 schema.prisma 一致，无需补 DDL。')
  } else {
    console.log(`[migrate-bootstrap] 待补加法语句 ${filtered.statements.length} 条（不删除任何数据）：`)
    try {
      await applyAdditiveStatements(conn, filtered.statements)
    } catch (error) {
      console.error('[migrate-bootstrap] 执行加法 DDL 失败：', error && error.message ? error.message : error)
      printManualRecoveryGuide('应用缺失 DDL 时失败（可能有并发/权限/语法问题）')
      return 1
    }
  }

  // 复核：此时 live 应与 schema.prisma 无差异，否则不能标记迁移为已应用
  const verify = verifyNoSchemaDrift()
  if (verify.error || verify.status !== 0) {
    console.error('[migrate-bootstrap] 修复后复核仍有 schema 差异（exit ' + verify.status + '）：')
    if (verify.stdout.trim()) console.error(verify.stdout.trim().slice(0, 4000))
    if (verify.stderr.trim()) console.error(verify.stderr.trim().slice(-2000))
    printManualRecoveryGuide('自动修复后仍存在 schema 差异')
    return 1
  }

  // 逐个 resolve 尚未记录的迁移（保持目录顺序；含数据回填语句的迁移不自动 resolve）
  const applied = await appliedMigrationNames(conn)
  const pending = listMigrationNames().filter((name) => !applied.has(name))
  if (pending.length === 0) {
    console.log('[migrate-bootstrap] 没有待标记的迁移（_prisma_migrations 已是最新）。')
    return 0
  }

  for (const name of pending) {
    const sql = readMigrationSql(name)
    if (sql && hasDataStatements(sql)) {
      console.error(`[migrate-bootstrap] 迁移 ${name} 含数据回填语句，自动 resolve 会跳过数据步骤 → 中止。`)
      printManualRecoveryGuide(`迁移 ${name} 含数据回填，需人工执行`)
      return 1
    }
    console.log(`[migrate-bootstrap] 标记迁移为已应用：${name}`)
    const result = resolveMigrationApplied(name)
    if (result.error || result.status !== 0) {
      console.error(`[migrate-bootstrap] prisma migrate resolve --applied ${name} 失败`)
      printManualRecoveryGuide(`标记迁移 ${name} 失败`)
      return 1
    }
  }

  console.log('[migrate-bootstrap] ✅ 自动修复完成：缺失 DDL 已补齐、迁移已标记，migrate deploy 将无待应用。')
  return 0
}

async function main() {
  const raw = process.env.DATABASE_URL
  if (!raw) {
    console.error('[migrate-bootstrap] 缺少 DATABASE_URL，无法判断迁移状态')
    printManualRecoveryGuide('缺少 DATABASE_URL')
    return 1
  }
  const cfg = parseDatabaseUrl(raw)
  let conn
  try {
    conn = await mysql.createConnection({ ...cfg, connectTimeout: 10000 })
  } catch (error) {
    console.error('[migrate-bootstrap] 连接数据库失败：', error && error.message ? error.message : error)
    printManualRecoveryGuide('无法连接数据库')
    return 1
  }

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
    const status = resolveBaseline()
    if (status !== 0) {
      console.error(`[migrate-bootstrap] prisma migrate resolve 失败（exit ${status}）`)
      printManualRecoveryGuide('标记基线迁移失败')
      return 1
    }
    console.log('[migrate-bootstrap] 基线已标记为已应用。')

    return await repairLegacyDatabase(conn, cfg)
  } finally {
    await conn.end().catch(() => {})
  }
}

function resolveBaseline() {
  const result = runPrisma(['migrate', 'resolve', '--applied', BASELINE_MIGRATION], { stdio: 'inherit' })
  if (result.error) {
    console.error('[migrate-bootstrap] 启动 prisma migrate resolve 失败:', result.error.message)
    return 1
  }
  return result.status
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('[migrate-bootstrap] 失败:', err && err.stack ? err.stack : err)
      printManualRecoveryGuide('未预期的异常')
      process.exit(1)
    })
}

module.exports = {
  BASELINE_MIGRATION,
  P1_OBJECTS,
  DEPLOYMENT_DOC,
  parseDatabaseUrl,
  splitSqlStatements,
  isAdditiveStatement,
  filterAdditiveStatements,
  filterAdditiveSql,
  evaluateObjects,
  objectKey,
  hasDataStatements,
  listMigrationNames,
  readMigrationSql,
  detectP1Objects,
  printManualRecoveryGuide,
}
