/**
 * 下载拉取分发器（Stage 3.4b）：把服务器列表接口映射为本地表记录快照。
 * 首期覆盖「离线读」的列表级实体（MOMENT / TRAVEL / ALBUM）；
 * MEMORY / MEDIA / TRAVEL_DAY / ALBUM_MEDIA 需要 spaceId 作用域接口或详情扇出，留待后续子阶段。
 *
 * B4：新增 `pullChanges()` 优先走增量端点 GET /api/sync/changes（带游标、含墓碑）；
 * 端点不存在（404）或请求失败时返回 null，调用方回退到原有全量拉取（兼容老服务端）。
 */
import { apiUrl } from '@/lib/api-base'
import { getMeta, META_KEYS } from './meta'
import type { EntityType } from './types'

/**
 * 增量拉取游标（P2-29）。
 *
 * 客户端先带出去，服务端支持后即自动生效；**服务端未支持时行为不变**（多余 query 参数被忽略）。
 * 时间用毫秒时间戳字符串，避免服务端/客户端时区与格式歧义。
 */
async function sinceParam(): Promise<string> {
  const raw = await getMeta(META_KEYS.lastSyncAt)
  const since = raw ? Number(raw) : 0
  return Number.isFinite(since) && since > 0 ? 'updatedSince=' + Math.floor(since) : ''
}

/** B4 增量游标：优先 syncCursor，其次兼容旧的 lastSyncAt（首次升级时游标为空 → 全量） */
async function cursorParam(): Promise<string> {
  const raw = (await getMeta(META_KEYS.syncCursor)) ?? (await getMeta(META_KEYS.lastSyncAt))
  const since = raw ? Number(raw) : 0
  return Number.isFinite(since) && since > 0 ? 'updatedSince=' + Math.floor(since) : ''
}

function withQuery(url: string, ...parts: string[]): string {
  const qs = parts.filter(Boolean).join('&')
  if (!qs) return url
  return url + (url.includes('?') ? '&' : '?') + qs
}

/** 一条待落地的远端记录（已映射为本地表列名 → 值） */
export interface PullEntity {
  /** 本地表名（travel / album / moment / memory） */
  table: string
  /** 本地 id（= String(remoteId)） */
  id: string
  remoteId: number
  /** LWW 时间戳（毫秒） */
  updatedAt: number
  /** 本地表列名 → 值 的快照 */
  data: Record<string, unknown>
}

/** B4：服务端墓碑（删除传播） */
export interface PullTombstone {
  entityType: 'Travel' | 'Moment' | 'Album' | 'Memory'
  entityId: number
}

/** B4：增量拉取结果；serverTime = 下一轮游标（服务端时刻，避免客户端时钟偏差） */
export interface PullChanges {
  serverTime: number
  entities: PullEntity[]
  tombstones: PullTombstone[]
}

export interface PullDispatcher {
  /** 拉取某实体类型的远端记录列表 */
  pull(entityType: EntityType): Promise<PullEntity[]>
  /** B4：增量拉取；服务端不支持（404/失败）返回 null，调用方回退全量 */
  pullChanges?(): Promise<PullChanges | null>
}

function toMs(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  const t = new Date(v).getTime()
  return isNaN(t) ? 0 : t
}

function mapMomentRow(m: any): PullEntity {
  return {
    table: 'moment',
    id: String(m.id),
    remoteId: Number(m.id),
    updatedAt: toMs(m.updatedAt) || toMs(m.createdAt) || Date.now(),
    data: {
      content: m.content,
      tags: Array.isArray(m.tags) ? JSON.stringify(m.tags) : null,
      userId: m.userId ?? null,
      isPublic: m.isPublic ? 1 : 0,
    },
  }
}

function mapTravelRow(t: any): PullEntity {
  return {
    table: 'travel',
    id: String(t.id),
    remoteId: Number(t.id),
    updatedAt: toMs(t.updatedAt) || Date.now(),
    data: {
      title: t.title,
      slug: t.slug,
      description: t.description ?? null,
      location: t.location ?? null,
      cover: t.cover ?? null,
      startDate: t.startDate ? new Date(t.startDate).getTime() : null,
      endDate: t.endDate ? new Date(t.endDate).getTime() : null,
      status: t.status ?? 'PLANNED',
      visibility: t.visibility ?? 'SPACE',
      isPublic: t.isPublic ? 1 : 0,
      spaceId: t.spaceId ?? null,
      ownerId: t.ownerId ?? null,
    },
  }
}

function mapAlbumRow(a: any): PullEntity {
  return {
    table: 'album',
    id: String(a.id),
    remoteId: Number(a.id),
    updatedAt: toMs(a.updatedAt) || toMs(a.createdAt) || Date.now(),
    data: {
      title: a.title,
      description: a.description ?? null,
      coverMediaId: a.coverMediaId ?? null,
      date: a.date ? new Date(a.date).getTime() : null,
      locationId: a.locationId ?? null,
      travelId: a.travelId ?? null,
      visibility: a.visibility ?? 'SPACE',
      isPublic: a.isPublic ? 1 : 0,
      spaceId: a.spaceId ?? null,
      userId: a.userId ?? null,
    },
  }
}

