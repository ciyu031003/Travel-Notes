/**
 * 行迹品牌图标生成器 —— 源文件 public/brand/logo.png（甜途 logo，2026-09-05 定稿，永久不变更）。
 * 产物：
 *  - public/favicon.png / app/icon.png / app/apple-icon.png（Web 站点图标）
 *  - android 各密度 ic_launcher 系列 PNG（legacy + 自适应前景）
 * 修改品牌图标时只替换 public/brand/logo.png 后重跑：node scripts/gen-icons.mjs
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(process.cwd(), 'android/app/src/main/res')
const LOGO = path.resolve(process.cwd(), 'public/brand/logo.png')
// logo 画布自带的暖米色（与 logo 圆角方底一致），用于铺满启动器/ favicon 底色
const BRAND_BG = '#FAF3E6'

async function flatLogo(size) {
  // logo 是圆角方底位图：铺在品牌米色画布上，避免启动器/浏览器深色主题下露出白角
  return sharp(LOGO).resize(size, size, { fit: 'contain', background: BRAND_BG })
}

async function main() {
  // ---- Web 站点图标 ----
  const favicon = await flatLogo(128)
  await favicon.clone().png().toFile(path.resolve(process.cwd(), 'public/favicon.png'))
  await sharp(LOGO).resize(512, 512, { fit: 'contain', background: BRAND_BG }).png().toFile(path.resolve(process.cwd(), 'app/icon.png'))
  await sharp(LOGO).resize(180, 180, { fit: 'contain', background: BRAND_BG }).png().toFile(path.resolve(process.cwd(), 'app/apple-icon.png'))

  // ---- Android 启动器 ----
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
  for (const [name, scale] of Object.entries(densities)) {
    const dir = path.join(root, `mipmap-${name}`)
    await mkdir(dir, { recursive: true })

    const launcher = Math.round(48 * scale)
    const fg = Math.round(108 * scale)

    // legacy：品牌底色铺满 + logo
    const full = await flatLogo(launcher)
    await full.clone().png().toFile(path.join(dir, 'ic_launcher.png'))
    await full.clone().png().toFile(path.join(dir, 'ic_launcher_round.png'))

    // 自适应前景：透明画布，logo 缩到安全区（66/108 ≈ 61%）
    const fgSize = Math.round(fg * 0.61)
    const logoBuf = await sharp(LOGO).resize(fgSize, fgSize, { fit: 'contain' }).png().toBuffer()
    await sharp({
      create: { width: fg, height: fg, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: logoBuf, gravity: 'centre' }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_foreground.png'))
  }
  console.log('brand icons generated from public/brand/logo.png')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
