#!/usr/bin/env node
/**
 * 诊断 2：补充两种未覆盖的角色
 *  ① 游客（未登录）在旅行圈点卡片 → 会怎样
 *  ② 作者本人（我公开的旅行）在旅行圈点自己的卡片 → 会怎样
 * 外加核对：/circle/<id> 详情里的「查看完整旅行记录」指向哪里。
 */
const { chromium } = require('playwright')

const BASE = process.env.PROD_BASE || 'https://travel-notes.yuanabd.cn'
const STAMP = String(Date.now()).slice(-8)
const A = { username: `pc${STAMP}`, password: 'ProbeRunner2026!' }
const V = { username: `pv${STAMP}`, password: 'ProbeRunner2026!' }

async function main() {
  const browser = await chromium.launch()
  const log = (...a) => console.log(...a)

  // A：作者
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await ctxA.request.post(`${BASE}/api/register`, { data: { ...A, rememberMe: true, clientType: 'web' } })
  const title = `DIAG2-SELF-${STAMP}`
  const created = await (
    await ctxA.request.post(`${BASE}/api/admin/travels`, {
      data: { title, location: 'Lijiang', startDate: '2026-10-01', endDate: '2026-10-03' },
    })
  ).json()
  const travelId = created?.id
  await ctxA.request.put(`${BASE}/api/admin/travels/${travelId}`, { data: { isPublic: true } })
  const feed = await (await ctxA.request.get(`${BASE}/api/social/posts?tab=latest&page=1&pageSize=12`)).json()
  const mine = (feed?.data || []).find((p) => String(p?.title || '').includes(title))
  log('A 自己的帖子在 feed 里:', mine ? `id=${mine.id}` : '无')

  // 作者本人点自己的卡片
  const aPage = await ctxA.newPage()
  if (mine) {
    await aPage.goto(`${BASE}/circle`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await aPage.waitForTimeout(2500)
    const card = aPage.getByText(mine.title).first()
    if (await card.count()) {
      const box = await card.boundingBox()
      log('  作者看到的卡片 box:', JSON.stringify(box))
      if (box) await aPage.mouse.click(box.x + 30, box.y + box.height / 2)
      const nav = await aPage.waitForURL(/\/circle\/\d+$/, { timeout: 6000 }).then(() => true).catch(() => false)
      log('  作者点击自己卡片 →', nav, aPage.url().replace(BASE, ''))
      if (nav) {
        const txt = await aPage.locator('body').innerText()
        log('  详情页片段:', txt.split('\n').filter(Boolean).slice(0, 6).join(' | '))
        // 「查看完整旅行记录」指向哪
        const links = await aPage.evaluate(() =>
          Array.from(document.querySelectorAll('a'))
            .map((x) => ({ t: (x.textContent || '').trim(), h: x.getAttribute('href') || '' }))
            .filter((x) => x.h.includes('/travel')),
        )
        log('  详情页内 /travel 链接:', JSON.stringify(links))
      }
    }
  }

  // 游客
  const ctxV = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const vPage = await ctxV.newPage()
  await vPage.goto(`${BASE}/circle`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await vPage.waitForTimeout(2500)
  log('游客访问 /travel-circle:', 'URL=', vPage.url().replace(BASE, ''))
  const vText = await vPage.locator('body').innerText().catch(() => '')
  log('  游客页面片段:', vText.split('\n').filter(Boolean).slice(0, 5).join(' | '))
  const shown = mine ? vText.includes(mine.title) : false
  log('  游客能看到 A 的公开旅行:', shown)
  if (shown && mine) {
    const card = vPage.getByText(mine.title).first()
    const box = await card.boundingBox()
    if (box) await vPage.mouse.click(box.x + 30, box.y + box.height / 2)
    await vPage.waitForTimeout(2500)
    log('  游客点击后 URL:', vPage.url().replace(BASE, ''))
    const after = await vPage.locator('body').innerText().catch(() => '')
    log('  点击后片段:', after.split('\n').filter(Boolean).slice(0, 6).join(' | '))
  }

  if (travelId) await ctxA.request.delete(`${BASE}/api/admin/travels/${travelId}`).catch(() => null)
  log('已清理探测旅行')
  await browser.close()
}

main().catch((e) => {
  console.error('诊断失败:', e.message)
  process.exit(1)
})
