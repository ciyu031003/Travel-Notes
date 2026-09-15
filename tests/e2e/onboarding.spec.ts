import { test, expect } from '@playwright/test'

/**
 * 首次启动引导（Onboarding）行为回归。
 *
 * 背景：Onboarding 是全屏模态（z-60）。曾被挂在全局 layout，导致**任何深链首次
 * 打开都被挡住**（他人分享的 /travel/xxx、/travel/new 记录流程），用户必须先关掉
 * 引导才能看到目标内容 —— 该缺陷正是被 interact.spec 抓到的。
 *
 * 现约定：只在**首页**首次进入时展示；深层路由不展示。
 * 本用例锁住该契约，避免回归。
 */
test.describe('首次启动引导', () => {
  const dialog = (page: import('@playwright/test').Page) =>
    page.getByRole('dialog', { name: '首次使用引导' })

  test('首页首次进入展示引导，完成后写入标记不再出现', async ({ page }) => {
    // 引导仅移动端展示（md:hidden）
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    await expect(dialog(page)).toBeVisible({ timeout: 20_000 })
    // 三屏结构
    await expect(page.getByText('第 1 / 3 步')).toBeVisible()
    await expect(page.getByRole('button', { name: /下一步/ })).toBeVisible()

    // 走完全部 → 写入 localStorage 标记并关闭
    await page.getByRole('button', { name: /下一步/ }).click()
    await expect(page.getByText('第 2 / 3 步')).toBeVisible()
    await page.getByRole('button', { name: /下一步/ }).click()
    await expect(page.getByText('第 3 / 3 步')).toBeVisible()
    await page.getByRole('button', { name: /开始记录/ }).click()

    await expect(dialog(page)).toBeHidden()
    const seen = await page.evaluate(() => localStorage.getItem('tiantu-onboard-seen-v1'))
    expect(seen).toBe('1')

    // 再次进入首页不再弹出
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await expect(dialog(page)).toBeHidden()
  })

  test('深链（非首页）不展示引导，不遮挡目标内容', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/travel/new')
    await page.waitForLoadState('domcontentloaded')

    // 引导不得出现
    await expect(dialog(page)).toBeHidden()
    // 目标内容可直接交互（此前正是被引导遮罩拦截）
    await expect(page.getByPlaceholder('旅行名称（必填）')).toBeVisible({ timeout: 20_000 })
  })

  test('跳过按钮同样写入标记', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await expect(dialog(page)).toBeVisible({ timeout: 20_000 })

    await page.getByRole('button', { name: '跳过引导' }).click()
    await expect(dialog(page)).toBeHidden()
    const seen = await page.evaluate(() => localStorage.getItem('tiantu-onboard-seen-v1'))
    expect(seen).toBe('1')
  })
})
