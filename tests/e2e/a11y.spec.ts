import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * 可访问性基线（1.21.0 新增 · P1-4 扩面）。
 *
 * 覆盖两层：
 *  ① 匿名态：未登录用户第一眼看到的页面（/login /admin/login /download）；
 *  ② 登录态：主流程页面（首页 / 旅行 / 旅行圈 / 我的 / 时间线 / 碎碎念 / 搜索）。
 *
 * ⚠️ 匿名组必须显式清空 storageState：playwright.config 全局注入了登录态，
 * 而这一组要验的正是"未登录用户看到的页面"。若沿用登录态，/login 一旦加了
 * "已登录则跳转"，用例会静默扫到别的页面（假绿）。
 * 登录组则**沿用**全局 storageState —— 这正是 1.21.0 只测 3 个匿名页时缺的另一半：
 * 登录后才是产品主路径，此前零覆盖。
 *
 * 断言口径：
 *  · critical / serious → 失败（读屏用户无法完成核心操作）；
 *  · moderate / minor   → 不计失败，避免用例随视觉微调而碎；
 *  · P1-4 起 axe 规则集加入 WCAG 2.2（wcag22aa）—— 其中 2.5.8 目标尺寸 24×24
 *    与 2.4.13 焦点外观与本项目直接相关（规范 §8 的 44×44 更严，但仍需自动兜底）。
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function auditAndAssert(
  page: import('@playwright/test').Page,
  path: string,
  name: string,
) {
  await page.goto(path, { waitUntil: 'networkidle' })
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()

  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  )
  if (blocking.length > 0) {
    const summary = blocking
      .map((v) => `${v.id}(${v.impact}): ${v.nodes.length} 处，示例 ${v.nodes[0]?.target.join(' ')}`)
      .join('\n')
    console.log(`[a11y] ${path} 违规：\n${summary}`)
  }
  expect(blocking, `${name} 存在 critical/serious 级可访问性违规`).toHaveLength(0)
}

/* ── ① 匿名态（不继承登录态）────────────────────────────────────────────── */
test.describe('匿名态', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  const ANON_PAGES = [
    { path: '/login', name: '登录页' },
    { path: '/admin/login', name: '后台登录页' },
    { path: '/download', name: 'APK 下载页' },
  ]

  for (const { path, name } of ANON_PAGES) {
    test(`a11y · ${name}（${path}）无 critical/serious 违规`, async ({ page }) => {
      await auditAndAssert(page, path, name)
    })
  }

  test('a11y · 登录页表单控件均可命名（label 关联）', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' })
    // 与 1.20.0 的 htmlFor/id 修复呼应：纯图标按钮必须有可读名
    const unnamed = await page.evaluate(() => {
      const bad: string[] = []
      for (const el of Array.from(document.querySelectorAll('button, a'))) {
        const text = (el.textContent || '').trim()
        const label =
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          el.querySelector('img[alt]')?.getAttribute('alt')
        if (!text && !label) bad.push(el.outerHTML.slice(0, 80))
      }
      return bad
    })
    expect(unnamed, `存在无可读名的按钮/链接：${unnamed.join(' | ')}`).toHaveLength(0)
  })
})

/* ── ② 登录态主流程（沿用全局 storageState）────────────────────────────── */
const AUTH_PAGES = [
  { path: '/', name: '首页' },
  { path: '/travel', name: '旅行列表' },
  { path: '/circle', name: '旅行圈' },
  { path: '/me', name: '我的' },
  { path: '/timeline', name: '时间线' },
  { path: '/moments', name: '碎碎念' },
  { path: '/search', name: '搜索' },
]

for (const { path, name } of AUTH_PAGES) {
  test(`a11y · ${name}（${path}）无 critical/serious 违规`, async ({ page }) => {
    await auditAndAssert(page, path, name)
  })
}

test('a11y · 主流程页面不存在无可读名的按钮/链接', async ({ page }) => {
  // 纯图标按钮靠 aria-label 命名；这条兜住"新加的图标按钮忘了给名字"。
  for (const { path } of AUTH_PAGES) {
    await page.goto(path, { waitUntil: 'networkidle' })
    const unnamed = await page.evaluate(() => {
      const bad: string[] = []
      for (const el of Array.from(document.querySelectorAll('button, a'))) {
        const text = (el.textContent || '').trim()
        const label =
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          el.querySelector('img[alt]')?.getAttribute('alt')
        if (!text && !label) bad.push(el.outerHTML.slice(0, 80))
      }
      return bad
    })
    expect(unnamed, `${path} 存在无可读名的按钮/链接：${unnamed.join(' | ')}`).toHaveLength(0)
  }
})
