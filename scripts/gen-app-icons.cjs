#!/usr/bin/env node
/**
 * 生成 App 图标资源（自适应图标 + 传统图标）。
 *
 * 修的问题（真机反馈"APP 图标四周有黑色区域，logo 太小"）：
 * 自适应图标 = background（纯色）+ foreground（PNG）两层。旧配置是
 *   · background = #151A21（近黑）
 *   · foreground = 奶油圆角方块（内含 logo），且四周留了 19% 透明边距
 * 启动器把方块裁进圆形/圆角方形后，那圈近黑背景就露出来 —— "logo 很小、外面一圈黑"。
 *
 * 现在的做法（不加新依赖，用已有的 sharp）：
 *   ① 背景色 = 从 logo 采样的奶油色 → 与方块融为一体，黑框消失；
 *   ② 前景 = **用 SVG 画一个圆角奶油卡片**，再把裁好的 logo 图形贴进去，
 *      整张卡片占画布 88%（自适应图标安全区内不会被裁）。
 *
 * 为什么用 SVG 画卡片而不是直接裁源图的方块：
 * 源图方块外围有一圈**纯白画布**，而奶油色 #fefdf9 与白的通道差只有 1-5，
 * 任何"按阈值找边界"的做法都会把白边带进来（试过两轮，图标上都出现白环）。
 * 用 SVG 画形状是确定性的：圆角、尺寸、底色都由我们指定，不受源图边缘影响。
 */
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res')
const SRC = path.join(__dirname, '..', 'public', 'brand', 'logo.png')

/** 各密度的传统启动图标边长（Android 约定） */
const LAUNCHER_SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
/** 自适应图标前景画布边长；可见区约为其 2/3（安全区 66/108） */
const FOREGROUND_SIZES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }
/** 卡片占画布比例：88% 既够大，又落在自适应图标安全区内 */
const CONTENT_RATIO = 0.88
/** 卡片圆角半径（相对卡片边长） */
const CORNER_RATIO = 0.22

async function main() {
  // ① 采样奶油底色：取源图正中偏上的一条横带的中位数（那里一定是卡片底）
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: sw, height: sh, channels } = info
  const y = Math.round(sh * 0.12)
  const rs = []
  const gs = []
  const bs = []
  for (let x = Math.round(sw * 0.3); x < Math.round(sw * 0.7); x++) {
    const i = (y * sw + x) * channels
    rs.push(data[i])
    gs.push(data[i + 1])
    bs.push(data[i + 2])
  }
  const med = (a) => a.slice().sort((p, q) => p - q)[Math.floor(a.length / 2)]
  const plate = { r: med(rs), g: med(gs), b: med(bs) }
  const plateHex = `#${[plate.r, plate.g, plate.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
  console.log(`源图 ${sw}x${sh}；采样奶油色 = ${plateHex}`)

  /**
   * 把源图裁成方形并去掉白边。
   * 源图里 logo 图形基本铺满，只留一点白边 → 统一裁掉 3%（保守值，宁可小一点也不带白边）。
   */
  const trim = Math.round(sw * 0.03)
  const square = await sharp(SRC)
    .extract({ left: trim, top: trim, width: sw - trim * 2, height: sh - trim * 2 })
    .png()
    .toBuffer()

  const out = []
  for (const [density, fgSize] of Object.entries(FOREGROUND_SIZES)) {
    const cardSize = Math.round(fgSize * CONTENT_RATIO)
    const inset = Math.round((fgSize - cardSize) / 2)
    const radius = Math.round(cardSize * CORNER_RATIO)

    // ② 用 SVG 画圆角奶油卡片，再把 logo 图形以卡片为遮罩贴上去
    const cardMask = Buffer.from(
      `<svg width="${cardSize}" height="${cardSize}"><rect x="0" y="0" width="${cardSize}" height="${cardSize}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
    )
    const artwork = await sharp(square).resize(cardSize, cardSize, { fit: 'cover' }).png().toBuffer()
    const carded = await sharp(artwork)
      .composite([{ input: cardMask, blend: 'dest-in' }])
      .png()
      .toBuffer()

    // 卡片外一圈用背景同色填充（而不是透明）→ 即使启动器不裁切，也不会出现任何边框
    const foreground = await sharp({
      create: { width: fgSize, height: fgSize, channels: 4, background: { ...plate, alpha: 1 } },
    })
      .composite([{ input: carded, top: inset, left: inset }])
      .png({ compressionLevel: 9 })
      .toBuffer()
    fs.writeFileSync(path.join(RES, `mipmap-${density}`, 'ic_launcher_foreground.png'), foreground)
    out.push(`mipmap-${density}/ic_launcher_foreground.png ${fgSize}²（卡片 ${cardSize}px = ${Math.round(CONTENT_RATIO * 100)}%）`)

    // ③ 传统图标（Android 7 及以下 / 部分启动器）：整张就是卡片，无外边距
    const legacy = await sharp(square).resize(LAUNCHER_SIZES[density], LAUNCHER_SIZES[density], { fit: 'cover' }).png({ compressionLevel: 9 }).toBuffer()
    fs.writeFileSync(path.join(RES, `mipmap-${density}`, 'ic_launcher.png'), legacy)
    fs.writeFileSync(path.join(RES, `mipmap-${density}`, 'ic_launcher_round.png'), legacy)
    out.push(`mipmap-${density}/ic_launcher(.round).png ${LAUNCHER_SIZES[density]}²`)
  }

  // ④ 背景色 = 奶油色（**消除黑边的关键**）
  fs.writeFileSync(
    path.join(RES, 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<!--
  App 图标（自适应图标）背景层颜色。
  取值由 scripts/gen-app-icons.cjs 从 logo 的奶油底色采样而来（${plateHex}），
  与前景卡片同色，因此启动器按圆形裁切时不会在四周露出深色边。
  旧值 #151A21（近黑）会让图标看起来"四周一圈黑、中间的 logo 很小"。
-->
<resources>
    <color name="ic_launcher_background">${plateHex}</color>
</resources>
`,
    'utf8',
  )
  out.push(`values/ic_launcher_background.xml → ${plateHex}`)

  console.log(out.map((l) => '  ✓ ' + l).join('\n'))
  console.log('\n完成。改图标后必须重新 build APK 才会在桌面生效。')
}

main().catch((e) => {
  console.error('生成失败:', e.message)
  process.exit(1)
})
