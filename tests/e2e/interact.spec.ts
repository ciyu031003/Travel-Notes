import { test, expect } from '@playwright/test'

/**
 * 互动冒烟（已登录）：
 * 1. 建旅行 — /travel?compose=1 移动端自动弹出的 TravelComposer（Web 端唯一新建入口）。
 * 2. 发碎碎念 — /moments MomentComposer（Web 在线直发）。
 * 测试数据由 global-teardown 按 e2e_runner 名下清理。
 */

test('新建旅行（标题+类型）→ 列表可见', async ({ page }) => {
  const title = `E2E 冒烟旅行 ${Date.now()}`
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/travel?compose=1')

  const titleInput = page.getByPlaceholder('旅行名称（必填）')
  await expect(titleInput).toBeVisible({ timeout: 20_000 })
  await titleInput.fill(title)
  await page.getByRole('button', { name: '独旅', exact: true }).click()
  await page.getByRole('button', { name: /保存/ }).click()

  // 发布成功后列表刷新出现新旅行（断言可见的移动端卡片链接；桌面列表在 390px 下 display:none 会误报 hidden）
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible({ timeout: 20_000 })
})

test('发碎碎念 → 时间线可见', async ({ page }) => {
  const text = `E2E 冒烟碎碎念 ${Date.now()}`
  await page.goto('/moments')

  const box = page.getByPlaceholder(/记录此刻的想法/)
  await expect(box).toBeVisible({ timeout: 20_000 })
  await box.fill(text)
  await page.getByRole('button', { name: /发布/ }).click()

  await expect(page.getByText('发布成功')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 20_000 })
})
