import { test, expect, type Page } from '@playwright/test'

/**
 * **原生壳关键路径**回归（本地存储不可用 / 在线正常）。
 *
 * 为什么必须有这一组：连续四五个版本的真机问题，都发生在**原生分支**上，
 * 而此前所有 e2e 都跑在 Web 分支（`isNativePlatform()` 为 false 时走的是直连在线路径），
 * 于是"原生壳把本地队列当唯一真相"这类缺陷**永远测不出来**。
 *
 * 复现手法：在浏览器里注入 `window.Capacitor.isNativePlatform = () => true`。
 * 于是：
 *   · 应用走原生分支（写本地 SQLite + 入队 / 读本地兜底）；
 *   · 浏览器里**没有** CapacitorSQLite 插件，本地读写必然抛错 ——
 *     这恰好等价于真机上"本地库坏掉（列漂移 / 插件异常）"的那种状态。
 *
 * 契约（也就是用户要的结果）：
 *   即使本地存储完全不可用，只要在线，
 *   ① 新建旅行必须建成并直接进入详情（不得出现"服务器不存在、本机也没有离线副本"）；
 *   ② 不得残留「还在本地待同步」的横幅；
 *   ③ 加一天行程必须立刻可见；
 *   ④ 记一笔必须立刻可见；
 *   ⑤ 全程不得出现"加载失败"。
 */
async function useNativeShell(page: Page) {
  await page.addInitScript(() => {
    // 每个导航/iframe 都注入：模拟 Capacitor 运行时
    ;(window as unknown as { Capacitor: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      // 故意不提供 Plugins：与"插件不可用"的真机故障同构
    }
  })
}

async function tapButton(page: Page, text: string | RegExp) {
  const ok = await page.evaluate((t) => {
    const matches = Array.from(document.querySelectorAll('button')).filter((b) => {
      const label = (b.getAttribute('aria-label') || '').trim()
      const s = (b.textContent || '').trim()
      return typeof t === 'string'
        ? s.includes(t) || label === t
        : new RegExp(t.source, t.flags).test(s) || new RegExp(t.source, t.flags).test(label)
    })
    const target = matches[matches.length - 1] as HTMLButtonElement | undefined
    if (!target || target.disabled) return false
    target.click()
    return true
  }, text instanceof RegExp ? { source: text.source, flags: text.flags } : text)
  expect(ok, `应找到可点击的按钮：${text}`).toBe(true)
}

async function createTravelNative(page: Page): Promise<string> {
  const title = `原生壳记录 ${Date.now()}`
  await page.goto('/travel/new')

  await tapButton(page, '选择开始与结束日期')
  await expect(page.getByText(/^选择日期$/).first()).toBeVisible({ timeout: 20_000 })
  const days = page.locator('button[aria-label^="20"]')
  await days.nth(0).click()
  await days.nth(2).click()
  await tapButton(page, /^确定/)

  await page.getByLabel('去哪？').fill('大理')
  await page.getByLabel('给这段旅程起个名字').fill(title)
  await tapButton(page, '开始记录')

  await page.waitForURL((u) => u.pathname.startsWith('/travel/') && u.pathname !== '/travel/new', { timeout: 30_000 })
  return title
}

test.describe('原生壳（本地存储不可用 + 在线）', () => {
  test('新建旅行 → 直接进详情，不出现「服务器不存在/待同步」', async ({ page }) => {
    await useNativeShell(page)
    await page.setViewportSize({ width: 390, height: 844 })

    const title = await createTravelNative(page)

    // ① 详情页必须真的渲染出来（标题可见）
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 25_000 })
    // ⑤ 不得是失败态
    await expect(page.getByText('旅行加载失败')).toHaveCount(0)
    await expect(page.getByText('本机也没有它的离线副本')).toHaveCount(0)
    // ② 不得残留待同步横幅
    await expect(page.getByText(/还在本地待同步/)).toHaveCount(0)
    // 四个 tab 都在 → 可继续操作
    await expect(page.getByRole('tab', { name: '行程' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('tab', { name: '花销' })).toBeVisible()
    // 有编辑入口（能改才说明 canEdit 为真）
    await expect(page.getByRole('button', { name: /编辑信息/ })).toBeVisible()
  })

  test('新建 → 加一天行程 → 立刻可见', async ({ page }) => {
    await useNativeShell(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await createTravelNative(page)

    await page.getByRole('tab', { name: '行程' }).click()
    const spot = `崇圣寺三塔 ${Date.now()}`
    await tapButton(page, '添加行程')
    const sheet = page.getByRole('dialog', { name: '添加行程' })
    await expect(sheet).toBeVisible({ timeout: 15_000 })
    await sheet.getByPlaceholder('例如 喀纳斯湖').fill(spot)
    await tapButton(page, '添加行程')
    await expect(sheet).toBeHidden({ timeout: 15_000 })
    // ③ 立刻可见 = 真的写到了服务端（本地存储此时是不可用的）
    await expect(page.getByText(spot).first()).toBeVisible({ timeout: 25_000 })
  })

  test('新建 → 记一笔 → 立刻可见', async ({ page }) => {
    await useNativeShell(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await createTravelNative(page)

    await page.getByRole('tab', { name: '行程' }).click()
    const note = `在洱海边坐了一下午 ${Date.now()}`
    await tapButton(page, '记一笔')
    const sheet = page.getByRole('dialog', { name: '记一笔' })
    await expect(sheet).toBeVisible({ timeout: 15_000 })
    await sheet.getByPlaceholder('例如 在喀纳斯的第一天').fill(note)
    await tapButton(page, /^保存$/)
    await expect(sheet).toBeHidden({ timeout: 25_000 })
    // ④ 立刻可见
    await expect(page.getByText(note).first()).toBeVisible({ timeout: 25_000 })
  })

  test('刷新详情页后内容仍在（证明确实落到了服务端，而不是只活在内存里）', async ({ page }) => {
    await useNativeShell(page)
    await page.setViewportSize({ width: 390, height: 844 })
    const title = await createTravelNative(page)
    const note = `落库校验 ${Date.now()}`
    await page.getByRole('tab', { name: '行程' }).click()
    await tapButton(page, '记一笔')
    const sheet = page.getByRole('dialog', { name: '记一笔' })
    await sheet.getByPlaceholder('例如 在喀纳斯的第一天').fill(note)
    await tapButton(page, /^保存$/)
    await expect(sheet).toBeHidden({ timeout: 25_000 })

    // 硬刷新：本地缓存已清空，只能从服务端读
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 25_000 })
    await page.getByRole('tab', { name: '行程' }).click()
    await expect(page.getByText(note).first()).toBeVisible({ timeout: 25_000 })
  })
})
