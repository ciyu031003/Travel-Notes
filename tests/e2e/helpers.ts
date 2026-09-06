import { expect, type Page } from '@playwright/test'

/** 断言页面正常渲染：无 Next 崩溃占位、无横向滚动 */
export async function expectPageHealthy(page: Page, marker?: string) {
  await expect(page.locator('body')).not.toContainText('Application error', { timeout: 20_000 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, '横向溢出 px').toBeLessThanOrEqual(0)
  if (marker) await expect(page.getByText(marker).first()).toBeVisible()
}
