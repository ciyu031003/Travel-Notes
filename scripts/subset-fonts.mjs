#!/usr/bin/env node
/**
 * 字体子集化：把 public/fonts/ 下的拉丁字体裁成「首屏够用」的子集（woff2）。
 * ---------------------------------------------------------------------------
 * 背景（移动端性能专项 E2）：
 *   · SourceSerif4-Regular.otf.woff2 105KB，在 /album、/circle 首屏被整份拉取；
 *     它是纯拉丁衬线体（CJK 本来就走系统字体回退），却因为 @font-face 没写
 *     unicode-range，中文标题也会触发一次加载 —— 浏览器必须把字体下完才能确认
 *     「这个字它没有」，首屏文字因此被吊住（实测 /album FCP 5.1s）。
 *   · Inter 三个字重各 ~24KB、Playfair 两个字重各 ~23KB，同样只用到拉丁基本区。
 *
 * 做法：
 *   1. 用已安装的 fontTools（fontTools.subset，woff2 输出靠 brotli）按固定字符集裁子集；
 *   2. 产物写到 public/fonts/*.subset.woff2，**原文件保留**（回滚/对比用）；
 *   3. 打印体积对比表 + 本次覆盖的 Unicode 区段（与 app/globals.css 的 unicode-range
 *      必须一致，脚本会同时打印可直接粘贴的 unicode-range 字符串）。
 *
 * 用法：
 *   node scripts/subset-fonts.mjs              # 生成/覆盖全部子集
 *   node scripts/subset-fonts.mjs --check      # 只检查产物是否存在且不超过目标体积
 *   node scripts/subset-fonts.mjs --only=inter # 只处理文件名含 inter 的字体
 *
 * 环境：python 需装 fonttools + brotli。默认按下面的顺序找解释器，
 *       也可以用 FONTTOOLS_PYTHON=/path/to/python 显式指定。
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = process.cwd()
const FONT_DIR = path.join(ROOT, 'public', 'fonts')

/**
 * 子集字符集（Unicode 区段）。
 * ⚠️ 这份列表是「字体覆盖」与「CSS unicode-range」的同一份事实来源：
 *    改动后请把脚本末尾打印的 unicode-range 同步进 app/globals.css。
 *   · 0020-007E  ASCII（数字/英文/常用标点）
 *   · 00A0-00FF  Latin-1 补充（· « » ° × ÷ 等 V6 中文排版里夹用的符号）
 *   · 0100-017F  Latin Extended-A（带音标地名，体积很小）
 *   · 0180-024F  Latin Extended-B（同上，仅保留有字形的）
 *   · 02B0-02FF / 0300-036F  修饰字母 / 组合音标（排版兜底）
 *   · 2000-206F  常用标点（– — ‘ ’ “ ” … ‰ ′ ″ ‹ ›）
 *   · 20A0-20CF  货币（€ 等）
 *   · 2100-214F  字母式符号（™ 等）
 *   · 2190-21FF  箭头（← ↑ → ↓ ↔）
 *   · 2200-22FF  数学运算符（− ∕ 等）
 *   · 25A0-25FF / 2600-26FF  几何图形 / 杂项符号（★ ☆ ● ○ ◆ ✓）
 *   · 2713 / 2714  对勾
 *   · FEFF        零宽不换行空格
 *   · FFFD        REPLACEMENT CHARACTER
 */
const UNICODE_RANGES = [
  'U+0020-007E',
  'U+00A0-00FF',
  'U+0100-017F',
  'U+0180-024F',
  'U+02B0-02FF',
  'U+0300-036F',
  'U+2000-206F',
  'U+20A0-20CF',
  'U+2100-214F',
  'U+2190-21FF',
  'U+2200-22FF',
  'U+25A0-25FF',
  'U+2600-26FF',
  'U+2713',
  'U+2714',
  'U+FEFF',
  'U+FFFD',
]

/** 要裁的字体：源文件 → 产物；targetKB 是软目标（超出只告警，不失败） */
const FONTS = [
  { src: 'SourceSerif4-Regular.otf.woff2', out: 'SourceSerif4-Regular.subset.woff2', targetKB: 35 },
  { src: 'SourceSerif4-It.otf.woff2', out: 'SourceSerif4-It.subset.woff2', targetKB: 35 },
  { src: 'inter-latin-400.woff2', out: 'inter-latin-400.subset.woff2', targetKB: 20 },
  { src: 'inter-latin-500.woff2', out: 'inter-latin-500.subset.woff2', targetKB: 20 },
  { src: 'inter-latin-600.woff2', out: 'inter-latin-600.subset.woff2', targetKB: 20 },
  { src: 'playfair-latin-700.woff2', out: 'playfair-latin-700.subset.woff2', targetKB: 20 },
  { src: 'playfair-latin-900.woff2', out: 'playfair-latin-900.subset.woff2', targetKB: 20 },
]

/**
 * 只保留真正影响拉丁排版的 OpenType 特性：
 *   kern 字距、liga/clig 连字、calt 上下文替换、ccmp 组合、locl 本地化。
 * 丢掉 dlig/hist/onum 之类的花饰特性，否则子集会被特性表撑大。
 */
