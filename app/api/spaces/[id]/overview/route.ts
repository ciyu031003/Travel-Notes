import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getSpaceOverview } from '@/lib/modules/space/space-overview.service'
import { SpaceAccessError } from '@/lib/modules/space/permissions'

/**
 * 空间概览（按 id）：一次取回空间详情页需要的全部数据。
 *
 * 为什么要合成一个接口：详情页有 5 段内容（空间信息 / 旅行 / 相册 / 回忆 / 动态）+ 成员，
 * 移动端逐个请求要 6 次往返，且每次都要重复做一遍成员校验。
 * 装配逻辑在 `space-overview.service`，与 `/api/spaces/by-slug/<slug>` 共用同一份实现。
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
  const activity = parseInt(url.searchParams.get('activity') || '20', 10) || 20

  try {
    const overview = await getSpaceOverview(auth.username, spaceId, { activity })
    if (!overview) {
      return NextResponse.json({ error: '空间不存在' }, { status: 404 })
    }
    return NextResponse.json(overview)
  } catch (error: any) {
    if (error instanceof SpaceAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 500 })
  }
}
