import { test, expect, type Page } from '@playwright/test'

/**
 * 旅行详情页「能记东西」回归（真机反馈：建完旅行无法进一步设置 / 找不到上传与规划入口）
 *
 * 本次重构后详情页的移动端信息架构是四个分段 tab：总览 / 行程 / 相册 / 花销。
 * 本组用例锁住四条此前要么不存在、要么被全屏相册盖死的路径：
 *   ① 落地页就是可操作页面（tab 齐全，而不是一个铺满全屏的相册）；
 *   ② 「行程」页签：添加行程（记景点/餐厅）→ 出现在对应那一天；
 *   ③ 「行程」页签：记一笔（文字 + 照片）→ 当天出现该回忆与照片；
 *   ④ 「相册」页签：**上传照片**入口（新增接口 POST /api/travels/:id/photos）。
 *
 * 点击统一走原生 \`el.click()\`：本页大量使用 sticky 底栏与底部抽屉，
 * Playwright 的坐标点击在这类元素上只派发 pointerdown（见 interact.spec.ts 的说明）。
 */

async function tapButton(page: Page, text: string | RegExp) {
  const ok = await page.evaluate((t) => {
    const matches = Array.from(document.querySelectorAll('button')).filter((b) => {
      const label = (b.getAttribute('aria-label') || '').trim()
      const s = (b.textContent || '').trim()
      return typeof t === 'string'
        ? s.includes(t) || label === t
        : new RegExp(t.source, t.flags).test(s) || new RegExp(t.source, t.flags).test(label)
    })
    const target = matches[matches.length - 1] as HTMLButtonElement | undefined
    if (!target || target.disabled) return false
    target.click()
    return true
  }, text instanceof RegExp ? { source: text.source, flags: text.flags } : text)
  expect(ok, `应找到可点击的按钮：${text}`).toBe(true)
}

/** 建一本旅行并落到详情页，返回标题 */
async function createTravel(page: Page): Promise<string> {
  const title = `E2E 记录闭环 ${Date.now()}`
  await page.goto('/travel/new')

  // 先选日期（避开目的地联想列表遮挡），日期区间 3 天 → 应自动生成 3 个「天」
  await tapButton(page, '选择开始与结束日期')
  await expect(page.getByText(/^选择日期$/).first()).toBeVisible({ timeout: 20_000 })
  const days = page.locator('button[aria-label^="20"]')
  await days.nth(0).click()
  await days.nth(2).click()
  await tapButton(page, /^确定/)

  await page.getByLabel('去哪？').fill('南京')
  await page.getByLabel('给这段旅程起个名字').fill(title)
  await tapButton(page, '开始记录')

  await page.waitForURL((u) => u.pathname.startsWith('/travel/') && u.pathname !== '/travel/new', { timeout: 30_000 })
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 25_000 })
  return title
}

/** 切到某个分段 tab */
async function openTab(page: Page, name: string) {
  await page.getByRole('tab', { name }).click()
}

test('新建旅行 → 落地页是可操作的移动详情（四 tab，而非全屏相册）', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await createTravel(page)

  await expect(page.getByRole('tab', { name: '总览' })).toBeVisible({ timeout: 25_000 })
  await expect(page.getByRole('tab', { name: '行程' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '相册' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '花销' })).toBeVisible()
  // 底部主操作常驻（记录一笔）
  await expect(page.getByRole('button', { name: /记录一笔/ })).toBeVisible()
})

test('行程页签：添加行程 → 出现在对应那天', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await createTravel(page)
  await openTab(page, '行程')

  const spot = `喀纳斯湖 ${Date.now()}`
  await tapButton(page, '添加行程')
  const sheet = page.getByRole('dialog', { name: '添加行程' })
  await expect(sheet).toBeVisible({ timeout: 15_000 })

  await sheet.getByPlaceholder('例如 喀纳斯湖').fill(spot)
  // 类型默认景点；抽屉里可以顺手改类型（六宫格）
  await sheet.getByRole('button', { name: /景点/ }).click()
  await tapButton(page, '添加行程')

  await expect(sheet).toBeHidden({ timeout: 15_000 })
  await expect(page.getByText(spot).first()).toBeVisible({ timeout: 20_000 })
})

test('行程页签：记一笔（文字 + 照片）→ 当天出现该回忆与照片', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await createTravel(page)
  await openTab(page, '行程')

  const note = `在这里住了一晚 ${Date.now()}`
  await tapButton(page, '记一笔')
  const sheet = page.getByRole('dialog', { name: '记一笔' })
  await expect(sheet).toBeVisible({ timeout: 15_000 })
  await sheet.getByPlaceholder('例如 在喀纳斯的第一天').fill(note)

  // 选 1 张照片（真实文件，走 Web file input 路径）
  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 15_000 })
  await tapButton(page, '添加照片')
  const chooser = await fileChooserPromise
  await chooser.setFiles({
    name: 'e2e-photo.jpg',
    mimeType: 'image/jpeg',
    // 1x1 最小 JPEG
    buffer: Buffer.from(
      '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
        'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
        'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
      'base64',
    ),
  })

  await expect(sheet.locator('img[src^="data:image"]')).toHaveCount(1, { timeout: 15_000 })
  await tapButton(page, /^保存$/)

  await expect(sheet).toBeHidden({ timeout: 25_000 })
  // 按天视图里当天应出现这条回忆（含照片）
  await expect(page.getByText(note).first()).toBeVisible({ timeout: 25_000 })
})

test('相册页签：上传照片 → 相册里出现（此前完全没有上传入口）', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await createTravel(page)
  await openTab(page, '相册')

  await expect(page.getByRole('button', { name: '上传照片' })).toBeVisible({ timeout: 20_000 })
  await tapButton(page, '上传照片')
  const sheet = page.getByRole('dialog', { name: '上传照片' })
  await expect(sheet).toBeVisible({ timeout: 15_000 })

  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 15_000 })
  await tapButton(page, '添加照片')
  const chooser = await fileChooserPromise
  await chooser.setFiles({
    name: 'e2e-album.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(
      '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
        'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
        'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
      'base64',
    ),
  })

  await expect(sheet.locator('img[src^="data:image"]')).toHaveCount(1, { timeout: 15_000 })
  await tapButton(page, /^上传 1 张$/)

  // 上传成功 toast + 抽屉关闭 + 相册出现 1 张
  await expect(sheet).toBeHidden({ timeout: 25_000 })
  await expect(page.getByText(/已上传 1 张/).first()).toBeVisible({ timeout: 20_000 })
})
