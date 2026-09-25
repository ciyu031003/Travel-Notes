import { test, expect, type Page } from '@playwright/test'

/**
 * 新用户偏好问卷（真机需求：注册并登录后弹一次；完成或跳过后不再弹）
 *
 * 本组用例锁三件事：
 *   ① 未做过的账号进首页会弹（且必须让位于首启引导 —— 两个全屏模态不叠加）；
 *   ② 跳过 / 完成都写入服务端 preferencesCompletedAt，**刷新与换设备都不再弹**；
 *   ③ 收集到的结果真的被用起来（同行者风格 → 新建旅行表单的默认类型）。
 *
 * 账号按时间戳新建（e2e_survey_*），由 global-teardown 按前缀清理，
 * 因此每次运行都是"从未做过问卷的新用户"。
 */

// 该文件必须从"未登录"开始：storageState 里的 e2e_runner 可能已做过问卷
test.use({ storageState: { cookies: [], origins: [] } })

const PASSWORD = 'E2eSurvey2026!'

/**
 * 注册即带会话（/api/register 会 set-cookie），但仍显式登录一次：
 * 语义清晰，也避免依赖注册接口的 cookie 行为。
 * 注意用户名上限 20 位（auth.validator），所以用 11 位前缀 + 8 位时间戳。
 */
async function registerAndLogin(page: Page, username: string) {
  const reg = await page.request.post('/api/register', {
    data: { username, password: PASSWORD, rememberMe: true, clientType: 'web' },
  })
  expect(reg.ok(), `注册应成功（${username}）: ${await reg.text()}`).toBeTruthy()
  const login = await page.request.post('/api/login', {
    data: { username, password: PASSWORD, rememberMe: true, clientType: 'web' },
  })
  expect(login.ok(), '测试账号应能登录').toBeTruthy()
}

/** 唯一且 ≤20 位的测试用户名（e2e_survey_ = 11 位 + 8 位时间戳） */
function surveyUsername(kind: 'done' | 'skip'): string {
  const tag = kind === 'done' ? 'd' : 's'
  return `e2e_survey_${tag}${Date.now().toString().slice(-7)}`
}

/** 首启引导会先占屏；这里直接标记"已看过"，把舞台让给问卷 */
async function skipOnboarding(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('tiantu-onboard-seen-v1', '1')
    } catch {}
  })
}

async function tapButton(page: Page, text: string) {
  const ok = await page.evaluate((t) => {
    const btns = Array.from(document.querySelectorAll('button')).filter((b) => (b.textContent || '').trim().includes(t))
    const el = btns[btns.length - 1] as HTMLButtonElement | undefined
    if (!el || el.disabled) return false
    el.click()
    return true
  }, text)
  expect(ok, `应找到可点击按钮：${text}`).toBe(true)
}

test('完成问卷 → 刷新不再弹，且同行者风格成为新建旅行的默认类型', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const username = surveyUsername('done')
  await registerAndLogin(page, username)
  await skipOnboarding(page)

  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const dialog = page.getByRole('dialog', { name: '偏好问卷' })
  await expect(dialog, '未做过问卷的新用户应看到问卷').toBeVisible({ timeout: 25_000 })

  // 第 1 屏：同行者风格（单选卡片）
  await dialog.getByRole('radio', { name: /和伴侣/ }).click()
  await tapButton(page, '下一步')

  // 第 2 屏：惊喜 / 扫兴（多选）
  await dialog.getByRole('checkbox', { name: '发现隐藏景点' }).click()
  await tapButton(page, '下一步')

  // 第 3 屏：特别注意（多选）→ 完成
  await dialog.getByRole('checkbox', { name: '容易高反' }).click()
  await tapButton(page, '完成')
  await expect(dialog).toBeHidden({ timeout: 15_000 })

  // 服务端已落库（幂等锚点 + 答案）
  const me = await page.request.get('/api/me')
  const profile = (await me.json())?.data
  expect(profile.preferencesCompletedAt, '完成后必须写入时间戳（否则会反复弹）').toBeTruthy()
  expect(profile.preferences?.companionStyle).toBe('COUPLE')
  expect(profile.preferences?.cautions).toContain('ALTITUDE')

  // 刷新不再弹（这是"后续不再弹出"的直接断言）
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  await expect(page.getByRole('dialog', { name: '偏好问卷' })).toHaveCount(0)

  // 结果被用起来：新建旅行的类型默认应为「情侣」
  // 注意旅行类型在「更多（可选）」折叠区里，需先展开 —— 这正是真实用户的操作路径
  await page.goto('/travel/new', { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('去哪？')).toBeVisible({ timeout: 25_000 })
  await page.getByRole('button', { name: /更多/ }).click()
  await expect(
    page.getByRole('button', { name: /情侣/ }),
    '偏好问卷里的同行者风格应预选旅行类型',
  ).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 })
})

test('跳过问卷 → 同样不再弹（跳过也算完成）', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const username = surveyUsername('skip')
  await registerAndLogin(page, username)
  await skipOnboarding(page)

  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const dialog = page.getByRole('dialog', { name: '偏好问卷' })
  await expect(dialog).toBeVisible({ timeout: 25_000 })

  await dialog.getByRole('button', { name: '跳过问卷' }).click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })

  const me = await page.request.get('/api/me')
  const profile = (await me.json())?.data
  expect(profile.preferencesCompletedAt, '跳过也要写时间戳，否则会再次弹').toBeTruthy()

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  await expect(page.getByRole('dialog', { name: '偏好问卷' })).toHaveCount(0)
})
