import { test, expect, type Page } from '@playwright/test'
import { expectPageHealthy } from './helpers'

/**
 * 设置页导航回归（R3 修的两个真机 bug）。
 *
 * 真机反馈：
 *  ① 「我的 → 数据与同步」等设置项进去以后**没有返回按钮**；
 *  ② 点「账号设置 / 管理后台」直接回到首页，**回到首页后底部 tab 也没了**。
 *
 * 根因（两个都在这组用例里钉死）：
 *  · 移动端返回键只存在于 `hidden md:flex` 的桌面页头里；大标题没有返回，
 *    而次级页面又渲染的是**桌面 Navbar**（同样没有返回）。
 *  · 「账号设置」原来链到 `/admin/settings`，而 `/admin/**` 在原生壳里没有打包；
 *    同时 `LayoutContent` 把 `/admin` 排除在「挂底部 tab」之外 ——
 *    于是进去以后整页没有导航，退无可退。
 */

async function tapLink(page: Page, text: string) {
  const ok = await page.evaluate((needle) => {
    const els = Array.from(document.querySelectorAll('a'))
    const target = els.find((el) => (el.textContent || '').includes(needle))
    if (!target) return false
    ;(target as HTMLElement).click()
    return true
  }, text)
  expect(ok, `应找到链接：${text}`).toBe(true)
}

/**
 * 打开「我的」页右上角 ≡ 的右侧半屏抽屉。
 * R4 重构：记录与设置类入口从页面主体搬进了这个抽屉（页面只留旅行档案），
 * 所以任何"从我的进入设置页"的用例都必须先开抽屉。
 */
async function openDrawer(page: Page) {
  await page.getByRole('button', { name: '设置与记录入口' }).click()
  await expect(page.getByRole('dialog', { name: '记录与设置' })).toBeVisible({ timeout: 15_000 })
}

test.use({ viewport: { width: 390, height: 844 } })

test('「我的」页的设置项都指向存在且有返回键的页面', async ({ page }) => {
  await page.goto('/me')
  await page.getByRole('heading', { name: '我的' }).first().waitFor({ timeout: 25_000 })
  await openDrawer(page)

  // 账号设置必须指向移动端可用页（不再指向 /admin/**）
  const settingsHref = await page
    .locator('a')
    .evaluateAll((els) =>
      els
        .filter((e) => (e.textContent || '').includes('账号设置'))
        .map((e) => e.getAttribute('href') || ''),
    )
  expect(settingsHref.length, '应存在「账号设置」入口').toBeGreaterThan(0)
  for (const href of settingsHref) {
    expect(href, '账号设置不该指向 /admin（原生壳没打包这个前缀）').not.toContain('/admin')
  }

  // 数据与同步（次级页）必须有返回键
  await page.goto('/sync')
  await expect(page.getByRole('heading', { name: '数据与同步' }).first()).toBeVisible({ timeout: 25_000 })
  await expect(page.getByRole('button', { name: '返回' })).toBeVisible()
})

test('设置子页返回键可用；底部 tab 在次级页面始终在位', async ({ page }) => {
  await page.goto('/me')
  await page.getByRole('heading', { name: '我的' }).first().waitFor({ timeout: 25_000 })

  // 从「我的」进「数据与同步」（R4 起入口在右上角抽屉里）
  await openDrawer(page)
  await tapLink(page, '数据与同步')
  await page.waitForURL('**/sync', { timeout: 20_000 })
  await expect(page.getByRole('heading', { name: '数据与同步' }).first()).toBeVisible({ timeout: 25_000 })

  // 底部 tab 必须在（这是用户在移动端唯一的"退路"）
  await expect(page.getByRole('navigation', { name: '移动端导航' })).toBeVisible()

  // 返回键回得到「我的」
  await page.getByRole('button', { name: '返回' }).click()
  await expect(page.getByRole('heading', { name: '我的' }).first()).toBeVisible({ timeout: 25_000 })
})

for (const path of ['/me/settings', '/sync', '/moments', '/timeline', '/search']) {
  test(`次级页面 ${path}：有返回键且底部 tab 在位`, async ({ page }) => {
    await page.goto(path)
    await expectPageHealthy(page)
    await expect(page.getByRole('button', { name: '返回' })).toBeVisible({ timeout: 25_000 })
    await expect(page.getByRole('navigation', { name: '移动端导航' })).toBeVisible()
  })
}

test('/admin 也挂底部 tab（避免从「我的」误入后台后无路可退）', async ({ page }) => {
  await page.goto('/admin')
  // 后台会做一次登录态检查，可能跳 /admin/login；两者都不该"整页无导航"
  await page.waitForTimeout(2500)
  const pathname = new URL(page.url()).pathname
  if (pathname.startsWith('/admin')) {
    await expect(page.getByRole('navigation', { name: '移动端导航' })).toBeVisible({ timeout: 20_000 })
  }
})
