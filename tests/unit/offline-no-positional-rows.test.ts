/**
 * 守卫：离线模块里**禁止按位置读取查询结果行**。
 *
 * 为什么：Android 插件的 `db.query()` 返回的是「按列名索引的对象」
 * （`CapacitorSQLite.Database.selectSQL` 用 `row.put(colName, v)`），
 * 经 `toRows()` 归一化后虽然也能按下标取，但**键序没有任何保证**
 * （org.json 实现细节）。按位置取值的后果是**字段整体错位**：
 * 列表里标题变成日期、slug 读成别的列……而且完全无声。
 *
 * 这一类缺陷在本模块已经出现过四次（旅行列表映射、旅行详情、社交 Feed、
 * 相册/碎碎念列表），每次都是"看起来正常、真机上数据错乱"。所以用一条
 * 静态守卫把它钉死：一律用 `rowGet(row, '列名')`。
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(process.cwd(), 'lib', 'modules', 'offline')

/** 允许的例外：这里处理的是**真正的数组行**（数组形态下的列名首行判定），不是对象行 */
const ALLOWED = new Set(['native/sqlite-db.ts'])

function walk(dir: string, base = ''): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const rel = base ? `${base}/${name}` : name
    if (statSync(full).isDirectory()) out.push(...walk(full, rel))
    else if (name.endsWith('.ts')) out.push(rel)
  }
  return out
}

/** 行变量的位置取值：r[0]、row[3]、rows[0][1]、existing[0][2]… */
const POSITIONAL = /\b(r|row|rows\[0\]|bySlug\[0\]|byId|existing\[0\])\[\d+\]/

describe('离线模块 · 禁止按位置读取结果行', () => {
  it('所有 .ts 里都不应出现 r[0] / row[n] 之类的取值', () => {
    const offenders: string[] = []
    for (const rel of walk(ROOT)) {
      if (ALLOWED.has(rel)) continue
      const lines = readFileSync(join(ROOT, rel), 'utf8').split(/\r?\n/)
      lines.forEach((line, i) => {
        const t = line.trim()
        // 跳过注释（含说明性文档）
        if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return
        if (POSITIONAL.test(line)) offenders.push(`${rel}:${i + 1}  ${t.slice(0, 100)}`)
      })
    }
    expect(offenders, '改用 rowGet(row, "列名") 取值').toEqual([])
  })
})
