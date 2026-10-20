import { test, expect, type Page } from '@playwright/test'

/**
 * 视觉回归基线（Tailwind 3 → 4 迁移专用，task-32）
 *
 * 目的：在升级 Tailwind 前先钉住 8 个代表页面的像素基线，升级后逐页比对，
 * 把「有意差异」与「回归」分开；只允许有记录地接受 Tailwind 4 的预期差异。
 *
 * 确定性口径（缺一不可，否则截图像素会随机漂移）：
 *  · viewport 390×844、dpr=1、zh-CN、light（与移动端真实主视口一致）；
 *  · reducedMotion='reduce' + toHaveScreenshot animations:'disabled'（冻结 CSS 动画/过渡/跑马灯）；
 *  · Date/Math.random 在页面加载前换成固定值（页面大量使用「今天/还有 N 天/碎碎念时间」与粒子随机）；
 *  · 等 document.fonts.ready、所有 <img> 加载完成、再等 600ms 让数据请求落位；
 *  · 登录态由全局 storageState 提供（global-setup 注册 e2e_runner 并标记偏好问卷已完成）。
 *
 * 基线所在：tests/e2e/visual.spec.ts-snapshots/（PNG 入库，随分支提交）。
 * 更新基线：npx playwright test tests/e2e/visual.spec.ts --update-snapshots
 */

const VIEWPORT = { width: 390, height: 844 }

const PAGES: Array<{ name: string; path: string }> = [
  { name: 'dev-ui', path: '/dev/ui' },
  { name: 'dev-ui-space', path: '/dev/ui/space' },
  { name: 'dev-ui-v4', path: '/dev/ui/v4' },
  { name: 'login', path: '/login' },
  { name: 'download', path: '/download' },
  { name: 'travel', path: '/travel' },
  { name: 'me', path: '/me' },
  { name: 'dashboard', path: '/dashboard' },
]

test.use({
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  colorScheme: 'light',
  locale: 'zh-CN',
  reducedMotion: 'reduce',
})

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

for (const target of PAGES) {
  test(`visual: ${target.name}`, async ({ page }) => {
    const response = await page.goto(target.path, { waitUntil: 'load', timeout: 60_000 })
    expect(response?.status(), `${target.path} HTTP 状态`).toBeLessThan(400)
    await waitForVisualReady(page)
    await expect(page).toHaveScreenshot(`${target.name}.png`, {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: MAX_DIFF_RATIO,
      scale: 'css',
    })
  })
}
