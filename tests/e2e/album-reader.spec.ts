import { test, expect, type Page } from '@playwright/test'
import { expectPageHealthy } from './helpers'

/**
 * 旅行画册阅读器 E2E（Album 2.0）
 *
 * 这是本次重构的**浏览器实测**，覆盖纯函数单测覆盖不到的部分：
 *   ① page-flip 运行时的真实挂载与页面元素生成；
 *   ② 翻页 / 键盘导航后页码正确前进与回退；
 *   ③ 主题切换**不改变页数与页码**（主题契约的浏览器侧证据）；
 *   ④ 懒加载图片真的加载出来（不是空白纸），且没有失败占位；
 *   ⑤ 无横向溢出、无崩溃占位。
 *
 * 【为什么用 route 注入画册数据】
 * E2E 跑在干净库上（`e2e_runner` 名下没有照片），而"书架上恰好有画册"是随机前提。
 * 直接 skip 会让这组用例永远不执行；用固定 fixture 注入则每次都在测同一份确定性数据，
 * 断言可以写得更严格（页数、页码、主题），这比"碰运气有数据才测"更有价值。
 * 图片 URL 指向仓库里真实存在的测试图（public/uploads/media/*.jpg），
 * 因此 ④ 的 naturalWidth 断言是真实加载证据，而不是空跑。
 */

const MEDIA = (n: number) => `/uploads/media/${n}.jpg`

function fixtureBook() {
  // 3 天 · 12 张图：足够触发 DAY_OPENING / FULL_BLEED / PHOTO_CAPTION / TIMELINE / ENDING
  const chapter = (index: number, date: string, ids: number[]) => ({
    id: 100 + index,
    index,
    date,
    title: `第 ${index} 天`,
    summary: `第 ${index} 天的记录`,
    itinerary: [{ id: index * 10, title: `行程 ${index}`, locationName: '南京' }],
    memories: [{ id: index * 20, title: `回忆 ${index}`, content: '走在城墙上', mood: 'HAPPY', photos: [] }],
    photos: ids.map((n) => ({
      id: n,
      thumbnailUrl: MEDIA(n),
      previewUrl: MEDIA(n),
      blurUrl: null,
      fullUrl: MEDIA(n),
      width: 1368,
      height: 1024,
    })),
  })

  return {
    bookKey: 'travel:9001',
    travelId: 9001,
    slug: 'e2e-album',
    title: 'E2E 画册',
    description: null,
    location: '南京',
    startDate: '2026-05-01',
    endDate: '2026-05-03',
    travelType: 'ALONE',
    companions: null,
    coverThumb: MEDIA(1),
    coverPreview: MEDIA(1),
    coverBlur: null,
    dayCount: 3,
    photoCount: 12,
    chapters: [
      chapter(1, '2026-05-01', [1, 2, 3, 4]),
      chapter(2, '2026-05-02', [5, 6, 7, 8]),
      chapter(3, '2026-05-03', [9, 10, 11, 12]),
    ],
  }
}

const SUMMARY = (() => {
  const { chapters: _chapters, ...rest } = fixtureBook()
  return rest
})()

/** 注入画册摘要与单本数据，然后打开第一本画册 */
async function openFixtureBook(page: Page) {
  const book = fixtureBook()
  // 用谓词而不是 glob：`/api/travel-book?key=...` 带查询串，通配符匹配容易出歧义；
  // 另外测试运行需屏蔽 Service Worker（见 playwright.config），否则 SW 会绕过路由拦截。
  await page.route(
    (url) => url.pathname === '/api/travel-book',
    async (route) => {
      const url = route.request().url()
      if (url.includes('key=')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ book }) })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ books: [SUMMARY] }) })
      }
    },
  )

  await page.goto('/album')
  const card = page.locator('.pcard').first()
  await expect(card).toBeVisible({ timeout: 30_000 })
  await card.click()
  await expect(page.locator('.book-reader')).toBeVisible({ timeout: 30_000 })
}

