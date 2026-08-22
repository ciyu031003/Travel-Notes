#!/usr/bin/env node
/**
 * 移动端静态导出（Stage 3.0b · A 拆分架构）。
 *
 * 原理：`next build` 的 output:'export' 与 API 路由/后台/feed/middleware 不兼容，
 * 因此把源码复制到临时目录 .mobile-build/，在其中剔除「服务端专属」内容后做纯客户端静态导出，
 * 产物拷到 www/。原源码目录零改动（复制而非移动，兼容 Docker overlayfs 且不污染源文件权限）。
 *
 * 移动端壳不设 /admin（D-3），API 全部走 NEXT_PUBLIC_API_BASE 指向的服务器。
 *
 * 用法：
 *   NEXT_PUBLIC_API_BASE=https://travel-notes.yuanabd.cn node scripts/build-mobile.cjs
 *   （随后可 npx cap sync android 更新原生工程）
 */
const { execSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const root = path.join(__dirname, '..')
const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'https://travel-notes.yuanabd.cn'
// 构建副本放在系统临时目录（不能在 root 内部，否则 cpSync 会复制自身）
const BUILD_DIR = path.join(os.tmpdir(), 'tn-mobile-build')

// 顶层目录/文件不复制（node_modules 用软链；大体积或构建无关的直接跳过）
const SKIP_TOP = new Set([
  'node_modules', '.next', '.git', 'www', 'android', 'mysql-data',
  'public', '.mobile-build', '.mobile-excluded', 'logs', 'out',
])
// 复制的副本里要删除的「服务端专属」内容
const STRIP = [
  'app/api',
  'app/feed.xml',
  'app/admin',
  'app/albums',
  'middleware.ts',
]

function copyFilter(src) {
  const rel = path.relative(root, src)
  if (!rel) return true
  const top = rel.split(path.sep)[0]
  return !SKIP_TOP.has(top)
}

function ensureNodeModules() {
  const dst = path.join(BUILD_DIR, 'node_modules')
  if (fs.existsSync(dst)) return
  try {
    fs.symlinkSync(path.join(root, 'node_modules'), dst, 'dir')
  } catch {
    // 无软链权限时降级为复制（较慢）
    fs.cpSync(path.join(root, 'node_modules'), dst, { recursive: true })
  }
}

console.log('[build-mobile] 准备静态导出（NEXT_PUBLIC_API_BASE=' + apiBase + '）...')
if (fs.existsSync(BUILD_DIR)) fs.rmSync(BUILD_DIR, { recursive: true, force: true })
fs.cpSync(root, BUILD_DIR, { recursive: true, filter: copyFilter })
for (const rel of STRIP) {
  const p = path.join(BUILD_DIR, rel)
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
}
ensureNodeModules()

try {
  execSync('npx next build', {
    cwd: BUILD_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      MOBILE_EXPORT: '1',
      NEXT_PUBLIC_API_BASE: apiBase,
      NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || '2.5.0',
      SKIP_DB_ON_BUILD: '1',
    },
  })
} finally {
  const outDir = path.join(BUILD_DIR, 'out')
  const wwwDir = path.join(root, 'www')
  if (fs.existsSync(outDir)) {
    console.log('[build-mobile] 拷贝 out/ -> www/ ...')
    if (fs.existsSync(wwwDir)) fs.rmSync(wwwDir, { recursive: true, force: true })
    fs.cpSync(outDir, wwwDir, { recursive: true })
    console.log('[build-mobile] 完成：www/ 已生成，可 npx cap sync android')
  }
  if (fs.existsSync(BUILD_DIR)) fs.rmSync(BUILD_DIR, { recursive: true, force: true })
}
