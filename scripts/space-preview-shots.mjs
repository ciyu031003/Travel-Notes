// 空间模块预览台截图（Playwright）
// 用法：
//   1. 先起 dev server（npm run dev），确认 http://localhost:3000 可访问
//   2. node scripts/space-preview-shots.mjs            # 幂等：已存在的演示空间不重复建
//      node scripts/space-preview-shots.mjs --reset    # 先清掉旧的演示空间再重拍
// 产物：docs/design/screenshots/space-*.png
//
// 说明：
//  · /dev/ui/* 在非生产环境是公开路径（lib/public-paths.ts isDevToolPath），
//    不需要登录、也不需要数据库 —— 五套配色的评审截图由此而来。
//  · 真实页面（/space、/space/<slug>）需要登录：脚本用 e2e 账号
//    （tests/e2e/global-setup.ts 同款）注册并登录，然后建 3 个不同类型的演示空间。
//    演示数据落在本地开发库；脚本会打印它们的 id，随时可删。
import { chromium } from 'playwright'

const BASE = process.env.TN_BASE || 'http://localhost:3000'
const OUT = process.env.TN_OUT || 'docs/design/screenshots'
const USER = { username: 'e2e_runner', password: 'E2eRunner2026!' }
const RESET = process.argv.includes('--reset')

const DEMO_SPACES = [
  { name: '我们的小家', spaceType: 'COUPLE', description: '从第一次穷游到现在的每一次出发' },
  { name: '全家出行记', spaceType: 'FAMILY', description: '爸妈、我和妹妹的假期' },
  { name: '老友出发', spaceType: 'FRIENDS', description: '每年一次，谁都不许缺席' },
]

const browser = await chromium.launch()
const created = []

async function shoot(page, name, { full = true } = {}) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full })
  console.log('saved', `${OUT}/${name}.png`)
}

/** 隐藏底部导航与 Next devtools 徽标（fullPage 截图会把 fixed 元素钉在视口位，属截图假象） */
async function sanitize(page) {
  await page.addStyleTag({
    content: [
      'nav[aria-label="移动端导航"]{display:none !important}',
      'nextjs-portal{display:none !important}',
    ].join('\n'),
  })
  await page.evaluate(() => {
    document.querySelectorAll('nav[aria-label="移动端导航"]').forEach((el) => el.remove())
  })
}

async function setDark(page, dark) {
  await page.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark)
}

/** 区块特写：整页缩略看不清控件细节，评审时需要能看清单个组件 */
async function shootSection(page, heading, name) {
  const section = page.locator('section', { has: page.locator(`h2:text-is("${heading}")`) }).first()
  if ((await section.count()) === 0) {
    console.log('skip (section not found):', heading)
    return
  }
  await section.scrollIntoViewIfNeeded()
  await page.waitForTimeout(250)
  await section.screenshot({ path: `${OUT}/${name}.png` })
  console.log('saved', `${OUT}/${name}.png`)
}

/** 读取当前演示账号名下的空间（用于幂等判断与清理） */
async function listMySpaces(ctx) {
  const res = await ctx.request.get(`${BASE}/api/spaces`, { failOnStatusCode: false })
  if (!res.ok()) return []
  const j = await res.json().catch(() => ({}))
  return j.spaces || []
}

