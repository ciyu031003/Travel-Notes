/**
 * 相册离线写（Stage 3.4 接线 · D-4 首期离线写范围）：
 * - 原生壳：本地乐观写 SQLite（album 表）+ 入 SyncQueue，联网后 SyncEngine 自动上传云端（服务端复检权限）。
 * - Web：直接走在线 /api/admin/albums。
 */
import { writeLocalEntity } from './local-write'
import { SyncQueue } from './sync-queue'
import { getSyncQueueStorage } from './storage'
import { isNativePlatform } from './platform'
import { apiUrl } from '@/lib/api-base'

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
}

export async function createAlbum(input: CreateAlbumInput): Promise<CreateAlbumResult> {
  const title = input.title.trim()
  if (!title) return { ok: false, error: '请输入相册名称' }

  if (isNativePlatform()) {
    const queue = new SyncQueue(getSyncQueueStorage())
    await writeLocalEntity(
      {
        table: 'album',
        id: crypto.randomUUID(),
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
    return { ok: true, local: true }
  }

  try {
    const res = await fetch(apiUrl('/api/admin/albums'), {
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