/** B4：本地 memory 表用 TEXT 存 travelId/travelDayId（可能是本地 UUID），服务端数字 id 转字符串即可 */
function mapMemoryRow(m: any): PullEntity {
  return {
    table: 'memory',
    id: String(m.id),
    remoteId: Number(m.id),
    updatedAt: toMs(m.updatedAt) || toMs(m.createdAt) || Date.now(),
    data: {
      spaceId: m.spaceId ?? null,
      travelId: m.travelId != null ? String(m.travelId) : null,
      travelDayId: m.travelDayId != null ? String(m.travelDayId) : null,
      title: m.title ?? '',
      content: m.content ?? null,
      happenedAt: m.happenedAt ? new Date(m.happenedAt).getTime() : null,
      mood: m.mood ?? null,
      visibility: m.visibility ?? 'SPACE',
      createdById: m.createdById ?? null,
    },
  }
}

function isTombstoneEntityType(v: unknown): v is PullTombstone['entityType'] {
  return v === 'Travel' || v === 'Moment' || v === 'Album' || v === 'Memory'
}

export class HttpPullDispatcher implements PullDispatcher {
  async pull(entityType: EntityType): Promise<PullEntity[]> {
    try {
      switch (entityType) {
        case 'MOMENT': return await this.pullMoments()
        case 'TRAVEL': return await this.pullTravels()
        case 'ALBUM': return await this.pullAlbums()
        case 'SOCIAL_POST': return await this.pullSocialPosts()
        default: return []
      }
    } catch {
      return []
    }
  }

  /**
   * B4 增量拉取：GET /api/sync/changes?updatedSince=<游标>
   * 返回 null 表示「服务端不支持/请求失败」——调用方回退全量拉取，不推进游标。
   */
  async pullChanges(): Promise<PullChanges | null> {
    let res: Response
    try {
      res = await fetch(apiUrl(withQuery('/api/sync/changes', await cursorParam())), { credentials: 'include' })
    } catch {
      return null
    }
    // 404 = 老服务端没有该端点；其余非 2xx 也回退（可能是未登录/网关错误）
    if (!res.ok) return null
    let json: any
    try {
      json = await res.json()
    } catch {
      return null
    }
    if (!json || typeof json !== 'object') return null

    const entities: PullEntity[] = [
      ...(Array.isArray(json.travels) ? json.travels.map(mapTravelRow) : []),
      ...(Array.isArray(json.moments) ? json.moments.map(mapMomentRow) : []),
      ...(Array.isArray(json.albums) ? json.albums.map(mapAlbumRow) : []),
      ...(Array.isArray(json.memories) ? json.memories.map(mapMemoryRow) : []),
    ]
    const tombstones: PullTombstone[] = (Array.isArray(json.tombstones) ? json.tombstones : [])
      .filter((t: any) => isTombstoneEntityType(t?.entityType) && Number.isFinite(Number(t?.entityId)))
      .map((t: any) => ({ entityType: t.entityType, entityId: Number(t.entityId) }))

    return {
      serverTime: toMs(json.serverTime) || Date.now(),
      entities,
      tombstones,
    }
  }

  private async pullMoments(): Promise<PullEntity[]> {
    const res = await fetch(apiUrl(withQuery('/api/admin/moments?page=1&pageSize=200', await sinceParam())), { credentials: 'include' })
    if (!res.ok) return []
    const json = await res.json()
    const rows = json?.data?.data ?? []
    return rows.map(mapMomentRow)
  }

  private async pullTravels(): Promise<PullEntity[]> {
    const res = await fetch(apiUrl(withQuery('/api/admin/travels', await sinceParam())), { credentials: 'include' })
    if (!res.ok) return []
    const json = await res.json()
    const rows = json?.travels ?? []
    return rows.map(mapTravelRow)
  }

  private async pullAlbums(): Promise<PullEntity[]> {
    const res = await fetch(apiUrl(withQuery('/api/admin/albums', await sinceParam())), { credentials: 'include' })
    if (!res.ok) return []
    const json = await res.json()
    const rows = json?.albums ?? []
    return rows.map(mapAlbumRow)
  }

  /** 旅行圈 Feed 缓存（D2 社交离线读）：拉推荐 Feed 前若干条进本地 social_post */
  private async pullSocialPosts(): Promise<PullEntity[]> {
    const res = await fetch(apiUrl(withQuery('/api/social/posts?tab=recommended&page=1&pageSize=50', await sinceParam())), { credentials: 'include' })
    if (!res.ok) return []
    const json = await res.json()
    const rows = json?.data ?? []
    return rows.map((p: any): PullEntity => ({
      table: 'social_post',
      id: String(p.id),
      remoteId: Number(p.id),
      updatedAt: toMs(p.publishedAt) || Date.now(),
      data: {
        title: p.title ?? '',
        summary: p.summary ?? null,
        coverUrl: p.coverUrl ?? null,
        location: p.location ?? null,
        startDate: p.startDate ? new Date(p.startDate).getTime() : null,
        endDate: p.endDate ? new Date(p.endDate).getTime() : null,
        dayCount: p.dayCount ?? 0,
        photoCount: p.photoCount ?? 0,
        authorId: p.author?.id ?? null,
        authorName: p.author?.username ?? null,
        authorNickname: p.author?.nickname ?? null,
        authorAvatar: p.author?.avatarUrl ?? null,
        likeCount: p.likeCount ?? 0,
        commentCount: p.commentCount ?? 0,
        favoriteCount: p.favoriteCount ?? 0,
        isLiked: p.isLiked ? 1 : 0,
        isFavorited: p.isFavorited ? 1 : 0,
        publishedAt: p.publishedAt ? new Date(p.publishedAt).getTime() : null,
      },
    }))
  }
}
