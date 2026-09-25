import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { spaceService } from '@/lib/modules/space/space.service'
import { travelService as spaceTravelService } from '@/lib/modules/travel/space-travel.service'
import { listAlbumsForSpace } from '@/lib/modules/album/album.service'
import { memoryService } from '@/lib/modules/memory/memory.service'
import { SpaceAccessError } from '@/lib/modules/space/permissions'

/**
 * 空间概览（P2）：一次取回空间详情页需要的全部数据。
 *
 * 为什么要合成一个接口：空间详情页有 5 段内容（空间信息 / 旅行 / 相册 / 回忆 / 动态），
 * 移动端逐个请求要 5 次往返且各自重复做一次成员校验。这里合成一次，
 * 权限判定仍然只在服务层做一次（`requireSpaceRole`）。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const spaceId = parseInt(id, 10)
  if (isNaN(spaceId)) {
    return NextResponse.json({ error: '无效的空间 ID' }, { status: 400 })
  }

  const url = new URL(request.url)
  const activityLimit = Math.min(Math.max(parseInt(url.searchParams.get('activity') || '20', 10) || 20, 1), 100)

  try {
    // ① 空间本体（内部已做 requireSpaceMember，非成员会抛 SpaceAccessError → 403）
    const space = await spaceService.getSpace(auth.username, spaceId)
    if (!space) {
      return NextResponse.json({ error: '空间不存在' }, { status: 404 })
    }

    // ② 内容四段：任一段失败不拖垮整页（返回空数组 + 记录），保证详情页永远能打开
    const [travels, albums, memories, activity] = await Promise.all([
      spaceTravelService.listTravels(auth.username, spaceId).catch(() => []),
      listAlbumsForSpace(spaceId).catch(() => []),
      memoryService.listMemories(auth.username, spaceId).catch(() => []),
      spaceService.getActivity(auth.username, spaceId, activityLimit).catch(() => []),
    ])

    // ③ 「正在规划」= PLANNED 且出发日期在未来（没有日期的计划也归入，用户可能还没定日子）
    const now = Date.now()
    const upcoming = travels
      .filter((t: { status?: string; startDate?: string | null }) => {
        if (t.status !== 'PLANNED') return false
        if (!t.startDate) return true
        const ts = new Date(t.startDate).getTime()
        return Number.isFinite(ts) ? ts >= now : true
      })
      .slice(0, 6)

    const recentTravels = travels.slice(0, 6)
    const recentAlbums = albums.slice(0, 6)
    const recentMemories = memories.slice(0, 8)

    return NextResponse.json({
      space,
      stats: {
        travelCount: space.travelCount ?? travels.length,
        albumCount: space.albumCount ?? albums.length,
        memoryCount: space.memoryCount ?? memories.length,
        mediaCount: space.mediaCount ?? 0,
      },
      travels: recentTravels,
      albums: recentAlbums,
      memories: recentMemories,
      upcoming,
      activity,
    })
  } catch (error: any) {
    if (error instanceof SpaceAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 500 })
  }
}
