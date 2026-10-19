#!/usr/bin/env node
/**
 * split-changelog.cjs — 把单一变更文档按年份/季度拆分（P3-40 文档治理）
 *
 * 输入：docs/design/改动记录.md（唯一变更文档，逐条以 `## YYYY-MM-DD ...` 开头）
 * 输出：
 *   docs/design/changelog/YYYY.md      每年一个文件，内部先给「按季度目录」，再原样保留各节
 *   docs/design/changelog/README.md    年份索引（节数/文件/大小）
 *
 * 设计约束：
 * - **原文件不改**：docs/design/改动记录.md 继续作为 index 与完整历史（避免一次性大迁移破坏引用）；
 * - **幂等**：输出只由输入决定，不写时间戳；重复执行字节级一致；
 * - **不篡改正文**：各节标题/正文原样搬运，只在外层加年份头与季度目录；
 * - `--check` 给 CI/本地用：发现归档文件缺失或与源不一致时 exit 1（配合 pre-commit 或 CI 步骤）。
 *
 * 用法：
 *   node scripts/split-changelog.cjs             # 生成/更新归档
 *   node scripts/split-changelog.cjs --check     # 只校验，不写文件
 *   node scripts/split-changelog.cjs --dry-run   # 只打印统计
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const SOURCE = path.join(ROOT, 'docs/design/改动记录.md')
const OUT_DIR = path.join(ROOT, 'docs/design/changelog')
const SOURCE_REL = 'docs/design/改动记录.md'

const HEADING_RE = /^## (\d{4})-(\d{2})-(\d{2})\b.*$/gm
const QUARTER_LABEL = { 1: 'Q1（1–3 月）', 2: 'Q2（4–6 月）', 3: 'Q3（7–9 月）', 4: 'Q4（10–12 月）' }

function parseSource(text) {
  const matches = [...text.matchAll(HEADING_RE)]
  if (matches.length === 0) {
    throw new Error('未在 ' + SOURCE_REL + ' 找到任何 `## YYYY-MM-DD` 节标题，拒绝生成空归档')
  }
  const firstIndex = matches[0].index
  const preamble = text.slice(0, firstIndex)
  const sections = matches.map((match, index) => {
    const start = match.index
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length
    const raw = text.slice(start, end)
    const [, year, month, day] = match
    return {
      year,
      month,
      day,
      date: year + '-' + month + '-' + day,
      title: match[0].replace(/^## /, '').trim(),
      quarter: Math.floor((Number(month) - 1) / 3) + 1,
      body: raw.replace(/\s+$/, '') + '\n',
    }
  })
  return { preamble, sections }
}

function groupByYear(sections) {
  const years = new Map()
  for (const section of sections) {
    if (!years.has(section.year)) years.set(section.year, [])
    years.get(section.year).push(section)
  }
  return years
}

function renderYear(year, sections) {
  const quarters = new Map()
  for (const section of sections) {
    if (!quarters.has(section.quarter)) quarters.set(section.quarter, [])
    quarters.get(section.quarter).push(section)
  }
  const out = []
  out.push('# ' + year + ' 年改动记录（自动拆分归档）')
  out.push('')
  out.push('> 本文件由 `scripts/split-changelog.cjs` 从 `' + SOURCE_REL + '` 自动生成，**请勿手改**；')
  out.push('> 完整历史与本文件索引见 `docs/design/改动记录.md`（原文件保留为 index）。')
  out.push('> 共 ' + sections.length + ' 节，最早 ' + sections[0].date + '，最近 ' + sections[sections.length - 1].date + '。')
  out.push('')
  out.push('## 目录（按季度）')
  out.push('')
  for (const quarter of [...quarters.keys()].sort((a, b) => a - b)) {
    const list = quarters.get(quarter)
    out.push('### ' + QUARTER_LABEL[quarter] + ' · ' + list.length + ' 节')
    out.push('')
    for (const section of list) out.push('- ' + section.title)
    out.push('')
  }
  out.push('---')
  out.push('')
  for (const section of sections) {
    out.push(section.body.trimEnd())
    out.push('')
  }
  return out.join('\n').replace(/\n+$/, '') + '\n'
}

function renderIndex(years) {
  const out = []
  out.push('# 变更记录归档索引')
  out.push('')
  out.push('> 由 `scripts/split-changelog.cjs` 生成，请勿手改。')
  out.push('> 单一事实源仍是 `docs/design/改动记录.md`（index + 完整历史）；本目录只做按年份归档，便于检索与 Code Review 引用。')
  out.push('')
  out.push('| 年份 | 节数 | 文件 | 大小 |')
  out.push('|---|---|---|---|')
  for (const [year, sections] of years) {
    const file = 'docs/design/changelog/' + year + '.md'
    const bytes = Buffer.byteLength(renderYear(year, sections), 'utf8')
    out.push('| ' + year + ' | ' + sections.length + ' | [' + year + '.md](' + year + '.md) | ' + (bytes / 1024).toFixed(1) + ' KB |')
  }
  out.push('')
  out.push('## 维护方式')
  out.push('')
  out.push('1. 日常变更只追加到 `docs/design/改动记录.md`（保持每节 `## YYYY-MM-DD · 标题` 格式）。')
  out.push('2. 提交前/CI 里跑 `node scripts/split-changelog.cjs` 重新生成归档；`--check` 模式只校验不写。')
  out.push('3. 归档文件禁止手改：需要修历史时改源文件再重新生成。')
  return out.join('\n') + '\n'
}

function main() {
  const check = process.argv.includes('--check')
  const dryRun = process.argv.includes('--dry-run')
  if (!fs.existsSync(SOURCE)) {
    console.error('[split-changelog] 找不到源文件：' + SOURCE_REL)
    process.exit(1)
  }
  const sourceText = fs.readFileSync(SOURCE, 'utf8')
  const { sections } = parseSource(sourceText)
  const years = groupByYear(sections)

  const outputs = new Map()
  for (const [year, yearSections] of years) outputs.set(year + '.md', renderYear(year, yearSections))
  outputs.set('README.md', renderIndex(years))

  if (dryRun) {
    console.log('[split-changelog] dry-run：' + sections.length + ' 节 / ' + years.size + ' 年')
    for (const [name, content] of outputs) console.log('  - ' + name + '（' + Buffer.byteLength(content, 'utf8') + ' bytes）')
    return
  }

  if (check) {
    const problems = []
    for (const [name, content] of outputs) {
      const target = path.join(OUT_DIR, name)
      if (!fs.existsSync(target)) problems.push(name + ' 缺失')
      else if (fs.readFileSync(target, 'utf8') !== content) problems.push(name + ' 与源不一致')
    }
    if (problems.length > 0) {
      console.error('[split-changelog] ✗ 归档未同步（跑 node scripts/split-changelog.cjs 重新生成）：')
      for (const problem of problems) console.error('  - ' + problem)
      process.exit(1)
    }
    console.log('[split-changelog] ✓ 归档已是最新（' + sections.length + ' 节 / ' + years.size + ' 年）')
    return
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  for (const [name, content] of outputs) fs.writeFileSync(path.join(OUT_DIR, name), content, 'utf8')
  console.log('[split-changelog] 已生成 ' + outputs.size + ' 个文件到 docs/design/changelog/（' + sections.length + ' 节 / ' + years.size + ' 年）')
  for (const [year, yearSections] of years) console.log('  - ' + year + '.md：' + yearSections.length + ' 节')
}

try {
  main()
} catch (error) {
  console.error('[split-changelog] ✗ ' + (error && error.message ? error.message : error))
  process.exit(1)
}
