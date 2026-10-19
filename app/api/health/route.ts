import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getStorageService } from '@/lib/infrastructure/storage'
import { APP_VERSION, APP_BUILD_NUMBER } from '@/lib/app-version'

export const dynamic = 'force-dynamic'

/**
 * 进程启动时刻（B10）。
 *
 * 旧实现读 `process.env.STARTED_AT`，但该变量从未在任何地方注入 → `uptime` 永远是 null，
 * 监控看到的是「不知道跑了多久」。模块顶层记录是进程级真值（Next 服务启动时加载该模块）；
 * 若部署侧显式注入了 STARTED_AT（多进程/外部编排）仍优先采用。
 */
const STARTED_AT = (() => {
  const fromEnv = Number(process.env.STARTED_AT)
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : Date.now()
})()

/** 存储探活超时：S3/网络卡住时不能把健康检查也拖死 */
const STORAGE_PROBE_TIMEOUT_MS = 2500

type DbStatus = 'ok' | 'fail'
type MigrationStatus = 'ok' | 'pending' | 'unavailable'
type StorageStatus = 'ok' | 'fail'

/** 数据库连通性（探活最小代价语句） */
async function checkDb(): Promise<DbStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return 'ok'
  } catch {
    return 'fail'
  }
}

/**
 * 迁移状态（B10）：_prisma_migrations 里不能存在「未完成」或「已回滚」的迁移。
 *
 * Prisma 的语义：finished_at IS NULL = 应用到一半/失败；rolled_back_at IS NOT NULL = 已回滚。
 * 注意「回滚后重新 resolve 成功」会留下两行同名记录（旧的 rolled_back + 新的 finished），
 * 这不是未就绪；只有「没有任何一次成功应用」的迁移才算 pending。
 * 判定：finished_at IS NULL 且不存在同名 finished_at IS NOT NULL 的记录。
 * 表不存在（历史 db push 库）或查询异常 → unavailable：同样算未就绪，
 * 因为此时无法证明库结构是对的（部署流程 entrypoint 会先做 migrate bootstrap，正常不会长期处于该状态）。
 */
async function checkMigrations(): Promise<{ status: MigrationStatus; pendingCount: number }> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
      `SELECT m.migration_name FROM _prisma_migrations m
        WHERE m.finished_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM _prisma_migrations a
            WHERE a.migration_name = m.migration_name AND a.finished_at IS NOT NULL
          )
        LIMIT 5`,
    )
    const pendingCount = Array.isArray(rows) ? rows.length : 0
    if (pendingCount > 0) {
      console.error('[health] 存在未完成/已回滚的迁移:', pendingCount)
      return { status: 'pending', pendingCount }
    }
    return { status: 'ok', pendingCount: 0 }
  } catch (error) {
    console.error('[health] 迁移状态检查失败:', (error as Error)?.message || error)
    return { status: 'unavailable', pendingCount: 0 }
  }
}

/**
 * 存储可达性（B10）：用现有 storage 抽象做一次「写入 → 删除」小对象探针。
 *
 * 为什么用 upload/delete 而不是新增 head 方法：storage 抽象目前只有这三个方法，
 * 本地盘能验证目录可写、S3/COS 能验证凭证与桶权限 —— 两者都是上线后最常见的故障点。
 * 探针对象放在 health/ 前缀下、内容 2 字节，失败时残留也无害。
 */
async function checkStorage(): Promise<StorageStatus> {
  const key = 'health/probe-' + Date.now().toString(36) + '.txt'
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    const storage = getStorageService()
    const probe = (async () => {
      await storage.upload(Buffer.from('ok'), key, 'text/plain')
      await storage.delete(key)
    })()
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('storage probe timeout')), STORAGE_PROBE_TIMEOUT_MS)
    })
    await Promise.race([probe, timeout])
    return 'ok'
  } catch (error) {
    console.error('[health] 存储探活失败:', (error as Error)?.message || error)
    return 'fail'
  } finally {
    // 探针很快时也要清掉定时器，避免每次健康检查都留一个 2.5s 的悬挂 timer
    if (timer) clearTimeout(timer)
  }
}

/**
 * 健康检查端点（监控/探活/部署门禁）。
 *
 * GET /api/health → { status, version, buildNumber, db, migrations, storage, uptime, ts }
 * - 全部就绪 → 200 { status: 'ok' }
 * - 任一不就绪（DB 连不上 / 迁移未完成或无法确认 / 存储不可写）→ 503 { status: 'degraded' }
 *
 * 为什么 degraded 也要 503：server-rebuild.sh 用 `curl -fsS` 轮询该端点决定部署成败，
 * 「只有 DB 通」不足以说明服务可用（迁移没跑完会让读写行为不确定）——宁可部署失败回滚，
 * 也不要带着半迁移的库对外服务。
 */
export async function GET() {
  const [db, migrations, storage] = await Promise.all([checkDb(), checkMigrations(), checkStorage()])
  const ready = db === 'ok' && migrations.status === 'ok' && storage === 'ok'

  return NextResponse.json(
    {
      status: ready ? 'ok' : 'degraded',
      version: APP_VERSION,
      buildNumber: APP_BUILD_NUMBER,
      db,
      migrations: migrations.status,
      migrationsPending: migrations.pendingCount,
      storage,
      uptime: Math.round((Date.now() - STARTED_AT) / 1000),
      ts: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 },
  )
}
