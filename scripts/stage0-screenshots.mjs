// Stage 1 截图回归脚本（Playwright）
// 使用前：
//   1. 确认 dev server 健康：http://localhost:3000
//   2. npm i -D playwright && npx playwright install chromium
//   3. 设置环境变量 TN_USER / TN_PASSWORD / TN_ALBUM_DATE
// 运行：node scripts/stage0-screenshots.mjs
import { chromium } from 'playwright'

const BASE = process.env.TN_BASE || 'http://localhost:3000'
const USER = process.env.TN_USER
const PASSWORD = process.env.TN_PASSWORD
const ALBUM_DATE = process.env.TN_ALBUM_DATE
const OUT = process.env.TN_OUT || 'docs/design/screenshots'

const routes = [
  { path: '/login', name: 'login' },
  { path: '/', name: 'home' },
  { path: '/travel', name: 'travel' },
  { path: '/timeline', name: 'timeline' },
  { path: '/album', name: 'album-space' },
  { path: '/album', name: 'album-pixel', clickText: '像素风' },
  { path: '/moments', name: 'moments' },
  { path: '/search', name: 'search' },
]

if (!USER || !PASSWORD) {
  console.error('缺少 TN_USER / TN_PASSWORD，无法登录并截图受保护页面。')
  process.exit(2)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

async function shot(name, viewport) {
  await page.setViewportSize(viewport)
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/${name}-${viewport.width}.png`, fullPage: true })
}

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  // 登录表单选择器按当前登录页实现调整
  await page.fill('input[type=text], input[name=username]', USER)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1000)

  for (const r of routes) {
    await page.goto(`${BASE}${r.path}`, { waitUntil: 'networkidle' }).catch(() => {})
    if (r.clickText) {
      const el = page.getByText(r.clickText).first()
      if (await el.count()) await el.click().catch(() => {})
    }
    if (r.path === '/album' && ALBUM_DATE) {
      // 相册解锁（若未解锁）
      const unlock = page.getByText('解锁相册').first()
      if (await unlock.count()) {
        await unlock.click()
        await page.fill('input[type=text]', ALBUM_DATE)
        await page.click('button[type=submit]')
        await page.waitForTimeout(1500)
      }
    }
    await shot(r.name, { width: 1440, height: 900 })
    await shot(`${r.name}-mobile`, { width: 390, height: 844 })
  }
  console.log('截图完成：', OUT)
} finally {
  await browser.close()
}
