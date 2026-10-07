import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * 可访问性基线（1.21.0 新增）。
 *
 * 只对**无需登录即可访问的页面**跑 axe（/login /admin/login /download），
 * 断言不允许出现 critical / serious 级违规 —— 这两个级别对应"读屏用户无法
 * 完成核心操作"的问题（如无名字的纯图标按钮、label 未关联）。
 * moderate 以下的对比度/结构建议不算失败，避免用例随视觉微调而碎。
 *
 * ⚠️ 本文件必须走**匿名态**：playwright.config 全局注入了登录后的 storageState，
 * 而这里要验的正是"未登录用户第一眼看到的页面"。若沿用登录态，/login 这类页面
 * 将来一旦加了"已登录则跳转"的逻辑，用例就会静默地扫到别的页面（假绿）。
 */

test.use({ storageState: { cookies: [], origins: [] } })

const PAGES = [
  { path: '/login', name: '登录页' },
  { path: '/admin/login', name: '后台登录页' },
  { path: '/download', name: 'APK 下载页' },
]

for (const { path, name } of PAGES) {
  test(`a11y · ${name}（${path}）无 critical/serious 违规`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'networkidle' })
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

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
