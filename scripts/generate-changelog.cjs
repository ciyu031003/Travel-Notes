#!/usr/bin/env node
/**
 * generate-changelog.cjs —— 从 git 提交生成 Markdown 变更日志（发版工程）
 *
 * 为什么需要：CHANGELOG 一直手工维护，发版时容易漏记/格式漂移；本脚本把「提交 → 分组 Markdown」
 * 变成可复现命令，并为后续 release notes 提供底稿。
 *
 * 提交解析规则（新老风格都兼容）：
 *   ① Conventional Commits：feat(scope)!: desc / fix: desc；
 *   ② 仓库历史上的批次式：feat-circle-interactions... / fix-album-... / docs-release-notes-1.24.8-b54
 *      （前缀 + -/_/空格 分隔，分隔符转成空格便于阅读）；
 *   ③ 其余归入 Other（例如中文提交、Update README）；merge 提交一律过滤；同组同文案去重。
 *
 * 用法：
 *   node scripts/generate-changelog.cjs --from v1.0.0 --to HEAD --output docs/release/raw-v1.27.0.md
 *   node scripts/generate-changelog.cjs --from v1.0.0 --check --output docs/release/raw-v1.27.0.md  # 不一致 exit 1
 *   node scripts/generate-changelog.cjs --self-test   # 纯函数自测，不依赖 git 仓库
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

const GROUPS = [
  { key: 'feat', title: 'Features' },
  { key: 'fix', title: 'Bug Fixes' },
  { key: 'security', title: 'Security' },
  { key: 'perf', title: 'Performance' },
  { key: 'refactor', title: 'Refactoring' },
  { key: 'docs', title: 'Documentation' },
  { key: 'test', title: 'Tests' },
  { key: 'chore', title: 'Chores' },
  { key: 'other', title: 'Other Changes' },
]
const KNOWN_TYPES = new Set(['feat', 'fix', 'security', 'perf', 'refactor', 'docs', 'test', 'chore', 'build', 'ci', 'style'])
const TYPE_ALIAS = { build: 'chore', ci: 'chore', style: 'chore' }

const CONVENTIONAL_RE = /^([A-Za-z]+)(?:\(([^)]*)\))?(!)?:\s+(.+)$/
const BATCH_RE = /^([A-Za-z]+)[-_ ]+(.+)$/

/** 解析单条提交标题；merge 返回 null，其余返回 { type, group, scope, breaking, description } */
function parseSubject(raw) {
  const subject = String(raw || '').trim()
  if (!subject) return null
  if (/^Merge\b/i.test(subject)) return null

  const conventional = CONVENTIONAL_RE.exec(subject)
  if (conventional) {
    const type = String(conventional[1] || '').toLowerCase()
    if (KNOWN_TYPES.has(type)) {
      return {
        type,
        group: TYPE_ALIAS[type] || type,
        scope: conventional[2] ? conventional[2].trim() : null,
        breaking: Boolean(conventional[3]),
        description: conventional[4].trim(),
      }
    }
  }

  const batch = BATCH_RE.exec(subject)
  if (batch) {
    const type = String(batch[1] || '').toLowerCase()
    if (KNOWN_TYPES.has(type)) {
      const description = String(batch[2] || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
      if (description) return { type, group: TYPE_ALIAS[type] || type, scope: null, breaking: false, description }
    }
  }

  return { type: 'other', group: 'other', scope: null, breaking: false, description: subject }
}
/** 把 git log 原始行（<shortHash>\t<subject>）解析成提交数组，过滤 merge/空行 */
function parseLogLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t')
      const hash = tab >= 0 ? line.slice(0, tab).trim() : ''
      const subject = tab >= 0 ? line.slice(tab + 1).trim() : line
      const parsed = parseSubject(subject)
      if (!parsed) return null
      return { hash, subject, ...parsed }
    })
    .filter(Boolean)
}

/** 分组 + 去重（同组同文案只保留最新一条，git log 新→旧） */
function groupCommits(commits) {
  const groups = {}
  for (const group of GROUPS) groups[group.key] = []
  const seen = new Set()
  for (const commit of commits) {
    const key = commit.group + '|' + commit.description.toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(key)) continue
    seen.add(key)
    groups[commit.group].push(commit)
  }
  return groups
}

