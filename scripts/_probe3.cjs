#!/usr/bin/env node
/** 临时诊断（用完即删）：打印 days 来源的每一步 */
const { chromium } = require('playwright')
const BASE = 'http://localhost:3111'

async function main() {
  const b = await chromium.launch()
  const ctx = await b.newContext()
  const stamp = String(Date.now())
  const uname = 'dbg' + stamp.slice(-6)

  await ctx.request.post(BASE + '/api/register', {
    data: { username: uname, password: 'ProbeRunner2026!', rememberMe: true, clientType: 'web' },
  })
  const created = await (
    await ctx.request.post(BASE + '/api/admin/travels', {
      data: { title: 'DBG ' + stamp, location: '杭州', startDate: '2026-09-02', endDate: '2026-09-04' },
    })
  ).json()
  console.log('travelId =', created.id)

  const tl = await (await ctx.request.get(BASE + '/api/travels/' + created.id + '/timeline')).json()
  console.log('timeline days =', (tl?.timeline?.days || []).length)

  const mem = await (
    await ctx.request.post(BASE + '/api/travels/' + created.id + '/memories', {
      data: { title: 'M', content: 'c', isPublic: true },
    })
  ).json()
  console.log('memoryId =', mem.memoryId)

  const tl2 = await (await ctx.request.get(BASE + '/api/travels/' + created.id + '/timeline')).json()
  const days2 = tl2?.timeline?.days || []
  console.log('timeline after: days =', days2.length, 'first.memories =', days2[0]?.memories?.length)

  await ctx.request.put(BASE + '/api/admin/travels/' + created.id, { data: { isPublic: true } })
  const feed = await (await ctx.request.get(BASE + '/api/social/posts?tab=latest&page=1&pageSize=50')).json()
  const hit = (feed?.data || []).find((p) => p.title === 'DBG ' + stamp)
  console.log('feed post =', JSON.stringify({ id: hit?.id, travelId: hit?.travelId, dayCount: hit?.dayCount }))

  const d = await (await ctx.request.get(BASE + '/api/social/posts/' + hit.id)).json()
  console.log('detail.travelId =', d?.data?.travelId)
  console.log('detail.daysDebug =', JSON.stringify(d?.data?.daysDebug))
  console.log('detail.days.length =', (d?.data?.days || []).length)
  console.log('detail.days =', JSON.stringify(d?.data?.days || []).slice(0, 300))

  await ctx.request.delete(BASE + '/api/admin/travels/' + created.id).catch(() => null)
  await b.close()
}

main().catch((e) => {
  console.error('诊断失败:', e.message)
  process.exit(1)
})
