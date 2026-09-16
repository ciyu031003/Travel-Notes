import { test, expect, type Page } from '@playwright/test'

/**
 * 互动冒烟（已登录）：
 * 1. 建旅行 — /travel/new 全屏新建页（Dock 栏「+」跳入，独立页面非弹窗）。
 *    2026-09-16 改版后：目的地 / 日期区间 / 名称 三项为核心，建完**直接进该旅行详情页**。
 * 2. 日期区间：选两天 → 实时算出「共 N 天 M 晚」。
 * 3. 发碎碎念 — /moments MomentComposer（Web 在线直发）。
 * 测试数据由 global-teardown 按 e2e_runner 名下清理。
 *
 * ⚠️ 测试里**先选日期再填目的地**，是有意为之：
 * 目的地输入框会弹出城市联想列表，它浮在日期按钮上方（真实用户不会受影响，
 * 因为列表就在他手指下面，他会先选一项或收起）。先选日期可以把这条与业务无关的
 * 点击时序从测试路径里去掉，让用例只验证业务契约。
 */

/**
 * 按可见文本点击一个 button —— 用原生 `el.click()` 而不是坐标点击。
 *
 * 为什么不用 Playwright 的 `.click()`：本页底部是 `sticky bottom-[76px]` 固定操作条，
 * 点击瞬间页面（软键盘/滚动）会有位移，Playwright 的坐标点击在这种元素上**只派发了
 * pointerdown、没派发 click**（实测：`native-pointerdown` 有、`click` 无），
 * 于是 React 的 onClick / 表单提交都不触发——看起来像"按钮点了没反应"。
 * 这不是产品缺陷（真实手指点击正常，探针里 `el.click()` 一次就跳转到详情页），
 * 因此测试改用原生点击，避免把浏览器事件时序问题误判成业务问题。
 */
async function tapButton(page: Page, text: string | RegExp) {
  const ok = await page.evaluate((t) => {
    const matches = Array.from(document.querySelectorAll('button')).filter((b) => {
      const s = (b.textContent || '').trim()
      return typeof t === 'string' ? s.includes(t) : new RegExp(t.source, t.flags).test(s)
    })
    const target = matches[matches.length - 1] as HTMLButtonElement | undefined
    if (!target || target.disabled) return false
    target.click()
    return true
  }, text instanceof RegExp ? { source: text.source, flags: text.flags } : text)
  expect(ok, `应找到可点击的按钮：${text}`).toBe(true)
}

/** 打开日期面板，选第 a、b 个可选日期，返回面板内显示的天数文案 */
async function pickRange(page: Page, a: number, b: number): Promise<string> {
  await tapButton(page, '选择开始与结束日期')
  await expect(page.getByText(/^选择日期$/).first()).toBeVisible({ timeout: 20_000 })

  const days = page.locator('button[aria-label^="20"]')
  expect(await days.count(), '日期网格应渲染出可点日期').toBeGreaterThan(a + 1)
  await days.nth(a).click()
  await days.nth(b).click()

  const summary = page.getByText(/共 \d+ 天 \d+ 晚/).first()
  await expect(summary).toBeVisible({ timeout: 10_000 })
  const text = (await summary.textContent()) ?? ''
  await tapButton(page, /^确定/)
  return text
}

test('新建旅行（日期+目的地+名称）→ 直接进入该旅行详情页', async ({ page }) => {
  const title = `E2E 冒烟旅行 ${Date.now()}`
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/travel/new')

  // ① 日期区间：一处选完，面板里实时算天数（改版的核心体验之一）
  const summary = await pickRange(page, 0, 2)
  // 字段里同时带天数与出发日副标题，例如「共 3 天 2 晚 · 8月31日 周一出发 · 至 9月2日」
  expect(summary, `字段应显示天数，实际「${summary}」`).toContain('共 3 天 2 晚')
  expect(summary, '应同时给出出发日与星期').toMatch(/出发/)

  // ② 目的地
  const locationInput = page.getByLabel('去哪？')
  await expect(locationInput).toBeVisible({ timeout: 20_000 })
  await locationInput.fill('南京')

  // ③ 名称：目的地 + 天数应已自动长出来
  const titleInput = page.getByLabel('给这段旅程起个名字')
  await expect(titleInput, '标题应由目的地+天数自动生成').toHaveValue(/南京/, { timeout: 10_000 })
  await titleInput.fill(title)

  // ④ 提交 → 建完直接进详情页
  await tapButton(page, '开始记录')
  // 注意：不能只匹配 /travel/<x>，因为 /travel/new 本身就符合该形状
  await page.waitForURL((u) => u.pathname.startsWith('/travel/') && u.pathname !== '/travel/new', { timeout: 30_000 })
  expect(page.url()).not.toContain('/travel/new')
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 25_000 })

  // ⑤ 详情页应显示目的地 —— 证明 location 真写进去了（画册按城市成册依赖它）
  await expect(page.getByText('南京').first()).toBeVisible({ timeout: 15_000 })

  // ⑥ 新建旅行没有内容 → 应有"还没有记录"引导，而不是空白页
  await expect(page.getByText(/还没有记录/)).toBeVisible({ timeout: 15_000 })
})

test('新建旅行：只选一天 → 共 1 天 0 晚，可提交', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/travel/new')

  await tapButton(page, '选择开始与结束日期')
  await expect(page.getByText(/^选择日期$/).first()).toBeVisible({ timeout: 20_000 })
  const days = page.locator('button[aria-label^="20"]')
  await days.nth(0).click()

  // 只选一天：按钮文案变为「确定（单日）」
  const singleBtn = page.getByRole('button', { name: /确定（单日）/ })
  await expect(singleBtn).toBeVisible()
  await tapButton(page, /确定（单日）/)

  await expect(page.getByText(/共 1 天 0 晚/).first()).toBeVisible()
  // 填个名字即可提交（其余都是可选项）
  await page.getByLabel('给这段旅程起个名字').fill(`E2E 一日游 ${Date.now()}`)
  await expect(page.getByRole('button', { name: '开始记录' })).toBeEnabled()
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
