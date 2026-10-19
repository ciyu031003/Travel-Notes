/**
 * 同步墓碑（B4）：服务端删除实体时落一条记录，供 GET /api/sync/changes 下发给客户端，
 * 客户端据此删除本地行（否则"Web 删掉的记录在 App 上永远留着"——pull 只 upsert 不删）。
 *
 * 全部是 **best-effort**：墓碑写失败只记日志，绝不阻断删除主流程
 * （墓碑缺失的后果只是某台设备下次要等全量对账，而删除失败是用户可见故障）。
 */
import { prisma } from '@/lib/db'

export type TombstoneEntityType = 'Travel' | 'Moment' | 'Album' | 'Memory'

export function isTombstoneEntityType(value: unknown): value is TombstoneEntityType {
  return value === 'Travel' || value === 'Moment' || value === 'Album' || value === 'Memory'
}

/**
 * 由用户名反查 userId（删除路径多数只有 username）：查不到时返回 null。
 * best-effort：失败不抛出（墓碑 userId 为空时不会被下发，但删除本身不受影响）。
 */
export async function resolveUserIdByUsername(username?: string | null): Promise<number | null> {
  if (!username) return null
  try {
    const user = await prisma.user.findUnique({ where: { username }, select: { id: true } })
    return user?.id ?? null
  } catch {
    return null
  }
}

/** 记录一条删除墓碑（best-effort） */
export async function recordSyncTombstone(
  entityType: TombstoneEntityType,
  entityId: number,
  userId?: number | null,
): Promise<void> {
  if (!Number.isFinite(entityId) || entityId <= 0) return
  try {
    await prisma.syncTombstone.create({
      data: { entityType, entityId, userId: userId ?? null },
    })
  } catch (error) {
    console.error(
      `[sync-tombstone] 写入失败（不阻断删除） ${entityType}#${entityId}:`,
      (error as Error)?.message || error,
    )
  }
}
