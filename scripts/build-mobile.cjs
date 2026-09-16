#!/usr/bin/env node
/**
 * 绉诲姩绔潤鎬佸鍑猴紙Stage 3.0b 路 A 鎷嗗垎鏋舵瀯锛夈€?
 *
 * 鍘熺悊锛歚next build` 鐨?output:'export' 涓?API 璺敱/鍚庡彴/feed/middleware 涓嶅吋瀹癸紝
 * 鍥犳鏋勫缓鍓嶆妸銆屾湇鍔＄涓撳睘銆嶅唴瀹逛复鏃剁Щ鍑?app/锛堝埌 .mobile-excluded/锛夛紝鍦ㄥ師鍦板仛绾鎴风闈欐€佸鍑猴紝
 * 浜х墿鎷峰埌 www/锛屾瀯寤哄悗鍐嶇Щ鍥烇紙try/finally 淇濊瘉涓嶆畫鐣欙級銆?
 *
 * 绉诲姩绔３涓嶈 /admin锛圖-3锛夛紝API 鍏ㄩ儴璧?NEXT_PUBLIC_API_BASE 鎸囧悜鐨勬湇鍔″櫒銆?
 *
 * 鐢ㄦ硶锛?
 *   NEXT_PUBLIC_API_BASE=https://travel-notes.yuanabd.cn node scripts/build-mobile.cjs
 *   锛堥殢鍚庡彲 npx cap sync android 鏇存柊鍘熺敓宸ョ▼锛?
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'https://travel-notes.yuanabd.cn'
const EXCLUDE_DIR = path.join(root, '.mobile-excluded')

// [鍘熷鐩稿璺緞, 绉诲嚭鍚庣殑鍚嶅瓧] 鈥斺€?鏈嶅姟绔笓灞烇紝涓嶈繘闈欐€佸３
const EXCLUDES = [
  ['app/api', 'api'],
  ['app/feed.xml', 'feed.xml'],
  ['app/admin', 'admin'],
  ['app/albums', 'albums'],
  // 寮€鍙戠敤缁勪欢棰勮鍙帮紙/dev/ui锛夛細鐢熶骇鏋勫缓鏈凡 404锛屼絾浠嶄細鐢熸垚涓€涓啑浣欓〉闈紝
  // 涓斿紑鍙戝伐鍏蜂笉搴旇繘鍏ュ彂缁欑敤鎴风殑瀹夎鍖?鈥斺€?涓?/admin 鍚岀悊绉诲嚭銆?
  ['app/dev', 'dev'],
  ['middleware.ts', 'middleware.ts'],
]

// 澶嶅埗 + 鍒犻櫎锛堣€岄潪 rename锛夛細鍏煎 Docker overlayfs 鐨?EXDEV 璺ㄥ眰闄愬埗锛屾湰鍦?NTFS 浜﹀彲
function relocate(src, dst) {
  if (!fs.existsSync(src)) return
  fs.cpSync(src, dst, { recursive: true })
  fs.rmSync(src, { recursive: true, force: true })
}

function moveOut() {
  if (fs.existsSync(EXCLUDE_DIR)) fs.rmSync(EXCLUDE_DIR, { recursive: true, force: true })
  fs.mkdirSync(EXCLUDE_DIR, { recursive: true })
  for (const [from, name] of EXCLUDES) {
    relocate(path.join(root, from), path.join(EXCLUDE_DIR, name))
  }
}

function moveBack() {
  for (const [from, name] of EXCLUDES) {
    relocate(path.join(EXCLUDE_DIR, name), path.join(root, from))
  }
  if (fs.existsSync(EXCLUDE_DIR)) fs.rmSync(EXCLUDE_DIR, { recursive: true, force: true })
}

console.log('[build-mobile] 闈欐€佸鍑猴紙NEXT_PUBLIC_API_BASE=' + apiBase + '锛?..')
moveOut()
try {
  execSync('npx next build', {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      MOBILE_EXPORT: '1',
      NEXT_PUBLIC_API_BASE: apiBase,
      NEXT_PUBLIC_APP_PLATFORM: 'mobile',
      NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || '1.9.0',
      NEXT_PUBLIC_APP_BUILD_NUMBER: process.env.NEXT_PUBLIC_APP_BUILD_NUMBER || '10',
      NEXT_PUBLIC_APP_DOWNLOAD_URL: process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL || process.env.APP_DOWNLOAD_URL || 'https://travel-notes.yuanabd.cn/downloads/tiantu.apk',
      SKIP_DB_ON_BUILD: '1',
    },
  })
} finally {
  moveBack()
}

const outDir = path.join(root, 'out')
const wwwDir = path.join(root, 'www')
if (fs.existsSync(outDir)) {
  console.log('[build-mobile] 鎷疯礉 out/ -> www/ ...')
  if (fs.existsSync(wwwDir)) fs.rmSync(wwwDir, { recursive: true, force: true })
  fs.cpSync(outDir, wwwDir, { recursive: true })
  fs.rmSync(outDir, { recursive: true, force: true })

  // 绉诲姩绔収鐗?瑙嗛鐢辨湇鍔＄鎸夐渶鎻愪緵锛?uploads銆丆OS/CDN锛夛紝涓嶅湪澹冲唴鍐椾綑鎵撳寘锛?
  // 绉婚櫎 public/uploads/media 鐨勯潤鎬佸鍑哄壇鏈悗锛宺elease APK 鍙噺灏戠害 64MB銆?
  const bundledMediaDir = path.join(wwwDir, 'uploads', 'media')
  if (fs.existsSync(bundledMediaDir)) {
    fs.rmSync(bundledMediaDir, { recursive: true, force: true })
    console.log('[build-mobile] 宸茬Щ闄ゆ墦鍖呭啑浣欙細www/uploads/media锛堢収鐗囨敼涓鸿繍琛屾湡浠庢湇鍔＄鍔犺浇锛?)
  }

  // 杩愯鏃跺搧鐗屾爣蹇楃敤 logo-512.png锛?58KB锛夛紱2048脳2048 鐨?logo.png 浠呬綔涓?
  // gen-splash/gen-icons 鐨勭敓鎴愭簮锛屽墧闄ゅ叾闈欐€佸鍑哄壇鏈伩鍏?~2MB 鍐椾綑鎵撹繘 APK銆?
  const bundledLogo = path.join(wwwDir, 'brand', 'logo.png')
  if (fs.existsSync(bundledLogo)) {
    fs.rmSync(bundledLogo, { force: true })
    console.log('[build-mobile] 宸茬Щ闄ゆ墦鍖呭啑浣欙細www/brand/logo.png锛堣繍琛屾椂鍝佺墝鐢?logo-512.png锛屾簮鍥句粎鐢熸垚鐢級')
  }

  console.log('[build-mobile] 瀹屾垚锛歸ww/ 宸茬敓鎴愶紝鍙?npx cap sync android')
}
