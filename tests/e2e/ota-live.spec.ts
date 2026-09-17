import { test, expect } from '@playwright/test'

/**
 * OTA 真机链路验证（不打桩 /api/version）
 *
 * 与 tests/e2e/album-reader.spec.ts 不同：那组用例为稳定性注入了 fixture；
 * 这组**故意不注入任何数据**，直接打生产接口，验证「真机装旧版本壳时，
 * 打开 App 会看到线上版本的更新提示，且下载地址就是那个固定 APK 路径」。
 *
 * 原生壳用 addInitScript 模拟：isNativePlatform() 只看 window.Capacitor，
 * 因此注入 isNativePlatform: () => true 即可让 OTA 检查逻辑真实执行。
 */

const PROD_API = 'https://travel-notes.yuanabd.cn'
const EXPECTED_APK = 'https://travel-notes.yuanabd.cn/downloads/tiantu.apk'

/**
 * 线上版本号**不写死**：曾把 1.8.0/build 9 硬编码进断言，发到 1.9.0 后立刻误报失败。
 * 这里只断言「形态正确」（x.y.z + 正整数构建号）+「下载地址是那个固定 APK」，
 * 具体版本是否为最新由发版流程保证，不由这条用例保证。
 */
const VERSION_RE = /^\d+\.\d+\.\d+$/

/**
 * 「模拟旧版本壳」那条用例要求本地构建的 NEXT_PUBLIC_APP_VERSION 低于线上版本，
 * 否则 isNewerVersion(built, remote) 为 false，提示本就不该出现。
 * 因此默认跳过，由显式环境变量启用：
 *   OTA_LIVE=1 NEXT_PUBLIC_APP_VERSION=1.7.0 NEXT_PUBLIC_APP_BUILD_NUMBER=8 \
 *     npx playwright test tests/e2e/ota-live.spec.ts
 */
const LOWER_SHELL = process.env.OTA_LIVE === '1'

test('生产 /api/version 返回可用的版本信息，且下载地址可用', async ({ request }) => {
  const res = await request.get(`${PROD_API}/api/version`)
  expect(res.ok()).toBeTruthy()
  const m = await res.json()

  expect(m.version, `版本号应为 x.y.z，实际 ${m.version}`).toMatch(VERSION_RE)
  expect(Number.isInteger(m.buildNumber), `构建号应为整数，实际 ${m.buildNumber}`).toBe(true)
  expect(m.buildNumber).toBeGreaterThan(0)
  expect(m.downloadUrl).toBe(EXPECTED_APK)
  expect(m.changelog).toBeTruthy()

  // 下载地址必须真的可下（Range 请求，避免拉 25MB）
  const apk = await request.get(EXPECTED_APK, { headers: { Range: 'bytes=0-1023' } })
  expect([200, 206]).toContain(apk.status())
  const len = Number(apk.headers()['content-length'] || 0)
  expect(len, 'APK 首段应返回 1024 字节').toBe(1024)
})

test('模拟原生壳旧版本：App 内出现 OTA 更新提示，下载地址指向新版 APK', async ({ page }) => {
  test.skip(!LOWER_SHELL, '需以 OTA_LIVE=1 + 低版本 NEXT_PUBLIC_APP_VERSION 构建后运行')

  // 模拟 Capacitor 原生壳 + 拦截 window.open 以捕获下载动作
  await page.addInitScript(() => {
    ;(window as unknown as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    }
    ;(window as unknown as { __opened: string[] }).__opened = []
    const origOpen = window.open.bind(window)
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      ;(window as unknown as { __opened: string[] }).__opened.push(String(url))
      if (target === '_system') return null
      return origOpen(url as string, target, features)
    }) as typeof window.open
  })

  await page.goto('/')

  // 远端版本从线上接口现取，避免把版本号写进用例
  const remote = await (await page.request.get(`${PROD_API}/api/version`)).json()

  // OTA 提示：BottomSheet 标题「发现新版本 v<remote.version>」
  await expect(page.getByText(/发现新版本/).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(new RegExp(`v${remote.version.replace(/\./g, '\\.')}`)).first()).toBeVisible({
    timeout: 20_000,
  })
  // changelog 来自线上 /api/version
  await expect(page.getByText(/旅行画册 2\.0/).first()).toBeVisible({ timeout: 20_000 })

  // 点击「立即更新」→ window.open 应拿到新版 APK 地址
  const updateBtn = page.getByRole('button', { name: '立即更新' })
  await expect(updateBtn).toBeVisible()
  await updateBtn.click()

  const opened = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened)
  expect(opened.length, 'window.open 应被调用').toBeGreaterThan(0)
  expect(opened[0]).toBe(EXPECTED_APK)
})
