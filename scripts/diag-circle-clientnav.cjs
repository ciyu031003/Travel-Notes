#!/usr/bin/env node
/**
 * 诊断 4：客户端导航（在旅行圈里点卡片）vs 直接进 URL，两者都要等足 30 秒。
 * 目的：给「点卡片看不到别人旅行」一个诚实结论 —— 是真 bug 还是我上一版等太短。
 */
const { chromium } = require('playwright')

const BASE = process.env.PROD_BASE || 'https://travel-notes.yuanabd.cn'
const STAMP = String(Date.now()).slice(-8)
const A = { username: `pe${STAMP}`, password: 'ProbeRunner2026!' }
const B = { username: `pf${STAMP}`, password: 'ProbeRunner2026!' }

async function main() {
  const browser = await chromium.launch()
  const log = (...a) => console.log(...a)

  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await ctxA.request.post(`${BASE}/api/register`, { data: { ...A, rememberMe: true, clientType: 'web' } })
  const title = `DIAG4-${STAMP}`
  const created = await (
    await ctxA.request.post(`${BASE}/api/admin/travels`, {
      data: { title, location: 'Xiamen', startDate: '2026-11-01', endDate: '2026-11-02' },
    })
  ).json()
  await ctxA.request.put(`${BASE}/api/admin/travels/${created.id}`, { data: { isPublic: true } })
  const feed = await (await ctxA.request.get(`${BASE}/api/social/posts?tab=latest&page=1&pageSize=12`)).json()
  const mine = (feed?.data || []).find((p) => String(p?.title || '').includes(title))
  log('B 将旁观帖子 id =', mine?.id)

  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const b = await ctxB.newPage()
  await ctxB.request.post(`${BASE}/api/register`, { data: { ...B, rememberMe: true, clientType: 'web' } })
  const errs = []
  b.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)))

  // ① 客户端导航
  await b.goto(`${BASE}/circle`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await b.getByText(mine.title).first().waitFor({ timeout: 30_000 })
  const card = b.getByText(mine.title).first()
  const box = await card.boundingBox()
  const t1 = Date.now()
  await b.mouse.click(box.x + 30, box.y + box.height / 2)
  await b.waitForURL(/\/circle\/\d+$/, { timeout: 15_000 })
  log('客户端导航后 URL:', b.url().replace(BASE, ''), `(用时 ${Date.now() - t1}ms)`)
  let ok1 = false
  try {
    await b.getByText(mine.title).first().waitFor({ state: 'visible', timeout: 30_000 })
    ok1 = true
  } catch {}
  log('  客户端导航后标题出现:', ok1, `总用时 ${Date.now() - t1}ms`)
  log('  页面片段:', (await b.locator('body').innerText()).split('\n').filter(Boolean).slice(0, 8).join(' | '))
  await b.screenshot({ path: '.diag4-client-nav.png', fullPage: false }).catch(() => null)

  // ② 直接进 URL
  const t2 = Date.now()
  await b.goto(`${BASE}/circle/${mine.id}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  let ok2 = false
  try {
    await b.getByText(mine.title).first().waitFor({ state: 'visible', timeout: 30_000 })
    ok2 = true
  } catch {}
  log('直接进 URL 标题出现:', ok2, `用时 ${Date.now() - t2}ms`)
  log('  页面片段:', (await b.locator('body').innerText()).split('\n').filter(Boolean).slice(0, 8).join(' | '))

  if (errs.length) log('页面 JS 错误:', JSON.stringify(errs.slice(0, 5)))

  await ctxA.request.delete(`${BASE}/api/admin/travels/${created.id}`).catch(() => null)
  log('已清理探测旅行')
  await browser.close()
}

main().catch((e) => {
  console.error('诊断失败:', e.message)
  process.exit(1)
})
