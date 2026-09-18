#!/usr/bin/env node
/**
 * 生产实测：旅行圈「点开别人的旅行」（R2）。
 *
 * 为什么必须到生产上跑：这轮的改动横跨
 *   ① 中间件公开路径（`/circle` 对游客开放 —— 只在真实 nginx + 中间件组合下才验证得到）
 *   ② 详情接口的按天数据（依赖 Prisma 的嵌套 include，**本地单测用的是 mock，掩盖过真 bug**）
 *   ③ 分享按钮（`navigator.share` / clipboard 在真实 https 下行为不同）
 *
 * 用法：node scripts/verify-prod-circle.cjs
 */
const { chromium } = require('playwright')

const BASE = process.env.PROD_BASE || 'https://travel-notes.yuanabd.cn'
const STAMP = String(Date.now()).slice(-8)
const USER = process.env.PROD_USER || `pc${STAMP}`
const PASS = process.env.PROD_PASS || 'ProbeRunner2026!'

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
)

function ok(name, extra = '') {
  console.log('✓', name, extra)
}
function fail(name, err) {
  console.error('✗', name, err instanceof Error ? err.message : err)
}

async function main() {
  const browser = await chromium.launch()
  const apiErrors = []

  // ── 作者上下文
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const a = await ctxA.newPage()
  a.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) apiErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`)
  })

  let travelId = null
  try {
    const reg = await ctxA.request.post(`${BASE}/api/register`, {
      data: { username: USER, password: PASS, rememberMe: true, clientType: 'web' },
    })
    ok('注册一次性账号', `http=${reg.status()}`)

    // 清掉上次中断的探测数据
    const list = await (await ctxA.request.get(`${BASE}/api/travels`)).json().catch(() => ({}))
    for (const p of (list?.posts || []).filter((x) => String(x?.title || '').startsWith('CIRCLE-PROBE'))) {
      await ctxA.request.delete(`${BASE}/api/admin/travels/${p.id}`).catch(() => null)
    }

    const title = `CIRCLE-PROBE-${STAMP}`
    const created = await (
      await ctxA.request.post(`${BASE}/api/admin/travels`, {
        data: { title, location: '杭州', startDate: '2026-10-01', endDate: '2026-10-03' },
      })
    ).json()
    travelId = created?.id
    if (!travelId) throw new Error(`建旅行失败: ${JSON.stringify(created)}`)
    ok('建一本 3 天旅行', `id=${travelId}`)

    // 公开回忆（默认 SPACE 不可见，必须显式公开）
    const mem = await (
      await ctxA.request.post(`${BASE}/api/travels/${travelId}/memories`, {
        data: { title: 'CIRCLE 公开回忆', content: '看西湖', mood: '开心', isPublic: true },
      })
    ).json()
    if (!mem?.memoryId) throw new Error(`建回忆失败: ${JSON.stringify(mem)}`)
    await ctxA.request.post(`${BASE}/api/memories/${mem.memoryId}/photos`, {
      multipart: { files: { name: 'p.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG } },
    })
    ok('建一条公开回忆 + 一张照片')

    await ctxA.request.put(`${BASE}/api/admin/travels/${travelId}`, { data: { isPublic: true } })

    const feed = await (await ctxA.request.get(`${BASE}/api/social/posts?tab=latest&page=1&pageSize=30`)).json()
    const hit = (feed?.data || []).find((p) => String(p?.title || '').includes(title))
    if (!hit) throw new Error('公开后没进旅行圈 feed')
    const postId = hit.id
    ok('已发布到旅行圈', `postId=${postId}`)

    // ① 详情接口必须下发按天数据（本地 mock 掩盖过这里的真 bug）
    const detail = await (await ctxA.request.get(`${BASE}/api/social/posts/${postId}`)).json()
    const days = detail?.data?.days || []
    if (days.length === 0) throw new Error('详情接口 days 为空（生产上按天数据没出来）')
    const memCount = days.reduce((s, d) => s + (d.memories?.length || 0), 0)
    const photoCount = days.reduce((s, d) => s + (d.photos?.length || 0), 0)
    ok('详情接口下发按天数据', `${days.length} 天 / ${memCount} 条公开回忆 / ${photoCount} 张照片`)
    if (memCount === 0) throw new Error('按天数据里没有公开回忆（visibility 过滤是否过严？）')

    // ② 游客（未登录）能打开 feed 与详情，且能看到按天内容
    const ctxG = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const g = await ctxG.newPage()
    const gFeed = await g.goto(`${BASE}/circle`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    if (new URL(g.url()).pathname !== '/circle') throw new Error(`游客被重定向到 ${g.url()}`)
    ok('游客可打开旅行圈', `http=${gFeed?.status()}`)

    const gDetail = await g.goto(`${BASE}/circle/${postId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    if (new URL(g.url()).pathname !== `/circle/${postId}`) throw new Error(`游客被重定向到 ${g.url()}`)
    await g.getByRole('heading', { level: 1, name: title }).waitFor({ timeout: 30_000 })
    await g.getByRole('heading', { name: '按天回顾' }).waitFor({ timeout: 30_000 })
    ok('游客能看到按天回顾', `http=${gDetail?.status()}`)

    // ③ 私人帖对游客不可读（权限边界）
    const priv = await ctxA.request.post(`${BASE}/api/admin/travels`, {
      data: { title: `CIRCLE-PROBE-PRIV-${STAMP}`, location: '苏州', startDate: '2026-11-01', endDate: '2026-11-02' },
    })
    const privTravel = await priv.json()
    const privDetail = await g.request.get(`${BASE}/api/social/posts/999999`)
    if (privDetail.status() < 400) throw new Error('不存在的帖子应返回 4xx')
    await ctxA.request.delete(`${BASE}/api/admin/travels/${privTravel.id}`).catch(() => null)
    ok('不存在的帖子返回 4xx（没有泄露）')

    // ④ 分享按钮可用（无原生分享时复制链接）
    await ctxG.grantPermissions(['clipboard-read', 'clipboard-write'])
    await g.getByTestId('share-button').click()
    const clip = await g.evaluate(() => navigator.clipboard.readText().catch(() => ''))
    if (!clip.includes(`/circle/${postId}`)) throw new Error(`剪贴板内容不对: ${clip}`)
    ok('分享复制到正确链接', clip)

    await ctxG.close()

    if (apiErrors.length) {
      console.log('\n⚠ 期间出现过的 4xx/5xx：')
      for (const e of apiErrors) console.log('  ', e)
    } else {
      console.log('\n（全程无 4xx/5xx 接口响应）')
    }

    await ctxA.request.delete(`${BASE}/api/admin/travels/${travelId}`).catch(() => null)
    ok('清理探测数据')
    console.log('\n生产实测通过（旅行圈 R2）')
    await browser.close()
    process.exit(0)
  } catch (e) {
    fail('生产实测失败', e)
    if (travelId) await ctxA.request.delete(`${BASE}/api/admin/travels/${travelId}`).catch(() => null)
    await browser.close()
    process.exit(1)
  }
}

main()
