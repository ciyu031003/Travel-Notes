/**
 * Next.js 15 instrumentation 入口（P2-35）：进程级优雅停机。
 *
 * ⚠️ 编译期约束：本文件会被同时打进 node 与 edge 两个 runtime。
 * 因此这里**绝不能**顶层 import lib/db（会经 prisma-adapter → mysql2 把 crypto 等 Node
 * 内置模块拖进 edge bundle，build 直接失败）。官方推荐写法是「正向分支 + 动态 import」：
 * `process.env.NEXT_RUNTIME === 'nodejs'` 在编译期是常量，webpack 会把该分支从 edge 图里裁掉；
 * 真正的 Node 逻辑放在 instrumentation.node.ts（只在 node runtime 被加载）。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node')
  }
}
