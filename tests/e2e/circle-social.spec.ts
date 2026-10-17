import { test, expect, type Page } from '@playwright/test'
import { expectPageHealthy } from './helpers'

/**
 * 旅行圈「点赞 / 评论 / 收藏」三个互动功能的浏览器实测（2026-10-17）。
 *
 * 为什么要有这一组：这三个功能此前都有**真实的缺口**，而单测/接口测试全都抓不到 ——
 *   ① 评论点赞：服务端 `/api/social/comments/[id]/like` 一直都在，但**没有任何客户端调用**。
 *      动作行里那个心形按钮的 onClick 是 `openActions()`（弹「分享/复制/删除」抽屉），
 *      后面的数字是只读值 —— 点它既不会点赞，也看不出"更多"藏在哪。
 *   ② 收藏：列表卡片上的书签数字是只读文本，想收藏必须点进详情页再点一次。
 *   ③ 评论入口：列表上的评论数点不动，想看评论得先落地详情再找动作条。
 * 三者都是「服务端有、界面上没有」，只有真实浏览器点一遍才能钉住。
 *
 * 数据全部用 route 注入（与 album-reader / circle-open 同一套做法）：
 * 干净库上不保证恰好有公开帖子，而这里要断言的正是稳定的交互契约，不是排序或发布时序。
 * Service Worker 由 playwright.config 统一 block，否则 route 注入会被 SW 绕过。
 */

const POST_ID = 9001

const STORY = {
  id: POST_ID,
  postId: null,
  travelId: POST_ID,
  title: '洱海边的四天',
  summary: '从古城出发，沿着环海西路一路向北。',
  coverUrl: '/uploads/media/1.jpg',
  location: '大理',
  startDate: '2026-05-01',
  endDate: '2026-05-04',
  dayCount: 4,
  photoCount: 12,
  author: { id: 1, username: 'linxiaoyu', nickname: '林小语', avatarUrl: null },
  likeCount: 128,
  commentCount: 12,
  favoriteCount: 46,
  isLiked: false,
  isFavorited: false,
  publishedAt: '2026-05-06T10:00:00.000Z',
  slug: null,
  photos: ['/uploads/media/1.jpg', '/uploads/media/2.jpg'],
  canEdit: false,
  days: [],
}

const FEED_POST = {
  id: POST_ID,
  travelId: POST_ID,
  title: STORY.title,
  summary: STORY.summary,
  coverUrl: STORY.coverUrl,
  location: STORY.location,
  startDate: '2026-05-01T00:00:00.000Z',
  endDate: '2026-05-04T00:00:00.000Z',
  dayCount: 4,
  photoCount: 12,
  travelType: 'ALONE',
  author: STORY.author,
  likeCount: 128,
  commentCount: 12,
  favoriteCount: 46,
  isLiked: false,
  isFavorited: false,
}

const COMMENTS = [
  {
    id: 501,
    userId: 2,
    parentId: null,
    content: '第二张那个云真的绝了。',
    createdAt: '2026-05-06T12:00:00.000Z',
    author: { id: 2, username: 'ayu', nickname: '阿屿', avatarUrl: null },
    likeCount: 4,
    isLiked: false,
    isMine: false,
    replies: [
      {
        id: 502,
        userId: 1,
        parentId: 501,
        content: '下午四点多拍的。',
        createdAt: '2026-05-06T12:30:00.000Z',
        author: { id: 1, username: 'linxiaoyu', nickname: '林小语', avatarUrl: null },
        likeCount: 1,
        isLiked: false,
        isMine: true,
        replies: [],
      },
    ],
  },
]

/**
 * 注入 feed + 详情 + 评论 + 三个互动接口，并**记录**每个写请求的方法。
 * 记录方法很关键：点赞用 POST、取消用 DELETE，若两端都写成 toggle（服务端曾经如此），
 * 「重试」会静默撤销用户的赞 —— 断言方法就是断言"幂等语义"没被改回去。
 */
