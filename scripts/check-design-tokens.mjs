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
 *
 * M5 新增检查项（对应《移动端UI精修方案-Uiverse模式移植.md》§3）：
 *   7. 组件内直接写渐变（只允许 --m-grad-hero / --m-grad-scrim / --m-grad-cta）
 *   8. 引用未定义的 CSS 变量（历史上 --m-shadow-lg / --m-on-accent 就因此静默失效）
 *   9. 散落的 iOS 冷色系统色与历史"危险红"字面量
 *  10. Tailwind !important 前缀覆盖（"缺组件"的症状）
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
  /**
   * M5 补充：整个 components/mobile/ 是设计系统层，其职责就是「引入 lucide 图标
   * 并交给 <Icon> 渲染」。本规则无法区分 `import type { LucideIcon }` 与值导入，
   * 早先会把这类合法用法一并计为违规（虚高）。真正绕过 Icon 直接给尺寸的写法
   * 仍由第 5 条 `iconSize` 规则拦截。
   */
  'components/mobile/',
]

/**
 * 空间主题令牌（`--space-*`）的合法使用范围（第 11 条规则）。
 *
 * 背景：产品要求「情侣 / 家庭 / 朋友 / 独旅 / 其他」各有配色，这与规范原本的
 * 「单一强调色 + 禁止用彩色表达分类」冲突。方案的做法是**受控多主题**：
 * 只放行 7 个低彩度令牌（见 app/globals.css 的 [data-space] 块），并且
 * **只允许在空间模块内使用** —— 一旦泄漏到别的模块，全站就会出现第二套强调色。
 * 这条规则把这个口头约定变成机制约束。
 */
const SPACE_THEME_ALLOWLIST = [
  'components/space/',
  'app/space/',
  'app/dev/ui/space/',
  'lib/mobile/space-system.ts',
  // 设计系统层：Pill 系列在此统一提供 SpaceTypePill（唯一入口）
  'components/mobile/Pills.tsx',
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

/**
 * 已定义的 CSS 自定义属性名集合（不限取值类型）。
 * 用于第 8 条规则：`var(--x)` 里的 --x 若从未定义，样式会静默失效。
 * 历史事故：`--m-shadow-lg` / `--m-on-accent` 被 7 个文件引用却从未定义 ——
 * 前者让面板阴影消失，后者让 9 处强调底按钮的文字退化为继承色（约 1.9:1，几乎不可见）。
 */
function buildDefinedTokenNames() {
  const cssFiles = ['app/globals.css', 'app/mobile.css']
  const names = new Set()
  for (const rel of cssFiles) {
    let css
    try {
      css = readFileSync(join(ROOT, rel), 'utf8')
    } catch {
      continue
    }
    for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) names.add(m[1])
  }
  return names
}

const TOKEN_BY_VALUE = buildTokenIndex()
const DEFINED_TOKENS = buildDefinedTokenNames()

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

/* ── M5 新增规则 ────────────────────────────────────────────────────────── */

