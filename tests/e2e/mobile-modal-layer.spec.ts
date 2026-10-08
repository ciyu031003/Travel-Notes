import { test, expect } from '@playwright/test'

test.use({
  viewport: { width: 390, height: 844 },
  storageState: { cookies: [], origins: [] },
})

test('BottomSheet 挂载到 body 并隔离背景、恢复焦点', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })

  const trigger = page.getByRole('button', { name: '相册解锁' })
  await trigger.click()

  const dialog = page.getByRole('dialog', { name: '底部面板' })
  await expect(dialog).toBeVisible()

  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        return (
          element.closest('[data-modal-layer="bottom-sheet"]')?.parentElement ===
          document.body
        )
      }),
    )
    .toBe(true)

  await expect
    .poll(() =>
      page.evaluate(() => {
        const layer = document.querySelector('[data-modal-layer="bottom-sheet"]')
        const background = Array.from(document.body.children).filter(
          (element) => element !== layer,
        )
        return (
          document.body.style.overflow === 'hidden' &&
          background.length > 0 &&
          background.every((element) => element.hasAttribute('inert'))
        )
      }),
    )
    .toBe(true)

  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press('Tab')
    await expect
      .poll(() =>
        dialog.evaluate((element) => element.contains(document.activeElement)),
      )
      .toBe(true)
  }

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('')
})

test('平台返回先关底部面板，不离开当前页面', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })

  const trigger = page.getByRole('button', { name: '相册解锁' })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '底部面板' })
  await expect(dialog).toBeVisible()

  await page.evaluate(() => window.history.back())
  await expect(dialog).toBeHidden()
  expect(new URL(page.url()).pathname).toBe('/login')
  await expect(trigger).toBeFocused()
})

test('系统减少动态效果时，底部面板关闭 CSS 动效', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '相册解锁' }).click()

  const sheet = page.getByRole('dialog', { name: '底部面板' })
  await expect(sheet).toBeVisible()
  const motion = await sheet.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      animationName: style.animationName,
      transitionDuration: style.transitionDuration,
    }
  })
  expect(motion.animationName).toBe('none')
  expect(motion.transitionDuration).toBe('0s')
})