async function stubSocial(page: Page, calls: string[]) {
  // 已登录：否则卡片上的胶囊走「引导登录」分支，不写库
  await page.route(
    (url) => url.pathname === '/api/check-auth',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: true, user: { id: 1, username: 'e2e_runner' } }),
      }),
  )
  await page.route(
    (url) => url.pathname === '/api/social/posts',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [FEED_POST], total: 1, hasMore: false }),
      }),
  )
  await page.route(
    (url) => url.pathname === `/api/social/posts/${POST_ID}`,
    (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: STORY }) }),
  )
  await page.route(
    (url) => url.pathname === `/api/social/posts/${POST_ID}/comments`,
    (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: COMMENTS }) }),
  )
  await page.route(
    (url) => url.pathname === `/api/social/comments/501/like`,
    (route) => {
      const method = route.request().method()
      calls.push(`comment-like:${method}`)
      // 服务端语义：POST = 确保已赞、DELETE = 确保未赞（**幂等**，不是 toggle）。
      // 桩必须照着这个语义回，否则"重试"在测试里也会表现成静默撤销。
      const liked = method === 'POST'
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { liked, likeCount: liked ? 5 : 4 } }),
      })
    },
  )
  await page.route(
    (url) => url.pathname === `/api/social/posts/${POST_ID}/favorite`,
    (route) => {
      calls.push(`post-favorite:${route.request().method()}`)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { favorited: route.request().method() === 'POST' } }),
      })
    },
  )
  await page.route(
    (url) => url.pathname === `/api/social/posts/${POST_ID}/like`,
    (route) => {
      const method = route.request().method()
      calls.push(`post-like:${method}`)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { liked: method === 'POST', likeCount: method === 'POST' ? 129 : 128 } }),
      })
    },
  )
}

