/**
 * 相册离线写：**在线直写云端 + 本地兜底**（统一策略见 write-through.ts）。
 */
import { writeLocalEntity, markEntitySynced } from './local-write'
import { SyncQueue } from './sync-queue'
import { getSyncQueueStorage } from './storage'
import { apiUrl } from '@/lib/api-base'
import { writeThrough } from './write-through'

export interface CreateAlbumInput {
  title: string
  description?: string
  date?: string
  isPublic?: boolean
}

export interface CreateAlbumResult {
  ok: boolean
  error?: string
  /** 是否本地写入（离线，待同步） */
  local?: boolean
  /** 云端相册 id（离线时为 undefined）：建完要往里传照片，没有 id 就没有容器 */
  id?: number
}

export async function createAlbum(input: CreateAlbumInput): Promise<CreateAlbumResult> {
  const title = input.title.trim()
  if (!title) return { ok: false, error: '请输入相册名称' }

  const localId = crypto.randomUUID()
  let wroteLocal = false

  // 与旅行/回忆同一策略：在线直写云端，本地只作离线兜底（见 write-through.ts）
  const r = await writeThrough<{ id?: number }>({
    entityId: localId,
    localWrite: async () => {
      const queue = new SyncQueue(getSyncQueueStorage())
      await writeLocalEntity(
        {
          table: 'album',
          id: localId,
          entityType: 'ALBUM',
          remoteId: null,
          operation: 'CREATE',
          data: {
            title,
            description: input.description || null,
            date: input.date ? new Date(input.date).getTime() : null,
            coverMediaId: null,
            locationId: null,
            visibility: 'SPACE',
            isPublic: input.isPublic ? 1 : 0,
            spaceId: null,
            userId: null,
          },
        },
        queue,
      )
      wroteLocal = true
    },
    serverWrite: async () => {
      try {
        const res = await fetch(apiUrl('/api/admin/albums'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { ok: false, error: json?.error || `创建失败（HTTP ${res.status}）` }
        const id = Number(json?.id)
        return { ok: true, data: { id: Number.isFinite(id) ? id : undefined } }
      } catch {
        return { ok: false, error: '网络不可用' }
      }
    },
    onServerOk: async (data) => {
      // 回填云端 id：否则「建完相册再传照片」没有容器可挂（与回忆照片同因）
      if (wroteLocal) await markEntitySynced('ALBUM', localId, data?.id ?? null)
    },
  })

  if (r.mode === 'server') return { ok: true, id: r.data?.id }
  if (r.mode === 'local') return { ok: true, local: true }
  return { ok: false, error: r.error }
}
