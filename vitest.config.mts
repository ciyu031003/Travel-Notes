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
      // P3-39（2026-10-19）：补 lib 纯函数/契约测试后，最终共享树实测 103 文件 / 938 用例：
      //   statements 58.11%（4405/7580）、branches 49.32%（3046/6175）、
      //   functions 57.64%（773/1341）、lines 60.45%（3885/6426）
      // 阈值 = 实测**向下取整**（57/49/57/59），低于实测约 0.3-1pp 作为并发/平台抖动缓冲；
      // statements 已达成 55+ 目标（本轮起点 52.38% → 58.11%）。只许上调（收紧），
      // 不允许为了「变绿」调低阈值；目标 60/50/60/62，后续每次实测 +2pp 上调。
      thresholds: {
        statements: 57,
        branches: 49,
        functions: 57,
        lines: 59,
      },
    },
  },
})
