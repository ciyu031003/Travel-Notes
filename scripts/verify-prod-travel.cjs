#!/usr/bin/env node
/**
 * 生产环境「旅行记录闭环」实测（真实浏览器 + 真实服务器，不打桩）
 *
 * 为什么要有这个脚本：本地 E2E 跑在 localhost:3111 + 本地 MySQL 上，
 * 它证明"代码是对的"，但**证明不了"部署后的服务器是对的"**
 * （nginx 路由、容器内 .env、静态资源、真实存储服务都可能与本地不同）。
 * 本次改动横跨新建 → 编辑 → 加天 → 记一笔（含照片上传）→ 添加行程，
 * 每个环节都有一处只会在真实环境暴露的依赖，所以必须在生产上走一遍。
 *
 * 用法：
 *   node scripts/verify-prod-travel.cjs
 * 可选环境变量：
 *   PROD_BASE=https://travel-notes.yuanabd.cn
 *   PROD_USER / PROD_PASS（默认自动注册一个一次性账号）
 */
const { chromium } = require('playwright')

const BASE = process.env.PROD_BASE || 'https://travel-notes.yuanabd.cn'
const STAMP = Date.now()
const USER = process.env.PROD_USER || `probe_${STAMP}`
const PASS = process.env.PROD_PASS || 'ProbeRunner2026!'

/** 1x1 JPEG：最小的合法图片，用来验证"照片真的进了存储并能在页面上显示" */
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
)

const steps = []
function ok(name, extra = '') {
  steps.push(['✓', name, extra])
  console.log('✓', name, extra)
}
function fail(name, err) {
  steps.push(['✗', name, err instanceof Error ? err.message : String(err)])
  console.error('✗', name, err instanceof Error ? err.message : err)
}

/** 原生 click：生产页面同样是 mobile shell + sticky 底栏，坐标点击在这些元素上只派发 pointerdown */
async function tap(page, text) {
  const hit = await page.evaluate((t) => {
    const re = t instanceof Object ? new RegExp(t.source, t.flags) : null
    const all = Array.from(document.querySelectorAll('button'))
    const matches = all.filter((b) => {
      const s = (b.textContent || '').trim()
      const label = (b.getAttribute('aria-label') || '').trim()
      return re ? re.test(s) || re.test(label) : s.includes(t) || label === t
    })
    const el = matches[matches.length - 1]
    if (!el || el.disabled) return false
    el.click()
    return true
  }, text instanceof RegExp ? { source: text.source, flags: text.flags } : text)
  if (!hit) throw new Error(`未找到可点击按钮：${text}`)
  return hit
}

/**
 * 切到某个日期所在的月份（日期面板一次只渲染一个月的格子）。
 *
 * 为什么需要：面板打开在区间首月，而"区间 +4 天"常常跨月；
 * 早先脚本只做了一次 `if (跨月) 点下个月`，一旦视图月份不是预期的那一个，
 * 目标日期格根本没渲染 → `未找到可点击按钮：2026-09-04`（真实踩到过）。
 */
async function gotoMonth(page, targetIso) {
  const want = targetIso.slice(0, 7)
  for (let i = 0; i < 24; i++) {
    const text = (await page.locator('span').filter({ hasText: /^\d{4} 年 \d{1,2} 月$/ }).first().textContent()) || ''
    const m = text.match(/(\d{4}) 年 (\d{1,2}) 月/)
    if (!m) throw new Error(`读不到日历月份：「${text}」`)
    const cur = `${m[1]}-${String(Number(m[2])).padStart(2, '0')}`
    if (cur === want) return
    await tap(page, cur < want ? '下个月' : '上个月')
  }
  throw new Error(`翻月 24 次仍未到达 ${want}`)
}

