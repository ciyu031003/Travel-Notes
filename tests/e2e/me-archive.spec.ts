import { test, expect, type Page } from '@playwright/test'

/**
 * 「我的」页（R1 重构）回归。
 *
 * 锁住三件事：
 *   ① **统计口径**：新建一本旅行后，「我的」页的「N 次旅行 / N 个地方 / N 张照片」必须跟着变。
 *      修复前这三个数字读的是旧文章表（`Post(type='travel')`），App 里建的旅行一个都不算 ——
 *      用例的价值就在于"建完立刻回档案页核对"，这正是当初漏掉的那一步。
 *   ② 页面结构：不再出现「我的旅行故事」；「记录」与「设置」两组入口在位。
 *   ③ 头图：上传后立即可见，且焦点九宫格改的是 `object-position`（不是白改）。
 *
 * 点击统一走原生 `el.click()`：本页是 mobile shell + sticky 底栏，
 * Playwright 的坐标点击在这类元素上只派发 pointerdown（见 interact.spec.ts 的说明）。
 */

async function tapButton(page: Page, text: string | RegExp) {
  const arg = text instanceof RegExp ? { source: text.source, flags: text.flags } : text
  const ok = await page.evaluate((t: string | { source: string; flags: string }) => {
    const re = typeof t === 'string' ? null : new RegExp(t.source, t.flags)
    const needle = typeof t === 'string' ? t : ''
    const matches = Array.from(document.querySelectorAll('button,a')).filter((b) => {
      const s = (b.textContent || '').trim()
      const label = (b.getAttribute('aria-label') || '').trim()
      return re ? re.test(s) || re.test(label) : s.includes(needle) || label === needle
    })
    const target = matches[matches.length - 1] as HTMLElement | undefined
    if (!target) return false
    target.click()
    return true
  }, arg)
  expect(ok, `应找到可点击元素：${text}`).toBe(true)
}

/** 1x1 最小 JPEG：真实文件，走真实的 multipart 上传路径 */
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
)

/** 读「我的」页三统计的数值 */
async function readStats(page: Page): Promise<{ travels: number; places: number; photos: number }> {
  return page.evaluate(() => {
    const text = document.body.innerText
    const pick = (label: string) => {
      const m = text.match(new RegExp('(\\d+)\\s*\\n?\\s*' + label))
      return m ? Number(m[1]) : -1
    }
    return { travels: pick('次旅行'), places: pick('个地方'), photos: pick('张照片') }
  })
}

/**
 * 读「三统计」的**稳定值**（等动画停下来再取值）。
 *
 * 为什么必须有这个函数：统计数字走 `CountUp` 动画，从 0 递增到真实值。
 * 直接 `readStats` 有概率取到动画起点 0，于是 `before.travels + 1` 这个断言会
 * 在「账号已有旅行」时变成 `0 + 1` 而误报失败 —— 实测在整套跑时稳定偶发
 * （单跑该用例必过、整套跑首次必挂、重试必过）。这里连续两次读数一致才返回，
 * 断言语义不变，只是不再把动画中间帧当成真实值。
 */
async function readStatsSettled(page: Page): Promise<{ travels: number; places: number; photos: number }> {
  let last = await readStats(page)
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(200)
    const next = await readStats(page)
    if (next.travels === last.travels && next.places === last.places && next.photos === last.photos) {
      return next
    }
    last = next
  }
  return last
}

/** 建一本「南京 3 天」旅行并回到「我的」 */
async function createTravelThenBackToMe(page: Page, title: string) {
  await page.goto('/travel/new')
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
}

