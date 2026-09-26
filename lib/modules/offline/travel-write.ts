/**
 * 旅行离线写（Stage 3.4 接线 · D-4 首期离线写范围）：
 * - 原生壳：本地乐观写 SQLite（travel 表）+ 入 SyncQueue，联网后 SyncEngine 自动上传云端（服务端复检权限）。
 * - Web：直接走在线 /api/admin/travels。
 */
import { writeLocalEntity, markEntitySynced } from './local-write'
import { SyncQueue } from './sync-queue'
import { getSyncQueueStorage } from './storage'
import { isNativePlatform } from './platform'
import { apiUrl } from '@/lib/api-base'
import { makeTravelSlug } from '@/lib/modules/travel/slug'
import { writeThrough } from './write-through'

export interface CreateTravelInput {
  title: string
  description?: string
  startDate?: string
  endDate?: string
  /** 目的地 → `Travel.location`（画册按城市成册依赖它，见 travel.service.createTravel 注释） */
  location?: string
  isPublic?: boolean
  /** 可见性三档（PRIVATE/SPACE/PUBLIC）；服务端据此写 visibility */
  visibility?: 'PRIVATE' | 'SPACE' | 'PUBLIC'
  /** 直接建在某个空间下（可选） */
  spaceId?: number | null
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
  /** 上传成功后的云端主键（有它才说明这本旅行在云端可编辑） */
  remoteId?: number | null
}

/**
 * 新建旅行。
 *
 * **在线优先，本地兜底** —— 这是 1.16.2 的结构性修正。
 *
 * 上一版的致命问题：原生壳里把「本地 SQLite 写入」当作**关键路径**，
 * 而设备上的本地库存在列漂移/插件异常等不可控因素。一旦本地写入或本地读取失败，
 * 用户既不落云端、也读不到本地 → 得到「服务器不存在、本机也没有离线副本」，
 * 旅行等于凭空消失（真机截图就是这个）。
 *
 * 现在的顺序：
 *   ① 先尽力写本地（离线可用 + 详情页能立刻渲染），**失败不阻断**；
 *   ② **在线就直接 POST 服务端**（与 Web 完全同一条已验证路径），成功即以服务端 slug 为准；
 *   ③ 服务端也失败（真离线）→ 才依赖本地行；本地行也没有 → 明确报错，不再假装成功。
 *
 * 用户的心智模型是对的：能联网就先落云端；不能联网就本地暂存、联网后补传。
 */
