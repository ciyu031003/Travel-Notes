#!/usr/bin/env node
/**
 * 诊断：旅行圈卡片点击 → 是否真的进了帖子详情页（两个账号，A 公开、B 旁观）
 *
 * 经验记录（踩过的坑，别重犯）：
 *  · 首次用 page.request 不共享页面 cookie → 全部 405，什么都没测到；要用 browserContext.request。
 *  · 用户名上限 20 位（RegisterSchema），`probe_a_${Date.now()}` 有 23 位 → 注册 400 → 后面全 405。
 *  · 千万不要用 PowerShell 改写本文件（会写 BOM / 弄坏中文），要用编辑器。
 */
const { chromium } = require('playwright')

const BASE = process.env.PROD_BASE || 'https://travel-notes.yuanabd.cn'
const STAMP = String(Date.now()).slice(-8)
const A = { username: `pa${STAMP}`, password: 'ProbeRunner2026!' }
const B = { username: `pb${STAMP}`, password: 'ProbeRunner2026!' }

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
)

async function main() {
  const browser = await chromium.launch()
  const log = (...a) => console.log(...a)

  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const regA = await ctxA.request.post(`${BASE}/api/register`, { data: { ...A, rememberMe: true, clientType: 'web' } })
  log('A 注册:', regA.status(), JSON.stringify(await regA.json().catch(() => ({}))))

  const title = `DIAG-PUBLIC-${STAMP}`
  const createRes = await ctxA.request.post(`${BASE}/api/admin/travels`, {
    data: { title, location: 'Dali', startDate: '2026-09-02', endDate: '2026-09-04' },
  })
  const created = await createRes.json().catch(() => ({}))
  log('A 建旅行:', createRes.status(), JSON.stringify(created))
  const travelId = created?.id
  const slug = created?.slug

  const memRes = await ctxA.request.post(`${BASE}/api/travels/${travelId}/memories`, {
    data: { title: 'DIAG-MEMO', content: 'erhai', mood: 'happy' },
  })
  const memJson = await memRes.json().catch(() => ({}))
  log('A 建回忆:', memRes.status(), JSON.stringify(memJson))
  if (memJson?.memoryId) {
    const up = await ctxA.request.post(`${BASE}/api/memories/${memJson.memoryId}/photos`, {
      multipart: { files: { name: 'probe.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG } },
    })
    log('A 传照片:', up.status())
  }

  const pub2 = await ctxA.request.put(`${BASE}/api/admin/travels/${travelId}`, { data: { isPublic: true } })
  log('A 置公开（admin 接口）:', pub2.status(), JSON.stringify(await pub2.json().catch(() => ({}))))
  const det = await ctxA.request.get(`${BASE}/api/travels/by-slug/${encodeURIComponent(slug)}/detail`)
  const detJson = await det.json().catch(() => ({}))
  log('A 详情接口:', det.status(), 'images=', Array.isArray(detJson?.images) ? detJson.images.length : 'n/a')

  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const b = await ctxB.newPage()
  const regB = await ctxB.request.post(`${BASE}/api/register`, { data: { ...B, rememberMe: true, clientType: 'web' } })
  log('B 注册:', regB.status())

  const feedRes = await ctxB.request.get(`${BASE}/api/social/posts?tab=latest&page=1&pageSize=12`)
  const feed = await feedRes.json().catch(() => ({}))
  const hit = (feed?.data || []).find((p) => String(p?.title || '').includes(title))
  log('B feed:', feedRes.status(), '命中：', hit ? `id=${hit.id}` : '无')

  if (hit) {
    const detailApi = await ctxB.request.get(`${BASE}/api/social/posts/${hit.id}`)
    log('B 帖子详情 API:', detailApi.status())

    await b.goto(`${BASE}/circle`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await b.waitForTimeout(2500)
    const circleText = await b.locator('body').innerText().catch(() => '')
    log('B 旅行圈页面含该标题:', circleText.includes(hit.title))

    const card = b.getByText(hit.title).first()
    const n = await card.count()
    log('  标题元素数:', n)
    if (n > 0) {
      const box = await card.boundingBox().catch(() => null)
      log('  boundingBox:', JSON.stringify(box))
      if (box) await b.mouse.click(box.x + Math.min(30, box.width / 2), box.y + box.height / 2)
      const navigated = await b.waitForURL(/\/circle\/\d+$/, { timeout: 6000 }).then(() => true).catch(() => false)
      log('  坐标点击后进入详情页:', navigated, '→ URL:', b.url().replace(BASE, ''))
      if (!navigated) {
        await b.evaluate((t) => {
          const btns = Array.from(document.querySelectorAll('button'))
          const el = btns.find((x) => (x.textContent || '').includes(t))
          if (el) el.click()
        }, hit.title)
        await b.waitForTimeout(1500)
        log('  原生 click 后 URL:', b.url().replace(BASE, ''))
      }
    }

    await b.goto(`${BASE}/circle/${hit.id}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await b.waitForTimeout(2500)
    log('  B 直接访问 /circle/' + hit.id + ' → 最终 URL:', b.url().replace(BASE, ''))
    const direct = await b.locator('body').innerText().catch(() => '')
    log('  直接访问页面片段:', direct.split('\n').filter(Boolean).slice(0, 8).join(' | '))
    await b.screenshot({ path: '.diag-circle-direct.png', fullPage: false }).catch(() => null)
    log('  （已保存 .diag-circle-direct.png）')
  }

  if (travelId) await ctxA.request.delete(`${BASE}/api/admin/travels/${travelId}`).catch(() => null)
  log('已清理探测旅行')
  await browser.close()
}

main().catch((e) => {
  console.error('诊断失败:', e.message)
  process.exit(1)
})
