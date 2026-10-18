import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/current-user'
import { applyCacheControl } from '@/lib/http-cache'
import { getHomeData } from '@/lib/home/home-data'

export const dynamic = 'force-dynamic'

/**
 * 首页聚合。
 *
 * P1-18：聚合逻辑已抽到 lib/home/home-data.ts 的 getHomeData(userId)，供首页
 * Server Component 首帧直接复用；本路由只负责鉴权上下文、响应包装与缓存头。
 * **响应字段/auth/缓存语义保持与抽取前完全一致**（App 端离线同步依赖该契约）。
 */
export async function GET(_request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    const data = await getHomeData(userId)
    const res = NextResponse.json(data)
    return applyCacheControl(res, 'user', !!userId)
  } catch (error) {
    console.error('[GET /api/home]', error)
    return NextResponse.json({ error: '获取首页数据失败' }, { status: 500 })
  }
}
