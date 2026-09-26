/**
 * 结构一致性守卫：`CREATE_TABLES_SQL` 与 `DESIRED_COLUMNS`（自愈清单）必须对齐。
 *
 * 为什么需要这条测试：
 * 自愈（healColumns）只会补 `DESIRED_COLUMNS` 里列出的列。**清单漏了哪张表/哪一列，
 * 老设备上那一列就永远补不上** —— 而 SQLite 的 `CREATE TABLE IF NOT EXISTS`
 * 对已存在的表什么都不做。历史教训：`sync_queue` 整张表都不在清单里，
 * 而它的 INSERT/SELECT 是**显式列举全部列**的（不像 local-write 会按真实列过滤），
 * 一旦老设备缺列就整条抛错 → 本地写入进不了队列、待上传项读不出来
 * → **用户创作永远上不了云**，且完全无声。
 *
 * 所以这里直接从建表语句**解析出真实列**，逐一要求清单覆盖（主键除外，
 * 因为 ALTER TABLE 不能新增主键列，主键列在表存在时必然已有）。
 */
import { describe, it, expect } from 'vitest'
import { CREATE_TABLES_SQL } from '@/lib/modules/offline/schema'
import { DESIRED_COLUMNS } from '@/lib/modules/offline/native/sqlite-db'

interface ParsedTable {
  name: string
  columns: string[]
  primaryKeys: Set<string>
}

/** 从 CREATE TABLE 语句解析表名、列名与主键列 */
function parseCreate(statement: string): ParsedTable | null {
  const m = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*\(([\s\S]+)\)\s*$/i.exec(statement.trim())
  if (!m) return null
  const name = m[1]
  const body = m[2]

  // 按顶层逗号切分（括号内不切，例如 PRIMARY KEY (a, b)）
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of body) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  if (cur.trim()) parts.push(cur)

  const columns: string[] = []
  const primaryKeys = new Set<string>()
  for (const raw of parts) {
    const part = raw.trim()
    if (!part) continue
    const tablePk = /^PRIMARY\s+KEY\s*\(([^)]+)\)/i.exec(part)
    if (tablePk) {
      for (const c of tablePk[1].split(',')) primaryKeys.add(c.trim())
      continue
    }
    const colName = part.split(/\s+/)[0]
    columns.push(colName)
    if (/PRIMARY\s+KEY/i.test(part)) primaryKeys.add(colName)
  }
  return { name, columns, primaryKeys }
}

const tables = CREATE_TABLES_SQL.map(parseCreate).filter((t): t is ParsedTable => t !== null)

describe('schema 与自愈清单一致性', () => {
  it('每条 CREATE TABLE 都能被解析（解析器失效要立刻暴露）', () => {
    expect(tables.length).toBe(CREATE_TABLES_SQL.length)
  })

  it('每张表都在 DESIRED_COLUMNS 里（漏一张表 = 那张表永远不自愈）', () => {
    const missing = tables.filter((t) => !DESIRED_COLUMNS[t.name]).map((t) => t.name)
    expect(missing, '这些表没有出现在自愈清单里').toEqual([])
  })

  it('每张表的非主键列都在清单里（漏一列 = 老设备上那列永远缺失）', () => {
    const problems: string[] = []
    for (const t of tables) {
      const desired = new Set((DESIRED_COLUMNS[t.name] ?? []).map(([c]) => c))
      for (const col of t.columns) {
        if (t.primaryKeys.has(col)) continue
        if (!desired.has(col)) problems.push(`${t.name}.${col}`)
      }
    }
    expect(problems, '以下列不会被自愈补齐').toEqual([])
  })

  it('清单里不应出现建表语句里不存在的列（避免 ALTER 无意义地失败）', () => {
    const problems: string[] = []
    for (const t of tables) {
      const cols = new Set(t.columns)
      for (const [col] of DESIRED_COLUMNS[t.name] ?? []) {
        if (!cols.has(col)) problems.push(`${t.name}.${col}`)
      }
    }
    expect(problems, '清单里有建表语句中没有的列').toEqual([])
  })

  it('关键表 sync_queue 必须在清单里（它决定能否上传）', () => {
    expect(Object.keys(DESIRED_COLUMNS)).toContain('sync_queue')
  })
})
