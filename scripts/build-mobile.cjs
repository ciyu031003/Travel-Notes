#!/usr/bin/env node
/**
 * 移动端静态导出（Stage 3.0b · A 拆分架构）。
 *
 * 原理：`next build` 的 output:'export' 与 API 路由/后台/feed/middleware 不兼容，
 * 因此构建前把「服务端专属」内容临时移出 app/（到 .mobile-excluded/），在原地做纯客户端静态导出，
 * 产物拷到 www/，构建后再移回（try/finally 保证不残留）。
 *
 * 移动端壳不设 /admin（D-3），API 全部走 NEXT_PUBLIC_API_BASE 指向的服务器。
 *
 * 用法：
 *   NEXT_PUBLIC_API_BASE=https://travel-notes.yuanabd.cn node scripts/build-mobile.cjs
 *   （随后可 npx cap sync android 更新原生工程）
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'https://travel-notes.yuanabd.cn'
const EXCLUDE_DIR = path.join(root, '.mobile-excluded')

// [原始相对路径, 移出后的名字] —— 服务端专属，不进静态壳
const EXCLUDES = [
  ['app/api', 'api'],
  ['app/feed.xml', 'feed.xml'],
  ['app/admin', 'admin'],
  ['app/albums', 'albums'],
  // 开发用组件预览台（/dev/ui）：生产构建本已 404，但仍会生成一个冗余页面，
  // 且开发工具不应进入发给用户的安装包 —— 与 /admin 同理移出。
  ['app/dev', 'dev'],
  ['middleware.ts', 'middleware.ts'],
  // Next 16 起 middleware 更名为 proxy.ts（安全头/鉴权逻辑不变），静态壳不能带服务端代理
  ['proxy.ts', 'proxy.ts'],
  // 测试文件会 import 被移出的 app/api 路由；静态导出不需要测试，移出后仍对 app 源码做类型检查
  ['tests', 'tests'],
]

// 复制 + 删除（而非 rename）：兼容 Docker overlayfs 的 EXDEV 跨层限制，本地 NTFS 亦可
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

console.log('[build-mobile] 静态导出（NEXT_PUBLIC_API_BASE=' + apiBase + '）...')
moveOut()
try {
  execSync('npx next build', {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      MOBILE_EXPORT: '1',
      NEXT_PUBLIC_API_BASE: apiBase,
      // 静态壳也需要站点 URL：next.config 的 images.remotePatterns 白名单从这里解析
      // （缺省会回退 https:** 并告警；壳内图片实际来自 API/COS 域名）
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || apiBase,
      NEXT_PUBLIC_APP_PLATFORM: 'mobile',
      NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || '1.27.0',
      NEXT_PUBLIC_APP_BUILD_NUMBER: process.env.NEXT_PUBLIC_APP_BUILD_NUMBER || '58',
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
  console.log('[build-mobile] 拷贝 out/ -> www/ ...')
  if (fs.existsSync(wwwDir)) fs.rmSync(wwwDir, { recursive: true, force: true })
  fs.cpSync(outDir, wwwDir, { recursive: true })
  fs.rmSync(outDir, { recursive: true, force: true })

  // 移动端照片/视频由服务端按需提供（/uploads、COS/CDN），不在壳内冗余打包；
  // 移除 public/uploads/media 的静态导出副本后，release APK 可减少约 64MB。
  const bundledMediaDir = path.join(wwwDir, 'uploads', 'media')
  if (fs.existsSync(bundledMediaDir)) {
    fs.rmSync(bundledMediaDir, { recursive: true, force: true })
    console.log('[build-mobile] 已移除打包冗余：www/uploads/media（照片改为运行期从服务端加载）')
  }

  /**
   * P2-26 后半（2026-10-19）：移动壳瘦身。
   *
   * 1) uploads 全目录剔除：媒体由服务端 /uploads 与 COS/CDN 在运行期提供，
   *    壳内副本既无用又是用户照片泄露面。此前只删 uploads/media，covers/memories/travels
   *    仍会随包分发（本地开发目录里还有数百个衍生文件）。
   * 2) 动态路由占位页剔除：generateStaticParams 产出的 travel/placeholder、
   *    space/placeholder、circle/0、circle/user/0 只用于构建期占位，移动端一律走
   *    query-param 路由（/travel/detail?slug= 等），这些页面不会被正确渲染，删掉减小包体。
   */
  const prunePaths = [
    'uploads',
    'circle/0.html',
    'circle/0.txt',
    'circle/user/0.html',
    'circle/user/0.txt',
    'space/placeholder.html',
    'space/placeholder.txt',
    'travel/placeholder.html',
    'travel/placeholder.txt',
    'travel/placeholder/record.html',
    'travel/placeholder/record.txt',
  ]
  let pruned = 0
  for (const rel of prunePaths) {
    const target = path.join(wwwDir, rel)
    if (!fs.existsSync(target)) continue
    fs.rmSync(target, { recursive: true, force: true })
    pruned += 1
  }
  for (const rel of ['travel/placeholder', 'space/placeholder', 'circle/user/0']) {
    const dir = path.join(wwwDir, rel)
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
    } catch {
      /* 目录非空则保留 */
    }
  }
  if (pruned > 0) {
    console.log('[build-mobile] 已剔除 ' + pruned + ' 项冗余产物（uploads 全目录 / 动态路由占位页）')
  }

  // 运行时品牌标志用 logo-512.png（258KB）；2048×2048 的 logo.png 仅作为
  // gen-splash/gen-icons 的生成源，剔除其静态导出副本避免 ~2MB 冗余打进 APK。
  const bundledLogo = path.join(wwwDir, 'brand', 'logo.png')
  if (fs.existsSync(bundledLogo)) {
    fs.rmSync(bundledLogo, { force: true })
    console.log('[build-mobile] 已移除打包冗余：www/brand/logo.png（运行时品牌用 logo-512.png，源图仅生成用）')
  }

  console.log('[build-mobile] 完成：www/ 已生成，可 npx cap sync android')
}
