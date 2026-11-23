#!/usr/bin/env node
/**
 * 品牌图标变体生成（移动端性能专项 E2）
 * ---------------------------------------------------------------------------
 * 问题：BrandLogo 一直用 public/brand/logo-512.png（512×512，75KB），
 *   而实际显示尺寸只有 32px / 36px；且根布局里它会被 React 预加载
 *   （<link rel=preload as=image>），等于每页首屏先花 75KB 带宽拉一张
 *   永远缩小到 32px 的图 —— 在 0.8Mbps 的弱网里要 0.6s，直接顶在
 *   CSS/JS 前面（实测 CSS 结束 1.6s / FCP 1.8s）。
 *
 * 做法：从 512 源图生成 96px（1x）与 160px（2x，覆盖 36~80px 显示）
 *   的 webp + png，BrandLogo 用 <picture> + srcSet 按 DPR 选最小的那张。
 *   原 logo-512.png 保留（PWA manifest / 启动图标仍在用）。
 *
 * 用法：node scripts/gen-brand-variants.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = process.cwd()
const BRAND_DIR = path.join(ROOT, 'public', 'brand')
const SRC = path.join(BRAND_DIR, 'logo-512.png')

/** 1x 用 96（覆盖到 96 CSS px），2x 用 160（覆盖到 80 CSS px 的 2 倍屏） */
const SIZES = [96, 160]

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('[brand-variants] 找不到源图：' + SRC)
    process.exit(1)
  }
  const meta = await sharp(SRC).metadata()
  console.log('[brand-variants] 源：' + path.relative(ROOT, SRC) + ' ' + meta.width + '×' + meta.height)
  console.log('')

  const rows = []
  for (const size of SIZES) {
    const base = sharp(SRC).resize(size, size, { fit: 'cover' })
    const targets = [
      { out: 'logo-' + size + '.webp', encode: (img) => img.webp({ quality: 88, effort: 6 }) },
      // 调色板 PNG 对品牌标志这种纯色块几乎是免费的体积优化（不支持 webp 的老壳兜底）
      { out: 'logo-' + size + '.png', encode: (img) => img.png({ compressionLevel: 9, palette: true, quality: 90, effort: 8 }) },
    ]
    for (const target of targets) {
      const outPath = path.join(BRAND_DIR, target.out)
      await target.encode(base.clone()).toFile(outPath)
      rows.push({ out: target.out, size: fs.statSync(outPath).size })
    }
  }

  const origSize = fs.statSync(SRC).size
  console.log('文件'.padEnd(24) + '体积'.padStart(10) + '   对比 logo-512.png')
  console.log('-'.repeat(60))
  for (const row of rows) {
    const drop = Math.round((1 - row.size / origSize) * 100)
    console.log(row.out.padEnd(24) + (kb(row.size) + 'KB').padStart(10) + ('   -' + drop + '%').padStart(20))
  }
  console.log('-'.repeat(60))
  console.log('原 logo-512.png'.padEnd(24) + (kb(origSize) + 'KB').padStart(10) + '   （保留：manifest/图标仍引用）')
}

main().catch((error) => {
  console.error('[brand-variants] 失败：', error)
  process.exit(1)
})
