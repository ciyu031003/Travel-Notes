/**
 * 下载拉取分发器（Stage 3.4b）：把服务器列表接口映射为本地表记录快照。
 * 首期覆盖「离线读」的列表级实体（MOMENT / TRAVEL / ALBUM）；
 * MEMORY / MEDIA / TRAVEL_DAY / ALBUM_MEDIA 需要 spaceId 作用域接口或详情扇出，留待后续子阶段。
 */
import { apiUrl } from '@/lib/api-base'
import type { EntityType } from './types'

/** 一条待落地的远端记录（已映射为本地表列名 → 值） */
export interface PullEntity {
  /** 本地表名（travel / album / moment） */
  table: string
  /** 本地 id（= String(remoteId)） */
  id: string
  remoteId: number
  /** LWW 时间戳（毫秒） */
  updatedAt: number
  /** 本地表列名 → 值 的快照 */
  data: Record<string, unknown>
}

export interface PullDispatcher {
  /** 拉取某实体类型的远端记录列表 */
  pull(entityType: EntityType): Promise<PullEntity[]>
}

function toMs(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  const t = new Date(v).getTime()
  return isNaN(t) ? 0 : t
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

  private async pullMoments(): Promise<PullEntity[]> {
    const res = await fetch(apiUrl('/api/admin/moments?page=1&pageSize=200'), { credentials: 'include' })
    if (!res.ok) return []
    const json = await res.json()
    const rows = json?.data?.data ?? []
    return rows.map((m: any): PullEntity => ({
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
    }))
  }

  private async pullTravels(): Promise<PullEntity[]> {
    const res = await fetch(apiUrl('/api/admin/travels'), { credentials: 'include' })
    if (!res.ok) return []
    const json = await res.json()
    const rows = json?.travels ?? []
    return rows.map((t: any): PullEntity => ({
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
        visibility: t.visibility ?? 'COUPLE',
        isPublic: t.isPublic ? 1 : 0,
        spaceId: t.spaceId ?? null,
        ownerId: t.ownerId ?? null,
      },
    }))
  }

  private async pullAlbums(): Promise<PullEntity[]> {
    const res = await fetch(apiUrl('/api/admin/albums'), { credentials: 'include' })
    if (!res.ok) return []
    const json = await res.json()
    const rows = json?.albums ?? []
    return rows.map((a: any): PullEntity => ({
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
        visibility: a.visibility ?? 'COUPLE',
        isPublic: a.isPublic ? 1 : 0,
        spaceId: a.spaceId ?? null,
        userId: a.userId ?? null,
      },
    }))
  }

  /** 旅行圈 Feed 缓存（D2 社交离线读）：拉推荐 Feed 前若干条进本地 social_post */
  private async pullSocialPosts(): Promise<PullEntity[]> {
    const res = await fetch(apiUrl('/api/social/posts?tab=recommended&page=1&pageSize=50'), { credentials: 'include' })
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
