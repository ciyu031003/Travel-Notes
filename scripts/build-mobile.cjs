#!/usr/bin/env node
/**
 * 移动端静态导出构建（Stage 3.0b 本地壳）。
 * 目标：把 Next.js 前端导出为静态壳到 www/，供 Capacitor 本地加载。
 *
 * 前置（3.0b-2）：需先把 force-dynamic / 服务端组件页面改为客户端渲染，
 * 否则 next build --export 会因动态路由失败。
 *
 * 用法：
 *   NEXT_PUBLIC_API_BASE=http://106.55.2.197 node scripts/build-mobile.cjs
 *   （可再执行 npx cap sync android 更新原生工程）
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://106.55.2.197'

console.log('[build-mobile] 静态导出（NEXT_PUBLIC_API_BASE=' + apiBase + '）...')
execSync('npx next build', {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    MOBILE_EXPORT: '1',
    NEXT_PUBLIC_API_BASE: apiBase,
  },
})

const outDir = path.join(root, 'out')
const wwwDir = path.join(root, 'www')
console.log('[build-mobile] 拷贝 out/ -> www/ ...')
if (fs.existsSync(wwwDir)) fs.rmSync(wwwDir, { recursive: true, force: true })
fs.renameSync(outDir, wwwDir)
console.log('[build-mobile] 完成：www/ 已生成，可执行 npx cap sync android')