test.describe.configure({ mode: 'serial' })

/**
 * 库**真正显示出来**的叶的下标（DOM 顺序）。
 *
 * 为什么不能只看页码指示：指示器是 React 状态，可能领先于库（用户看到的书没动，
 * 数字却变了）。这条断言直取 page-flip 渲染结果，是「书到底停在哪一屏」的唯一真相。
 */
function visibleLeafIndexes(page: Page) {
  return page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('.art-flipbook-container .art-flip-page'))
    return all.reduce<number[]>((acc, el, i) => {
      const cs = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      if (cs.display !== 'none' && cs.visibility !== 'hidden' && rect.width > 0 && rect.height > 0) acc.push(i)
      return acc
    }, [])
  })
}

/** 翻页过程中逐帧采到的「可见叶」：库渲染出来的页在哪、用什么定位 */
interface VisibleLeafSample {
  theme: string
  frame: number
  index: number
  position: string
  top: number
  bottom: number
  containerBottom: number
}

/**
 * 翻页动画期间**逐帧**采样可见叶的定位与盒子。
 *
 * 为什么必须逐帧：本文要防的缺陷**只在翻页那几百毫秒里存在** ——
 * 库对被翻动的页只在动画期写内联样式，停稳后就把多余的页收回去/隐藏。
 * 只断言静止态永远抓不到它（这正是它长期漏网的原因）。
 * 每帧等两次 rAF 再读样式：确保读到的已经是**画完**的那一帧布局。
 */
async function sampleVisibleLeavesDuringFlip(
  page: Page,
  theme: string,
  samples: VisibleLeafSample[],
  frames = 8,
) {
  for (let frame = 0; frame < frames; frame += 1) {
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    )
    const snapshot = await page.evaluate(() => {
      const container = document.querySelector('.art-flipbook-container')
      if (!container) return null
      const containerBottom = container.getBoundingClientRect().bottom
      const visible: Array<{ index: number; position: string; top: number; bottom: number }> = []
      document.querySelectorAll<HTMLElement>('.art-flipbook-container .art-flip-page').forEach((el, index) => {
        const cs = getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        if (cs.display === 'none' || rect.width === 0 || rect.height === 0) return
        visible.push({ index, position: cs.position, top: rect.top, bottom: rect.bottom })
      })
      return { containerBottom, visible }
    })
    if (!snapshot) continue
    for (const leaf of snapshot.visible) {
      samples.push({ theme, frame, containerBottom: snapshot.containerBottom, ...leaf })
    }
  }
}

