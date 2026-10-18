import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      // 测试专用 JWT 密钥（与生产无关）
      JWT_SECRET: 'vitest-only-secret-not-for-production',
    },
    coverage: {
      // P1-25：覆盖率进 CI 门禁。之前没有 provider 也没有阈值，覆盖率完全不可度量。
      // 只有显式 --coverage（即 npm run test:coverage）时才生效，不影响日常 npm test。
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage',
      // 51/45/50/53 = 2026-10-18 P0 阶段实测存量（全量 76 文件 / 679 用例：statements 52.4% /
      // branches 46.13% / functions 51.01% / lines 54.37%，向下取整再留 1pp 平台缓冲）。
      // 只许上调（收紧），不允许为了「变绿」调低阈值；目标 60/50/55/60：
      // 用 npx vitest run --coverage 的新实测值每次 +2pp 上调。
      thresholds: {
        statements: 51,
        branches: 45,
        functions: 50,
        lines: 53,
      },
    },
  },
})
