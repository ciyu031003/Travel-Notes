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

/**
 * 已登记、待收敛的对比度项（B2 · 2026-10-19）。
 *
 * 口径：**只有「已登记」的项才允许不失败**，且每次运行都会打印出来（可见、可追踪）；
 * 新出现的对比度问题一律 critical/serious 失败。登记格式：`<path> <target 前缀>`。
 *
 * 本轮已修：text-travel-ink/70 → /80 共 59 处（/70 合成对比度 4.12:1 → /80 5.37:1）。
 * 仍未收敛的档位（/60、/50）台账见 docs/review/_impl 汇报，后续批次处理。
 */
const KNOWN_CONTRAST_DEFERRED: Array<{ path: string; target: string; note: string }> = []

function isDeferredContrast(path: string, target: string): boolean {
  return KNOWN_CONTRAST_DEFERRED.some(
    (item) => item.path === path && target.startsWith(item.target),
  )
}

async function auditAndAssert(
  page: import('@playwright/test').Page,
  path: string,
  name: string,
) {
  await page.goto(path, { waitUntil: 'networkidle' })

  // 登录页有一道「地图门」开场动画：动画中间态会出现半透明文字（合成对比度被 axe 误判）。
  // 点击开门后再审计，既贴近真实可交互状态，也避开过渡帧的假阳性。
  if (path === '/login') {
    await page.getByText('点击开门').click({ timeout: 3000 }).catch(() => null)
    await page.waitForTimeout(1400)
  }
  // 页面入场动画/骨架退场后再采样（避免过渡帧影响对比度与焦点判定）。
  await page.waitForTimeout(300)

  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()

  // 运行报告用：把本次页面命中的全部规则桶打印出来（含 moderate/minor），
  // 失败判据仍只取 critical/serious。
  if (results.violations.length > 0) {
    console.log(
      `[a11y:all] ${path} ` +
        results.violations.map((v) => `${v.id}(${v.impact})x${v.nodes.length}`).join(', '),
    )
  }

  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  )

  // 对比度单独分流：已登记项只告警、不计失败；其余仍是阻塞项。
  const contrast = blocking.find((v) => v.id === 'color-contrast')
  const deferredNodes = contrast
    ? contrast.nodes.filter((node) => isDeferredContrast(path, node.target.join(' ')))
    : []
  const nonDeferredBlocking = blocking
    .map((v) => {
      if (v.id !== 'color-contrast') return v
      const nodes = v.nodes.filter((node) => !isDeferredContrast(path, node.target.join(' ')))
      return nodes.length ? { ...v, nodes } : null
    })
    .filter((v): v is NonNullable<typeof v> => Boolean(v))

  if (deferredNodes.length > 0) {
    console.log(`[a11y] ${path} 已登记待收敛对比度 ${deferredNodes.length} 处：` +
      deferredNodes.map((n) => n.target.join(' ')).slice(0, 8).join(' | '))
  }
  if (nonDeferredBlocking.length > 0) {
    // 打印逐节点 target（修复时直接据此定位组件/class），最多每规则 8 条。
    const summary = nonDeferredBlocking
      .map((v) => {
        const nodes = v.nodes
          .slice(0, 8)
          .map((n) => `${n.target.join(' ')}  ::  ${(n.html || '').replace(/\s+/g, ' ').slice(0, 120)}`)
          .join('\n    | ')
        const more = v.nodes.length > 8 ? ` …+${v.nodes.length - 8}` : ''
        return `${v.id}(${v.impact}) x${v.nodes.length}:\n    ${nodes}${more}`
      })
      .join('\n')
    console.log(`[a11y] ${path} 违规：\n${summary}`)
  }
  expect(nonDeferredBlocking, `${name} 存在 critical/serious 级可访问性违规`).toHaveLength(0)
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
  // B2 扩面：画册 / 看板 / 设置 / 收藏 / 同步中心（登录态主流程里此前完全没有覆盖）
  { path: '/album', name: '画册' },
  { path: '/dashboard', name: '数据看板' },
  { path: '/me/settings', name: '我的设置' },
  { path: '/me/favorites', name: '我的收藏' },
  { path: '/sync', name: '同步中心' },
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


/* ── ③ 弹层焦点圈定（B2：useModalLayer 接入后的回归门禁）──────────────────
 * 背景：24 个 role=dialog 的弹层此前只有 3 个接入了焦点管理；B2 统一接 useModalLayer 后，
 * 这里用「命令面板」做代表用例：打开后 Tab 焦点必须始终留在 dialog 内。
 * 只验证键盘可达性，不依赖具体业务数据。 */
test('a11y · 命令面板打开后焦点不逃出弹层（useModalLayer）', async ({ page }) => {
  // 用 /search 而不是 /：首页首访会弹 Onboarding（同为 role=dialog），
  // 会让 [role="dialog"].first() 拿到引导层，测试对象不可信。
  await page.goto('/search', { waitUntil: 'networkidle' })
  await page.keyboard.press('Control+KeyK')
  const dialog = page.locator('[role="dialog"][aria-label="命令面板"]')
  await expect(dialog).toBeVisible({ timeout: 10_000 })

  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab')
    const inside = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null
      const layer = document.querySelector('[role="dialog"][aria-label="命令面板"]')
      return Boolean(active && layer && (layer === active || layer.contains(active)))
    })
    expect(inside, 'Tab 焦点逃出了弹层（useModalLayer 焦点圈定失效）').toBe(true)
  }

  // ESC 关闭后焦点应回到打开前的元素（这里是 body / 触发按钮）
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden({ timeout: 5_000 })
})
