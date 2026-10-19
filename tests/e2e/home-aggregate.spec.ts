import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

/**
 * P1-18 之后首页改为服务端渲染：数据由 Server Component 直接取，不再由客户端请求 /api/home。
 * 因此本用例的契约改为：
 *  ① /api/home 聚合接口本身仍返回 books/recentMoments（App 离线与刷新路径依赖）；
 *  ② 首屏 HTML 必须包含真实内容（移动树已 SSR），而不是只有骨架；
 *  ③ 首页不应再分别打 /api/travel-book 与 /api/moments。
 */
test('移动端首页 SSR 直出 + /api/home 聚合契约', async ({ page }) => {
  const apiRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin === 'http://localhost:3111') {
      apiRequests.push(`${url.pathname}${url.search}`)
    }
  })

  // ① 聚合接口契约（带登录态；App 的离线刷新仍走这条）
  const apiRes = await page.request.get('/api/home')
  expect(apiRes.ok()).toBeTruthy()
  const homeData = await apiRes.json()
  expect(Array.isArray(homeData.books), '/api/home 应返回画册摘要').toBe(true)
  expect(Array.isArray(homeData.recentMoments), '/api/home 应返回最近碎碎念').toBe(true)

  // ② 首屏 HTML 直出真实内容（P1-18 验收）
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: '打开功能菜单' })).toBeVisible({ timeout: 30_000 })
  // SSR 同时渲染桌面/移动两棵树（CSS 断点切换显示），可见标题必须只有一个
  await expect(page.locator('h1:visible')).toHaveCount(1)
  const html = await page.content()
  expect(html, '移动端首页应有 SSR 内容（移动树标题）').toContain('我的旅行足迹')
  expect(html, '移动端首页应有 SSR 内容（桌面树标题）').toContain('把走过的路')
  // 骨架只应剩地图等真正 ssr:false 的占位（本页 2 处），而不是整页骨架
  const skeletons = (html.match(/m-skeleton/g) || []).length
  expect(skeletons, '首页不应整页骨架，骨架仅剩地图占位').toBeLessThanOrEqual(6)

  // ③ 聚合子接口不应被首页单独请求（SSR 直出）
  expect(apiRequests.filter((path) => path.startsWith('/api/travel-book'))).toEqual([])
  expect(apiRequests.filter((path) => path.startsWith('/api/moments'))).toEqual([])
})
