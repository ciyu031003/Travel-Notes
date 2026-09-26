import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { setTravelSpace } from '@/lib/modules/travel/travel.service'

/**
 * 变更旅行归属：`{ spaceId: number | null }`
 *  · `null` → 收回成「仅自己」
 *  · 数字 → 移入该空间（我必须是该空间的 OWNER/MEMBER）
 *
 * 只有旅行的创建者能改归属（在 service 层判，前端藏按钮不算数）。
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const travelId = parseInt(id, 10)
  if (isNaN(travelId)) {
    return NextResponse.json({ error: '无效的旅行 ID' }, { status: 400 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const raw = body?.spaceId
    let spaceId: number | null = null
    if (raw !== null && raw !== undefined && raw !== '') {
      const n = Number(raw)
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json({ error: '无效的空间 ID' }, { status: 400 })
      }
      spaceId = n
    }
    const result = await setTravelSpace(travelId, spaceId, auth.payload?.userId, auth.username)
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    const msg = error?.message || '操作失败'
    const status = msg.includes('未授权') ? 401 : msg.includes('不存在') ? 404 : 403
    return NextResponse.json({ error: msg }, { status })
  }
}
