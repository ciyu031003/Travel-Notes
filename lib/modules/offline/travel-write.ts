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
  /** 目的地 → `Travel.location`（画册按城市成册依赖它，见 travel.service.createTravel 注释） */
  location?: string
  isPublic?: boolean
  travelType?: 'ALONE' | 'COUPLE' | 'FAMILY' | 'FRIENDS' | 'BFF' | 'GROUP' | 'OTHER'
  companions?: unknown
}

export interface CreateTravelResult {
  ok: boolean
  error?: string
  /** 是否本地写入（离线，待同步） */
  local?: boolean
  /** 云端创建后的 slug；用于「建完直接进该旅行详情页」。离线写入时为 null */
  slug?: string | null
  /** 本地实体 id（离线写入时为 SQLite 行 id，供本地详情页使用） */
  localId?: string | null
}

export async function createTravel(input: CreateTravelInput): Promise<CreateTravelResult> {
  const title = input.title.trim()
  if (!title) return { ok: false, error: '请输入旅行名称' }

  if (isNativePlatform()) {
    const queue = new SyncQueue(getSyncQueueStorage())
    const localId = crypto.randomUUID()
    await writeLocalEntity(
      {
        table: 'travel',
        id: localId,
        entityType: 'TRAVEL',
        remoteId: null,
        operation: 'CREATE',
        data: {
          title,
          slug: '',
          description: input.description || null,
          // 原先硬写 null，导致原生壳建的旅行在画册里只能靠标题猜城市；现在跟随表单
          location: input.location?.trim() || null,
          cover: null,
          startDate: input.startDate ? new Date(input.startDate).getTime() : null,
          endDate: input.endDate ? new Date(input.endDate).getTime() : null,
          status: 'PLANNED',
          visibility: 'SPACE',
          travelType: input.travelType || 'ALONE',
          // 本地 companions 为 TEXT 列：对象需序列化为 JSON 字符串，避免 SQLite 绑定对象失败
          companions: input.companions ? JSON.stringify(input.companions) : null,
          isPublic: input.isPublic ? 1 : 0,
          spaceId: null,
          ownerId: null,
        },
      },
      queue,
    )
    // 离线：还没有云端 slug，调用方应留在本地列表/详情，不能跳 /travel/<slug>
    return { ok: true, local: true, slug: null, localId }
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
    const slug = typeof json?.slug === 'string' && json.slug ? json.slug : null
    return { ok: true, slug }
  } catch {
    return { ok: false, error: '网络错误，请重试' }
  }
}
