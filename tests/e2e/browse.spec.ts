import { test, expect } from '@playwright/test'
import { expectPageHealthy } from './helpers'

/**
 * 核心页面浏览冒烟（已登录 storageState）：
 * 每页断言 — 无崩溃占位 / 无横向滚动 / 关键锚点文本可见。
 */
const PAGES: { path: string; marker?: string }[] = [
  { path: '/' },
  { path: '/travel', marker: '管理旅行' },
  { path: '/timeline', marker: '走过的时光' },
  { path: '/moments', marker: '碎碎念' },
  { path: '/circle' },
  { path: '/me', marker: '我的旅行档案' },
  { path: '/dashboard', marker: '我的旅行足迹' },
  { path: '/sync' },
  { path: '/album' },
]

test.describe.configure({ mode: 'serial' })

for (const { path, marker } of PAGES) {
  test(`浏览 ${path}`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('domcontentloaded')
    await expectPageHealthy(page, marker)
  })
}

test('核心页面登录态下可见品牌「行迹」', async ({ page }) => {
  await page.goto('/timeline')
  await expect(page.getByText('行迹').first()).toBeVisible({ timeout: 20_000 })
})
