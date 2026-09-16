import { test, expect } from '@playwright/test'

/**
 * 会话失效回归（真机复现的 bug）
 *
 * 现象：未登录时打开「我的」一直转圈，点 + 登录后才显示。
 * 根因：中间件对受保护**接口**返回 307 → /login（不是 401）。旧 apiFetch 让 fetch 跟随
 * 重定向，拿到登录页 HTML：res.ok === true、JSON.parse 失败 → json=null →
 * 既不抛错也无数据 → useApi 得到 data=null/error=''/loading=false →
 * 页面条件 `loading || !profile` 恒真 → 永远「正在加载你的旅行档案…」。
 *
 * 这里用路由拦截**复现中间件的 307 行为**（不依赖真实未登录态，因为 storageState 是已登录的），
 * 断言页面必须离开「加载中」并给出登录引导，而不是一直转圈。
 */

test('受保护接口返回 307 时，「我的」不再永久转圈而是跳登录', async ({ page }) => {
  // 复现中间件行为：受保护接口 → 307 /login?redirect=...
  await page.route('**/api/me', async (route) => {
    await route.fulfill({
      status: 307,
      headers: { location: '/login?redirect=%2Fme' },
    })
  })

  await page.goto('/me')

  // 必须离开永久加载态：要么已跳登录页，要么显示「正在跳转登录」
  await expect
    .poll(
      async () => {
        const url = page.url()
        const body = (await page.locator('body').innerText().catch(() => '')) || ''
        if (url.includes('/login')) return 'login'
        if (body.includes('跳转登录')) return 'redirecting'
        if (body.includes('正在加载你的旅行档案')) return 'spinner'
        return 'other'
      },
      { timeout: 25_000, message: '页面应离开加载态并进入登录流程' },
    )
    .not.toBe('spinner')

  // 最终落到登录页
  await page.waitForURL(/\/login/, { timeout: 25_000 })
  expect(page.url()).toContain('redirect')
})

test('网络错误时「我的」显示错误态 + 重试（不再冒充加载中）', async ({ page }) => {
  await page.route('**/api/me', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: '服务器开小差了' }),
    })
  })

  await page.goto('/me')
  await expect(page.getByText('个人档案加载失败')).toBeVisible({ timeout: 25_000 })
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
})

test('粉丝/关注页在 307 时也离开加载态', async ({ page }) => {
  await page.route('**/api/me', async (route) => {
    await route.fulfill({ status: 307, headers: { location: '/login?redirect=%2Fme%2Ffollowers' } })
  })

  await page.goto('/me/followers')
  await expect
    .poll(
      async () => {
        const url = page.url()
        const body = (await page.locator('body').innerText().catch(() => '')) || ''
        if (url.includes('/login')) return 'login'
        if (body.includes('跳转登录')) return 'redirecting'
        if (body.includes('正在加载')) return 'spinner'
        return 'other'
      },
      { timeout: 25_000 },
    )
    .not.toBe('spinner')
})
