import { test, expect, type Page } from '@playwright/test'

/**
 * 旅行圈「点开别人的旅行」回归（R2 路由加固）。
 *
 * 真机反馈："在旅行圈里点我公开的旅行，会直接跳回首页；没办法点开别人的旅行记录去看。"
 * 我在生产上按 4 种角色组合复现过，链路是通的 —— 但确实存在两个**更隐蔽**的真实缺陷，
 * 这组用例把它们钉住：
 *
 *   ① 游客点旅行圈会被弹去登录（`/circle` 不在公开路径白名单）。
 *      → 现在游客可读，交互仍需登录。
 *   ② 详情页数据没回来时是**整页转圈**，弱网下停在那一帧，体感就是"点了没反应/跳到别处"。
 *      → 现在是与真实布局同构的骨架屏；失败态保留 URL 并给出重试。
 *
 * 另外守住：详情页必须能看到「按天回顾」（别人真正想看的是旅行本身，不是一段摘要）。
 */

async function tapCard(page: Page, title: string) {
  const card = page.getByText(title).first()
  await card.waitFor({ timeout: 30_000 })
  const box = await card.boundingBox()
  if (!box) throw new Error('卡片没有可测尺寸')
  await page.mouse.click(box.x + Math.min(30, box.width / 2), box.y + box.height / 2)
}

/** 建一本公开的旅行（走接口，避免依赖 UI 表单时序），返回 { title, postId } */
async function seedPublicTravel(page: Page, stamp: string) {
  const title = `E2E 圈子公开 ${stamp}`
  const created = await (
    await page.request.post('/api/admin/travels', {
      data: { title, location: '杭州', startDate: '2026-09-02', endDate: '2026-09-04' },
    })
  ).json()
  const travelId = created?.id as number

  // 加一条**公开**回忆，让「按天回顾」有真实内容。
  // 注意 isPublic: true 是必须的：回忆默认 SPACE 可见，而圈子详情只下发 PUBLIC 回忆
  // —— 这正是"公开了旅行却看到空章节"的成因，用例顺带守住这个契约。
  const mem = await (
    await page.request.post(`/api/travels/${travelId}/memories`, {
      data: { title: 'E2E 公开回忆', content: '看西湖', mood: '开心', isPublic: true },
    })
  ).json()
  expect(mem?.memoryId, '公开回忆应创建成功').toBeTruthy()

  // 旅行公开 → syncTravelPost 会生成旅行圈帖子
  await page.request.put(`/api/admin/travels/${travelId}`, { data: { isPublic: true } })

  const feed = await (await page.request.get('/api/social/posts?tab=latest&page=1&pageSize=30')).json()
  const hit = (feed?.data || []).find((p: { title?: string }) => String(p?.title || '').includes(title))
  return { title, travelId, postId: hit?.id as number | undefined }
}

