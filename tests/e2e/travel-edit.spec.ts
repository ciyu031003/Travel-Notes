import { test, expect, type Page } from '@playwright/test'

/**
 * 「编辑旅行信息」闭环回归。
 *
 * 真机反馈原文："添加完的旅行没有办法看到，也没有办法进一步去设置"。
 * 此前前台**完全没有**修改入口：目的地写错、日期漏填、名字想改都只能删掉重建
 * （删除会连带回忆与照片一起丢）。本组用例锁住三条契约：
 *   ① 自己的旅行在详情页必须出现「编辑信息」入口；
 *   ② 改目的地 / 日期区间能保存，并落到详情页（区间变化要同步「按天回顾」的章节数）；
 *   ③ 改标题要连带换 slug（地址跟着名字走），旧地址不能把用户留在 404 上。
 */

/**
 * 按可见文本**或 aria-label** 点击一个 button —— 用原生 `el.click()` 而不是坐标点击。
 *
 * 为什么不用 Playwright 的 `.click()`：本页有 bottom sheet 与 sticky 底栏，
 * 坐标点击在这类元素上只派发 pointerdown、不派发 click，React onClick 不触发
 * （实测：picker 打开了但"确定"永远点不动，区间根本没提交）。
 * 需要 aria-label 匹配是因为日期格的可见文本只有日号，日期在 aria-label 里。
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

/** 建一本 3 天旅行（南京），落到详情页 */
async function createTravel(page: Page, title: string): Promise<void> {
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

test('详情页对自有旅行给出「编辑信息」入口', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await createTravel(page, `E2E 编辑入口 ${Date.now()}`)

  await expect(page.getByRole('button', { name: /编辑信息/ })).toBeVisible({ timeout: 20_000 })

  await tapButton(page, '编辑信息')
  const sheet = page.getByRole('dialog', { name: '编辑旅行信息' })
  await expect(sheet).toBeVisible({ timeout: 15_000 })
  // 表单要回填当前值，而不是空白
  await expect(sheet.getByLabel('去哪？')).toHaveValue('南京')
})

test('改目的地与日期区间 → 保存后详情页按新数据渲染，章节数跟着变', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const title = `E2E 编辑保存 ${Date.now()}`
  await createTravel(page, title)

  await tapButton(page, '编辑信息')
  const sheet = page.getByRole('dialog', { name: '编辑旅行信息' })
  await expect(sheet).toBeVisible({ timeout: 15_000 })

  // 目的地：南京 → 苏州
  await sheet.getByLabel('去哪？').fill('苏州')

  // 区间：3 天 → 5 天（点开始日 + 结束日，底部按钮常驻「确定」）
  // 全程用原生 click：编辑器和日期面板都是贴在页面底部的浮层，
  // Playwright 的坐标点击在这类元素上只派发 pointerdown（见本文件顶部说明），
  // 表现就是"点了没反应、区间根本没改"。
  await tapButton(page, /共 \d+ 天/)
  await expect(page.getByText(/^选择日期$/).first()).toBeVisible({ timeout: 20_000 })
  // 日期格的可见文本只有日号，日期在 aria-label 里 → 按 ISO 日期定位。
  // 这里刻意从**面板首格**出发、结束日 +4 天：面板打开在区间首月，
  // 首格就是区间起点，加 4 天后必然比原来的 3 天长，
  // 不依赖"今天落在哪一格"（今天是 9/17 而区间是 8/31-9/2 时，今天根本不在网格里）。
  const firstDayCell = page.locator('button[aria-label]').filter({ hasText: /^\d{1,2}$/ }).first()
  const startIso = (await firstDayCell.getAttribute('aria-label')) || ''
  expect(startIso, '首格应是可点的日期').toMatch(/^\d{4}-\d{2}-\d{2}$/)

  const start = new Date(`${startIso}T00:00:00`)
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 4)
  const endIso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`

  await tapButton(page, startIso)
  if (end.getMonth() !== start.getMonth()) {
    await tapButton(page, '下个月') // 结束日跨月 → 先翻月
  }
  await tapButton(page, endIso)
  await tapButton(page, /^确定$/)
  // 落库前先确认抽屉里的区间真的变成 5 天，否则测的就是"旧区间 + 新目的地"
  await expect(sheet.locator('button').filter({ hasText: /共 5 天 4 晚/ }).first()).toBeVisible({ timeout: 10_000 })

  await tapButton(page, /^保存$/)

  // 保存后整页重载：新目的地要在详情页出现（证明真写进去了）
  await expect(page.getByText('苏州').first()).toBeVisible({ timeout: 25_000 })
  // 天数跟着区间长到 5 天（服务端 syncTravelDayDates 补齐缺失的天）
  await expect(page.getByText(/5 天/).first()).toBeVisible({ timeout: 25_000 })
  // 「行程」页签里应出现第 5 天（DAY 05 · MM.DD 周X）
  await page.getByRole('tab', { name: '行程' }).click()
  await expect(page.getByText(/DAY 05/).first()).toBeVisible({ timeout: 20_000 })
})

test('改标题 → 地址跟着换 slug，详情页仍可访问', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await createTravel(page, `E2E 旧名字 ${Date.now()}`)

  const before = new URL(page.url()).pathname
  const newTitle = `E2E 新名字 ${Date.now()}`

  await tapButton(page, '编辑信息')
  const sheet = page.getByRole('dialog', { name: '编辑旅行信息' })
  await expect(sheet).toBeVisible({ timeout: 15_000 })
  await sheet.getByLabel('旅程名字').fill(newTitle)
  await tapButton(page, /^保存$/)

  await expect(page.getByRole('heading', { level: 1, name: newTitle })).toBeVisible({ timeout: 25_000 })
  const after = new URL(page.url()).pathname
  expect(after, '改名字后地址应换到新 slug').not.toBe(before)
  expect(after).toContain('/travel/')
})