test('画册阅读器：打开 → page-flip 挂载 → 翻页页码前进/回退', async ({ page }) => {
  await openFixtureBook(page)

  // ① 运行时真实挂载：page-flip 生成了页元素 —— **一页一叶**（不是对开 sheet）
  const pages = page.locator('.art-flipbook-container .art-flip-page')
  await expect(pages.first()).toBeVisible({ timeout: 20_000 })
  const pageCount = await pages.count()

  // ② 一屏一个对开：停稳后可见的页元素恰好 2 片（左页 + 右页）。
  //    回归护栏：旧实现把「一个对开」做成一张内部再分左右半的 sheet 交给库，
  //    库在 landscape 下又把这种页并排两片 → 一屏出现 **4 个逻辑页**，每片叶只有半页宽。
  await expect(
    page.locator('.art-flipbook-container .art-flip-page:visible'),
    '双页模式一屏应恰好 2 片叶（一个对开 = 左页 + 右页）',
  ).toHaveCount(2)

  // ③ 页码指示：01 / NN。NN 是**对开数**（不是叶数）
  const indicator = page.locator('.book-reader footer span[aria-live="polite"]')
  await expect(indicator).toBeVisible()
  const first = (await indicator.textContent())?.trim() ?? ''
  const m = first.match(/^01 \/ (\d{2,})$/)
  expect(m, `页码指示格式应为 01 / NN，实际 ${first}`).not.toBeNull()
  const totalSpreads = Number(m![1])

  // fixture 是 19 逻辑页（封面+前言+3×(DAY_OPENING+PEAK+PAUSE+2×ECHO)+时间线+结尾），
  // 测试图 aspect=1.34 < 1.6，不触发出血展开 → 19 片叶；双页模式两两成对 → 10 个对开。
  expect(pageCount, '页元素数应等于物理叶数（一页一叶）').toBe(19)
  expect(totalSpreads, '19 逻辑页在双页模式下应为 10 个对开').toBe(10)

  // ④ 下一页：页码前进
  await page.locator('.book-reader footer button', { hasText: '下一页' }).click()
  await expect(indicator).toHaveText(/^02 \//, { timeout: 20_000 })

  // ⑤ 上一页回到封面
  await page.locator('.book-reader footer button', { hasText: '上一页' }).click()
  await expect(indicator).toHaveText(first, { timeout: 20_000 })

  await expectPageHealthy(page)
})

test('画册阅读器：主题切换只改外观，不改页数与页码', async ({ page }) => {
  await openFixtureBook(page)

  const reader = page.locator('.book-reader')
  const indicator = reader.locator('footer span[aria-live="polite"]')
  const pages = page.locator('.art-flipbook-container .art-flip-page')

  // 先翻到第 3 页，确保"切主题不改页码"这条断言有意义（不是恒为 01）
  await reader.locator('footer button', { hasText: '下一页' }).click()
  await expect(indicator).toHaveText(/^02 \//, { timeout: 20_000 })
  await reader.locator('footer button', { hasText: '下一页' }).click()
  await expect(indicator).toHaveText(/^03 \//, { timeout: 20_000 })

  const pageCountBefore = await pages.count()
  const labelBefore = (await indicator.textContent())?.trim() ?? ''
  await expect(reader).toHaveAttribute('data-book-theme', 'editorial')

  const menu = reader.locator('[role="menu"][aria-label="画册主题"]')

  // 切到「胶片」
  await reader.locator('button[aria-haspopup="menu"]').click()
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitemradio', { name: /胶片/ }).click()
  await expect(reader).toHaveAttribute('data-book-theme', 'film', { timeout: 15_000 })
  expect(await pages.count(), '切主题不得改变物理页数').toBe(pageCountBefore)
  expect((await indicator.textContent())?.trim(), '切主题不得改变当前页码').toBe(labelBefore)

  // 切到「手记」
  await reader.locator('button[aria-haspopup="menu"]').click()
  await menu.getByRole('menuitemradio', { name: /手记/ }).click()
  await expect(reader).toHaveAttribute('data-book-theme', 'memory', { timeout: 15_000 })
  expect(await pages.count()).toBe(pageCountBefore)
  expect((await indicator.textContent())?.trim()).toBe(labelBefore)

  // 切回「画报」
  await reader.locator('button[aria-haspopup="menu"]').click()
  await menu.getByRole('menuitemradio', { name: /画报/ }).click()
  await expect(reader).toHaveAttribute('data-book-theme', 'editorial', { timeout: 15_000 })

  await expectPageHealthy(page)
})

test('画册阅读器：图片真的加载出来（懒加载不是空白纸）', async ({ page }) => {
  await openFixtureBook(page)

  // 封面是 eager 图，必须完成加载且有真实像素
  const coverImg = page.locator('.art-flipbook-container .art-page img').first()
  await expect(coverImg).toBeVisible({ timeout: 20_000 })
  await expect
    .poll(async () => coverImg.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 20_000 })
    .toBeGreaterThan(0)

  // 翻两页，让视口内的第二/第三页图片进入加载路径
  const reader = page.locator('.book-reader')
  await reader.locator('footer button', { hasText: '下一页' }).click()
  await expect(reader.locator('footer span[aria-live="polite"]')).toHaveText(/^02 \//, { timeout: 20_000 })

  await expect
    .poll(
      async () =>
        page.locator('.art-flipbook-container .art-page img').evaluateAll(
          (els) => els.filter((el) => (el as HTMLImageElement).naturalWidth > 0).length,
        ),
      { timeout: 25_000 },
    )
    .toBeGreaterThanOrEqual(2)

  // 不应出现失败占位
  await expect(page.locator('.photo-fallback')).toHaveCount(0)

  await expectPageHealthy(page)
})

test('画册阅读器：键盘导航与 Escape 关闭', async ({ page }) => {
  await openFixtureBook(page)

  const reader = page.locator('.book-reader')
  const indicator = reader.locator('footer span[aria-live="polite"]')
  const first = (await indicator.textContent())?.trim() ?? ''
  expect(first).toMatch(/^01 \//)

  await page.keyboard.press('ArrowRight')
  await expect(indicator).toHaveText(/^02 \//, { timeout: 20_000 })

  await page.keyboard.press('ArrowLeft')
  await expect(indicator).toHaveText(first, { timeout: 20_000 })

  await page.keyboard.press('End')
  await expect(indicator).not.toHaveText(first, { timeout: 20_000 })
  // End 应落在最后一个对开（不必硬编码页数，只断言"不再是第一页"）
  await expect(indicator).toHaveText(/^10 \//, { timeout: 20_000 })

  await page.keyboard.press('Home')
  await expect(indicator).toHaveText(first, { timeout: 20_000 })

  // Escape 关闭阅读器，回到画册墙
  await page.keyboard.press('Escape')
  await expect(page.locator('.book-reader')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.locator('.pcard').first()).toBeVisible({ timeout: 15_000 })
})

test('画册阅读器：移动端单页模式无横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openFixtureBook(page)

  const reader = page.locator('.book-reader')
  await expect(reader).toBeVisible()
  // 单页模式：rig 带 --single 修饰类
  await expect(reader.locator('.art-flip-rig--single')).toBeVisible({ timeout: 15_000 })

  // 单页模式一屏恰好 1 片叶（一个逻辑页 = 一张照片）
  await expect(
    page.locator('.art-flipbook-container .art-flip-page:visible'),
    '移动端一屏应恰好 1 片叶',
  ).toHaveCount(1)

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, '移动端阅读器横向溢出 px').toBeLessThanOrEqual(0)

  await expectPageHealthy(page)
})

test('画册阅读器：系统「减弱动态效果」下仍是真书（不是加载失败兜底）', async ({ page }) => {
  /*
   * 回归证据：视觉档 reduced 的语义是「直切」，BOOK_TIER_PROFILES.reduced.flippingTime = 0；
   * 而 page-flip 的 getSettings() 会对 flippingTime <= 0 抛 "Invalid flipping time"，
   * 构造失败 → 组件落到「翻页组件加载失败」兜底。也就是说：**任何开启了系统级
   * 「减弱动态效果」的用户打开画册都是白屏**（连"重新加载"也救不回来）。
   * 现在换成 resolveFlippingTime(0) = 1ms（一帧内走完，肉眼等同直切）。
   */
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openFixtureBook(page)

  const reader = page.locator('.book-reader')
  // 档位确实降到了 reduced（否则这条用例没测到目标路径）
  await expect(reader).toHaveAttribute('data-book-tier', 'reduced', { timeout: 15_000 })

  // ① 真书：页元素在，且没有兜底面板
  await expect(page.locator('.art-flipbook-container .art-flip-page').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.art-flip-fallback')).toHaveCount(0)

  // ② 直切档位依然可以翻页
  await reader.locator('footer button', { hasText: '下一页' }).click()
  await expect(reader.locator('footer span[aria-live="polite"]')).toHaveText(/^02 \//, { timeout: 20_000 })

  await expectPageHealthy(page)
})

test('画册阅读器：台面投影不得按「内容 alpha」重画（翻页时书页下方的重影）', async ({ page }) => {
  /*
   * 回归证据：容器原先用 `filter: drop-shadow(...)`。drop-shadow 取的是**内容 alpha**
   * 的轮廓 —— 翻页时正在转动的那一页轮廓变了，投影就跟着被重画一遍，
   * 于是在书页下方出现一片随翻页移动的模糊重影（用户报的「镜像重影」）。
   * 实测证据：把该 filter 去掉，书页下缘那 11px 带内 **13.3% 的像素**发生变化；
   * 而关掉章节条的 backdrop-blur / 整条章节目录，像素变化 **0**。
   * 现在改用 box-shadow（只认元素盒子，翻页时纹丝不动）。
   */
  await openFixtureBook(page)
  const container = page.locator('.art-flipbook-container')
  await expect(container).toBeVisible({ timeout: 20_000 })

  const paint = await container.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { filter: cs.filter, boxShadow: cs.boxShadow }
  })
  expect(paint.filter, '容器不得使用 filter: drop-shadow（翻页时会重画成重影）').toBe('none')
  expect(paint.boxShadow, '应改用静态 box-shadow 保留台面投影').not.toBe('none')

  await expectPageHealthy(page)
})

test('画册阅读器：翻页全程（画报 / 胶片 / 手记）不得有页落到书本下方', async ({ page }) => {
  /*
   * 回归证据：`.art-flipbook-container .art-flip-page` 曾写 `position: relative`。
   * page-flip 把这一层**直接当 `.stf__item` 用**，靠自己注入的
   * `.stf__item { display: none; position: absolute }` 加上内联 `left/top` 摆位；
   * 而我们的选择器（0,2,0）比库的（0,1,0）更具体，把绝对定位顶掉了 ——
   * 页于是退回**文档流**：对开里第二片叶（右页）被排在第一片叶正下方，
   * 台面下方于是冒出一块带内容的矩形。实测（浏览器）：该矩形整段翻页都停在
   * 书本下方（top=659 = 书盒底边、高度整页），停稳后才被库隐藏。
   * 相册 / 胶片 / 手册三个主题共用这段布局代码，所以三个主题一起中招 —— 用户报的
   * 「翻页时下方有重影」正是它，与视觉档案 / 主题都无关。
   *
   * 断言只认 **DOM 真相**（库渲染出来后页的真实定位与盒子），不看截图：
   *   ① 可见叶一律必须是绝对定位（退回文档流 = 重影的根因）；
   *   ② 可见叶的**盒子顶边**不得落到书盒底边之下。
   * 不写「盒子底边不得超过书盒底边」：正在翻转的那一叶被 3D 透视投影放大，
   * 底边合法地会越过书盒（实测越界约 196px，属正常翻页观感，不是重影）——
   * 把这条也写进断言只会制造假失败。
   */
  await openFixtureBook(page)
  const reader = page.locator('.book-reader')
  await expect(page.locator('.art-flipbook-container .art-flip-page').first()).toBeVisible({ timeout: 20_000 })

  const menu = reader.locator('[role="menu"][aria-label="画册主题"]')
  const next = reader.locator('footer button', { hasText: '下一页' })
  const samples: VisibleLeafSample[] = []

  for (const [theme, label] of [
    ['editorial', /画报/],
    ['film', /胶片/],
    ['memory', /手记/],
  ] as const) {
    await reader.locator('button[aria-haspopup="menu"]').click()
    await expect(menu).toBeVisible()
    await menu.getByRole('menuitemradio', { name: label }).click()
    await expect(reader).toHaveAttribute('data-book-theme', theme, { timeout: 15_000 })

    for (let flip = 0; flip < 2; flip += 1) {
      await next.click()
      await sampleVisibleLeavesDuringFlip(page, theme, samples)
      // 等这一翻停稳：下一翻才能从静止态起，采到的帧才覆盖完整动画
      await page.waitForTimeout(600)
    }
  }

  expect(samples.length, '必须真的采到翻页过程中的帧（否则这条用例是空跑）').toBeGreaterThan(0)

  // ① 根因护栏
  expect(
    samples
      .filter((s) => s.position !== 'absolute')
      .map((s) => `${s.theme} 第${s.frame}帧 叶${s.index} position=${s.position}`),
    '翻页中可见的叶必须是绝对定位（退回文档流会把右页排到书本下方）',
  ).toEqual([])

  // ② 症状护栏
  expect(
    samples
      .filter((s) => s.top > s.containerBottom - 2)
      .map(
        (s) =>
          `${s.theme} 第${s.frame}帧 叶${s.index} top=${Math.round(s.top)} 书盒底边=${Math.round(s.containerBottom)}`,
      ),
    '翻页中不得有页落到书本下方',
  ).toEqual([])

  await expectPageHealthy(page)
})

test('画册阅读器：翻页与跳转后，书的真实落点与页码指示一致', async ({ page }) => {
  /*
   * 回归证据（reflex 测得的真实缺陷）：本组件曾用「声明式当前页」把**对开序号**
   * 当**叶索引**递给库的 `turnToPage()`（库内部 `pages.show(page)`），于是：
   *   · 点一次「下一页」后库被打回封面 —— 指示器说 02，书停在 01；
   *   · 章节直达停在错误的对开；End / Home 与跳转抢步，完全不动。
   * 单页模式/旧的一张 sheet 顶一个对开的实现里，叶索引恰好等于对开序号，所以一直没暴露。
   *
   * 这条用例只认**库真正渲染出来的叶**（DOM 真相），因为页码指示是 React 状态，
   * 可能领先于库；只有「书停在哪一屏」能证明两者没有脱钩。
   */
  await openFixtureBook(page)
  await expect(page.locator('.art-flipbook-container .art-flip-page').first()).toBeVisible({ timeout: 20_000 })

  const reader = page.locator('.book-reader')
  const indicator = reader.locator('footer span[aria-live="polite"]')

  // ① 第一屏：封面 + 前言
  await expect(indicator).toHaveText(/^01 \//)
  await expect.poll(() => visibleLeafIndexes(page)).toEqual([0, 1])

  // ② 下一页：书必须跟着走（曾经被打回封面）
  await reader.locator('footer button', { hasText: '下一页' }).click()
  await expect(indicator).toHaveText(/^02 \//, { timeout: 20_000 })
  await expect.poll(() => visibleLeafIndexes(page)).toEqual([2, 3])

  // ③ 上一页
  await reader.locator('footer button', { hasText: '上一页' }).click()
  await expect(indicator).toHaveText(/^01 \//, { timeout: 20_000 })
  await expect.poll(() => visibleLeafIndexes(page)).toEqual([0, 1])

  // ④ 章节直达：DAY 02 引导页 = 逻辑页 8 → 对开 3 → 叶 6/7
  await reader.locator('[aria-label="章节直达"] button').nth(1).click()
  await expect(indicator).toHaveText(/^04 \//, { timeout: 20_000 })
  await expect.poll(() => visibleLeafIndexes(page)).toEqual([6, 7])

  // ⑤ End / Home。先移开焦点：焦点在按钮上时阅读器**故意**不接管键盘（交还原生行为）
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('End')
  await expect(indicator).toHaveText(/^10 \//, { timeout: 20_000 })
  // 末对开只有一片叶（19 片叶两两成对，落单片画在左半）
  await expect.poll(() => visibleLeafIndexes(page)).toEqual([18])

  await page.keyboard.press('Home')
  await expect(indicator).toHaveText(/^01 \//, { timeout: 20_000 })
  await expect.poll(() => visibleLeafIndexes(page)).toEqual([0, 1])

  await expectPageHealthy(page)
})
