/**
 * 碎碎念离线写：**在线直写云端 + 本地兜底**（统一策略见 write-through.ts）。
 */
import { writeLocalEntity, markEntitySynced } from './local-write'
import { SyncQueue } from './sync-queue'
import { getSyncQueueStorage } from './storage'
import { apiUrl } from '@/lib/api-base'
import { writeThrough } from './write-through'

export interface CreateMomentResult {
  ok: boolean
  error?: string
  /** 是否本地写入（离线，待同步） */
  local?: boolean
}

export async function createMoment(content: string, tags: string[] | null): Promise<CreateMomentResult> {
  const trimmed = content.trim()
  if (!trimmed) return { ok: false, error: '内容不能为空' }

  const localId = crypto.randomUUID()
  let wroteLocal = false

  // 与旅行/回忆/相册同一策略：在线直写云端，本地只作离线兜底
  const r = await writeThrough<{ id?: number }>({
    entityId: localId,
    localWrite: async () => {
      const queue = new SyncQueue(getSyncQueueStorage())
      await writeLocalEntity(
        {
          table: 'moment',
          id: localId,
          entityType: 'MOMENT',
          remoteId: null,
          operation: 'CREATE',
          data: {
            content: trimmed,
            tags: tags && tags.length > 0 ? JSON.stringify(tags) : null,
            userId: null,
            isPublic: 0,
          },
        },
        queue,
      )
      wroteLocal = true
    },
    serverWrite: async () => {
      try {
        const res = await fetch(apiUrl('/api/admin/moments'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: trimmed, tags }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { ok: false, error: json?.error || `发布失败（HTTP ${res.status}）` }
        const id = Number(json?.id)
        return { ok: true, data: { id: Number.isFinite(id) ? id : undefined } }
      } catch {
        return { ok: false, error: '网络不可用' }
      }
    },
    onServerOk: async (data) => {
      if (wroteLocal) await markEntitySynced('MOMENT', localId, data?.id ?? null)
    },
  })

  if (r.mode === 'server') return { ok: true }
  if (r.mode === 'local') return { ok: true, local: true }
  return { ok: false, error: r.error }
}
