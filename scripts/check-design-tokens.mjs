#!/usr/bin/env node
/**
 * 移动端设计规范一致性检查
 * ============================================================================
 * 目的：把《移动端设计规范》从"文档约定"变成"机制约束"。
 *       没有这一步，改完一轮后新增页面仍会各写各的，几周后回到原样。
 *
 * 用法：
 *   node scripts/check-design-tokens.mjs            # 报告模式（默认，不失败）
 *   node scripts/check-design-tokens.mjs --strict   # CI 模式（有违规即 exit 1）
 *   node scripts/check-design-tokens.mjs --json     # 输出 JSON
 *
 * 检查项：
 *   1. 硬编码颜色（hex / rgb / rgba）出现在组件样式里
 *   2. 直接 import lucide-react（应改走 components/mobile/Icon）
 *   3. 非标字号（不在 7 档字阶内）
 *   4. 字符冒充图标（✦ ✨ ✍ ★ 等）
 *   5. 图标尺寸自由取值（lucide 上的 h-N w-N）
 *   6. 非标圆角（rounded-[Npx] 魔术数字）
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const ROOT = process.cwd()
const SCAN_DIRS = ['components', 'app']
const EXTS = new Set(['.tsx', '.ts'])
const STRICT = process.argv.includes('--strict')
const JSON_OUT = process.argv.includes('--json')

/**
 * 豁免清单：这些文件属于「刻意保留自有视觉」的主题实现，
 * 不计入违规（但仍会以 info 形式提示）。
 */
const THEME_ALLOWLIST = [
  'components/album/sketchbook/',
  'components/album/space/',
  'components/album/pixel',
  'components/album/reader/',
  'components/admin/',
  'app/admin/',
]

/**
 * 图标体系自身与预览台：这些文件的职责就是「引入并展示 lucide 图标」，
 * 不应被计入「应改走 Icon 组件」的违规，否则阈值失去意义。
 */
const ICON_SYSTEM_ALLOWLIST = [
  'components/mobile/Icon.tsx',
  'lib/mobile/icon-system.ts',
  'app/dev/ui/',
]

/** 允许的字号（对应 .m-display / title-1 / title-2 / body / caption / label / stat / tab-label） */
const ALLOWED_FONT_SIZES = new Set([
  32, 24, 18, 15, 13, 11,
])

/**
 * 调色板声明文件：这些文件的职责就是「把颜色集中声明成常量/调色板」，
 * 其中的 hex 属于合法声明（但若与既有 token 重复，仍会被标为可收敛）。
 *
 * 渲染值文件：WebGL / Canvas / 粒子引擎里的颜色是渲染参数，
 * 不是 UI 语义色，收敛价值低，单独归类避免淹没真正的问题。
 */
const PALETTE_FILES = [
  'components/china-map/types.ts',
  'components/travel-info/types.ts',
]
const RENDER_VALUE_FILES = [
  'components/album/StarfieldBackground.tsx',
  'components/album/space/',
  'components/album/driftwall/',
  'components/album/morphslider/',
  'components/home/HeroFootprintMap.tsx',
  'components/china-map/ChinaMap',
]

/**
 * 构建 token 索引：解析 CSS 里的 `--name: #hex` → value → [names]
 * 用于区分两类 hex：
 *   · duplicatesToken —— 值与既有 token 完全相同 ⇒ 应改用该 token（高价值、低风险）
 *   · unmatched       —— 未匹配任何 token ⇒ 多为渲染参数或缺失的新色，需人工判断
 */
function buildTokenIndex() {
  const cssFiles = ['app/globals.css', 'app/mobile.css']
  const byValue = new Map()
  for (const rel of cssFiles) {
    let css
    try {
      css = readFileSync(join(ROOT, rel), 'utf8')
    } catch {
      continue
    }
    for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g)) {
      const name = m[1]
      const value = m[2].toLowerCase()
      const key = value.length === 4
        ? '#' + [...value.slice(1)].map((c) => c + c).join('')
        : value
      if (!byValue.has(key)) byValue.set(key, [])
      if (!byValue.get(key).includes(name)) byValue.get(key).push(name)
    }
  }
  return byValue
}

const TOKEN_BY_VALUE = buildTokenIndex()

