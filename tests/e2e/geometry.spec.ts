import { test } from '@playwright/test'
import { expectPageHealthy } from './helpers'

/**
 * 360px 小屏几何回归（固化 M4d 走查）：
 * 全部核心页在小屏断言无横向溢出、无崩溃占位。
 */
const PAGES = ['/', '/travel', '/timeline', '/moments', '/circle', '/me', '/dashboard', '/sync']

test.describe.configure({ mode: 'serial' })

test.describe('360px 小屏回归', () => {
  test.use({ viewport: { width: 360, height: 740 } })

  for (const path of PAGES) {
    test(`无横向溢出 ${path}`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('domcontentloaded')
      await expectPageHealthy(page)
    })
  }
})
