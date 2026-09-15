import { expect, type Page } from '@playwright/test'

/** 断言页面正常渲染：无 Next 崩溃占位、无横向滚动、关键锚点可见 */
export async function expectPageHealthy(page: Page, marker?: string) {
  await expect(page.locator('body')).not.toContainText('Application error', { timeout: 20_000 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, '横向溢出 px').toBeLessThanOrEqual(0)
  if (marker) {
    // 必须过滤出「可见」的匹配项再断言：
    // 本项目大量使用响应式双渲染（移动端 md:hidden 块 + 桌面 hidden md:flex 块），
    // 同一文案在 DOM 里出现两次，且移动端块通常排在前面 —— 直接 .first()
    // 会命中当前断点下 display:none 的那个，导致断言必然失败（与页面是否正常无关）。
    // 测试意图是「关键锚点文本在当前视口下可见」，因此这里只取可见项。
    await expect(page.getByText(marker).filter({ visible: true }).first()).toBeVisible()
  }
}
