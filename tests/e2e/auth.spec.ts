import { test, expect } from '@playwright/test'
import { E2E_USER } from './global-setup'

/**
 * 登录 UI 冒烟：开门动画走 seen 直开路径（sessionStorage），
 * 用全新 context（覆盖默认 storageState），成功后退出登录。
 */
test.use({ storageState: { cookies: [], origins: [] } })

test('登录页 UI 登录 → 进入应用 → 退出登录', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('login-door-seen', '1'))
  await page.goto('/login')
  await expect(page.getByText('登录你的旅行记忆空间')).toBeVisible({ timeout: 20_000 })

  await page.locator('input[type="text"]').fill(E2E_USER.username)
  await page.locator('input[type="password"]').fill(E2E_USER.password)
  await page.getByRole('button', { name: '解锁', exact: true }).click()

  // 登录成功：默认 redirect=/ ，应用首页渲染（本地 dev 的 / 即应用首页）
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20_000 })
  await expect(page.locator('body')).not.toContainText('Application error')

  // 退出登录：R4 起「我的」页只留旅行档案，退出按钮在右上角 ≡ 的抽屉底部
  await page.goto('/me')
  await page.getByRole('button', { name: '设置与记录入口' }).click()
  await expect(page.getByRole('dialog', { name: '记录与设置' })).toBeVisible({ timeout: 15_000 })
  const logout = page.getByRole('button', { name: /退出登录/ })
  await expect(logout).toBeVisible({ timeout: 20_000 })
  await logout.click()
  await page.waitForURL(u => u.pathname.startsWith('/login'), { timeout: 20_000 })
})

test('未登录访问受保护页 → 307 到登录页并带 redirect', async ({ page }) => {
  await page.goto('/timeline')
  await page.waitForURL(/\/login\?redirect=%2Ftimeline/, { timeout: 20_000 })
  await expect(page.getByText('登录你的旅行记忆空间')).toBeVisible()
})
