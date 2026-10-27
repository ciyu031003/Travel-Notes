import { expect, test, type Page } from '@playwright/test'

const FEED_POSTS = Array.from({ length: 12 }, (_, index) => ({
  id: 9100 + index,
  travelId: 9100 + index,
  title: `移动端公开旅途 ${String(index + 1).padStart(2, '0')}`,
  summary: `第 ${index + 1} 条公开旅途`,
  coverUrl: null,
  location: index % 2 === 0 ? '广州' : '杭州',
  startDate: '2026-10-01',
  endDate: '2026-10-02',
  dayCount: 2,
  photoCount: 0,
  travelType: index % 2 === 0 ? 'ALONE' : 'FRIENDS',
  author: { id: 1, username: 'mobile_e2e', nickname: '移动端测试', avatarUrl: null },
  likeCount: 0,
  commentCount: 0,
  favoriteCount: 0,
  isLiked: false,
  isFavorited: false,
}))

async function stubAuth(page: Page) {
  await page.route(
    (url) => url.pathname === '/api/check-auth',
    (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: true, user: { id: 1, username: 'mobile_e2e' } }),
    }),
  )
}

async function stubFeed(page: Page, posts = FEED_POSTS) {
  await stubAuth(page)
  await page.route(
    (url) => url.pathname === '/api/social/posts',
    (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: posts, total: posts.length, hasMore: false }),
    }),
  )
}

async function applyAndroidStatusBar(page: Page, height = 38) {
  await page.evaluate((value) => {
    document.documentElement.style.setProperty('--m-status-bar-height', `${value}px`)
    document.documentElement.style.setProperty('--safe-area-inset-top', '0px')
  }, height)
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function expectNoGlobalError(page: Page) {
  await expect(page.locator('body')).not.toContainText('页面出了点问题')
  await expect(page.locator('body')).not.toContainText('旅行圈暂时没能打开')
}

test('公开 feed 有数据时不崩溃，hero 不重复且顶部避开状态栏', async ({ page }) => {
  const pageErrors = collectPageErrors(page)
  await stubFeed(page)

  await page.goto('/circle', { waitUntil: 'domcontentloaded' })
  await applyAndroidStatusBar(page)
  await expect(page.getByText('移动端公开旅途 01', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('移动端公开旅途 02', { exact: true }).first()).toBeVisible()

  await expect(page.locator('h2', { hasText: '移动端公开旅途 01' })).toHaveCount(1)
  await expect(page.locator('h3', { hasText: '移动端公开旅途 02' })).toHaveCount(1)
  await expect(page.locator('.m-bottom-nav')).toBeVisible()
  await expectNoGlobalError(page)

  for (const height of [0, 24, 32, 44]) {
    await applyAndroidStatusBar(page, height)
    const safeTop = await page.locator('.m-safe-top').first().evaluate(
      (element) => Number.parseFloat(getComputedStyle(element).paddingTop),
    )
    const collapserTop = await page.locator('.m-collapser').evaluate(
      (element) => Number.parseFloat(getComputedStyle(element).paddingTop),
    )
    expect(safeTop, `${height}px 状态栏 + 12px 页面间距`).toBeGreaterThanOrEqual(height + 12)
    expect(collapserTop, `${height}px 状态栏 + 8px 顶栏间距`).toBeGreaterThanOrEqual(height + 8)
  }

  const visibleTitleTop = await page.locator('h1:visible').first().evaluate(
    (element) => element.getBoundingClientRect().top,
  )
  expect(visibleTitleTop, '标题不能进入状态栏区域').toBeGreaterThanOrEqual(56)
  const navBox = await page.locator('.m-bottom-nav').boundingBox()
  expect(navBox, '底部导航必须可见').not.toBeNull()
  expect(navBox!.y + navBox!.height, '底部导航不能超出视口').toBeLessThanOrEqual(844)

  await page.evaluate(() => window.scrollTo(0, 900))
  await expect(page.locator('.m-collapser')).toHaveClass(/is-collapsed/)
  expect(pageErrors, '页面不应出现运行时异常').toEqual([])

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, '横向溢出 px').toBeLessThanOrEqual(0)
})

test('只有一篇公开文章时只渲染 hero，不挂载空虚拟列表', async ({ page }) => {
  const pageErrors = collectPageErrors(page)
  await stubFeed(page, FEED_POSTS.slice(0, 1))

  await page.goto('/circle', { waitUntil: 'domcontentloaded' })
  await applyAndroidStatusBar(page)
  await expect(page.locator('h2', { hasText: '移动端公开旅途 01' })).toBeVisible()
  await expect(page.locator('h3', { hasText: '移动端公开旅途 01' })).toHaveCount(0)
  await expectNoGlobalError(page)
  expect(pageErrors).toEqual([])
})

for (const width of [320, 412]) {
  test(`${width}px 小屏 public feed 无横向溢出且底部导航可用`, async ({ page }) => {
    const pageErrors = collectPageErrors(page)
    await page.setViewportSize({ width, height: 844 })
    await stubFeed(page, FEED_POSTS.slice(0, 3))

    await page.goto('/circle', { waitUntil: 'domcontentloaded' })
    await applyAndroidStatusBar(page, 32)
    await expect(page.locator('h2', { hasText: '移动端公开旅途 01' })).toBeVisible()
    await expect(page.locator('.m-bottom-nav')).toBeVisible()
    await expectNoGlobalError(page)

    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      safeTop: Number.parseFloat(getComputedStyle(document.querySelector('.m-safe-top')!).paddingTop),
      navBottom: document.querySelector('.m-bottom-nav')!.getBoundingClientRect().bottom,
    }))
    expect(geometry.overflow, '横向溢出 px').toBeLessThanOrEqual(0)
    expect(geometry.safeTop, '32px 状态栏 + 12px 页面间距').toBeGreaterThanOrEqual(44)
    expect(geometry.navBottom, '底部导航不能超出视口').toBeLessThanOrEqual(844)
    expect(pageErrors).toEqual([])
  })
}

test('公开详情 404 显示缺失态且不再提供无效重试', async ({ page }) => {
  const pageErrors = collectPageErrors(page)
  await stubAuth(page)
  await page.route(
    (url) => url.pathname === '/api/social/posts/9199',
    (route) => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: '帖子不存在' }),
    }),
  )

  await page.goto('/circle/detail?postId=9199', { waitUntil: 'domcontentloaded' })
  await applyAndroidStatusBar(page)
  await expect(page.getByRole('heading', { name: '这篇旅行故事不存在或已取消公开' })).toBeVisible()
  await expect(page.getByRole('button', { name: '重试' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '返回旅行圈' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('页面出了点问题')
  expect(pageErrors).toEqual([])
})

test('公开详情 5xx 显示可重试网络态', async ({ page }) => {
  const pageErrors = collectPageErrors(page)
  await stubAuth(page)
  await page.route(
    (url) => url.pathname === '/api/social/posts/9200',
    (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: '服务暂时不可用' }),
    }),
  )

  await page.goto('/circle/detail?postId=9200', { waitUntil: 'domcontentloaded' })
  await applyAndroidStatusBar(page)
  await expect(page.getByRole('heading', { name: '网络开小差了' })).toBeVisible()
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('页面出了点问题')
  expect(pageErrors).toEqual([])
})