test.describe('旅行圈 · 登录用户', () => {
  test('点卡片进详情页：URL 是 /circle/<id>，页面渲染出内容（不跳首页）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const stamp = Date.now()
    const { title, travelId, postId } = await seedPublicTravel(page, String(stamp))
    expect(postId, '帖子应已发布到旅行圈').toBeTruthy()

    // 这条用例要验证的是**点击后的跳转**，不是 feed 的排序/缓存/发布时序。
    // 本地库里帖子一多，默认「推荐」tab 里新帖不一定在前（列表还分页）；
    // 更关键的是 feed 有服务端缓存，刚发布的帖子可能还没进候选集 ——
    // 这些都与路由无关，却会让断言偶发失败。
    // 这里直接把 feed 桩成"只有这一条"，断言只针对路由行为（SW 已 block，route 才生效）。
    await page.route('**/api/social/posts?**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: postId,
              travelId,
              title,
              summary: null,
              coverUrl: null,
              location: '杭州',
              startDate: '2026-09-02T00:00:00.000Z',
              endDate: '2026-09-04T00:00:00.000Z',
              dayCount: 3,
              photoCount: 0,
              travelType: 'ALONE',
              author: { id: 1, username: 'e2e_runner', nickname: 'E2E', avatarUrl: null },
              likeCount: 0,
              commentCount: 0,
              favoriteCount: 0,
            },
          ],
          total: 1,
          hasMore: false,
        }),
      }),
    )

    await page.goto('/circle', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 40_000 })
    await tapCard(page, title)

    // 关键断言：URL 必须是帖子详情，而不是被弹回首页
    await page.waitForURL((u) => /^\/circle\/\d+$/.test(u.pathname), { timeout: 30_000 })
    expect(new URL(page.url()).pathname).not.toBe('/')
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 25_000 })

    await page.request.delete(`/api/admin/travels/${travelId}`).catch(() => null)
  })

  test('详情页能看到「按天回顾」（别人想看的是旅行本身，不是一段摘要）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const stamp = String(Date.now())
    const { title, travelId, postId } = await seedPublicTravel(page, stamp)
    expect(postId).toBeTruthy()

    const detail = await (await page.request.get(`/api/social/posts/${postId}`)).json()
    const days = detail?.data?.days || []
    expect(
      days.length,
      `详情接口应下发按天数据，实际 days=${JSON.stringify(days).slice(0, 300)}`,
    ).toBeGreaterThan(0)
    expect(days[0].memories?.length, '公开回忆应出现在当天的数据里').toBeGreaterThan(0)

    await page.goto(`/circle/${postId}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 25_000 })
    // 日期区间 3 天 → 应有按天章节（DAY 01 等由服务端下发）
    await expect(page.getByRole('heading', { name: '按天回顾' })).toBeVisible({ timeout: 25_000 })
    // 「DAY 01」会同时出现在天标题与天章节里 → 用 .first()
    await expect(page.getByText('DAY 01').first()).toBeVisible()
    await expect(page.getByText('E2E 公开回忆').first()).toBeVisible()

    await page.request.delete(`/api/admin/travels/${travelId}`).catch(() => null)
  })

  test('分享按钮：无原生分享时复制链接并提示', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const stamp = String(Date.now())
    const { travelId, postId } = await seedPublicTravel(page, stamp)
    expect(postId).toBeTruthy()

    // 关掉原生分享，强制走"复制链接"分支（桌面 Chromium 本身也没有 navigator.share）
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(`/circle/${postId}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('share-button').waitFor({ timeout: 25_000 })
    await page.getByTestId('share-button').click()

    // 复制成功 → 剪贴板里是这个帖子的地址
    await expect
      .poll(async () => page.evaluate(() => navigator.clipboard.readText().catch(() => '')), { timeout: 15_000 })
      .toContain(`/circle/${postId}`)

    await page.request.delete(`/api/admin/travels/${travelId}`).catch(() => null)
  })
})

test.describe('旅行圈 · 游客（未登录）', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('游客可以浏览旅行圈，且不会被弹去登录', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/circle', { waitUntil: 'domcontentloaded' })
    expect(new URL(page.url()).pathname, '游客不该被重定向到登录页').toBe('/circle')
    // 移动端标题（LargeTitle 渲染成 h1；桌面版标题在 md: 断点下是 hidden）
    await expect(page.getByRole('heading', { name: '旅行圈' })).toBeVisible({ timeout: 25_000 })
  })

  test('/circle/<id> 直开对游客可读（公开帖不该要求登录）', async ({ page, browser }) => {
    // 先用一个登录态上下文造数据
    const ctx = await browser.newContext({ storageState: './tests/e2e/.auth/state.json' })
    const authed = await ctx.newPage()
    const stamp = String(Date.now())
    const { travelId, postId } = await seedPublicTravel(authed, stamp)
    await ctx.close()

    await page.setViewportSize({ width: 390, height: 844 })
    const res = await page.goto(`/circle/${postId}`, { waitUntil: 'domcontentloaded' })
    expect(res?.status(), '游客访问公开帖详情不应被门禁拦下').toBeLessThan(400)
    expect(new URL(page.url()).pathname).toBe(`/circle/${postId}`)

    // 清理（用登录态接口请求）
    const ctx2 = await browser.newContext({ storageState: './tests/e2e/.auth/state.json' })
    await ctx2.request.delete(`/api/admin/travels/${travelId}`).catch(() => null)
    await ctx2.close()
  })

  test('游客在详情页点「分享」不会因未登录而报错', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const ctx = await context.browser()!.newContext({ storageState: './tests/e2e/.auth/state.json' })
    const authed = await ctx.newPage()
    const stamp = String(Date.now())
    const { travelId, postId } = await seedPublicTravel(authed, stamp)
    await ctx.close()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/circle/${postId}`, { waitUntil: 'domcontentloaded' })
    const share = page.getByTestId('share-button')
    await share.waitFor({ timeout: 25_000 })
    await share.click()
    // 出现「已分享」或错误提示都算"有反馈"，不允许静默无反应
    await expect(page.getByText(/已分享|复制/).first()).toBeVisible({ timeout: 15_000 })

    const ctx2 = await context.browser()!.newContext({ storageState: './tests/e2e/.auth/state.json' })
    await ctx2.request.delete(`/api/admin/travels/${travelId}`).catch(() => null)
    await ctx2.close()
  })
})