const LAYOUT_FEATURES = 'kern,liga,clig,calt,ccmp,locl'

function findPython() {
  const candidates = [
    process.env.FONTTOOLS_PYTHON,
    // 本机 DSH 运行时自带的 python（fonttools 4.68 + brotli 已装）
    'C:/Users/yuan/.dsh/dsh-runtimes/dsh-next-primary-runtime/dependencies/python/python.exe',
    'python3',
    'python',
    'py',
  ].filter(Boolean)
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-c', 'import fontTools, brotli; print(fontTools.version)'], {
      encoding: 'utf8',
    })
    if (probe.status === 0) {
      return { python: candidate, version: (probe.stdout || '').trim() }
    }
  }
  return null
}

function kb(bytes) {
  return Math.round((bytes / 1024) * 10) / 10
}

function subsetFont(python, font) {
  const srcPath = path.join(FONT_DIR, font.src)
  const outPath = path.join(FONT_DIR, font.out)
  if (!fs.existsSync(srcPath)) {
    return { ...font, skipped: true, reason: '源字体不存在' }
  }
  const args = [
    '-m',
    'fontTools.subset',
    srcPath,
    '--unicodes=' + UNICODE_RANGES.join(','),
    '--layout-features=' + LAYOUT_FEATURES,
    '--flavor=woff2',
    '--no-hinting',
    '--ignore-missing-unicodes',
    '--no-glyph-names',
    '--desubroutinize',
    '--output-file=' + outPath,
  ]
  const result = spawnSync(python, args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error('fontTools 子集化失败：' + font.src + '\n' + (result.stderr || result.stdout))
  }
  const before = fs.statSync(srcPath).size
  const after = fs.statSync(outPath).size
  return { ...font, before, after, savedPct: Math.round((1 - after / before) * 100) }
}

const argv = process.argv.slice(2)
const checkOnly = argv.includes('--check')
const only = (argv.find((a) => a.startsWith('--only=')) || '').split('=')[1]

if (!fs.existsSync(FONT_DIR)) {
  console.error('[subset-fonts] 目录不存在：' + FONT_DIR)
  process.exit(1)
}

const fonts = only ? FONTS.filter((f) => f.out.includes(only) || f.src.includes(only)) : FONTS

if (checkOnly) {
  let bad = 0
  for (const font of fonts) {
    const outPath = path.join(FONT_DIR, font.out)
    if (!fs.existsSync(outPath)) {
      console.log('✗ 缺少产物 ' + font.out)
      bad++
      continue
    }
    const size = fs.statSync(outPath).size
    const over = size > font.targetKB * 1024
    console.log((over ? '⚠' : '✓') + ' ' + font.out + ' ' + kb(size) + 'KB' + (over ? '（超过目标 ' + font.targetKB + 'KB）' : ''))
    if (over) bad++
  }
  process.exit(bad === 0 ? 0 : 1)
}

const python = findPython()
if (!python) {
  console.error(
    '[subset-fonts] 找不到可用的 python（需要 fonttools + brotli）。\n' +
      '  安装：python -m pip install fonttools brotli\n' +
      '  或指定解释器：FONTTOOLS_PYTHON=/path/to/python node scripts/subset-fonts.mjs',
  )
  process.exit(1)
}

console.log('[subset-fonts] python=' + python.python + ' fontTools=' + python.version)
console.log('[subset-fonts] 字符集区段（' + UNICODE_RANGES.length + ' 段）：' + UNICODE_RANGES.join(','))
console.log('')

const rows = []
for (const font of fonts) {
  const row = subsetFont(python.python, font)
  rows.push(row)
}

const pad = (value, len) => String(value).padEnd(len, ' ')
const num = (value, len) => String(value).padStart(len, ' ')
console.log(pad('源文件', 34) + pad('产物', 34) + num('原体积', 10) + num('子集', 10) + num('省下', 8))
console.log('-'.repeat(36 + 34 + 10 + 10 + 8))
let totalBefore = 0
let totalAfter = 0
for (const row of rows) {
  if (row.skipped) {
    console.log(pad(row.src, 34) + '⚠ ' + row.reason)
    continue
  }
  totalBefore += row.before
  totalAfter += row.after
  const warn = row.after > row.targetKB * 1024 ? ' ⚠超出目标' : ''
  console.log(
    pad(row.src, 34) + pad(row.out, 34) + num(kb(row.before) + 'KB', 10) + num(kb(row.after) + 'KB', 10) + num('-' + row.savedPct + '%', 8) + warn,
  )
}
console.log('-'.repeat(36 + 34 + 10 + 10 + 8))
console.log(pad('合计', 34) + pad('', 34) + num(kb(totalBefore) + 'KB', 10) + num(kb(totalAfter) + 'KB', 10) + num('-' + Math.round((1 - totalAfter / totalBefore) * 100) + '%', 8))
console.log('')
console.log('[subset-fonts] 复制到 app/globals.css 的 unicode-range：')
console.log(UNICODE_RANGES.join(', '))
console.log('')
console.log('[subset-fonts] 保留原文件（回滚只需把 @font-face 的 src 指回原名），产物可用 --check 校验体积。')
