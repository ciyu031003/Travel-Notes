import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { prisma } from '@/lib/db'
import { canActOnContent } from '@/lib/modules/access'

/**
 * 前台旅行子资源写接口的统一门禁。
 *
 * 为什么抽出来：`days` / `itinerary` / `memories` / 新增的 `photos`、`expenses`
 * 五个路由各自抄一遍「requireAuth → 取 travel → canActOnContent」，
 * 抄漏一处就是一条越权写路径（IDOR）。这里收敛成唯一实现。
 */
export interface TravelGuardContext {
  username: string
  userId?: number
  travel: {
    id: number
    spaceId: number | null
    ownerId: number | null
    startDate: Date | null
    endDate: Date | null
  }
}

export type TravelGuardResult =
  | { ok: true; ctx: TravelGuardContext }
  | { ok: false; response: NextResponse }

export async function guardTravelWrite(request: NextRequest, travelId: number): Promise<TravelGuardResult> {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return { ok: false, response: NextResponse.json({ error: '未授权' }, { status: 401 }) }
  }
  if (!Number.isFinite(travelId)) {
    return { ok: false, response: NextResponse.json({ error: '无效的旅行 ID' }, { status: 400 }) }
  }
  const travel = await prisma.travel.findUnique({
    where: { id: travelId },
    select: {
      id: true,
      spaceId: true,
      ownerId: true,
      visibility: true,
      isPublic: true,
      startDate: true,
      endDate: true,
    },
  })
  if (!travel) {
    return { ok: false, response: NextResponse.json({ error: '旅行不存在' }, { status: 404 }) }
  }
  if (!(await canActOnContent('Travel', travel, auth.payload?.userId))) {
    return { ok: false, response: NextResponse.json({ error: '无权编辑该旅行' }, { status: 403 }) }
  }
  return {
    ok: true,
    ctx: {
      username: auth.username,
      userId: auth.payload?.userId,
      travel: {
        id: travel.id,
        spaceId: travel.spaceId,
        ownerId: travel.ownerId,
        startDate: travel.startDate,
        endDate: travel.endDate,
      },
    },
  }
}