test('「我的」页结构：有档案头图与三统计，没有「我的旅行故事」', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/me')
  await expect(page.getByRole('heading', { name: '我的' }).first()).toBeVisible({ timeout: 25_000 })

  // 三统计在位
  const stats = await readStats(page)
  expect(stats.travels, `未读到「次旅行」统计：${JSON.stringify(stats)}`).toBeGreaterThanOrEqual(0)
  expect(stats.places).toBeGreaterThanOrEqual(0)
  expect(stats.photos).toBeGreaterThanOrEqual(0)

  // 旅行内容只在 /travel 与画册，不再在「我的」重复铺一遍
  await expect(page.getByText('我的旅行故事')).toHaveCount(0)
  await expect(page.getByText('我的记忆')).toHaveCount(0)

  // R4：记录与设置类入口全部收进右上角 ≡ 的右侧半屏抽屉，页面主体只留旅行档案
  await expect(page.getByRole('link', { name: /时间线/ })).toHaveCount(0)
  await page.getByRole('button', { name: '设置与记录入口' }).click()
  const drawer = page.getByRole('dialog', { name: '记录与设置' })
  await expect(drawer).toBeVisible({ timeout: 15_000 })
  await expect(drawer.getByRole('link', { name: /时间线/ })).toBeVisible()
  await expect(drawer.getByRole('link', { name: /数据看板/ })).toBeVisible()
  await expect(drawer.getByRole('link', { name: /碎碎念/ })).toBeVisible()
  await expect(drawer.getByRole('link', { name: /数据与同步/ })).toBeVisible()
  await expect(drawer.getByRole('button', { name: /退出登录/ })).toBeVisible()
})

test('新建旅行后，「我的」页统计立刻反映（口径修复的核心断言）', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/me')
  await expect(page.getByRole('heading', { name: '我的' }).first()).toBeVisible({ timeout: 25_000 })
  const before = await readStatsSettled(page)

  await createTravelThenBackToMe(page, `E2E 档案统计 ${Date.now()}`)

  await page.goto('/me')
  await expect(page.getByRole('heading', { name: '我的' }).first()).toBeVisible({ timeout: 25_000 })
  // 等接口回来（CountUp 有动画，取稳定值）
  await expect
    .poll(async () => (await readStatsSettled(page)).travels, { timeout: 20_000 })
    .toBe(before.travels + 1)

  const after = await readStatsSettled(page)
  // 目的地填了「南京」→ 地方数不应减少；新建旅行没有照片，照片数保持不变
  expect(after.places).toBeGreaterThanOrEqual(before.places)
  expect(after.photos).toBeGreaterThanOrEqual(before.photos)
})

test('上传档案头图 → 立即可见，且焦点九宫格写进 object-position', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/me')
  await expect(page.getByRole('heading', { name: '我的' }).first()).toBeVisible({ timeout: 25_000 })

  // 换头图：走 MeHome 的隐藏 file input（有 aria-label；隐藏元素也能直接 setInputFiles，
  // 不要等 filechooser 事件——setInputFiles 不会弹出选择器）
  await page.getByLabel('选择头图图片').setInputFiles({
    name: 'cover.jpg',
    mimeType: 'image/jpeg',
    buffer: TINY_JPEG,
  })

  // 头图容器出现 img
  const cover = page.getByTestId('profile-cover')
  await expect(cover).toBeVisible({ timeout: 25_000 })
  const src = await cover.getAttribute('src')
  expect(src, '头图 URL 应指向 /uploads/covers/').toContain('/uploads/covers/')

  // 打开焦点面板并点一格
  await tapButton(page, '更换头图')
  const grid = page.getByRole('dialog', { name: '档案头图' })
  await expect(grid).toBeVisible({ timeout: 15_000 })
  const cell = grid.getByRole('button', { name: '焦点 第1行 第1列' })
  await cell.click()

  // 焦点写入 object-position（不允许"点了没反应"）
  await expect
    .poll(async () => (await cover.getAttribute('style')) || '', { timeout: 15_000 })
    .toContain('object-position')

  // 刷新后焦点仍在（真的落库了，不是只改了本地 state）
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '我的' }).first()).toBeVisible({ timeout: 25_000 })
  await expect
    .poll(async () => (await page.getByTestId('profile-cover').getAttribute('style')) || '', { timeout: 20_000 })
    .toContain('object-position')
  // 并且确实是刚选的那一格（左上 → 41.67% 41.67%），不是居中
  const style = (await page.getByTestId('profile-cover').getAttribute('style')) || ''
  expect(style).toContain('41.67%')
})