function classifyHex(raw) {
  const v = raw.toLowerCase()
  const key = v.length === 4 ? '#' + [...v.slice(1)].map((c) => c + c).join('') : v
  const names = TOKEN_BY_VALUE.get(key)
  return names ? { kind: 'duplicatesToken', token: names[0] } : { kind: 'unmatched' }
}

const CHAR_ICON_RE = /[✦✨✍★☆♡❤️🔥⭐️]/u
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g
const RGBA_RE = /\brgba?\(/g
const LUCIDE_IMPORT_RE = /from\s+['"]lucide-react['"]/
const LUCIDE_JSX_SIZE_RE = /<(?:[A-Z][A-Za-z0-9]*)\s+className="[^"]*\b([hw])-(\d+(?:\.\d+)?)\b/g
const FONT_SIZE_RE = /text-\[(\d+(?:\.\d+)?)px\]/g
const MAGIC_RADIUS_RE = /rounded-\[(\d+(?:\.\d+)?)px\]/g

/**
 * 合法的字面量场景（不计入违规）：
 *  · `<meta name="theme-color" content="#xxx">` —— HTML meta 无法引用 CSS 变量
 *  · `manifest.json` / `og:image` 等元数据
 *  · 集中调色板声明文件（PALETTE_FILES）—— 它们就是「声明处」
 */
function isLegitLiteral(rel, line) {
  if (/content=["']#[0-9a-fA-F]{3,8}["']/.test(line)) return 'meta'
  if (PALETTE_FILES.includes(rel)) return 'palette'
  return null
}

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const p = join(dir, name)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) walk(p, out)
    else if (EXTS.has(extname(p))) out.push(p)
  }
  return out
}

function isAllowed(rel) {
  return THEME_ALLOWLIST.some((a) => rel.startsWith(a))
}

function isIconSystem(rel) {
  return ICON_SYSTEM_ALLOWLIST.some((a) => rel.startsWith(a))
}