try {
  /* ══════════ 一、预览台（五套主题，无需登录） ══════════ */
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 })
  await page.goto(`${BASE}/dev/ui/space`, { waitUntil: 'networkidle' })
  if (!page.url().includes('/dev/ui/space')) {
    throw new Error(`被重定向到 ${page.url()}（预期 /dev/ui/space）`)
  }
  await sanitize(page)

  await setDark(page, false)
  await shoot(page, 'space-preview-light-1280')
  await shootSection(page, '① 七令牌色板（浅色 / 深色随右上角切换）', 'space-themes-light-1280')
  await shootSection(page, '② 空间列表卡片（真实组件 SpaceCard）', 'space-cards-light-1280')
  await shootSection(page, '③ 创建空间时的类型选择（真实组件 SpaceTypePicker）', 'space-picker-light-1280')
  await shootSection(page, '④ 空间详情页缩影（真实组件 SpaceDetail 的头图 / 统计 / 内容行）', 'space-detail-snippet-light-1280')

  await setDark(page, true)
  await shoot(page, 'space-preview-dark-1280')
  await shootSection(page, '① 七令牌色板（浅色 / 深色随右上角切换）', 'space-themes-dark-1280')
  await shootSection(page, '② 空间列表卡片（真实组件 SpaceCard）', 'space-cards-dark-1280')
  await shootSection(page, '④ 空间详情页缩影（真实组件 SpaceDetail 的头图 / 统计 / 内容行）', 'space-detail-snippet-dark-1280')

  // 移动端宽度：类型选择器与卡片在真机尺寸下的样子
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  await mobile.goto(`${BASE}/dev/ui/space`, { waitUntil: 'networkidle' })
  await sanitize(mobile)
  await setDark(mobile, false)
  await shootSection(mobile, '③ 创建空间时的类型选择（真实组件 SpaceTypePicker）', 'space-picker-light-390')
  await shootSection(mobile, '④ 空间详情页缩影（真实组件 SpaceDetail 的头图 / 统计 / 内容行）', 'space-detail-snippet-light-390')
  await setDark(mobile, true)
  await shootSection(mobile, '④ 空间详情页缩影（真实组件 SpaceDetail 的头图 / 统计 / 内容行）', 'space-detail-snippet-dark-390')

  /* ══════════ 二、真实页面（需要登录） ══════════ */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  await ctx.request.post(`${BASE}/api/register`, { data: USER, failOnStatusCode: false })
  const loginRes = await ctx.request.post(`${BASE}/api/login`, { data: USER, failOnStatusCode: false })
  if (!loginRes.ok()) throw new Error(`登录失败: ${loginRes.status()} ${await loginRes.text()}`)
  console.log('logged in as', USER.username)

  const app = await ctx.newPage()

  // 清理：--reset 时删掉演示账号名下所有「演示空间」（只带一个成员、且名字在清单里）
  if (RESET) {
    const mine = await listMySpaces(ctx)
    for (const s of mine) {
      if (DEMO_SPACES.some((d) => d.name === s.name)) {
        const r = await ctx.request.delete(`${BASE}/api/spaces/${s.id}`, { failOnStatusCode: false })
        console.log(`  reset: deleted #${s.id} ${s.name} -> ${r.status()}`)
      }
    }
  }

  await app.goto(`${BASE}/space`, { waitUntil: 'networkidle' })
  if (app.url().includes('/login')) throw new Error('未登录成功（被重定向到 /login）')
  await sanitize(app)

  const existing = await listMySpaces(ctx)
  const hasEmptyState = existing.filter((s) => DEMO_SPACES.some((d) => d.name === s.name)).length === 0
  // 空态只在「账号名下确实没有演示空间」时才有意义
  if (hasEmptyState) await shoot(app, 'space-real-empty-390')

  // 建演示空间（幂等：同名同类型的已存在就跳过）
  for (const s of DEMO_SPACES) {
    if (existing.some((e) => e.name === s.name)) {
      console.log('skip (exists):', s.name)
      continue
    }
    const res = await ctx.request.post(`${BASE}/api/spaces`, { data: s, failOnStatusCode: false })
    const j = await res.json().catch(() => ({}))
    if (res.ok() && j.spaceId) created.push({ ...s, id: j.spaceId, slug: j.slug })
    else console.log('create failed:', s.name, res.status(), JSON.stringify(j))
  }
  if (created.length) console.log('created demo spaces:', JSON.stringify(created))

  await app.reload({ waitUntil: 'networkidle' })
  await sanitize(app)
  await shoot(app, 'space-real-list-390')

  // 创建弹层（含五套主题预览的类型选择器）
  await app.getByRole('button', { name: '创建空间' }).first().click()
  await app.waitForTimeout(600)
  await shoot(app, 'space-real-create-sheet-390', { full: false })
  await app.keyboard.press('Escape')
  await app.waitForTimeout(400)

  // 空间详情页：优先用刚建的，否则用已存在的同名空间
  const all = [...created, ...(await listMySpaces(ctx))]
  const target =
    all.find((s) => s.spaceType === 'COUPLE' && s.slug) ||
    all.find((s) => s.slug)
  if (target?.slug) {
    await app.goto(`${BASE}/space/${target.slug}`, { waitUntil: 'networkidle' })
    if (app.url().includes('/space/')) {
      await sanitize(app)
      await shoot(app, 'space-real-detail-390')
      await setDark(app, true)
      await shoot(app, 'space-real-detail-dark-390')
      await setDark(app, false)
    } else {
      console.log('skip detail shot: redirected to', app.url())
    }
  }

  const finalList = await listMySpaces(ctx)
  const demo = finalList.filter((s) => DEMO_SPACES.some((d) => d.name === s.name))
  console.log('\n完成。演示空间（如需清理）：')
  for (const s of demo) console.log(`  #${s.id}  ${s.name}  (${s.spaceType})  /space/${s.slug}`)
  console.log('  清理命令：node scripts/space-preview-shots.mjs --reset')
} finally {
  await browser.close()
}

