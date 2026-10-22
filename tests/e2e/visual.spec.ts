import { test, expect, type Page } from '@playwright/test'

/**
 * 视觉回归基线 · Tailwind 4 正式基线（task-32 建立，task-35 扩面）
 *
 * 目的：把「关键页面在真实数据/登录态下的像素形态」钉住。任何样式改动（Tailwind
 * 升级、token 三层化、a11y 对比度修正等）都必须在这里给出逐页结论，把「有意差异」
 * 与「回归」分开。
 *
 * 覆盖范围（2026-10-22 扩面后）：
 *  · 移动视口 390×844（dpr=1，移动端真实主视口）：16 页
 *    /dev/ui、/dev/ui/space、/dev/ui/v4、/login、/download、/travel、/me、/dashboard、
 *    /circle、/moments、/search、/me/settings、/space、/travel/detail、/me/favorites、/sync
 *  · 桌面视口 1280×800（dpr=1，桌面主视口）：8 个核心页
 *    /、/travel、/circle、/me、/dashboard、/dev/ui、/login、/download
 *
 * 快照命名含视口，例如 visual-travel-390x844-win32.png / visual-travel-1280x800-win32.png，
 * 同一页面两个视口不会互相覆盖；基线 PNG 入库：tests/e2e/visual.spec.ts-snapshots/。
 *
 * 确定性口径（缺一不可，否则截图像素会随机漂移）：
 *  · light 主题、zh-CN、dpr=1；reducedMotion='reduce' + toHaveScreenshot animations:'disabled'
 *    （冻结 CSS 动画/过渡/跑马灯，也避免 reduced-motion 分支以外的动效进入截图）；
 *  · Date/Math.random 在页面脚本执行前换成固定值（页面大量使用「今天/还有 N 天/碎碎念时间」与粒子随机）；
 *  · 等 document.fonts.ready、所有 <img> 加载完成、networkidle、再等 600ms 让数据请求落位；
 *  · 登录页 mp4 背景统一 pause + seek 0（animations:'disabled' 不会暂停 <video>，否则稳定性判定永远失败）；
 *  · 登录态由全局 storageState 提供（global-setup 注册 e2e_runner、标记偏好问卷完成、预置 onboarding 标记）。
 *  · /dev/ui* 预览台在生产构建默认 404，playwright.config.ts 的 webServer 已注入 DEV_UI=1。
 *  · /travel/detail 是「查询参数版」详情入口（无 slug 时为稳定的空/错误态），/space 等页面在
 *    空库下走空态；这里只钉形态，不钉业务数据。
 *
 * 更新基线（仅在**有意**改动视觉后执行，并在评审里记录原因）：
 *   npx playwright test tests/e2e/visual.spec.ts --update-snapshots
 * 精确差异测量（零容忍）：
 *   $env:VISUAL_MAX_DIFF_RATIO='0'; npx playwright test tests/e2e/visual.spec.ts
 *
 * 运行前置：MySQL（3308，travel_notes_visual）+ 登录态 Cookie；webServer 会自动
 * `npx next build && npx next start -p 3111`（本地已有 3111 时复用）。
 */

const MOBILE_VIEWPORT = { width: 390, height: 844 }
const DESKTOP_VIEWPORT = { width: 1280, height: 800 }

type VisualPage = { name: string; path: string }

/** 移动视口 16 页：8 个既有代表页 + 8 个扩面页（均要求登录态可访问，空态可接受）。 */
const MOBILE_PAGES: VisualPage[] = [
  { name: 'dev-ui', path: '/dev/ui' },
  { name: 'dev-ui-space', path: '/dev/ui/space' },
  { name: 'dev-ui-v4', path: '/dev/ui/v4' },
  { name: 'login', path: '/login' },
  { name: 'download', path: '/download' },
  { name: 'travel', path: '/travel' },
  { name: 'me', path: '/me' },
  { name: 'dashboard', path: '/dashboard' },
  // ── task-35 扩面（8 页）──
  { name: 'circle', path: '/circle' },
  { name: 'moments', path: '/moments' },
  { name: 'search', path: '/search' },
  { name: 'me-settings', path: '/me/settings' },
  { name: 'space', path: '/space' },
  { name: 'travel-detail', path: '/travel/detail' },
  { name: 'me-favorites', path: '/me/favorites' },
  { name: 'sync', path: '/sync' },
]

