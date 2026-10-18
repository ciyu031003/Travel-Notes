#!/usr/bin/env node
/**
 * P2-31 视觉零变化证据：设计 token 三层化 parity 校验。
 *
 * 背景：app/tokens.css 把 app/globals.css + app/mobile.css 中的 legacy token
 * （--m-* / --album-* / --social-* / --space-* / --semantic-* / --color-* /
 * --shadow-* / --danger-soft / --art-*）改写成「legacy 别名 → --ui-* → --palette-*」。
 * 只要任何一条 legacy token 的最终字面值发生变化，就说明视觉可能回归。
 *
 * 数据来源（按优先级）：
 *   1) scripts/token-parity-baseline.json —— 改造前从 git HEAD 导出的 (scope, var) → 值快照
 *   2) 没有基线文件时，回退到 git show HEAD:app/globals.css + app/mobile.css
 *
 * 校验内容：
 *   A. 基线里每个 (作用域, legacy token) 在 tokens.css 中都能解析出与改造前相等的最终字面值；
 *      解析链：legacy 别名 var(--ui-*) → --ui-* 角色 → var(--palette-*)；
 *   B. 作用域链正确：html.dark 覆盖 root；[data-space]/html.dark [data-space] 覆盖 root；
 *   C. globals.css / mobile.css 中不再残留 legacy token 的字面值声明（防止两处声明打架）；
 *   D. 每个 legacy 别名必须写成 var(--ui-<role>)，而不是直接写字面值（保证三层结构落地）。
 *
 * 用法：node scripts/check-token-parity.mjs
 * 退出码：0 全部相等；1 存在差异（CI 可直接用）。
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_PATH = join(ROOT, 'scripts/token-parity-baseline.json')
const TOKENS_PATH = join(ROOT, 'app/tokens.css')
const LEGACY_FILES = ['app/globals.css', 'app/mobile.css']
const LEGACY_PREFIXES = ['--m-', '--color-', '--album-', '--shadow-', '--social-', '--space-', '--semantic-']
const LEGACY_EXACT = new Set(['--danger-soft'])

function isLegacyToken(name, scope) {
  if (LEGACY_EXACT.has(name)) return true
  if (name.startsWith('--art-')) return scope === 'root'
  return LEGACY_PREFIXES.some((p) => name.startsWith(p))
}

function blankComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
}

function parseCss(raw) {
  const text = blankComments(raw)
  const rules = []
  const stack = []
  let i = 0
  let bufStart = 0
  let paren = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '"' || ch === "'") {
      const q = ch
      i++
      while (i < text.length && text[i] !== q) {
        if (text[i] === '\\') i++
        i++
      }
      i++
      continue
    }
    if (ch === '{') {
      const header = text.slice(bufStart, i).trim()
      stack.push({ header: header, at: header.startsWith('@'), decls: [] })
      bufStart = i + 1
      i++
      paren = 0
      continue
    }
    if (ch === '}') {
      const t = stack.pop()
      if (t && !t.at) rules.push(t)
      bufStart = i + 1
      i++
      paren = 0
      continue
    }
    if (ch === '(') { paren++; i++; continue }
    if (ch === ')') { paren = Math.max(0, paren - 1); i++; continue }
    if (ch === ';' && paren === 0) {
      const top = stack[stack.length - 1]
      if (top && !top.at) {
        const dr = text.slice(bufStart, i)
        const m = dr.match(/^\s*(--[a-zA-Z0-9-]+)\s*:\s*([\s\S]*?)\s*$/)
        if (m) top.decls.push({ kind: 'var', name: m[1], value: m[2].trim() })
        else if (dr.trim()) top.decls.push({ kind: 'prop', name: '', value: dr.trim() })
      }
      bufStart = i + 1
      i++
      continue
    }
    i++
  }
  return rules
}

function scopeOf(selector) {
  const s = selector.replace(/\s+/g, ' ').trim()
  if (s === ':root') return 'root'
  if (s === 'html.dark') return 'dark'
  let m = s.match(/^\[data-space=['"]([A-Z]+)['"]\]$/i)
  if (m) return 'space:' + m[1].toUpperCase()
  m = s.match(/^html\.dark \[data-space=['"]([A-Z]+)['"]\]$/i)
  if (m) return 'space:' + m[1].toUpperCase() + '+dark'
  return null
}

function chainOf(scope) {
  if (scope === 'root') return ['root']
  if (scope === 'dark') return ['dark', 'root']
  const m = scope.match(/^space:([A-Z]+)(\+dark)?$/)
  if (!m) return [scope]
  const base = 'space:' + m[1]
  return m[2] ? [scope, 'dark', base, 'root'] : [scope, base, 'root']
}

function buildScopeMap(rules) {
  const map = new Map()
  for (const r of rules) {
    const key = scopeOf(r.header)
    if (!key) continue
    if (!map.has(key)) map.set(key, new Map())
    for (const d of r.decls) if (d.kind === 'var') map.get(key).set(d.name, d.value)
  }
  return map
}

function makeResolver(map) {
  const cache = new Map()
  function resolveInScope(name, scope, seen) {
    for (const s of chainOf(scope)) {
      const decls = map.get(s)
      if (decls && decls.has(name)) {
        const value = decls.get(name)
        const key = s + '::' + name + '::' + value
        if (seen.has(key)) return value
        seen.add(key)
        const ref = value.match(/^var\((--[a-zA-Z0-9-]+)\)$/)
        if (ref) return resolveInScope(ref[1], s, seen)
        return value
      }
    }
    return null
  }
  return (name, scope) => {
    const k = scope + '::' + name
    if (!cache.has(k)) cache.set(k, resolveInScope(name, scope, new Set()))
    return cache.get(k)
  }
}

const norm = (v) => (v == null ? null : v.replace(/\s+/g, ' ').trim().toLowerCase())

function loadBaseline() {
  if (existsSync(BASELINE_PATH)) {
    return { source: 'scripts/token-parity-baseline.json', scopes: JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).scopes }
  }
  const read = (f) => execFileSync('git', ['show', 'HEAD:' + f], { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 }).toString('utf8')
  const scopes = {}
  for (const f of LEGACY_FILES) {
    for (const r of parseCss(read(f))) {
      const key = scopeOf(r.header)
      if (!key) continue
      scopes[key] = scopes[key] || {}
      for (const d of r.decls) if (d.kind === 'var' && isLegacyToken(d.name, key)) scopes[key][d.name] = d.value
    }
  }
  return { source: 'git show HEAD (' + LEGACY_FILES.join(' + ') + ')', scopes }
}

const failures = []
const warnings = []
const baseline = loadBaseline()
const newMap = buildScopeMap(parseCss(readFileSync(TOKENS_PATH, 'utf8')))
const resolveNew = makeResolver(newMap)
const oldMap = new Map()
for (const [scope, vars] of Object.entries(baseline.scopes)) oldMap.set(scope, new Map(Object.entries(vars)))
const resolveOld = makeResolver(oldMap)

let checked = 0
const scopeStats = []
for (const [scope, vars] of Object.entries(baseline.scopes)) {
  let equal = 0
  for (const [name, oldRaw] of Object.entries(vars)) {
    checked++
    const expected = norm(resolveOld(name, scope) || oldRaw)
    const decls = newMap.get(scope)
    const alias = decls ? decls.get(name) : undefined
    if (alias === undefined) {
      failures.push([scope, name, expected, 'MISSING', 'tokens.css 中该作用域缺少 legacy 别名声明'])
      continue
    }
    if (!/^var\(--ui-[a-z0-9-]+\)$/.test(alias)) {
      failures.push([scope, name, expected, alias, 'legacy 变量不是 var(--ui-*) 别名'])
      continue
    }
    const actual = norm(resolveNew(name, scope))
    if (actual !== expected) {
      failures.push([scope, name, expected, actual || 'UNRESOLVED', '最终字面值不相等'])
      continue
    }
    equal++
  }
  scopeStats.push(scope + ': ' + equal + '/' + Object.keys(vars).length)
}

for (const f of LEGACY_FILES) {
  for (const r of parseCss(readFileSync(join(ROOT, f), 'utf8'))) {
    const key = scopeOf(r.header)
    for (const d of r.decls) {
      if (d.kind === 'var' && isLegacyToken(d.name, key)) {
        failures.push([key || f, d.name, '', d.value, f + ' 仍残留 legacy 字面值声明'])
      }
    }
  }
}

for (const f of LEGACY_FILES) {
  const text = readFileSync(join(ROOT, f), 'utf8')
  const hits = text.match(/var\(--palette-[a-z0-9-]+\)/g) || []
  if (hits.length) warnings.push(f + ' 直接引用 --palette-*：' + hits.length + ' 处（应经 --ui-*）')
}

console.log('token parity 校验（P2-31 视觉零变化）')
console.log('='.repeat(64))
console.log('基线来源 :', baseline.source)
console.log('作用域   :', scopeStats.join(' | '))
console.log('token 数 :', checked, ' 相等:', checked - failures.length, ' 不等:', failures.length)
if (warnings.length) warnings.forEach((w) => console.log('WARN', w))
if (failures.length) {
  console.log('')
  console.log('FAIL 存在不一致：')
  for (const row of failures.slice(0, 40)) {
    console.log('  [' + row[0] + '] ' + row[1] + ' | 原因: ' + row[4])
    console.log('    期望: ' + row[2])
    console.log('    实际: ' + row[3])
  }
  if (failures.length > 40) console.log('  … 其余 ' + (failures.length - 40) + ' 条')
  process.exit(1)
}
console.log('')
console.log('PASS 全部相等：legacy token 最终字面值逐条与改造前一致，视觉零变化。')
