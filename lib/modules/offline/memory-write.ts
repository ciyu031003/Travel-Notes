/**
 * 留言（回忆）离线写（Stage 3.4 接线 · D-4 首期离线写范围）：
 * - 原生壳：本地乐观写 SQLite（memory 表）+ 入 SyncQueue，联网后 SyncEngine 自动上传云端（服务端复检权限）。
 * - Web：直接走在线 /api/travels/{travelId}/memories。
 * 注意：上传接口依赖云端 travelId；离线新建的旅行（无 remoteId）不能挂留言，需旅行先同步。
 */
import { writeLocalEntity } from './local-write'
import { SyncQueue } from './sync-queue'
import { getSyncQueueStorage } from './storage'
import { isNativePlatform } from './platform'
import { apiUrl } from '@/lib/api-base'

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
}

export async function createMemory(input: CreateMemoryInput): Promise<CreateMemoryResult> {
  const title = input.title.trim()
  if (!title) return { ok: false, error: '请输入标题' }

  if (isNativePlatform()) {
    const queue = new SyncQueue(getSyncQueueStorage())
    await writeLocalEntity(
      {
        table: 'memory',
        id: crypto.randomUUID(),
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
          visibility: 'COUPLE',
          createdBy: null,
          createdById: null,
        },
      },
      queue,
    )
    return { ok: true, local: true }
  }

  try {
    const res = await fetch(apiUrl(`/api/travels/${input.travelId}/memories`), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content: input.content || null, mood: input.mood || null, happenedAt: input.happenedAt }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: json?.error || '保存失败' }
    return { ok: true }
  } catch {
    return { ok: false, error: '网络错误，请重试' }
  }
}
