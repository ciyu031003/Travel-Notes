import { test, expect, type Page } from '@playwright/test'

/**
 * 「进行中的旅行 → 完成并归档」闭环（真机需求原文：
 * "新建旅行后在首页做一个大大的入口…用户确认后就自动添加到旅行画册和最近旅行模块里面"）。
 *
 * 契约：
 *  ① 新建的旅行在首页以「进行中的旅行」大卡片出现（含添加照片 / 安排行程入口）；
 *  ② 未归档时它**不在**「最近旅行」里；
 *  ③ 点「完成并归档」后卡片消失、该旅行进入「最近旅行」；
 *  ④ 归档接口幂等（重复调用不改首次归档时间）。
 */

async function tapButton(page: Page, text: string | RegExp) {
  const ok = await page.evaluate((t) => {
    const btns = Array.from(document.querySelectorAll('button')).filter((b) => {
      const s = (b.textContent || '').trim()
      return typeof t === 'string' ? s.includes(t) : new RegExp(t.source, t.flags).test(s)
    })
    const el = btns[btns.length - 1] as HTMLButtonElement | undefined
    if (!el || el.disabled) return false
    el.click()
    return true
  }, text instanceof RegExp ? { source: text.source, flags: text.flags } : text)
  expect(ok, `应找到可点击按钮：${text}`).toBe(true)
}

/** 按接口建一本旅行（等价于新建表单提交，但更快更稳），返回 { id, title, slug } */
async function createDraftViaApi(page: Page) {
  const title = `E2E 进行中旅行 ${Date.now()}`
  const res = await page.request.post('/api/admin/travels', {
    data: { title, location: '成都', startDate: new Date().toISOString().slice(0, 10), travelType: 'COUPLE' },
  })
  expect(res.ok(), '建旅行接口应成功').toBeTruthy()
  const j = await res.json()
  return { id: j.id as number, title, slug: j.slug as string }
}

test.use({ viewport: { width: 390, height: 844 } })

/**
 * 前几轮用例（或手工验证）可能留下未归档的草稿 —— 先全部归档，
 * 保证断言面对的是干净状态（否则"卡片消失"会被别的草稿干扰）。
 */
test.beforeEach(async ({ page }) => {
  const home = await page.request.get('/api/home')
  const j = await home.json().catch(() => null)
  for (const d of (j?.draftTravels ?? []) as { id: number }[]) {
    await page.request.post(`/api/travels/${d.id}/confirm`)
  }
})

test('新建旅行 → 首页大入口 → 完成并归档 → 进入最近旅行', async ({ page }) => {
  await page.goto('/me') // 确保已登录（沿用全局 storageState）
  const draft = await createDraftViaApi(page)

  // ① 首页出现「进行中的旅行」大卡片
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('进行中的旅行').first()).toBeVisible({ timeout: 25_000 })
  await expect(page.getByText(draft.title).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('link', { name: /添加照片/ }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: /安排行程/ }).first()).toBeVisible()

  // ② 未归档：不在「最近旅行」里
  const recentSection = page.locator('section', { hasText: '最近旅行' }).last()
  await expect(recentSection.getByText(draft.title)).toHaveCount(0)

  // ③ 归档
  await tapButton(page, '完成并归档')
  await expect(page.getByText('已归档，已加入旅行画册与最近旅行').first()).toBeVisible({ timeout: 20_000 })

  // 该卡片消失（归档后不再属于"进行中"），并进入最近旅行
  const draftSection = page.locator('section', { hasText: '进行中的旅行' })
  await expect(draftSection.getByText(draft.title), '归档后不该再出现在进行中').toHaveCount(0, {
    timeout: 20_000,
  })
  await expect(page.getByText(draft.title).first()).toBeVisible({ timeout: 20_000 })

  // ④ 幂等：再调一次接口，归档时间不变
  const first = await page.request.post(`/api/travels/${draft.id}/confirm`)
  const firstAt = (await first.json()).confirmedAt
  const second = await page.request.post(`/api/travels/${draft.id}/confirm`)
  const secondAt = (await second.json()).confirmedAt
  expect(secondAt).toBe(firstAt)
})

test('未归档的旅行不进入旅行画册', async ({ page }) => {
  const draft = await createDraftViaApi(page)
  const books = await page.request.get('/api/travel-book')
  const body = await books.text()
  expect(body, '草稿不该出现在画册数据里').not.toContain(draft.slug)
})
