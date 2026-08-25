/**
 * 旅行离线写（Stage 3.4 接线 · D-4 首期离线写范围）：
 * - 原生壳：本地乐观写 SQLite（travel 表）+ 入 SyncQueue，联网后 SyncEngine 自动上传云端（服务端复检权限）。
 * - Web：直接走在线 /api/admin/travels。
 */
import { writeLocalEntity } from './local-write'
import { SyncQueue } from './sync-queue'
import { getSyncQueueStorage } from './storage'
import { isNativePlatform } from './platform'
import { apiUrl } from '@/lib/api-base'

export interface CreateTravelInput {
  title: string
  description?: string
  startDate?: string
  endDate?: string
  isPublic?: boolean
}

export interface CreateTravelResult {
  ok: boolean
  error?: string
  /** 是否本地写入（离线，待同步） */
  local?: boolean
}

export async function createTravel(input: CreateTravelInput): Promise<CreateTravelResult> {
  const title = input.title.trim()
  if (!title) return { ok: false, error: '请输入旅行名称' }

  if (isNativePlatform()) {
    const queue = new SyncQueue(getSyncQueueStorage())
    await writeLocalEntity(
      {
        table: 'travel',
        id: crypto.randomUUID(),
        entityType: 'TRAVEL',
        remoteId: null,
        operation: 'CREATE',
        data: {
          title,
          slug: '',
          description: input.description || null,
          location: null,
          cover: null,
          startDate: input.startDate ? new Date(input.startDate).getTime() : null,
          endDate: input.endDate ? new Date(input.endDate).getTime() : null,
          status: 'PLANNED',
          visibility: 'SPACE',
          isPublic: input.isPublic ? 1 : 0,
          spaceId: null,
          ownerId: null,
        },
      },
      queue,
    )
    return { ok: true, local: true }
  }

  try {
    const res = await fetch(apiUrl('/api/admin/travels'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: json?.error || '创建失败' }
    return { ok: true }
  } catch {
    return { ok: false, error: '网络错误，请重试' }
  }
}
