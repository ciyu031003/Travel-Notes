// M5 预览台截图（Playwright）
// 用法：
//   1. 先起 dev server（npm run dev），确认 http://localhost:3000 可访问
//   2. node scripts/m5-preview-shots.mjs
// 产物：docs/design/screenshots/m5-preview-{light,dark}-{width}.png
//       docs/design/screenshots/m5-sec-*.png（逐区块特写，390 宽）
//
// 说明：/dev/ui* 在非生产环境是公开路径（lib/public-paths.ts isDevToolPath），
// 因此不需要登录、也不需要数据库。
import { chromium } from 'playwright'

const BASE = process.env.TN_BASE || 'http://localhost:3000'
const OUT = process.env.TN_OUT || 'docs/design/screenshots'
const WIDTHS = [390, 360]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

async function shoot(name) {
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log('saved', `${OUT}/${name}.png`)
}

/** 逐区块特写：整页缩略看不清控件细节，评审时需要能看清单个组件。 */
async function shootSections(theme) {
  const sections = page.locator('section')
  const count = await sections.count()
  for (let i = 0; i < Math.min(count, 6); i++) {
    const title = (
      await sections
        .nth(i)
        .locator('h2')
        .first()
        .innerText()
        .catch(() => `s${i}`)
    )
      .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
      .slice(0, 24)
    const path = `${OUT}/m5-sec-${i}-${title}-${theme}.png`
    await sections.nth(i).screenshot({ path })
    console.log('saved', path)
  }
}

try {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto(`${BASE}/dev/ui/v4`, { waitUntil: 'networkidle' })
    if (!page.url().includes('/dev/ui/v4')) {
      throw new Error(`被重定向到 ${page.url()}（预期 /dev/ui/v4）`)
    }

    // fullPage 截图会把 position:fixed 的底部导航「钉」在视口位置、压在内容上，
    // 属于截图假象。这里只在截图期间移除它，不改动应用代码。
    // 同时隐藏 Next dev-tools 的悬浮徽标（nextjs-portal，仅开发环境存在）。
    await page.addStyleTag({
      content: [
        'nav[aria-label="移动端导航"]{display:none !important}',
        'nextjs-portal{display:none !important}',
      ].join('\n'),
    })
    await page.evaluate(() => {
      document
        .querySelectorAll('nav[aria-label="移动端导航"]')
        .forEach((el) => el.remove())
    })

    await page.evaluate(() => document.documentElement.classList.remove('dark'))
    await shoot(`m5-preview-light-${width}`)
    if (width === 390) await shootSections('light')

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await shoot(`m5-preview-dark-${width}`)
    if (width === 390) await shootSections('dark')
  }
  console.log('完成')
} finally {
  await browser.close()
}
