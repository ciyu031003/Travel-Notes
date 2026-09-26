/**
 * 留言（回忆）离线写（Stage 3.4 接线 · D-4 首期离线写范围）：
 * - 原生壳：本地乐观写 SQLite（memory 表）+ 入 SyncQueue，联网后 SyncEngine 自动上传云端（服务端复检权限）。
 * - Web：直接走在线 /api/travels/{travelId}/memories。
 * 注意：上传接口依赖云端 travelId；离线新建的旅行（无 remoteId）不能挂留言，需旅行先同步。
 */
import { writeLocalEntity, markEntitySynced } from './local-write'
import { SyncQueue } from './sync-queue'
import { getSyncQueueStorage } from './storage'
import { apiUrl } from '@/lib/api-base'
import { writeThrough } from './write-through'

export interface CreateMemoryInput {
  /** 云端 travelId（留言挂载的旅行；需旅行已存在/已同步） */
  travelId: number
  title: string
  content?: string
  mood?: string
  happenedAt?: string
}

export interface CreateMemoryResult {
  ok: boolean
  error?: string
  /** 是否本地写入（离线，待同步） */
  local?: boolean
  /**
   * 云端新建的回忆 id（离线本地写入时为 undefined）。
   * 回传它是为了让「记录今日」旧页也能在保存后**顺带上传照片**
   * （照片必须挂在回忆上，没有 id 就没法关联）。
   */
  id?: number
}

export async function createMemory(input: CreateMemoryInput): Promise<CreateMemoryResult> {
  const title = input.title.trim()
  if (!title) return { ok: false, error: '请输入标题' }

  const localId = crypto.randomUUID()
  let wroteLocal = false

  const r = await writeThrough<{ id: number | undefined }>({
    entityId: localId,
    localWrite: async () => {
      const queue = new SyncQueue(getSyncQueueStorage())
      await writeLocalEntity(
        {
          table: 'memory',
          id: localId,
          entityType: 'MEMORY',
          remoteId: null,
          operation: 'CREATE',
          data: {
            spaceId: null,
            travelId: String(input.travelId),
            travelDayId: null,
            title,
            content: input.content || null,
            happenedAt: input.happenedAt ? new Date(input.happenedAt).getTime() : null,
            mood: input.mood || null,
            visibility: 'SPACE',
            createdBy: null,
            createdById: null,
          },
        },
        queue,
      )
      wroteLocal = true
    },
    /**
     * 在线直写服务端。**必须做**：回忆是详情页/时间线的数据源，只写本地的话
     * 「记一笔」保存后页面上看不到；而且拿不到云端 id 就**没法给这条回忆挂照片** ——
     * 这正是手机上"记一笔+选照片"照片丢掉的根因（原注释也写了"没有 id 就没法关联"）。
     */
    serverWrite: async () => {
      try {
        const res = await fetch(apiUrl(`/api/travels/${input.travelId}/memories`), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content: input.content || null, mood: input.mood || null, happenedAt: input.happenedAt }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { ok: false, error: json?.error || `保存失败（HTTP ${res.status}）` }
        const n = Number(json?.memoryId)
        return { ok: true, data: { id: Number.isFinite(n) ? n : undefined } }
      } catch {
        return { ok: false, error: '网络不可用' }
      }
    },
    onServerOk: async (data) => {
      if (wroteLocal) await markEntitySynced('MEMORY', localId, data?.id ?? null)
    },
  })

  if (r.mode === 'server') return { ok: true, id: r.data?.id }
  if (r.mode === 'local') return { ok: true, local: true }
  return { ok: false, error: r.error }
}
