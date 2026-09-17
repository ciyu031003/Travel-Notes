import { test, expect, type Page } from '@playwright/test'

/**
 * 旅行详情页「能记东西」回归（真机反馈：建完旅行无法进一步设置）
 *
 * 覆盖三条此前完全走不通的路径：
 *   ① 按天时间线要出现（0 天时组件不渲染 → 连按钮都没有）、
 *   ② 「记一笔」：写文字 + 传照片（上传照片此前在 App 里根本没有入口）、
 *   ③ 「添加行程」：记景点/餐厅等（只有后台接口，前台无 UI）。
 *
 * 点击统一走原生 `el.click()`：本页大量使用 sticky 底栏，
 * Playwright 的坐标点击在这类元素上只派发 pointerdown（见 interact.spec.ts 的说明）。
 */

async function tapButton(page: Page, text: string | RegExp) {
  const ok = await page.evaluate((t) => {
    const matches = Array.from(document.querySelectorAll('button')).filter((b) => {
      const s = (b.textContent || '').trim()
      return typeof t === 'string' ? s.includes(t) : new RegExp(t.source, t.flags).test(s)
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

test('新建旅行 → 详情页出现按天时间线（可继续编辑）', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await createTravel(page)

  // 按天回顾：日期区间 3 天 → 应有 3 天
  await expect(page.getByText('按天回顾')).toBeVisible({ timeout: 25_000 })
  await expect(page.getByText(/DAY 01/).first()).toBeVisible({ timeout: 15_000 })

  // 每一天都要有可动手的入口（这两个按钮此前都不存在）
  await expect(page.getByRole('button', { name: /记一笔/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /添加行程/ }).first()).toBeVisible()
})

test('添加行程：记一个景点 → 时间线出现该景点', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await createTravel(page)
  await expect(page.getByText('按天回顾')).toBeVisible({ timeout: 25_000 })

  const spot = `喀纳斯湖 ${Date.now()}`
  await tapButton(page, '添加行程')
  const sheet = page.getByRole('dialog', { name: '添加行程' })
  await expect(sheet).toBeVisible({ timeout: 15_000 })

  await sheet.getByPlaceholder('例如 喀纳斯湖').fill(spot)
  // 类型默认景点；顺手选个开始时间
  await sheet.getByRole('button', { name: /景点/ }).click()
  await tapButton(page, '添加行程')

  // 抽屉关闭 + 时间线出现该行程
  await expect(sheet).toBeHidden({ timeout: 15_000 })
  await expect(page.getByText(spot).first()).toBeVisible({ timeout: 20_000 })
})

test('记一笔：写文字 + 传照片 → 时间线出现该回忆与照片', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await createTravel(page)
  await expect(page.getByText('按天回顾')).toBeVisible({ timeout: 25_000 })

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

  // 预览出现后保存
  await expect(sheet.locator('img[src^="data:image"]')).toHaveCount(1, { timeout: 15_000 })
  await tapButton(page, /^保存$/)

  await expect(sheet).toBeHidden({ timeout: 25_000 })
  await expect(page.getByText(note).first()).toBeVisible({ timeout: 25_000 })
})