test('评论点赞：心形是**真入口**（不是伪装成点赞的「更多」按钮）', async ({ page }) => {
  const calls: string[] = []
  await stubSocial(page, calls)
  await page.setViewportSize({ width: 390, height: 844 })

  await page.goto(`/circle/${POST_ID}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { level: 1, name: STORY.title })).toBeVisible({ timeout: 30_000 })

  // 打开评论抽屉
  await page.locator('button[aria-label="评论"]').click()
  await expect(page.getByText('第二张那个云真的绝了。')).toBeVisible({ timeout: 20_000 })

  // 点赞前：4 个赞、未赞
  const likeBtn = page.locator('button[aria-label^="点赞，当前 4 个赞"]')
  await expect(likeBtn).toBeVisible()
  await expect(likeBtn).toHaveAttribute('aria-pressed', 'false')

  await likeBtn.click()

  // 写请求必须是 POST（确保已赞），且界面立刻切到已赞态；数字以**服务端回传**为准（5）
  await expect.poll(() => calls.filter((c) => c.startsWith('comment-like:')).length).toBe(1)
  expect(calls).toContain('comment-like:POST')
  await expect(page.locator('button[aria-label^="取消点赞，当前 5 个赞"]')).toBeVisible({ timeout: 20_000 })

  // 再点一次 → DELETE，取消收藏/取消点赞走同一个接口的另一个方法
  await page.locator('button[aria-label^="取消点赞，当前 5 个赞"]').click()
  await expect.poll(() => calls.filter((c) => c.startsWith('comment-like:')).length).toBe(2)
  expect(calls).toContain('comment-like:DELETE')
  // 取消后回到 4 个赞（数字以服务端为准，不是本地瞎减）
  await expect(page.locator('button[aria-label^="点赞，当前 4 个赞"]')).toBeVisible({ timeout: 20_000 })

  // 「更多」仍然独立存在（此前它正是被塞在心形按钮上的那个功能）
  await expect(page.locator('button[aria-label="更多操作"]').first()).toBeVisible()

  await expectPageHealthy(page)
})

test('评论点赞：失败要回滚并说明原因，不能假装点上', async ({ page }) => {
  const calls: string[] = []
  await stubSocial(page, calls)
  // 让点赞接口失败（例如服务端 500）
  await page.route(
    (url) => url.pathname === '/api/social/comments/501/like',
    (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '服务不可用' }) }),
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/circle/${POST_ID}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { level: 1, name: STORY.title })).toBeVisible({ timeout: 30_000 })
  await page.locator('button[aria-label="评论"]').click()
  await page.locator('button[aria-label^="点赞，当前 4 个赞"]').click()

  // 回滚：重新变回「点赞，当前 4 个赞」；并且有明确的失败提示
  await expect(page.locator('button[aria-label^="点赞，当前 4 个赞"]')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('服务不可用')).toBeVisible({ timeout: 10_000 })
})

test('列表卡片：点赞与收藏都是真的可点（不是只读数字），且用 POST / DELETE 表达目标状态', async ({ page }) => {
  const calls: string[] = []
  await stubSocial(page, calls)
  await page.setViewportSize({ width: 390, height: 844 })

  await page.goto('/circle', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText(STORY.title).first()).toBeVisible({ timeout: 30_000 })

  /*
   * 先点**点赞**。这条断言同时是一道版面护栏：hero 卡片的底部信息行曾经漏写 z-index，
   * 被卡片的「打开详情」覆盖层（z-1）盖住 —— 按钮看着能点，点下去却是打开详情
   * （E2E 报 "…intercepts pointer events"）。所以这里必须真的点到、且请求真的发出去。
   */
  const likeBtn = page.locator('button[aria-label="点赞"]').first()
  await expect(likeBtn).toBeVisible({ timeout: 20_000 })
  await likeBtn.click()
  await expect.poll(() => calls.filter((c) => c.startsWith('post-like:')).length).toBe(1)
  expect(calls).toContain('post-like:POST')
  // 点完之后**不能**跳到详情页（说明点击没有被覆盖层吃掉）
  expect(new URL(page.url()).pathname).toBe('/circle')

  const favBtn = page.locator('button[aria-label="收藏"]').first()
  await expect(favBtn).toBeVisible({ timeout: 20_000 })
  await expect(favBtn).toHaveAttribute('aria-pressed', 'false')

  await favBtn.click()
  await expect.poll(() => calls.filter((c) => c.startsWith('post-favorite:')).length).toBe(1)
  expect(calls).toContain('post-favorite:POST')
  // 乐观更新：界面立刻切到已收藏（46 → 47）
  await expect(page.locator('button[aria-label="取消收藏"]').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('button[aria-label="取消收藏"]').first()).toContainText('47')

  // 取消收藏 → DELETE
  await page.locator('button[aria-label="取消收藏"]').first().click()
  await expect.poll(() => calls.filter((c) => c.startsWith('post-favorite:')).length).toBe(2)
  expect(calls).toContain('post-favorite:DELETE')
  expect(new URL(page.url()).pathname).toBe('/circle')

  await expectPageHealthy(page)
})

test('列表卡片：点评论数直接落到详情并展开评论抽屉', async ({ page }) => {
  const calls: string[] = []
  await stubSocial(page, calls)
  await page.setViewportSize({ width: 390, height: 844 })

  await page.goto('/circle', { waitUntil: 'domcontentloaded' })
  const commentEntry = page.locator('button[aria-label^="查看评论"]').first()
  await expect(commentEntry).toBeVisible({ timeout: 30_000 })
  await commentEntry.click()

  // URL 带上意图，详情页据此自动展开抽屉
  await page.waitForURL((u) => /^\/circle\/\d+$/.test(u.pathname) && u.searchParams.get('comments') === '1', {
    timeout: 30_000,
  })
  await expect(page.getByText('第二张那个云真的绝了。')).toBeVisible({ timeout: 25_000 })
})

test('详情页版面：桌面两栏、移动单栏，两个断点都无横向溢出', async ({ page }) => {
  const calls: string[] = []
  await stubSocial(page, calls)

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto(`/circle/${POST_ID}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: STORY.title })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: '收藏' })).toBeVisible()
    // 关键锚点：动作条与按天回顾/照片分节都在
    await expect(page.getByText('旅行照片').filter({ visible: true }).first()).toBeVisible()
    await expectPageHealthy(page)
  }
})
