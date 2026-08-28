#!/usr/bin/env node
/**
 * 存量媒体变体回填脚本
 * 扫描 UPLOAD_DIR（默认 public/uploads）下 media 目录的原始图片，
 * 按需生成 -thumbnail / -preview / -blur.jpg 变体（与原图同目录、同名后缀）。
 * 变体已存在则跳过。用于部署后预生成，避免首次访问画册时逐个生成造成延迟。
 *
 * 用法（容器内）：
 *   node scripts/backfill-media-variants.cjs
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const uploadDir = process.env.UPLOAD_DIR || 'public/uploads'
const mediaDir = path.join(uploadDir, 'media')
const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const VARIANTS = [
  { suffix: 'thumbnail', targetWidth: 480 },
  { suffix: 'preview', targetWidth: 1600 },
  { suffix: 'blur', targetWidth: 16 },
]
// 已是变体的文件（带 -thumbnail/-preview/-blur 后缀）跳过
const VARIANT_RE = /-(thumbnail|preview|blur)\.(jpg|jpeg|png|webp)$/i

async function makeVariant(input, targetWidth) {
  const image = sharp(input, { failOn: 'error' })
  const meta = await image.metadata()
  const width = meta.width || 1
  const scale = Math.min(1, targetWidth / width)
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(meta.height ? meta.height * scale : 1))
  return sharp(input, { failOn: 'error' })
    .resize({ width: w, height: h, fit: 'inside' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer()
}

async function main() {
  if (!fs.existsSync(mediaDir)) {
    console.log(`media dir not found: ${mediaDir}`)
    return
  }
  const files = fs.readdirSync(mediaDir)
  let generated = 0
  let skipped = 0
  let errors = 0
  for (const f of files) {
    const ext = path.extname(f).toLowerCase()
    if (!EXT.has(ext)) continue
    if (VARIANT_RE.test(f)) continue
    const base = path.basename(f, ext)
    const origPath = path.join(mediaDir, f)
    const jobs = []
    for (const v of VARIANTS) {
      const vp = path.join(mediaDir, `${base}-${v.suffix}.jpg`)
      if (!fs.existsSync(vp)) jobs.push({ ...v, vp })
    }
    if (jobs.length === 0) { skipped++; continue }
    try {
      for (const j of jobs) {
        const buf = await makeVariant(origPath, j.targetWidth)
        await fs.promises.writeFile(j.vp, buf)
      }
      generated += jobs.length
      console.log(`+ ${f} -> ${jobs.map((j) => path.basename(j.vp)).join(', ')}`)
    } catch (e) {
      errors++
      console.error(`! ${f}: ${e.message}`)
    }
  }
  console.log(`\nmediaDir=${mediaDir}`)
  console.log(`generated=${generated} variants, skipped=${skipped} files, errors=${errors}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
