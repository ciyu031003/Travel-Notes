import { defineConfig } from '@playwright/test'

/**
 * E2E 冒烟测试（Playwright）。
 * - 跑本地 dev（webServer 自动起，端口 3111 避开常用 3000），需本地 MySQL（.env DATABASE_URL）。
 * - 全局 setup 注册专用账号 e2e_runner 并写入 storageState（HttpOnly cookie）。
 * - 用例文件用 .spec.ts，与 vitest（*.test.ts）天然隔离。
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 25_000 },
  fullyParallel: false,
  workers: 1,
  // 本地 dev 编译抖动大（全套跑时中国地图/路由冷编译可达 15s+），保留 1 次重试
  retries: 1,
  reporter: [['list']],
  outputDir: './test-results/e2e',
  use: {
    baseURL: 'http://localhost:3111',
    storageState: './tests/e2e/.auth/state.json',
    viewport: { width: 1280, height: 720 },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    locale: 'zh-CN',
  },
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  webServer: {
    // 冒烟跑生产构建：无 dev 按需编译/HMR 退化，结果稳定（本地复跑时若已有服务在 3111 则直接复用）
    command: 'npx next build && npx next start -p 3111',
    url: 'http://localhost:3111/login',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
