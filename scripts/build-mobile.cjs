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
  ['middleware.ts', 'middleware.ts'],
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
      NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || '3.0.1',
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
  console.log('[build-mobile] 完成：www/ 已生成，可 npx cap sync android')
}