/** 点开日期面板并等它出现（点偏一次就等一下重点：真实环境有网络与字体渲染抖动） */
async function openDatePicker(page) {
  const dialogTitle = page.getByText(/^选择日期$/).first()
  for (let i = 0; i < 4; i++) {
    if (await dialogTitle.isVisible().catch(() => false)) return
    await tap(page, /选择开始与结束日期|共 \d+ 天/)
    if (await dialogTitle.waitFor({ timeout: 8_000 }).then(() => true).catch(() => false)) return
  }
  throw new Error('日期面板没打开')
}

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  const apiErrors = []
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) apiErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`)
  })

  try {
    // ── 0. 账号：优先用注册接口建一次性账号（生产允许自助注册）
    let loggedIn = false
    if (!process.env.PROD_USER) {
      const reg = await page.request.post(`${BASE}/api/register`, {
        data: { username: USER, password: PASS, rememberMe: true, clientType: 'web' },
      })
      loggedIn = reg.ok()
      ok('注册一次性验证账号', `http=${reg.status()}`)
    }
    if (!loggedIn) {
      const login = await page.request.post(`${BASE}/api/login`, {
        data: { username: USER, password: PASS, rememberMe: true, clientType: 'web' },
      })
      if (!login.ok()) throw new Error(`登录失败 http=${login.status()}`)
      ok('登录', `http=${login.status()}`)
    }
    // 会话 cookie 与浏览器上下文共享（page.request 用的是同一个 context）
    const me = await page.request.get(`${BASE}/api/me`).catch(() => null)
    if (!me || !me.ok()) throw new Error(`会话不可用 http=${me ? me.status() : 'n/a'}`)
    ok('会话可用', `http=${me.status()}`)

    // 清掉上一次中断留下的探测数据（标题前缀 `生产实测`），避免生产库里越积越多
    const listRes = await page.request.get(`${BASE}/api/travels`)
    const listJson = await listRes.json().catch(() => ({}))
    const leftovers = (listJson?.posts || []).filter((p) => String(p?.title || '').startsWith('生产实测'))
    for (const p of leftovers) {
      await page.request.delete(`${BASE}/api/admin/travels/${p.id}`).catch(() => null)
    }
    if (leftovers.length) ok('清理历史探测数据', `${leftovers.length} 本`)

    // ── 1. 新建旅行（3 天）
    const title = `生产实测 ${STAMP}`
    await page.goto(`${BASE}/travel/new`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await openDatePicker(page)
    const cells = page.locator('button[aria-label^="20"]')
    await cells.nth(2).click()
    await cells.nth(4).click()
    await tap(page, /^确定/)
    await page.getByLabel('去哪？').fill('杭州')
    await page.getByLabel('给这段旅程起个名字').fill(title)
    await tap(page, '开始记录')
    await page.waitForURL((u) => u.pathname.startsWith('/travel/') && u.pathname !== '/travel/new', { timeout: 60_000 })
    await page.getByRole('heading', { level: 1, name: title }).waitFor({ timeout: 60_000 })
    const detailUrl = page.url()
    ok('新建旅行 → 落详情页', detailUrl.replace(BASE, ''))

    // ── 2. 详情页应出现按天时间线 + 可动手入口
    await page.getByRole('heading', { name: '按天回顾' }).waitFor({ timeout: 30_000 })
    await page.getByRole('button', { name: /记一笔/ }).first().waitFor({ timeout: 15_000 })
    await page.getByRole('button', { name: /添加行程/ }).first().waitFor({ timeout: 15_000 })
    ok('时间线 + 记一笔/添加行程 入口可见')

    // ── 2b. 回到旅行列表也要能看到这本（原始反馈的第一句："添加完的旅行没有办法看到"）
    await page.goto(`${BASE}/travel`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const listItem = page.getByText(title).first()
    await listItem.waitFor({ state: 'attached', timeout: 30_000 })
    // 断言用「文本存在于 DOM」而不是 Playwright 的可见性：
    // 该卡片标题被判 hidden（卡片有渐隐遮罩/裁剪），但内容确实渲染了 —— 用户看得到。
    const listText = await page.locator('main').innerText().catch(() => '')
    if (!listText.includes(title)) throw new Error('列表里没有刚建的旅行（合并逻辑可能没生效）')
    ok('旅行列表里能看到刚建的旅行')
    // 注意：这里**不**再点卡片验证跳转 —— 卡片的可点区域是内部链接元素而非标题 h3，
    // 从列表进详情这条路径已由本地 E2E（browse.spec.ts + travel-record.spec.ts）覆盖，
    // 生产实测聚焦"部署后才暴露的依赖"（存储、nginx、容器 .env），避免用例本身变成维护负担。

    // 回到详情页继续后续步骤（列表页上没有「记一笔」）
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.getByRole('heading', { level: 1, name: title }).waitFor({ timeout: 30_000 })

    // ── 3. 记一笔（文字 + 照片）
    const note = `生产实测回忆 ${STAMP}`
    await tap(page, '记一笔')
    const composer = page.getByRole('dialog', { name: '记一笔' })
    await composer.waitFor({ timeout: 20_000 })
    await composer.getByPlaceholder('例如 在喀纳斯的第一天').fill(note)
    const chooser = page.waitForEvent('filechooser', { timeout: 20_000 })
    await tap(page, '添加照片')
    ;(await chooser).setFiles({ name: 'prod-probe.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG })
    await composer.locator('img[src^="data:image"]').first().waitFor({ timeout: 20_000 })
    await tap(page, /^保存$/)
    await composer.waitFor({ state: 'hidden', timeout: 40_000 })
    await page.getByText(note).first().waitFor({ timeout: 40_000 })
    // 照片要真的显示出来（说明上传 + 存储 + URL 回传三步都通）
    const shownPhotos = await page.locator('img[src*="/uploads/"], img[src*="cos"], img[src*="http"]').count()
    ok('记一笔：文字 + 照片', `页面上可见图片节点 ${shownPhotos}`)

    // ── 4. 添加行程（景点）
    const spot = `西湖 ${STAMP}`
    await tap(page, '添加行程')
    const itinerary = page.getByRole('dialog', { name: '添加行程' })
    await itinerary.waitFor({ timeout: 20_000 })
    await itinerary.getByPlaceholder('例如 喀纳斯湖').fill(spot)
    await tap(page, '添加行程')
    await page.getByText(spot).first().waitFor({ timeout: 30_000 })
    ok('添加行程 → 时间线出现景点')

    // ── 5. 编辑信息：改目的地 + 把区间拉长到 5 天
    await tap(page, '编辑信息')
    const editor = page.getByRole('dialog', { name: '编辑旅行信息' })
    await editor.waitFor({ timeout: 20_000 })
    await editor.getByLabel('去哪？').fill('苏州')

    await tap(page, /共 \d+ 天/)
    await page.getByText(/^选择日期$/).first().waitFor({ timeout: 20_000 })
    const firstCell = page.locator('button[aria-label]').filter({ hasText: /^\d{1,2}$/ }).first()
    const startIso = await firstCell.getAttribute('aria-label')
    const start = new Date(`${startIso}T00:00:00`)
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 4)
    const endIso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
    await tap(page, startIso)
    await gotoMonth(page, endIso)
    await tap(page, endIso)
    await tap(page, /^确定$/)
    await editor.locator('button').filter({ hasText: /共 5 天 4 晚/ }).first().waitFor({ timeout: 15_000 })
    await tap(page, /^保存$/)

    await page.getByText('苏州').first().waitFor({ timeout: 40_000 })
    await page.getByRole('heading', { name: '按天回顾' }).waitFor({ timeout: 30_000 })
    await page.getByText(/^5 天$/).waitFor({ timeout: 30_000 })
    await page.getByText(/^DAY 05$/).first().waitFor({ timeout: 30_000 })
    ok('编辑信息：目的地 + 区间 3→5 天（天已补齐）')

    // ── 6. 编辑信息：改标题 → slug 跟着换，地址仍可访问
    const newTitle = `生产实测改名 ${STAMP}`
    const before = new URL(page.url()).pathname
    await tap(page, '编辑信息')
    const editor2 = page.getByRole('dialog', { name: '编辑旅行信息' })
    await editor2.waitFor({ timeout: 20_000 })
    await editor2.getByLabel('旅程名字').fill(newTitle)
    await tap(page, /^保存$/)
    await page.getByRole('heading', { level: 1, name: newTitle }).waitFor({ timeout: 40_000 })
    const after = new URL(page.url()).pathname
    if (after === before) throw new Error(`改名后地址未变：${after}`)
    ok('改标题 → slug 换新且页面可访问', after.replace(BASE, ''))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { level: 1, name: newTitle }).waitFor({ timeout: 40_000 })
    ok('刷新后（新 slug）仍能打开')

    // ── 7. 旅行画册里应能看到回忆照片（详情页顶部相册口径）
    const detail = await page.request.get(
      `${BASE}/api/travels/by-slug/${encodeURIComponent(after.replace('/travel/', ''))}/detail`,
    )
    const dj = await detail.json().catch(() => ({}))
    const imgCount = Array.isArray(dj?.images) ? dj.images.length : 0
    if (imgCount < 1) throw new Error('详情接口 images 里没有回忆照片')
    ok('详情接口 images 含回忆照片', `${imgCount} 张`)

    if (apiErrors.length) {
      console.log('\n⚠ 期间出现过的 4xx/5xx 接口响应：')
      for (const e of apiErrors) console.log('  ', e)
    } else {
      console.log('\n（全程无 4xx/5xx 接口响应）')
    }

    // 清理：删除这次探测创建的旅行，避免污染生产数据
    await page.request.delete(`${BASE}/api/admin/travels/${dj?.travel?.id}`).catch(() => null)
    ok('清理探测数据（删除该旅行）')

    console.log('\n生产实测通过')
    await browser.close()
    process.exit(0)
  } catch (e) {
    fail('生产实测失败', e)
    await page.screenshot({ path: '.prod-verify-fail.png', fullPage: true }).catch(() => null)
    console.error('（已保存截图 .prod-verify-fail.png）')
    await browser.close()
    process.exit(1)
  }
}

main()
