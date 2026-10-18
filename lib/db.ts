import { PrismaClient } from '@prisma/client'
import { PrismaMariaDB } from './prisma-adapter'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaAdapter: PrismaMariaDB | undefined
}

const adapter =
  globalForPrisma.prismaAdapter ??
  new PrismaMariaDB({
    connectionString: process.env.DATABASE_URL!,
  })

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: adapter as any,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
  globalForPrisma.prismaAdapter = adapter
}

/**
 * 优雅停机（P2-35）：断开 Prisma 客户端 + 关闭底层连接池。
 *
 * 由进程入口调用（instrumentation.ts 的 SIGTERM/SIGINT 处理），
 * 历史实现把信号处理写在 PrismaMariaDB 构造函数里并直接 process.exit(0)，
 * 导致任何引用 lib/db 的脚本都被动接管进程生命周期。现在职责分离：
 * 适配器只提供 close()，何时关、关完是否退出由入口决定。
 */
export async function shutdownPrisma(): Promise<void> {
  try {
    await prisma.$disconnect()
  } catch (error) {
    console.error('[db] prisma.$disconnect 失败:', (error as Error)?.message || error)
  }
  try {
    await adapter.close()
  } catch (error) {
    console.error('[db] 关闭数据库连接池失败:', (error as Error)?.message || error)
  }
}
