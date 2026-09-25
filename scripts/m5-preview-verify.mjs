// M5 预览台冒烟检查（Playwright）
// 目的：确认 /dev/ui/v4 在真实浏览器里**能渲染且无客户端运行时错误**。
//
// 为什么需要它：Next dev 的 .next 目录与 next build 共用，**dev server 运行期间跑
// next build 会把 dev 的 client manifest 冲掉**，表现为页面白屏 + 开发错误浮层
// `TypeError: Cannot read properties of undefined (reading 'call')`。
// 这种故障 SSR 的 HTML 仍是好的（curl 看不出问题），必须用真浏览器才能发现。
//
// 用法：node scripts/m5-preview-verify.mjs
// 退出码：有问题时 1
import { chromium } from 'playwright'

const BASE = process.env.TN_BASE || 'http://localhost:3000'
const ROUTES = ['/dev/ui/v4', '/dev/ui']

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

const problems = []

for (const route of ROUTES) {
  const consoleErrors = []
  const pageErrors = []

  const onConsole = (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  }
  const onPageError = (e) => pageErrors.push(String(e.message || e))

  page.on('console', onConsole)
  page.on('pageerror', onPageError)

  const res = await page.goto(BASE + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  const status = res?.status()
  const hasOverlay = await page
    .locator('text=/Cannot read properties of undefined|Runtime TypeError|Unhandled Runtime Error/')
    .count()
  const bodyText = await page.locator('body').innerText().catch(() => '')
  const rendered = bodyText.includes('组件预览')

  console.log(`\n${route}`)
  console.log(`  status           : ${status}`)
  console.log(`  渲染出内容       : ${rendered}`)
  console.log(`  开发错误浮层     : ${hasOverlay > 0}`)
  console.log(`  pageerror        : ${pageErrors.length ? pageErrors.join(' | ') : '无'}`)
  console.log(`  console.error    : ${consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : '无'}`)

  if (status !== 200) problems.push(`${route} 返回 ${status}`)
  if (!rendered) problems.push(`${route} 未渲染出内容`)
  if (hasOverlay > 0) problems.push(`${route} 出现开发错误浮层`)
  if (pageErrors.length) problems.push(`${route} 有 pageerror: ${pageErrors[0]}`)

  page.off('console', onConsole)
  page.off('pageerror', onPageError)
}

await browser.close()

if (problems.length) {
  console.error('\n❌ 预览台检查失败：')
  for (const p of problems) console.error('   · ' + p)
  console.error('\n提示：若报 client manifest / reading \'call\'，清理 .next 后重启 dev server：')
  console.error('  停止 dev → Remove-Item -Recurse -Force .next → npm run dev')
  process.exit(1)
}
console.log('\n✅ 预览台检查通过（均 200、正常渲染、无客户端错误）')
