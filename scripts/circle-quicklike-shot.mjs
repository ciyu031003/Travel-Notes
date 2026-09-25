// 旅行圈「快捷点赞」视觉验证截图
// 用法：
//   1. 起 MySQL（start-mysql.bat）与 dev server（npm run dev）
//   2. node scripts/circle-quicklike-shot.mjs
// 产物：docs/design/screenshots/circle-quicklike-{light,dark}.png
//
// 前置数据：本地库的 travelpost 若为空，旅行圈是空态（没有卡片就没有快捷点赞）。
// 用 `node scripts/backfill-travel-posts.cjs` 从已公开的 Travel 回填（幂等）。
import { chromium } from 'playwright'

const BASE = process.env.TN_BASE || 'http://localhost:3000'
const OUT = 'docs/design/screenshots'

async function login() {
  const body = JSON.stringify({
    username: 'yuanabd',
    password: 'Tiantu@2026',
    rememberMe: true,
    clientType: 'web',
  })
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  if (!res.ok) throw new Error(`登录失败 ${res.status}`)
  const cookie = res.headers
    .getSetCookie()
    .map((c) => (c.split('=')[0] === 'admin_session' ? c : null))
    .filter(Boolean)[0]
  if (!cookie) throw new Error('未拿到 admin_session')
  return cookie.split(';')[0].slice('admin_session='.length)
}

const value = await login()
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
await ctx.addCookies([
  { name: 'admin_session', value, domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' },
])
const page = await ctx.newPage()

const errors = []
page.on('pageerror', (e) => errors.push(String(e.message || e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text())
})

await page.goto(`${BASE}/circle`, { waitUntil: 'networkidle' })
await page.addStyleTag({
  content: 'nav[aria-label="移动端导航"]{display:none !important}\nnextjs-portal{display:none !important}',
})
await page.evaluate(() => {
  document.querySelectorAll('nav[aria-label="移动端导航"]').forEach((el) => el.remove())
})
await page.waitForTimeout(1200)

// 快捷点赞按钮是否存在、有多少个
const likeButtons = await page.locator('button[aria-label="点赞"], button[aria-label="取消点赞"]').count()
console.log('页面上快捷点赞按钮数量:', likeButtons)

// 抓一张点赞按钮所在卡片的特写
const first = page.locator('button[aria-label="点赞"], button[aria-label="取消点赞"]').first()
if (likeButtons > 0) {
  const box = await first.boundingBox()
  console.log('第一个按钮位置:', JSON.stringify(box))
}

await page.evaluate(() => document.documentElement.classList.remove('dark'))
await page.screenshot({ path: `${OUT}/circle-quicklike-light.png`, fullPage: false })
console.log('saved', `${OUT}/circle-quicklike-light.png`)

await page.evaluate(() => document.documentElement.classList.add('dark'))
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/circle-quicklike-dark.png`, fullPage: false })
console.log('saved', `${OUT}/circle-quicklike-dark.png`)

console.log('客户端错误:', errors.length ? errors.slice(0, 5).join(' | ') : '无')
await browser.close()
