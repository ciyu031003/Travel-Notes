/**
 * 旅行信息编辑 · 离线写（原生壳）。
 *
 * 需求背景：用户反馈"建完的旅行看不到、也没法进一步设置"——前台此前**完全没有**
 * 修改入口，目的地写错 / 日期漏填都无法补救。本文件把"已存在的旅行"做成可编辑，
 * 且沿用既有离线策略：原生壳先乐观写本地 SQLite + 入 SyncQueue，联网后 SyncEngine 上传。
 *
 * 与新建（travel-write.ts）的差别：
 *  · 目标行已存在 → 用 UPDATE 而不是 CREATE，队列项带 remoteId（能取到的话）；
 *  · 本地表主键是 UUID（`id`），而页面只拿得到 slug / 云端 id → 先反查本地行；
 *  · 本地未同步（remoteId == null）时，队列项 remoteId 为 null，由同步侧按本地行补全。
 */
import { writeLocalEntity } from './local-write'
import { SyncQueue } from './sync-queue'
import { getSyncQueueStorage } from './storage'
import { isNativePlatform } from './platform'
import { queryById, queryRows } from './dao'
import { apiUrl } from '@/lib/api-base'
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
  if (remoteId != null) {
    const rows = await queryRows('SELECT id FROM travel WHERE remoteId = ? AND deleted = 0 LIMIT 1', [remoteId]).catch(
      () => [],
    )
    if (rows[0]) return String(rows[0][0])
  }
  const bySlug = await queryRows('SELECT id FROM travel WHERE slug = ? AND deleted = 0 LIMIT 1', [slug]).catch(() => [])
  if (bySlug[0]) return String(bySlug[0][0])
  const byId = await queryById('travel', slug).catch(() => null)
  return byId ? String(byId[0]) : null
}

export async function updateTravelInfo(input: UpdateTravelInfoInput): Promise<UpdateTravelInfoResult> {
  if (isNativePlatform()) {
    const data: Record<string, unknown> = {}
    if (input.title !== undefined) data.title = input.title
    if (input.location !== undefined) data.location = input.location || null
    if (input.description !== undefined) data.description = input.description || null
    if (input.startDate !== undefined) data.startDate = input.startDate ? new Date(input.startDate).getTime() : null
    if (input.endDate !== undefined) data.endDate = input.endDate ? new Date(input.endDate).getTime() : null
    if (input.budget !== undefined) data.budget = input.budget

    // 本地表主键是 UUID，不是 slug：直接拿 slug 当 id 落库会插出一个"影子行"，
    // 列表里于是出现两本同名旅行。必须先反查真实本地行；查不到就放弃本地写（走在线分支）。
    const localRowId = await findLocalTravelRowId(input.slug, input.travelId)
    if (!localRowId) {
      return { ok: false, error: '本地没有这本书的缓存，请联网后重试' }
    }

    // 改标题 → 本地 slug 也跟着改，保证下次进详情页地址可用（与服务端 makeUniqueTravelSlug 同源策略）
    const nextSlug = input.title !== undefined && input.title.trim() ? makeTravelSlug(input.title, localRowId.slice(0, 8)) : input.slug
    if (nextSlug !== input.slug) data.slug = nextSlug

    const queue = new SyncQueue(getSyncQueueStorage())
    await writeLocalEntity(
      {
        table: 'travel',
        id: localRowId,
        entityType: 'TRAVEL',
        remoteId: input.travelId,
        operation: 'UPDATE',
        data,
      },
      queue,
    )
    return { ok: true, local: true, slug: nextSlug }
  }

  if (input.travelId == null) {
    return { ok: false, error: '该旅行尚未同步到云端，请联网后重试' }
  }

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
    if (!res.ok) return { ok: false, error: json?.error || '保存失败' }
    return {
      ok: true,
      slug: typeof json?.slug === 'string' && json.slug ? json.slug : input.slug,
      daysChanged: typeof json?.daysChanged === 'number' ? json.daysChanged : undefined,
    }
  } catch {
    return { ok: false, error: '网络错误，请重试' }
  }
}