/** 组件内直接写渐变。受控渐变只能通过 --m-grad-hero / -scrim / -cta 使用。 */
const RAW_GRADIENT_RE = /linear-gradient\(|bg-gradient-to-/
/** 引用 CSS 变量：`var(--x)` */
const CSS_VAR_USE_RE = /var\((--[a-zA-Z0-9-]+)/g
/** iOS 冷色系统色 + 历史"危险红"字面量（应统一走 --m-danger） */
const SCATTERED_COLOR_RE = /#34C759|#FF453A|#64D2FF|#E5484D|#E06C6C|#EF4444|#ef4444/i
/** Tailwind `!` 前缀覆盖：通常是「缺组件」的症状，不是样式技巧 */
const IMPORTANT_OVERRIDE_RE =
  /!(?:h|w|min-h|min-w|max-h|max-w|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|bg|text|border|rounded|shadow|ring|gap|leading|tracking|opacity)-/

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

/** 空间主题令牌的合法文件范围（第 11 条） */
function isSpaceThemeAllowed(rel) {
  return SPACE_THEME_ALLOWLIST.some((a) => rel.startsWith(a))
}

const findings = {
  hexColor: [],
  rgbaColor: [],
  lucideImport: [],
  fontSize: [],
  charIcon: [],
  iconSize: [],
  magicRadius: [],
  // M5 新增
  rawGradient: [],
  undefinedToken: [],
  scatteredColor: [],
  importantOverride: [],
  // P1 新增（空间模块受控多主题）
  spaceTokenLeak: [],
}

/** 原有 7 条规则（用于与历史基线对比，避免新增规则的欠债混入 KPI） */
const LEGACY_BUCKETS = [
  'hexColor',
  'rgbaColor',
  'lucideImport',
  'fontSize',
  'charIcon',
  'iconSize',
  'magicRadius',
]
/** M5 新增 4 条规则 */
const NEW_BUCKETS = ['rawGradient', 'undefinedToken', 'scatteredColor', 'importantOverride', 'spaceTokenLeak']
const infoFindings = []

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  const allowed = isAllowed(rel)

  // 本文件从 lucide-react 实际导入的组件名（含 `X as Y` 别名）。
  // 用真实导入集而非硬编码名单：早先的固定列表漏掉了 Download / Package 等，
  // 导致「图标尺寸违规」被低报（口径不完整）。
  const lucideNames = []
  for (const m of src.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]lucide-react['"]/g)) {
    for (const part of m[1].split(',')) {
      const t = part.trim()
      if (!t) continue
      const alias = t.match(/^\S+\s+as\s+(\S+)$/)
      const name = alias ? alias[1] : t
      if (/^[A-Z][A-Za-z0-9]*$/.test(name)) lucideNames.push(name)
    }
  }
  const iconJsxRe = lucideNames.length
    ? new RegExp(`<(${lucideNames.join('|')})\\b[^>]*className="[^"]*\\b[hw]-\\d`)
    : null

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
    // `import type { LucideIcon }` 只是类型导入，不产生任何图标用法，不计违规
    if (
      LUCIDE_IMPORT_RE.test(line) &&
      !/^\s*import\s+type\s/.test(line) &&
      !isIconSystem(rel)
    ) {
      push('lucideImport')
    }
    if (CHAR_ICON_RE.test(line)) push('charIcon')
    for (const m of line.matchAll(FONT_SIZE_RE)) {
      const px = Number(m[1])
      if (!ALLOWED_FONT_SIZES.has(px)) push('fontSize', m[0])
    }
    for (const m of line.matchAll(MAGIC_RADIUS_RE)) {
      const px = Number(m[1])
      if (![20, 14, 12, 24, 10, 16].includes(px)) push('magicRadius', m[0])
    }

    /* ── M5 新增规则 ─────────────────────────────────────────────── */
    const grad = line.match(RAW_GRADIENT_RE)
    if (grad) push('rawGradient', grad[0])

    for (const m of line.matchAll(CSS_VAR_USE_RE)) {
      const name = m[1]
      // 模板拼接（var(--m-tone-${tone}-fg)）无法静态判定，跳过
      if (line[m.index + m[0].length] === '$') continue
      // `var(--x, fallback)` 带兜底值 → 未定义也不会失效，不算违规
      const rest = line.slice(m.index + m[0].length)
      const close = rest.indexOf(')')
      if (close >= 0 && rest.slice(0, close).includes(',')) continue
      if (!DEFINED_TOKENS.has(name)) push('undefinedToken', name)

      /* ── P1 新增规则（第 11 条）：空间主题令牌不得泄漏到空间模块之外 ──
         受控多主题的前提是「影响面锁死」。一旦别的模块引用 --space-*，
         全站就会出现第二套强调色，与「单一强调色」纪律冲突。 */
      if (name.startsWith('--space-') && !isSpaceThemeAllowed(rel)) {
        push('spaceTokenLeak', name)
      }
    }

    const scattered = line.match(SCATTERED_COLOR_RE)
    if (scattered) push('scatteredColor', scattered[0])

    const bang = line.match(IMPORTANT_OVERRIDE_RE)
    if (bang) push('importantOverride', bang[0])
    // 图标尺寸自由取值：本文件 lucide 导入项的 JSX 用法上出现 h-N / w-N 尺寸类
    if (iconJsxRe && !/m-icon/.test(line) && iconJsxRe.test(line)) {
      push('iconSize', trimmed.slice(0, 100))
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
  // M5 新增
  rawGradient: '组件内直接写渐变（应改用 --m-grad-hero/-scrim/-cta）',
  undefinedToken: '引用未定义的 CSS 变量（样式会静默失效）',
  scatteredColor: '散落的 iOS 冷色 / 历史危险红字面量（应统一走 --m-*）',
  importantOverride: 'Tailwind !important 覆盖（「缺组件」的症状）',
  // P1 新增
  spaceTokenLeak: '空间主题令牌泄漏到空间模块之外（受控多主题只允许在 components/space 等范围内使用）',
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
let legacyTotal = 0
let newTotal = 0
for (const [key, label] of Object.entries(LABELS)) {
  const n = summary[key] ?? 0
  total += n
  if (LEGACY_BUCKETS.includes(key)) legacyTotal += n
  else newTotal += n
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
console.log(`\n原有 7 条规则合计: ${legacyTotal} 处   ← 与历史基线（308）对比用这个`)
console.log(`M5/P1 新增规则:    ${newTotal} 处   ← 新增规则首次暴露的既有欠债`)
console.log(`待处理合计:        ${total} 处\n`)

if (STRICT && total > 0) {
  console.error('❌ 存在设计规范违规（--strict 模式）')
  process.exit(1)
}
console.log('报告模式：未失败。CI 请加 --strict。\n')
