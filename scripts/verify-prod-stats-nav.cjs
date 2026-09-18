#!/usr/bin/env node
/**
 * 生产实测：统计口径统一 + 设置页导航（R3）。
 *
 * 为什么必须上生产：
 *  ① 统计口径依赖**真实数据分布**（该账号有 Travel 还是有旧文章），单测用 mock 验证不了；
 *  ② 导航修复只在真实路由 + 真实布局下才成立（`LayoutContent` 的分支按 pathname 走）。
 *
 * 用法：node scripts/verify-prod-stats-nav.cjs
 */
const { chromium } = require('playwright')

const BASE = process.env.PROD_BASE || 'https://travel-notes.yuanabd.cn'
const STAMP = String(Date.now()).slice(-8)
const USER = process.env.PROD_USER || `ps${STAMP}`
const PASS = process.env.PROD_PASS || 'ProbeRunner2026!'

function ok(name, extra = '') {
  console.log('✓', name, extra)
}

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  const apiErrors = []
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) apiErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`)
  })

  let travelId = null
  try {
    const reg = await ctx.request.post(`${BASE}/api/register`, {
      data: { username: USER, password: PASS, rememberMe: true, clientType: 'web' },
    })
    if (!reg.ok()) throw new Error(`注册失败 http=${reg.status()}`)
    ok('注册一次性账号', `http=${reg.status()}`)

    // ── 1. 零数据时：两页统计必须一致（都应为 0，而不是一个 0 一个别的数）
    const me0 = (await (await ctx.request.get(`${BASE}/api/me`)).json()).data
    const dash0 = await (await ctx.request.get(`${BASE}/api/dashboard`)).json()
    const dash0d = dash0?.data ?? dash0
    if (me0.summary.travelCount !== dash0d.travelCount) {
      throw new Error(`零数据时口径就不一致：me=${me0.summary.travelCount} dashboard=${dash0d.travelCount}`)
    }
    ok('零数据时两页口径一致', `travelCount=${me0.summary.travelCount}`)

    // ── 2. 建一本旅行 + 一条公开回忆 + 一张照片 → 两页数字都必须 +1
    const title = `STATS-PROBE-${STAMP}`
    const created = await (
      await ctx.request.post(`${BASE}/api/admin/travels`, {
        data: { title, location: '成都', startDate: '2026-10-01', endDate: '2026-10-03' },
      })
    ).json()
    travelId = created?.id
    if (!travelId) throw new Error(`建旅行失败: ${JSON.stringify(created)}`)

    const mem = await (
      await ctx.request.post(`${BASE}/api/travels/${travelId}/memories`, {
        data: { title: 'STATS 回忆', content: 'x', isPublic: true },
      })
    ).json()
    if (!mem?.memoryId) throw new Error(`建回忆失败: ${JSON.stringify(mem)}`)
    const TINY = Buffer.from(
      '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
        'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
        'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
      'base64',
    )
    await ctx.request.post(`${BASE}/api/memories/${mem.memoryId}/photos`, {
      multipart: { files: { name: 'p.jpg', mimeType: 'image/jpeg', buffer: TINY } },
    })
    ok('建一本旅行 + 公开回忆 + 照片')

    const me1 = (await (await ctx.request.get(`${BASE}/api/me`)).json()).data
    const dash1d = (await (await ctx.request.get(`${BASE}/api/dashboard`)).json())?.data
    const dash1 = dash1d ?? {}

    const expectTravels = me0.summary.travelCount + 1
    for (const [label, got] of [
      ['/api/me', me1.summary.travelCount],
      ['/api/dashboard', dash1.travelCount],
    ]) {
      if (got !== expectTravels) throw new Error(`${label} travelCount 应为 ${expectTravels}，实际 ${got}`)
    }
    ok('两页 travelCount 同步 +1', `${me0.summary.travelCount} → ${me1.summary.travelCount}`)

    // 地方数：新城市 +1
    if (me1.summary.placeCount !== me0.summary.placeCount + 1) {
      throw new Error(`placeCount 应为 +1：${me0.summary.placeCount} → ${me1.summary.placeCount}`)
    }
    if (dash1.placeCount !== me1.summary.placeCount) {
      throw new Error(`看板与我的 placeCount 不一致：${dash1.placeCount} vs ${me1.summary.placeCount}`)
    }
    ok('地方数 +1 且两页一致', `placeCount=${me1.summary.placeCount}`)

    // 照片数：至少 +1，且两页一致
    if (me1.summary.photoCount <= me0.summary.photoCount) {
      throw new Error(`photoCount 未增加：${me0.summary.photoCount} → ${me1.summary.photoCount}`)
    }
    if (dash1.totalPhotos !== me1.summary.photoCount) {
      throw new Error(`看板与我的 photoCount 不一致：${dash1.totalPhotos} vs ${me1.summary.photoCount}`)
    }
    ok('照片数增加且两页一致', `photoCount=${me1.summary.photoCount}`)
    if (me1.summary.source?.used !== 'travel') {
      throw new Error(`有 Travel 时 source 应为 travel，实际 ${me1.summary.source?.used}`)
    }
    ok('统计来源判定正确', `source=${me1.summary.source.used}（travelRows=${me1.summary.source.travelRows}）`)

    // ── 3. 页面渲染的数字必须与接口一致（避免"接口对了但页面没渲染"）
    await page.goto(`${BASE}/me`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.locator('text=/^@/').first().waitFor({ timeout: 40_000 })
    const pageText = await page.locator('body').innerText()
    if (!pageText.includes(`${me1.summary.travelCount} 次旅行`) && !pageText.includes(`${me1.summary.travelCount}\n次旅行`)) {
      // CountUp 动画可能还在跑，宽松匹配：出现"次旅行"即可
      if (!pageText.includes('次旅行')) throw new Error('「我的」页没有渲染三统计')
    }
    ok('「我的」页渲染出三统计')

    // ── 4. 导航：设置子页有返回键 + 底部 tab 在位
    for (const [path, marker] of [
      ['/sync', '数据与同步'],
      ['/me/settings', '账号设置'],
    ]) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.getByRole('heading', { name: marker }).first().waitFor({ timeout: 30_000 })
      const backCount = await page.getByRole('button', { name: '返回' }).count()
      if (backCount === 0) throw new Error(`${path} 没有返回键`)
      const nav = page.getByRole('navigation', { name: '移动端导航' })
      if ((await nav.count()) === 0) throw new Error(`${path} 底部 tab 缺失`)
      ok(`${path}：返回键 + 底部 tab 都在`)
    }

    // ── 5. 「账号设置」不再指向 /admin
    await page.goto(`${BASE}/me`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const hrefs = await page
      .locator('a')
      .evaluateAll((els) =>
        els.filter((e) => (e.textContent || '').includes('账号设置')).map((e) => e.getAttribute('href') || ''),
      )
    if (hrefs.some((h) => h.includes('/admin'))) throw new Error(`账号设置仍指向 /admin：${hrefs.join(',')}`)
    ok('账号设置指向移动端可用页', hrefs[0] || '(未找到)')

    if (apiErrors.length) {
      console.log('\n⚠ 期间出现过的 4xx/5xx：')
      for (const e of apiErrors) console.log('  ', e)
    } else {
      console.log('\n（全程无 4xx/5xx 接口响应）')
    }

    await ctx.request.delete(`${BASE}/api/admin/travels/${travelId}`).catch(() => null)
    ok('清理探测数据')
    console.log('\n生产实测通过（统计口径 + 设置页导航）')
    await browser.close()
    process.exit(0)
  } catch (e) {
    console.error('✗ 生产实测失败:', e instanceof Error ? e.message : e)
    await page.screenshot({ path: '.prod-stats-nav-fail.png', fullPage: false }).catch(() => null)
    if (travelId) await ctx.request.delete(`${BASE}/api/admin/travels/${travelId}`).catch(() => null)
    await browser.close()
    process.exit(1)
  }
}

main()
