/**
 * 碎碎念离线写（Stage 3.4 接线 · D-4 首期离线写范围）：
 * - 原生壳：本地乐观写 SQLite + 入 SyncQueue，联网后 SyncEngine 自动上传云端（服务端复检权限）。
 * - Web：直接走在线 API。
 */
import { writeLocalEntity } from './local-write'
import { SyncQueue } from './sync-queue'
import { getSyncQueueStorage } from './storage'
import { isNativePlatform } from './platform'
import { apiUrl } from '@/lib/api-base'

export interface CreateMomentResult {
  ok: boolean
  error?: string
  /** 是否本地写入（离线，待同步） */
  local?: boolean
}

export async function createMoment(content: string, tags: string[] | null): Promise<CreateMomentResult> {
  const trimmed = content.trim()
  if (!trimmed) return { ok: false, error: '内容不能为空' }

  if (isNativePlatform()) {
    const queue = new SyncQueue(getSyncQueueStorage())
    await writeLocalEntity(
      {
        table: 'moment',
        id: crypto.randomUUID(),
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
    return { ok: true, local: true }
  }

  try {
    const res = await fetch(apiUrl('/api/admin/moments'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: trimmed, tags }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: json?.error || '发布失败' }
    return { ok: true }
  } catch {
    return { ok: false, error: '网络错误，请重试' }
  }
}
