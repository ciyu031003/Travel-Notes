import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('移动端首页只挂载一层，并由 /api/home 聚合画册与碎碎念', async ({ page }) => {
  const apiRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin === 'http://localhost:3111') {
      apiRequests.push(`${url.pathname}${url.search}`)
    }
  })

  const homeResponsePromise = page.waitForResponse((response) => {
    return new URL(response.url()).pathname === '/api/home'
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  const homeResponse = await homeResponsePromise
  const homeData = await homeResponse.json()
  expect(Array.isArray(homeData.books), '/api/home 应返回画册摘要').toBe(true)
  expect(Array.isArray(homeData.recentMoments), '/api/home 应返回最近碎碎念').toBe(true)

  await expect(page.getByRole('button', { name: '打开功能菜单' })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.locator('h1')).toHaveCount(1)

  expect(
    apiRequests.filter((path) => path.startsWith('/api/travel-book')),
    '首页不应再单独请求画册接口',
  ).toEqual([])
  expect(
    apiRequests.filter((path) => path.startsWith('/api/moments')),
    '首页不应再单独请求碎碎念接口',
  ).toEqual([])
})
