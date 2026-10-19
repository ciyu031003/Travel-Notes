import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

/**
 * ESLint 10 flat config（B 批次：ESLint 8 → 10 迁移）
 *
 * 与旧 .eslintrc.json 的对应关系：
 *   extends: ["next/core-web-vitals", "next/typescript"]  → 展开下面两个 flat config 数组
 *   rules: { "@typescript-eslint/no-explicit-any": "warn" } → 原样保留
 *
 * 语义保持：lint 只覆盖 app / components / hooks / lib（与旧命令的目录参数一致），
 * warning 预算由 package.json 的 --max-warnings=<N> 维护（只许下调，见 CI 注释）。
 */
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 存量债务：保持 warn 级别（不阻断），预算由 eslint --max-warnings 控制
      '@typescript-eslint/no-explicit-any': 'warn',
      // ESLint 10 / eslint-config-next 16 新增的 React Compiler 规则（react-hooks v6）。
      // 存量代码有 115 处命中（set-state-in-effect 67、immutability 28、refs 12、purity 5、
      // preserve-manual-memoization 3），本批次只做「ESLint 版本迁移」，不改业务代码，
      // 因此先显式关闭以保持旧规则集的 warning 预算语义；后续单独排期清理后再逐条开启。
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'node_modules/**',
    'coverage/**',
    'www/**',
    'public/**',
    'test-results/**',
    'playwright-report/**',
  ]),
])
