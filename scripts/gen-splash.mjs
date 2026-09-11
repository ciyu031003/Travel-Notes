/**
 * 甜途品牌启动屏生成器 —— 源文件 public/brand/logo.png（2026-09-05 定稿，永久不变更）。
 * 产物：android 各密度/横竖屏 drawable 下的 splash.png 全套。
 *   - 画布铺品牌暖米色（与 logo 圆角方底同色，圆角无缝融合）
 *   - logo 居中，占短边 40%（Android 12+ 安全区友好，上下留白）
 * 修改品牌图时只替换 public/brand/logo.png 后重跑：node scripts/gen-splash.mjs
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(process.cwd(), 'android/app/src/main/res')
const LOGO = path.resolve(process.cwd(), 'public/brand/logo.png')
// 与 gen-icons.mjs 的 BRAND_BG 保持一致：logo 圆角方底自带的暖米色
const BRAND_BG = '#FAF3E6'

// 既有分辨率按密度/横竖屏保持不动，仅替换内容
const SPLASH_SIZES = {
  'drawable': [480, 320],
  'drawable-port-mdpi': [320, 480],
  'drawable-port-hdpi': [480, 800],
  'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600],
  'drawable-port-xxxhdpi': [1280, 1920],
  'drawable-land-mdpi': [480, 320],
  'drawable-land-hdpi': [800, 480],
  'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960],
  'drawable-land-xxxhdpi': [1920, 1280],
}

async function main() {
  const logo = sharp(LOGO)
  for (const [dirName, [w, h]] of Object.entries(SPLASH_SIZES)) {
    const dir = path.join(root, dirName)
    await mkdir(dir, { recursive: true })
    const logoSize = Math.max(64, Math.round(Math.min(w, h) * 0.4))
    const logoBuf = await logo
      .clone()
      .resize(logoSize, logoSize, { fit: 'contain' })
      .png()
      .toBuffer()
    await sharp({
      create: { width: w, height: h, channels: 3, background: BRAND_BG },
    })
      .composite([{ input: logoBuf, gravity: 'centre' }])
      .png()
      .toFile(path.join(dir, 'splash.png'))
  }
  console.log('brand splash screens generated from public/brand/logo.png')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
