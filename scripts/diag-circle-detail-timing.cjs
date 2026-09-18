#!/usr/bin/env node
/**
 * 诊断 3：/circle/<id> 详情页到底多久才渲染出内容？
 *
 * 上一条诊断里，作者点自己的卡片后 URL 确实变成了 /circle/70，但页面正文只有「加载中…」。
 * 这很可能就是用户说的「点不开」：URL 进了详情页，界面却卡在转圈，看起来像没反应/被弹走。
 * 这里量一下：详情页从进入到标题出现需要多久，以及接口本身的耗时。
 */
const { chromium } = require('playwright')

const BASE = process.env.PROD_BASE || 'https://travel-notes.yuanabd.cn'
const STAMP = String(Date.now()).slice(-8)
const A = { username: `pd${STAMP}`, password: 'ProbeRunner2026!' }

async function main() {
  const browser = await chromium.launch()
  const log = (...a) => console.log(...a)
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await ctxA.request.post(`${BASE}/api/register`, { data: { ...A, rememberMe: true, clientType: 'web' } })

  const title = `DIAG3-${STAMP}`
  const created = await (
    await ctxA.request.post(`${BASE}/api/admin/travels`, {
      data: { title, location: 'Chengdu', startDate: '2026-10-01', endDate: '2026-10-03' },
    })
  ).json()
  const travelId = created?.id
  await ctxA.request.put(`${BASE}/api/admin/travels/${travelId}`, { data: { isPublic: true } })

  const feed = await (await ctxA.request.get(`${BASE}/api/social/posts?tab=latest&page=1&pageSize=12`)).json()
  const mine = (feed?.data || []).find((p) => String(p?.title || '').includes(title))
  if (!mine) {
    log('未找到帖子，退出')
    await ctxA.request.delete(`${BASE}/api/admin/travels/${travelId}`).catch(() => null)
    await browser.close()
    return
  }
  log('帖子 id =', mine.id)

  // ① 接口耗时
  for (const url of [`/api/social/posts/${mine.id}`, `/api/travels/by-slug/${created.slug}/detail`]) {
    const t0 = Date.now()
    const r = await ctxA.request.get(`${BASE}${url}`)
    log(`  ${url} → ${r.status()} 用时 ${Date.now() - t0}ms`)
  }

  // ② 页面渲染耗时
  const page = await ctxA.newPage()
  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e.message).slice(0, 200)))

  const t0 = Date.now()
  await page.goto(`${BASE}/circle/${mine.id}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  let titleSeen = false
  try {
    await page.getByText(title).first().waitFor({ state: 'visible', timeout: 30_000 })
    titleSeen = true
  } catch {}
  log(`进入 /circle/${mine.id} → 帖子标题出现: ${titleSeen}，用时 ${Date.now() - t0}ms`)
  const txt = await page.locator('body').innerText()
  log('  页面片段:', txt.split('\n').filter(Boolean).slice(0, 8).join(' | '))
  if (consoleErrors.length) {
    log('  控制台错误:')
    for (const e of consoleErrors.slice(0, 8)) log('   -', e)
  } else {
    log('  无控制台错误')
  }
  await page.screenshot({ path: '.diag3-detail.png', fullPage: false }).catch(() => null)

  await ctxA.request.delete(`${BASE}/api/admin/travels/${travelId}`).catch(() => null)
  log('已清理探测旅行')
  await browser.close()
}

main().catch((e) => {
  console.error('诊断失败:', e.message)
  process.exit(1)
})
