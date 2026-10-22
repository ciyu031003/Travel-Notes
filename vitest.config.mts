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
      // P3-36（2026-10-22）：补 lib/prisma-adapter、lib/exif、media-variants 等可 mock 模块单测后，
      // 共享树实测 113 文件 / 1039 用例（112 passed + 1 skipped）：
      //   statements 65.15%（5311/8151）、branches 55.65%（3576/6425）、
      //   functions 63.86%（942/1475）、lines 67.67%（4702/6948）
      // 目标（本轮验收）：statements ≥60 / branches ≥50 / functions ≥55 / lines ≥60 —— **全部达成**。
      // 阈值取「实测向下取整后留 0.3-1pp 抖动」（64/55/63/67），均高于旧阈值（57/49/57/59）与目标值，
      // 只许上调（收紧），不允许为了「变绿」调低；后续实测每 +2pp 上调一次。
      thresholds: {
        statements: 64,
        branches: 55,
        functions: 63,
        lines: 67,
      },
    },
  },
})