const findings = {
  hexColor: [],
  rgbaColor: [],
  lucideImport: [],
  fontSize: [],
  charIcon: [],
  iconSize: [],
  magicRadius: [],
}
const infoFindings = []

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  const allowed = isAllowed(rel)

  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`

    // 跳过注释行（规范说明/文档注释里出现示例是正常的）
    const trimmed = line.trim()
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return

    const push = (bucket, detail, extra) => {
      const rec = { at, detail: detail ?? trimmed.slice(0, 120), ...(extra || {}) }
      if (allowed) infoFindings.push({ bucket, ...rec })
      else findings[bucket].push(rec)
    }

    for (const m of line.matchAll(HEX_RE)) {
      const legit = isLegitLiteral(rel, line)
      if (legit) {
        infoFindings.push({ bucket: 'hexColor', at, detail: `${m[0]} (${legit === 'meta' ? 'meta 标签' : '调色板声明'}，合法)` })
        continue
      }
      const cls = classifyHex(m[0])
      push('hexColor', m[0], {
        hex: m[0],
        hexKind: cls.kind,
        token: cls.token,
        renderValue: RENDER_VALUE_FILES.some((r) => rel.includes(r)),
        paletteFile: false,
      })
    }
    for (const m of line.matchAll(RGBA_RE)) push('rgbaColor', m[0])
    if (LUCIDE_IMPORT_RE.test(line) && !isIconSystem(rel)) push('lucideImport')
    if (CHAR_ICON_RE.test(line)) push('charIcon')
    for (const m of line.matchAll(FONT_SIZE_RE)) {
      const px = Number(m[1])
      if (!ALLOWED_FONT_SIZES.has(px)) push('fontSize', m[0])
    }
    for (const m of line.matchAll(MAGIC_RADIUS_RE)) {
      const px = Number(m[1])
      if (![20, 14, 12, 24, 10, 16].includes(px)) push('magicRadius', m[0])
    }
    // 图标尺寸自由取值：仅当同行出现 lucide 图标组件名时提示
    if (LUCIDE_JSX_SIZE_RE.test(line) && /className=/.test(line) && !/m-icon/.test(line)) {
      const isKnownIcon = /<(MapPin|ArrowRight|ArrowLeft|Calendar|CalendarDays|Heart|Sparkles|BookOpen|Camera|X|ChevronRight|ChevronLeft|ChevronDown|ChevronUp|Search|Settings|User|Users|Loader2|Image|Images|MessageCircle|Compass|Home|Plus|Bell|Route|Map)\b/.test(line)
      if (isKnownIcon) push('iconSize')
    }
  })
}

const LABELS = {
  hexColor: '硬编码 hex 颜色',
  rgbaColor: '硬编码 rgba() 颜色',
  lucideImport: "直接 import lucide-react（应改走 @/components/mobile/Icon）",
  fontSize: '非标字号（不在 7 档字阶内）',
  charIcon: '字符冒充图标（✦ ✨ ✍ ★ 等）',
  iconSize: '图标尺寸自由取值（应用 Icon 组件的 sm/md/lg）',
  magicRadius: '非标圆角（魔术数字）',
}

const summary = Object.fromEntries(
  Object.entries(findings).map(([k, v]) => [k, new Set(v.map((r) => r.at)).size]),
)
const infoSummary = Object.fromEntries(
  Object.entries(LABELS).map(([k]) => [
    k,
    new Set(infoFindings.filter((r) => r.bucket === k).map((r) => r.at)).size,
  ]),
)

if (JSON_OUT) {
  console.log(JSON.stringify({ summary, infoSummary, findings }, null, 2))
  process.exit(0)
}

console.log('\n移动端设计规范一致性检查')
console.log('='.repeat(56))
console.log(`扫描 ${files.length} 个文件（components/ + app/）\n`)

let total = 0
for (const [key, label] of Object.entries(LABELS)) {
  const n = summary[key] ?? 0
  total += n
  const mark = n === 0 ? '✅' : '⚠️ '
  console.log(`${mark} ${label}`)
  console.log(`     待处理文件数: ${n}`)
  if (n > 0 && n <= 12) {
    for (const r of findings[key].slice(0, 12)) console.log(`       · ${r.at}  ${r.detail}`)
  } else if (n > 12) {
    for (const r of findings[key].slice(0, 8)) console.log(`       · ${r.at}  ${r.detail}`)
    console.log(`       … 其余 ${n - 8} 个文件`)
  }
}

console.log('\n' + '-'.repeat(56))
console.log(`主题豁免（相册三模式 / 后台，刻意保留自有视觉）:`)
for (const [key, label] of Object.entries(LABELS)) {
  const n = infoSummary[key] ?? 0
  if (n > 0) console.log(`   · ${label}: ${n} 个文件`)
}
console.log('-'.repeat(56))
console.log('硬编码色分类（决定收敛优先级）:')
{
  const hexAll = findings.hexColor
  const dup = hexAll.filter((r) => r.hexKind === 'duplicatesToken')
  const unmatched = hexAll.filter((r) => r.hexKind === 'unmatched')
  const renderish = unmatched.filter((r) => r.renderValue || r.paletteFile)
  const realGap = unmatched.filter((r) => !r.renderValue && !r.paletteFile)

  const dupFiles = new Set(dup.map((r) => r.at.split(':')[0]))
  const gapFiles = new Set(realGap.map((r) => r.at.split(':')[0]))

  console.log(`   ① 与既有 token 同值（应直接改用该 token）`)
  console.log(`      ${dup.length} 处 / ${dupFiles.size} 文件`)
  const topDup = new Map()
  for (const r of dup) {
    const k = `${r.hex} → ${r.token}`
    topDup.set(k, (topDup.get(k) || 0) + 1)
  }
  ;[...topDup.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .forEach(([k, n]) => console.log(`        · ${k}  ×${n}`))

  console.log(`   ② 渲染参数/调色板声明（WebGL·Canvas·集中声明，收敛价值低）`)
  console.log(`      ${renderish.length} 处 / ${new Set(renderish.map((r) => r.at.split(':')[0])).size} 文件`)

  console.log(`   ③ 未匹配 token 的散落色（需人工判断是否补 token）`)
  console.log(`      ${realGap.length} 处 / ${gapFiles.size} 文件`)
  ;[...new Set(realGap.map((r) => r.at.split(':')[0]))].slice(0, 6).forEach((f) => console.log(`        · ${f}`))
}
console.log('-'.repeat(56))
console.log(`\n待处理合计: ${total} 个文件\n`)

if (STRICT && total > 0) {
  console.error('❌ 存在设计规范违规（--strict 模式）')
  process.exit(1)
}
console.log('报告模式：未失败。CI 请加 --strict。\n')