/** 桌面视口 8 页：桌面壳（Navbar/Footer/多列布局）与移动壳差异最大的一批。 */
const DESKTOP_PAGES: VisualPage[] = [
  { name: 'home', path: '/' },
  { name: 'travel', path: '/travel' },
  { name: 'circle', path: '/circle' },
  { name: 'me', path: '/me' },
  { name: 'dashboard', path: '/dashboard' },
  { name: 'dev-ui', path: '/dev/ui' },
  { name: 'login', path: '/login' },
  { name: 'download', path: '/download' },
]

const VIEWPORT_GROUPS = [
  { key: 'mobile', viewport: MOBILE_VIEWPORT, pages: MOBILE_PAGES },
  { key: 'desktop', viewport: DESKTOP_VIEWPORT, pages: DESKTOP_PAGES },
] as const

/** 固定时钟 + 可复现随机数：在页面脚本执行前注入（addInitScript 早于应用 JS）。 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const FIXED_NOW = new Date('2026-03-15T10:24:00+08:00').getTime()
    // Date：无参构造与 Date.now() 一律返回固定时刻（保留带参构造/静态方法语义）
    const RealDate = Date
    class FixedDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(FIXED_NOW)
        } else {
          super(...(args as ConstructorParameters<typeof Date>))
        }
      }
      static now(): number {
        return FIXED_NOW
      }
    }
    window.Date = FixedDate as unknown as DateConstructor
    // Math.random：mulberry32 固定种子，保证粒子/骨架抖动每次一致
    let seed = 0x9e3779b9
    Math.random = () => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  })
})

/** 等到「字体 + 图片 + 一帧稳定」再截图：少任何一步都会出现字体回退/半张图的假差异。 */
async function waitForVisualReady(page: Page) {
  await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 20_000 }).catch(() => null)
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  await page.waitForFunction(
    () => Array.from(document.images).every((img) => img.complete),
    null,
    { timeout: 20_000 },
  ).catch(() => null)
  /**
   * 媒体冻结：登录页背景是 mp4 循环视频（LoginDoor），播放中的每一帧都不同，
   * Playwright 的 animations:'disabled' 只冻结 CSS 动画，不会暂停 <video>，
   * 于是「两帧一致」的稳定性判定永远失败（实测 /login 抖动）。
   * 这里统一暂停并 seek 到第 0 帧：画面来自解码首帧，仍能验证遮罩/卡片/排版，
   * 又保证像素可复现。
   */
  await page.evaluate(async () => {
    const videos = Array.from(document.querySelectorAll('video'))
    await Promise.all(
      videos.map(
        (video) =>
          new Promise<void>((resolve) => {
            try {
              video.pause()
              video.removeAttribute('autoplay')
              if (video.readyState >= 1) {
                video.currentTime = 0
                video.addEventListener('seeked', () => resolve(), { once: true })
                window.setTimeout(() => resolve(), 1500)
                return
              }
              video.addEventListener('loadeddata', () => {
                video.pause()
                video.currentTime = 0
                window.setTimeout(() => resolve(), 300)
              }, { once: true })
              window.setTimeout(() => resolve(), 1500)
            } catch {
              resolve()
            }
          }),
      ),
    )
  })
  // 数据请求（/api/*）落位 + 入场动画（reduced-motion 下多为瞬时）收尾
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => null)
  await page.waitForTimeout(600)
}

/** 允许用环境变量收紧/放宽阈值做「精确差异测量」（默认 0.001，见任务要求）。 */
const MAX_DIFF_RATIO = Number(process.env.VISUAL_MAX_DIFF_RATIO ?? '0.001')

for (const group of VIEWPORT_GROUPS) {
  test.describe(`${group.key} ${group.viewport.width}x${group.viewport.height}`, () => {
    test.use({
      viewport: group.viewport,
      deviceScaleFactor: 1,
      colorScheme: 'light',
      locale: 'zh-CN',
      reducedMotion: 'reduce',
    })

    for (const target of group.pages) {
      test(`visual: ${group.key} · ${target.name}`, async ({ page }) => {
        const response = await page.goto(target.path, { waitUntil: 'load', timeout: 60_000 })
        expect(response?.status(), `${target.path} HTTP 状态`).toBeLessThan(400)
        await waitForVisualReady(page)
        // 快照名必须带视口：同一页面在 mobile/desktop 下是两份不同基线。
        await expect(page).toHaveScreenshot(
          `visual-${target.name}-${group.viewport.width}x${group.viewport.height}.png`,
          {
            animations: 'disabled',
            caret: 'hide',
            maxDiffPixelRatio: MAX_DIFF_RATIO,
            scale: 'css',
          },
        )
      })
    }
  })
}
