/**
 * 空间概览（空间详情页的数据装配）。
 *
 * 为什么抽成服务：同一份数据有两个入口 ——
 *   ① Web/服务端：`/space/[slug]` 页面直接用（少一次 HTTP 往返）；
 *   ② 移动端/客户端：静态导出的壳必须走 API（`/api/spaces/by-slug/<slug>` 与
 *      `/api/spaces/<id>/overview`）。
 * 两边若各写一份装配逻辑，迟早出现「网页有、App 没有」的字段漂移。
 * 因此装配只此一处，路由只负责把结果转成 HTTP 响应。
 */
import { spaceService } from './space.service'
import { SpaceAccessError } from './permissions'
import { travelService as spaceTravelService } from '../travel/space-travel.service'
import { listAlbumsForSpace } from '../album/album.service'
import { memoryService } from '../memory/memory.service'
import type { SpaceOverview } from './space-overview.types'

export interface OverviewLimits {
  travels?: number
  albums?: number
  memories?: number
  activity?: number
}

/**
 * 装配空间概览。非成员抛 `SpaceAccessError`（路由转 403），空间不存在返回 null（转 404）。
 * 单段内容取数失败不会拖垮整页：各自 catch 成空数组，保证详情页永远能打开。
 */
export async function getSpaceOverview(
  username: string,
  spaceId: number,
  limits: OverviewLimits = {},
): Promise<SpaceOverview | null> {
  const activityLimit = Math.min(Math.max(limits.activity ?? 20, 1), 100)

  // 空间本体（内部已做 requireSpaceMember）
  const space = await spaceService.getSpace(username, spaceId)
  if (!space) return null

  const [travels, albums, memories, activity, members] = await Promise.all([
    spaceTravelService.listTravels(username, spaceId).catch(() => []),
    listAlbumsForSpace(spaceId).catch(() => []),
    memoryService.listMemories(username, spaceId).catch(() => []),
    spaceService.getActivity(username, spaceId, activityLimit).catch(() => []),
    spaceService.listMembers(username, spaceId).catch(() => []),
  ])

  // 「正在规划」= PLANNED 且出发日期在未来；没写日期的计划也归入（用户可能还没定日子）
  const now = Date.now()
  const upcoming = travels
    .filter((t) => {
      if (t.status !== 'PLANNED') return false
      if (!t.startDate) return true
      const ts = new Date(t.startDate).getTime()
      return Number.isFinite(ts) ? ts >= now : true
    })
    .slice(0, 4)

  return {
    space: {
      id: space.id,
      name: space.name,
      slug: space.slug,
      description: space.description,
      spaceType: space.spaceType,
      myRole: space.myRole,
      memberCount: space.memberCount,
      members: (space.members ?? []).map((m) => ({
        username: m.username,
        nickname: m.nickname,
        avatarUrl: m.avatarUrl,
        role: m.role,
      })),
      createdAt: space.createdAt,
    },
    stats: {
      travelCount: space.travelCount ?? travels.length,
      albumCount: space.albumCount ?? albums.length,
      memoryCount: space.memoryCount ?? memories.length,
      mediaCount: space.mediaCount ?? 0,
    },
    travels: travels.slice(0, limits.travels ?? 6).map((t) => ({
      id: t.id,
      title: t.title,
      slug: t.slug,
      status: String(t.status),
      startDate: t.startDate,
      travelType: String(t.travelType),
      visibility: String(t.visibility),
    })),
    albums: albums.slice(0, limits.albums ?? 6).map((a) => ({
      id: a.id,
      title: a.title,
      coverUrl: a.coverUrl,
      mediaCount: a.mediaCount,
    })),
    memories: memories.slice(0, limits.memories ?? 6).map((m) => ({
      id: m.id,
      content: m.content ?? null,
      createdBy: m.createdBy ?? null,
      happenedAt: m.happenedAt ?? null,
    })),
    upcoming: upcoming.map((t) => ({
      id: t.id,
      title: t.title,
      slug: t.slug,
      startDate: t.startDate,
    })),
    activity: activity.map((a) => ({
      id: a.id,
      username: a.username,
      action: a.action,
      resourceType: a.resourceType,
      resourceId: a.resourceId,
      metadata: a.metadata,
      createdAt: a.createdAt,
    })),
    members: members
      .filter((m) => m.status === 'ACTIVE')
      .map((m) => ({
        id: m.id,
        username: m.username,
        nickname: m.nickname,
        avatarUrl: m.avatarUrl,
        role: m.role,
        status: m.status,
        joinedAt: m.joinedAt,
      })),
  }
}

/** 按 slug 装配（先解析 slug → id；空间不存在返回 null） */
export async function getSpaceOverviewBySlug(
  username: string,
  slug: string,
  limits: OverviewLimits = {},
): Promise<SpaceOverview | null> {
  const found = await spaceService.getSpaceIdBySlug(slug)
  if (!found) return null
  return getSpaceOverview(username, found, limits)
}

export { SpaceAccessError }