function renderMarkdown(commits, options) {
  const from = options.from || 'beginning'
  const to = options.to || 'HEAD'
  const groups = groupCommits(commits)
  const lines = []
  lines.push('# Changelog: ' + from + '..' + to)
  lines.push('')
  lines.push('> 由 scripts/generate-changelog.cjs 从 git 提交自动生成；请勿手改，发版说明请另写 docs/release/<version>.md。')
  lines.push('> 共 ' + commits.length + ' 条提交（已过滤 merge、同组同文案去重）。')
  lines.push('')
  for (const group of GROUPS) {
    const list = groups[group.key]
    if (list.length === 0) continue
    lines.push('## ' + group.title + ' (' + list.length + ')')
    lines.push('')
    for (const commit of list) {
      const scope = commit.scope ? '**' + commit.scope + '**: ' : ''
      const breaking = commit.breaking ? '**BREAKING** ' : ''
      const hash = commit.hash ? ' (`' + commit.hash + '`)' : ''
      lines.push('- ' + breaking + scope + commit.description + hash)
    }
    lines.push('')
  }
  return lines.join('\n').replace(/\n+$/, '') + '\n'
}

function readGitLog(from, to) {
  const range = from + '..' + to
  return execFileSync('git', ['log', '--no-merges', '--pretty=format:%h%x09%s', range], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
}
/* ───────────────────────── 自测（固定样例，不依赖 git） ───────────────────────── */
function selfTest() {
  const failures = []
  const assert = (label, actual, expected) => {
    const a = JSON.stringify(actual)
    const e = JSON.stringify(expected)
    if (a !== e) failures.push(label + ': expected ' + e + ' got ' + a)
  }

  assert('conventional', parseSubject('feat(album): add gallery grid'), {
    type: 'feat', group: 'feat', scope: 'album', breaking: false, description: 'add gallery grid',
  })
  assert('conventional breaking', parseSubject('feat(api)!: drop legacy endpoint').breaking, true)
  assert('batch style', parseSubject('fix-album-flip-page-rendered-below-book'), {
    type: 'fix', group: 'fix', scope: null, breaking: false, description: 'album flip page rendered below book',
  })
  assert('batch docs', parseSubject('docs-release-notes-1.24.8-b54').group, 'docs')
  assert('merge filtered', parseSubject("Merge branch 'master' of github.com:x/y"), null)
  assert('unknown to other', parseSubject('Update README').group, 'other')
  assert('build alias', parseSubject('build: bump deps').group, 'chore')

  const commits = parseLogLines([
    'aaa111\tfeat: add one',
    'bbb222\tfeat: add one',
    'ccc333\tfix-broken-thing',
    'ddd444\tMerge branch x',
    'eee555\trandom chinese 提交',
  ].join('\n'))
  assert('parse count (merge filtered)', commits.length, 4)
  const groups = groupCommits(commits)
  assert('dedupe feat', groups.feat.length, 1)
  assert('fix group', groups.fix.length, 1)
  assert('other group', groups.other.length, 1)
  const md = renderMarkdown(commits, { from: 'v1.0.0', to: 'HEAD' })
  assert('md has features', md.includes('## Features (1)'), true)
  assert('md has hash', md.includes('(`ccc333`)'), true)
  assert('md header range', md.includes('v1.0.0..HEAD'), true)

  if (failures.length > 0) {
    console.error('[changelog] SELF-TEST FAIL:')
    for (const failure of failures) console.error('  - ' + failure)
    process.exit(1)
  }
  console.log('[changelog] SELF-TEST PASS（覆盖 Conventional/批次式/merge 过滤/去重/分组/渲染）')
}

/* ───────────────────────── CLI ───────────────────────── */
function argValue(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : null
}

function main() {
  if (process.argv.includes('--self-test')) {
    selfTest()
    return
  }
  const from = argValue('--from')
  const to = argValue('--to') || 'HEAD'
  const output = argValue('--output')
  const check = process.argv.includes('--check')
  if (!from) {
    console.error('[changelog] 缺少 --from <tag/commit>（例如 --from v1.0.0）；自测请用 --self-test')
    process.exit(1)
  }
  const markdown = renderMarkdown(parseLogLines(readGitLog(from, to)), { from, to })
  if (check) {
    if (!output) {
      console.error('[changelog] --check 需要配合 --output <file>')
      process.exit(1)
    }
    if (!fs.existsSync(output)) {
      console.error('[changelog] ✗ 输出文件不存在：' + output + '（先生成一次）')
      process.exit(1)
    }
    const current = fs.readFileSync(output, 'utf8').replace(/\r\n/g, '\n')
    if (current !== markdown) {
      console.error('[changelog] ✗ ' + output + ' 与当前提交历史不一致，重新生成：node scripts/generate-changelog.cjs --from ' + from + ' --to ' + to + ' --output ' + output)
      process.exit(1)
    }
    console.log('[changelog] ✓ ' + output + ' 已是最新')
    return
  }
  if (output) {
    fs.writeFileSync(output, markdown, 'utf8')
    console.log('[changelog] 已写入 ' + output + '（' + markdown.split('\n').length + ' 行）')
    return
  }
  process.stdout.write(markdown)
}

module.exports = { parseSubject, parseLogLines, groupCommits, renderMarkdown }

if (require.main === module) {
  main()
}