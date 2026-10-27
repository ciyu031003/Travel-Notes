import { defineConfig } from '@playwright/test'

/**
 * 不依赖 MySQL 的移动端布局/渲染门禁。
 *
 * 旅行圈 feed 和详情的数据全部由 page.route 注入；只验证移动端壳、安全区、
 * 虚拟列表和错误态，不注册账号、不读写数据库。
 */
export default defineConfig({
  testDir: './tests/mobile-e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: './test-results/mobile-e2e',
  use: {
    baseURL: 'http://localhost:3113',
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
    colorScheme: 'light',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npx next build && npx next start -p 3113',
    url: 'http://localhost:3113/circle',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
