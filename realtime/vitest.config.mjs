import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.mjs'],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
