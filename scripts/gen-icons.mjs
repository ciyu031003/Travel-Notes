import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

// 行迹品牌图标生成器（用于 Android 启动器图标）。
// 自适应图标(v26+)走 drawable 矢量，本脚本补齐各密度的 legacy PNG，
// 让低版本 Android / 启动器缓存也显示满铺品牌渐变，不再出现黑边。

const root = path.resolve(process.cwd(), 'android/app/src/main/res')

const MARK = `
  <g>
    <path d="M216,96 C166,96 122,140 122,190 C122,258 216,352 216,352 C216,352 310,258 310,190 C310,140 266,96 216,96 Z" fill="#FFFFFF"/>
    <path d="M216,150 a40,40 0 1,0 0.02,0 Z" fill="#A85F3A"/>
    <path d="M150,240 a14,14 0 1,0 0.02,0 Z" fill="#E4B478"/>
    <path d="M116,292 a12,12 0 1,0 0.02,0 Z" fill="#E4B478"/>
    <path d="M160,322 a10,10 0 1,0 0.02,0 Z" fill="#E4B478"/>
  </g>
`

function fullSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="432" height="432" viewBox="0 0 432 432">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#C88052"/>
      <stop offset="0.52" stop-color="#A85F3A"/>
      <stop offset="1" stop-color="#7A3F24"/>
    </linearGradient>
  </defs>
  <rect width="432" height="432" fill="url(#bg)"/>
  ${MARK}
</svg>`
}

function roundSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="432" height="432" viewBox="0 0 432 432">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#C88052"/>
      <stop offset="0.52" stop-color="#A85F3A"/>
      <stop offset="1" stop-color="#7A3F24"/>
    </linearGradient>
    <clipPath id="c"><circle cx="216" cy="216" r="216"/></clipPath>
  </defs>
  <g clip-path="url(#c)">
    <rect width="432" height="432" fill="url(#bg)"/>
    ${MARK}
  </g>
</svg>`
}

function fgSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="432" height="432" viewBox="0 0 432 432">
  ${MARK}
</svg>`
}

const densities = {
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4,
}

async function main() {
  for (const [name, scale] of Object.entries(densities)) {
    const dir = path.join(root, `mipmap-${name}`)
    await mkdir(dir, { recursive: true })

    const launcher = Math.round(48 * scale)
    const fg = Math.round(108 * scale)

    await sharp(Buffer.from(fullSvg()))
      .resize(launcher, launcher)
      .png()
      .toFile(path.join(dir, 'ic_launcher.png'))

    await sharp(Buffer.from(roundSvg()))
      .resize(launcher, launcher)
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'))

    await sharp(Buffer.from(fgSvg()))
      .resize(fg, fg)
      .png()
      .toFile(path.join(dir, 'ic_launcher_foreground.png'))
  }
  console.log('icons generated')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
