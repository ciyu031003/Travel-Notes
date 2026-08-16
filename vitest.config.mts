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
  },
})
