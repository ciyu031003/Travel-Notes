/**
 * Node runtime 的 instrumentation 实现（P2-35）。
 *
 * 由 instrumentation.ts 在 `NEXT_RUNTIME === 'nodejs'` 时动态 import，
 * 所以这里的 lib/db（Prisma/mysql2）依赖不会进入 edge bundle。
 *
 * 行为：收到 SIGTERM/SIGINT 时先 shutdownPrisma()（断开 Prisma + 关闭 MySQL 连接池），
 * 再 exit(0)；5 秒超时兜底强制退出，避免容器 stop 卡在 10s SIGKILL。
 * 构建期（phase-production-build）不注册信号处理，避免影响 next build。
 */
const SHUTDOWN_TIMEOUT_MS = 5_000

let registered = false

export async function registerNodeInstrumentation(): Promise<void> {
  // 构建期跳过：build 进程不需要优雅停机，也不该因为 import lib/db 触发连接初始化
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  if (registered) return
  registered = true

  let shuttingDown = false

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[instrumentation] 收到 ${signal}，开始优雅停机…`)

    // 强制退出兜底：shutdownPrisma 卡住（连接池被占用/DB 无响应）时最多等 5s
    const forceExit = setTimeout(() => {
      console.error('[instrumentation] 优雅停机超时（5s），强制退出')
      process.exit(1)
    }, SHUTDOWN_TIMEOUT_MS)

    try {
      const { shutdownPrisma } = await import('./lib/db')
      await shutdownPrisma()
    } catch (error) {
      console.error('[instrumentation] 优雅停机失败:', (error as Error)?.message || error)
    } finally {
      clearTimeout(forceExit)
      process.exit(0)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

// 模块被动态 import 时立即注册（保持和「register 里注册」同样的时机：服务启动时）
void registerNodeInstrumentation()
