import { test, expect, type Page } from '@playwright/test'
import { expectPageHealthy } from './helpers'

/**
 * 旅行画册阅读器 E2E（Album 2.0）
 *
 * 这是本次重构的**浏览器实测**，覆盖纯函数单测覆盖不到的部分：
 *   ① page-flip 运行时的真实挂载与页面元素生成；
 *   ② 翻页 / 键盘导航后页码正确前进与回退；
 *   ③ 主题切换**不改变页数与页码**（主题契约的浏览器侧证据）；
 *   ④ 懒加载图片真的加载出来（不是空白纸），且没有失败占位；
 *   ⑤ 无横向溢出、无崩溃占位。
 *
 * 【为什么用 route 注入画册数据】
 * E2E 跑在干净库上（`e2e_runner` 名下没有照片），而"书架上恰好有画册"是随机前提。
 * 直接 skip 会让这组用例永远不执行；用固定 fixture 注入则每次都在测同一份确定性数据，
 * 断言可以写得更严格（页数、页码、主题），这比"碰运气有数据才测"更有价值。
 * 图片 URL 指向仓库里真实存在的测试图（public/uploads/media/*.jpg），
 * 因此 ④ 的 naturalWidth 断言是真实加载证据，而不是空跑。
 */

const MEDIA = (n: number) => `/uploads/media/${n}.jpg`

function fixtureBook() {
  // 3 天 · 12 张图：足够触发 DAY_OPENING / FULL_BLEED / PHOTO_CAPTION / TIMELINE / ENDING
  const chapter = (index: number, date: string, ids: number[]) => ({
    id: 100 + index,
    index,
    date,
    title: `第 ${index} 天`,
    summary: `第 ${index} 天的记录`,
    itinerary: [{ id: index * 10, title: `行程 ${index}`, locationName: '南京' }],
    memories: [{ id: index * 20, title: `回忆 ${index}`, content: '走在城墙上', mood: 'HAPPY', photos: [] }],
    photos: ids.map((n) => ({
      id: n,
      thumbnailUrl: MEDIA(n),
      previewUrl: MEDIA(n),
      blurUrl: null,
      fullUrl: MEDIA(n),
      width: 1368,
      height: 1024,
    })),
  })

  return {
    bookKey: 'travel:9001',
    travelId: 9001,
    slug: 'e2e-album',
    title: 'E2E 画册',
    description: null,
    location: '南京',
    startDate: '2026-05-01',
    endDate: '2026-05-03',
    travelType: 'ALONE',
    companions: null,
    coverThumb: MEDIA(1),
    coverPreview: MEDIA(1),
    coverBlur: null,
    dayCount: 3,
    photoCount: 12,
    chapters: [
      chapter(1, '2026-05-01', [1, 2, 3, 4]),
      chapter(2, '2026-05-02', [5, 6, 7, 8]),
      chapter(3, '2026-05-03', [9, 10, 11, 12]),
    ],
  }
}

const SUMMARY = (() => {
  const { chapters: _chapters, ...rest } = fixtureBook()
  return rest
})()

/** 注入画册摘要与单本数据，然后打开第一本画册 */
async function openFixtureBook(page: Page) {
  const book = fixtureBook()
  // 用谓词而不是 glob：`/api/travel-book?key=...` 带查询串，通配符匹配容易出歧义；
  // 另外测试运行需屏蔽 Service Worker（见 playwright.config），否则 SW 会绕过路由拦截。
  await page.route(
    (url) => url.pathname === '/api/travel-book',
    async (route) => {
      const url = route.request().url()
      if (url.includes('key=')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ book }) })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ books: [SUMMARY] }) })
      }
    },
  )

  await page.goto('/album')
  const card = page.locator('.pcard').first()
  await expect(card).toBeVisible({ timeout: 30_000 })
  await card.click()
  await expect(page.locator('.book-reader')).toBeVisible({ timeout: 30_000 })
}

test.describe.configure({ mode: 'serial' })

