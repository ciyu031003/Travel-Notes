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
import { makeTravelSlug } from '@/lib/modules/travel/slug'

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
    // 本地也要有确定的 slug：早先写空串，而读取时回退成 `travel-<localId>`，
    // 两侧不一致 → `/travel/<slug>` 打不开（"建完看不到也进不去"的根因之一）。
    // 与服务端共用 makeTravelSlug，保证同步后 slug 一致、链接不失效。
    const slug = makeTravelSlug(title, localId.slice(0, 8))
    await writeLocalEntity(
      {
        table: 'travel',
        id: localId,
        entityType: 'TRAVEL',
        remoteId: null,
        operation: 'CREATE',
        data: {
          title,
          slug,
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
    // 离线：返回本地 slug（列表与详情都能按它定位）
    return { ok: true, local: true, slug, localId }
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

export interface AddTravelDayInput {
  /** 云端的旅行 id（离线新建尚未同步时为 null） */
  travelId: number | null
  /** 本地旅行行 id：离线时给「天」建立本地父子引用，上传时再解析成云端 id */
  localTravelId?: string | null
  date?: string | null
  title?: string
  summary?: string
}

export interface AddTravelDayResult {
  ok: boolean
  error?: string
  local?: boolean
  /** 云端天数行的 id（离线时为 null） */
  id?: number | null
  /** 本地天数行 id（离线时用于本地时间线） */
  localId?: string | null
}

/**
 * 给旅行加一天（离线优先）。
 *
 * 离线分支刻意把「天」写进本地 SQLite 并入队：`TRAVEL_DAY` 的两条上行路径
 * （云端 id 已在 / 只有本地 UUID）都由 sync-dispatcher 的 resolveRemoteId 处理，
 * 于是"离线建旅行 → 离线加天 → 联网全量上传"整条链路才闭合。
 */
export async function addTravelDay(input: AddTravelDayInput): Promise<AddTravelDayResult> {
  if (isNativePlatform()) {
    const queue = new SyncQueue(getSyncQueueStorage())
    const localId = crypto.randomUUID()
    const parent = input.travelId != null ? String(input.travelId) : input.localTravelId
    if (!parent) return { ok: false, error: '找不到这本旅行的本地记录，请先同步' }
    await writeLocalEntity(
      {
        table: 'travel_day',
        id: localId,
        entityType: 'TRAVEL_DAY',
        remoteId: null,
        operation: 'CREATE',
        data: {
          travelId: parent,
          date: input.date ? new Date(input.date).getTime() : null,
          title: input.title || null,
          summary: input.summary || null,
          sortOrder: Date.now(),
        },
      },
      queue,
    )
    return { ok: true, local: true, id: null, localId }
  }

  if (input.travelId == null) {
    return { ok: false, error: '该旅行尚未同步到云端，请联网后重试' }
  }

  try {
    const res = await fetch(apiUrl(`/api/travels/${input.travelId}/days`), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: input.date || undefined, title: input.title, summary: input.summary }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: json?.error || '添加失败' }
    return { ok: true, id: typeof json?.id === 'number' ? json.id : null }
  } catch {
    return { ok: false, error: '网络错误，请重试' }
  }
}
