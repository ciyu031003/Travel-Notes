import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('移动端首页状态栏安全区与功能抽屉契约', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  const onboarding = page.getByRole('dialog', { name: '首次使用引导' })
  await onboarding
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => page.getByRole('button', { name: '跳过引导' }).click())
    .catch(() => null)

  const trigger = page.getByRole('button', { name: '打开功能菜单' })
  await expect(trigger).toBeVisible({ timeout: 30_000 })

  // Android WebView 在部分 ROM 下 env(safe-area-inset-top) 为 0，
  // 状态栏同步后的变量必须能单独撑开首页顶部安全区。
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--m-status-bar-height', '38px')
  })
  const safeTop = await page
    .locator('section.m-safe-top')
    .first()
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingTop))
  expect(safeTop).toBeGreaterThanOrEqual(38)

  // 备案信息只存在于抽屉中，首页正文不应再占用底部空间。
  // P1 会移除隐藏的桌面树；此处先以用户可见结果为准。
  await expect(page.locator('[data-icp-license]:visible')).toHaveCount(0)

  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '功能菜单' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('[data-icp-license]')).toBeVisible()
  await expect(dialog.getByRole('link', { name: '我的旅行' })).toHaveCount(0)
  await expect(dialog.getByRole('link', { name: '旅行圈' })).toHaveCount(0)

  await expect
    .poll(() =>
      page.evaluate(() => {
        const panel = document.querySelector('[role="dialog"]')
        return !!panel && panel.contains(document.activeElement)
      }),
    )
    .toBe(true)

  await expect
    .poll(() =>
      page.evaluate(() => {
        const layer = document.querySelector('[data-modal-layer="side-drawer"]')
        const background = Array.from(document.body.children).filter(
          (element) => element !== layer,
        )
        return (
          background.length > 0 &&
          background.every((element) => element.hasAttribute('inert'))
        )
      }),
    )
    .toBe(true)

  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press('Tab')
    const focusInside = await page.evaluate(() => {
      const panel = document.querySelector('[role="dialog"]')
      return !!panel && panel.contains(document.activeElement)
    })
    expect(focusInside, `第 ${index + 1} 次 Tab 后焦点应留在抽屉内`).toBe(true)
  }

  await page.keyboard.press('Shift+Tab')
  await page.evaluate(() => window.history.back())
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  expect(new URL(page.url()).pathname).toBe('/')

  await trigger.click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(page.locator('[data-icp-license]:visible')).toHaveCount(0)
})