test('画册阅读器：打开 → page-flip 挂载 → 翻页页码前进/回退', async ({ page }) => {
  await openFixtureBook(page)

  // ① 运行时真实挂载：page-flip 生成了页元素
  const pages = page.locator('.art-flipbook-container .art-flip-page')
  await expect(pages.first()).toBeVisible({ timeout: 20_000 })
  const pageCount = await pages.count()

  // ② 页码指示：01 / NN。NN 就是**对开数**，也是 page-flip 的页元素数
  //    （双页模式下每个 .art-flip-page 承载一个左右对开）
  const indicator = page.locator('.book-reader footer span[aria-live="polite"]')
  await expect(indicator).toBeVisible()
  const first = (await indicator.textContent())?.trim() ?? ''
  const m = first.match(/^01 \/ (\d{2,})$/)
  expect(m, `页码指示格式应为 01 / NN，实际 ${first}`).not.toBeNull()
  const totalSpreads = Number(m![1])
  expect(pageCount, 'page-flip 页元素数应等于对开数').toBe(totalSpreads)

  // fixture 是 19 逻辑页（封面+前言+3×(DAY_OPENING+PEAK+PAUSE+2×ECHO)+时间线+结尾），
  // 双页模式两两成对 → 10 个对开。测试图 aspect=1.34 < 1.6，不触发出血展开。
  expect(totalSpreads, '19 逻辑页在双页模式下应为 10 个对开').toBe(10)

  // ③ 下一页：页码前进
  await page.locator('.book-reader footer button', { hasText: '下一页' }).click()
  await expect(indicator).toHaveText(/^02 \//, { timeout: 20_000 })

  // ④ 上一页回到封面
  await page.locator('.book-reader footer button', { hasText: '上一页' }).click()
  await expect(indicator).toHaveText(first, { timeout: 20_000 })

  await expectPageHealthy(page)
})

test('画册阅读器：主题切换只改外观，不改页数与页码', async ({ page }) => {
  await openFixtureBook(page)

  const reader = page.locator('.book-reader')
  const indicator = reader.locator('footer span[aria-live="polite"]')
  const pages = page.locator('.art-flipbook-container .art-flip-page')

  // 先翻到第 3 页，确保"切主题不改页码"这条断言有意义（不是恒为 01）
  await reader.locator('footer button', { hasText: '下一页' }).click()
  await expect(indicator).toHaveText(/^02 \//, { timeout: 20_000 })
  await reader.locator('footer button', { hasText: '下一页' }).click()
  await expect(indicator).toHaveText(/^03 \//, { timeout: 20_000 })

  const pageCountBefore = await pages.count()
  const labelBefore = (await indicator.textContent())?.trim() ?? ''
  await expect(reader).toHaveAttribute('data-book-theme', 'editorial')

  const menu = reader.locator('[role="menu"][aria-label="画册主题"]')

  // 切到「胶片」
  await reader.locator('button[aria-haspopup="menu"]').click()
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitemradio', { name: /胶片/ }).click()
  await expect(reader).toHaveAttribute('data-book-theme', 'film', { timeout: 15_000 })
  expect(await pages.count(), '切主题不得改变物理页数').toBe(pageCountBefore)
  expect((await indicator.textContent())?.trim(), '切主题不得改变当前页码').toBe(labelBefore)

  // 切到「手记」
  await reader.locator('button[aria-haspopup="menu"]').click()
  await menu.getByRole('menuitemradio', { name: /手记/ }).click()
  await expect(reader).toHaveAttribute('data-book-theme', 'memory', { timeout: 15_000 })
  expect(await pages.count()).toBe(pageCountBefore)
  expect((await indicator.textContent())?.trim()).toBe(labelBefore)

  // 切回「画报」
  await reader.locator('button[aria-haspopup="menu"]').click()
  await menu.getByRole('menuitemradio', { name: /画报/ }).click()
  await expect(reader).toHaveAttribute('data-book-theme', 'editorial', { timeout: 15_000 })

  await expectPageHealthy(page)
})

test('画册阅读器：图片真的加载出来（懒加载不是空白纸）', async ({ page }) => {
  await openFixtureBook(page)

  // 封面是 eager 图，必须完成加载且有真实像素
  const coverImg = page.locator('.art-flipbook-container .art-page img').first()
  await expect(coverImg).toBeVisible({ timeout: 20_000 })
  await expect
    .poll(async () => coverImg.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 20_000 })
    .toBeGreaterThan(0)

  // 翻两页，让视口内的第二/第三页图片进入加载路径
  const reader = page.locator('.book-reader')
  await reader.locator('footer button', { hasText: '下一页' }).click()
  await expect(reader.locator('footer span[aria-live="polite"]')).toHaveText(/^02 \//, { timeout: 20_000 })

  await expect
    .poll(
      async () =>
        page.locator('.art-flipbook-container .art-page img').evaluateAll(
          (els) => els.filter((el) => (el as HTMLImageElement).naturalWidth > 0).length,
        ),
      { timeout: 25_000 },
    )
    .toBeGreaterThanOrEqual(2)

  // 不应出现失败占位
  await expect(page.locator('.photo-fallback')).toHaveCount(0)

  await expectPageHealthy(page)
})

test('画册阅读器：键盘导航与 Escape 关闭', async ({ page }) => {
  await openFixtureBook(page)

  const reader = page.locator('.book-reader')
  const indicator = reader.locator('footer span[aria-live="polite"]')
  const first = (await indicator.textContent())?.trim() ?? ''
  expect(first).toMatch(/^01 \//)

  await page.keyboard.press('ArrowRight')
  await expect(indicator).toHaveText(/^02 \//, { timeout: 20_000 })

  await page.keyboard.press('ArrowLeft')
  await expect(indicator).toHaveText(first, { timeout: 20_000 })

  await page.keyboard.press('End')
  await expect(indicator).not.toHaveText(first, { timeout: 20_000 })
  // End 应落在最后一个对开（不必硬编码页数，只断言"不再是第一页"）
  await expect(indicator).toHaveText(/^10 \//, { timeout: 20_000 })

  await page.keyboard.press('Home')
  await expect(indicator).toHaveText(first, { timeout: 20_000 })

  // Escape 关闭阅读器，回到画册墙
  await page.keyboard.press('Escape')
  await expect(page.locator('.book-reader')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.locator('.pcard').first()).toBeVisible({ timeout: 15_000 })
})

test('画册阅读器：移动端单页模式无横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openFixtureBook(page)

  const reader = page.locator('.book-reader')
  await expect(reader).toBeVisible()
  // 单页模式：rig 带 --single 修饰类
  await expect(reader.locator('.art-flip-rig--single')).toBeVisible({ timeout: 15_000 })

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, '移动端阅读器横向溢出 px').toBeLessThanOrEqual(0)

  await expectPageHealthy(page)
})