export async function createTravel(input: CreateTravelInput): Promise<CreateTravelResult> {
  const title = input.title.trim()
  if (!title) return { ok: false, error: '请输入旅行名称' }

  if (isNativePlatform()) {
    const localId = crypto.randomUUID()
    const localSlug = makeTravelSlug(title, localId.slice(0, 8))

    // ① 尽力写本地（失败只记录，不影响后续在线创建）
    let localWritten = false
    let localWriteError = ''
    try {
      const queue = new SyncQueue(getSyncQueueStorage())
      await writeLocalEntity(
        {
          table: 'travel',
          id: localId,
          entityType: 'TRAVEL',
          remoteId: null,
          operation: 'CREATE',
          data: {
            title,
            slug: localSlug,
            description: input.description || null,
            location: input.location?.trim() || null,
            cover: null,
            startDate: input.startDate ? new Date(input.startDate).getTime() : null,
            endDate: input.endDate ? new Date(input.endDate).getTime() : null,
            status: 'PLANNED',
            // 本地行也跟随表单的可见性与归属，避免"本地待同步态"与云端语义不一致
            visibility: input.visibility || 'PRIVATE',
            travelType: input.travelType || 'ALONE',
            companions: input.companions ? JSON.stringify(input.companions) : null,
            isPublic: input.visibility === 'PUBLIC' || input.isPublic ? 1 : 0,
            spaceId: input.spaceId ?? null,
            ownerId: null,
          },
        },
        queue,
      )
      localWritten = true
    } catch (e) {
      localWriteError = e instanceof Error ? e.message : '本地写入失败'
      console.warn('[travel-write] 本地写入失败，改为直接走服务端:', localWriteError)
    }

    // ② 在线优先：直接创建到服务端（与 Web 同一条路径）
    const online = await createTravelOnline(input)
    if (online.ok) {
      /**
       * 本地行若存在：回填云端 id + 服务端 slug，**并清掉队列项**。
       *
       * 清队列是必须的：`writeLocalEntity` 已经把这本旅行排进了待上传队列，
       * 如果不清，SyncEngine 稍后会再 POST 一次 → 同一本旅行出现两份
       * （服务端 slug 唯一化会把它变成"标题"和"标题-2"两本）。
       */
      if (localWritten) {
        await markEntitySynced('TRAVEL', localId, online.remoteId ?? null, online.slug ?? null).catch(() => {})
      }
      // 清队列（无论本地写是否成功，理由见 write-through.ts）。
      // 用 try/catch 而不是 .catch()：`new SyncQueue` 在存储不可用时是**同步抛错**。
      try {
        await new SyncQueue(getSyncQueueStorage()).markDoneByEntityId(localId)
      } catch {
        // 清不掉也不影响创建结果
      }
      return { ok: true, local: false, slug: online.slug ?? localSlug, localId, remoteId: online.remoteId ?? null }
    }

    // ③ 服务端不可用：只能靠本地暂存
    if (localWritten) {
      return { ok: true, local: true, slug: localSlug, localId }
    }
    return {
      ok: false,
      error: localWriteError
        ? `保存失败（本地：${localWriteError}；网络：${online.error || '不可用'}）`
        : online.error || '创建失败，请检查网络后重试',
    }
  }

  // Web（非原生）：直接在线
  const online = await createTravelOnline(input)
  if (!online.ok) return { ok: false, error: online.error }
  return { ok: true, slug: online.slug ?? null, remoteId: online.remoteId ?? null }
}

/** 在线创建（原生与 Web 共用；返回服务端 slug 与 id） */
async function createTravelOnline(
  input: CreateTravelInput,
): Promise<{ ok: boolean; error?: string; slug?: string | null; remoteId?: number | null }> {
  try {
    const res = await fetch(apiUrl('/api/admin/travels'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: json?.error || `创建失败（HTTP ${res.status}）` }
    const slug = typeof json?.slug === 'string' && json.slug ? json.slug : null
    const remoteId = Number.isFinite(Number(json?.id)) && Number(json?.id) > 0 ? Number(json.id) : null
    return { ok: true, slug, remoteId }
  } catch {
    return { ok: false, error: '网络不可用' }
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
  const localId = crypto.randomUUID()
  const parent = input.travelId != null ? String(input.travelId) : input.localTravelId

  let wroteLocal = false
  const r = await writeThrough<{ id: number | null }>({
    entityId: localId,
    // ① 本地乐观写（离线可用）。注意 parent 缺失时要报错，不能静默写出一行无父的"天"
    localWrite: async () => {
      if (!parent) throw new Error('找不到这本旅行的本地记录，请先同步')
      const queue = new SyncQueue(getSyncQueueStorage())
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
      wroteLocal = true
    },
    // ② 在线直写服务端。
    // 为什么必须做：行程 tab 读的是**服务端** timeline，只写本地的话
    // 「加完一天返回详情就没了」—— 真机必然报这个。
    serverWrite: async () => {
      if (input.travelId == null) return { ok: false, error: '该旅行尚未同步到云端，请联网后重试' }
      try {
        const res = await fetch(apiUrl(`/api/travels/${input.travelId}/days`), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: input.date || undefined, title: input.title, summary: input.summary }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { ok: false, error: json?.error || `添加失败（HTTP ${res.status}）` }
        const id = Number(json?.id)
        return { ok: true, data: { id: Number.isFinite(id) ? id : null } }
      } catch {
        return { ok: false, error: '网络不可用' }
      }
    },
    onServerOk: async (data) => {
      if (wroteLocal) await markEntitySynced('TRAVEL_DAY', localId, data?.id ?? null)
    },
  })

  if (r.mode === 'server') return { ok: true, id: r.data?.id ?? null }
  if (r.mode === 'local') return { ok: true, local: true, id: null, localId }
  return { ok: false, error: r.error }
}
