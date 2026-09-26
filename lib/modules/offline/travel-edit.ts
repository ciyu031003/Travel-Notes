/**
 * 旅行信息编辑 · 离线写（原生壳）。
 *
 * 策略与新建一致：**在线优先、本地兜底**（writeThrough）。
 * 详见文件末尾 updateTravelInfo 的注释。
 */
import { writeLocalEntity, markEntitySynced } from './local-write'
import { SyncQueue } from './sync-queue'
import { getSyncQueueStorage } from './storage'
import { queryById, queryRows } from './dao'
import { rowGet } from './native/sqlite-db'
import { apiUrl } from '@/lib/api-base'
import { writeThrough } from './write-through'
import { makeTravelSlug } from '@/lib/modules/travel/slug'

export interface UpdateTravelInfoInput {
  /** 云端的旅行 id（离线新建尚未同步时为 null） */
  travelId: number | null
  /** 当前 slug：离线场景用它定位本地行 */
  slug: string
  title?: string
  location?: string
  description?: string
  startDate?: string | null
  endDate?: string | null
  /** 预算（元）；null 表示清空 */
  budget?: number | null
}

export interface UpdateTravelInfoResult {
  ok: boolean
  error?: string
  /** 是否本地写入（离线，待同步） */
  local?: boolean
  /** 保存后的 slug（改标题时可能变化，前台据此 replace 地址） */
  slug?: string
  /** 服务端因区间变化调整的天数（仅在线时有值） */
  daysChanged?: number
}

/** 本地行定位：先按云端 remoteId，再按 slug，最后按本地行 id */
export async function findLocalTravelRowId(slug: string, remoteId: number | null): Promise<string | null> {
  // 一律按列名取值（rowGet）：Android 返回列名对象，键序不等于 SELECT 列序
  if (remoteId != null) {
    const rows = await queryRows('SELECT id FROM travel WHERE remoteId = ? AND deleted = 0 LIMIT 1', [remoteId]).catch(
      () => [],
    )
    const id = rowGet(rows[0], 'id')
    if (id != null) return String(id)
  }
  const bySlug = await queryRows('SELECT id FROM travel WHERE slug = ? AND deleted = 0 LIMIT 1', [slug]).catch(() => [])
  const idBySlug = rowGet(bySlug[0], 'id')
  if (idBySlug != null) return String(idBySlug)
  const byId = await queryById('travel', slug).catch(() => null)
  const localId = rowGet(byId, 'id')
  return localId != null ? String(localId) : null
}

export async function updateTravelInfo(input: UpdateTravelInfoInput): Promise<UpdateTravelInfoResult> {
  /**
   * 与新建旅行同一套策略：**在线优先、本地兜底**。
   *
   * 历史缺陷：原生端只要本地缓存里找不到这一行就**直接失败**
   * （返回"本地没有这本书的缓存，请联网后重试"），可设备明明是在线的 ——
   * 本地缓存不全时「编辑旅行信息」永远保存不了。现在在线写不再依赖本地行，
   * 本地写只是"顺手也存一份"，供离线查看。
   */
  const localRowId = await findLocalTravelRowId(input.slug, input.travelId).catch(() => null)
  const nextSlug =
    input.title !== undefined && input.title.trim()
      ? makeTravelSlug(input.title, (localRowId ?? input.slug).slice(0, 8))
      : input.slug

  let wroteLocal = false
  const r = await writeThrough<{ slug?: string; daysChanged?: number }>({
    entityId: localRowId,
    localWrite: async () => {
      if (!localRowId) throw new Error('本地没有这本旅行的缓存')
      const data: Record<string, unknown> = {}
      if (input.title !== undefined) data.title = input.title
      if (input.location !== undefined) data.location = input.location || null
      if (input.description !== undefined) data.description = input.description || null
      if (input.startDate !== undefined) data.startDate = input.startDate ? new Date(input.startDate).getTime() : null
      if (input.endDate !== undefined) data.endDate = input.endDate ? new Date(input.endDate).getTime() : null
      if (input.budget !== undefined) data.budget = input.budget
      // 改标题 → 本地 slug 也跟着改，保证下次进详情页地址可用
      if (nextSlug !== input.slug) data.slug = nextSlug

      const queue = new SyncQueue(getSyncQueueStorage())
      await writeLocalEntity(
        {
          table: 'travel',
          id: localRowId,
          entityType: 'TRAVEL',
          // remoteId 已在云端时一并带上，避免队列里的 UPDATE 缺 remoteId 被丢弃
          remoteId: input.travelId ?? null,
          operation: 'UPDATE',
          data,
        },
        queue,
      )
      wroteLocal = true
    },
    serverWrite: async () => {
      if (input.travelId == null) return { ok: false, error: '该旅行尚未同步到云端，请联网后重试' }
      try {
        const res = await fetch(apiUrl(`/api/travels/by-slug/${encodeURIComponent(input.slug)}`), {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: input.title,
            location: input.location,
            description: input.description,
            startDate: input.startDate,
            endDate: input.endDate,
            budget: input.budget,
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { ok: false, error: json?.error || `保存失败（HTTP ${res.status}）` }
        return {
          ok: true,
          data: {
            slug: typeof json?.slug === 'string' && json.slug ? json.slug : input.slug,
            daysChanged: typeof json?.daysChanged === 'number' ? json.daysChanged : undefined,
          },
        }
      } catch {
        return { ok: false, error: '网络不可用' }
      }
    },
    onServerOk: async (data) => {
      if (wroteLocal && localRowId) {
        await markEntitySynced('TRAVEL', localRowId, input.travelId ?? null, data?.slug ?? null)
      }
    },
  })

  if (r.mode === 'server') {
    return { ok: true, slug: r.data?.slug ?? input.slug, daysChanged: r.data?.daysChanged }
  }
  if (r.mode === 'local') return { ok: true, local: true, slug: nextSlug }
  return { ok: false, error: r.error }
}
