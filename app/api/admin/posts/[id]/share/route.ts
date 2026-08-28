import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { getPostService } from '@/lib/container'
import { ok, fail, unauthorized } from '@/lib/api-response'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'

/**
 * 内容管理 2.0：文章卡片显式「分享到旅行圈 / 取消分享」。
 * 分享状态的事实来源 = TravelPost 记录是否存在；由用户动作驱动，与文章可见性(Post.isPublic)解耦。
 */

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return unauthorized('未授权')
  }
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied

  const { id } = await params
  try {
    const body = await request.json().catch(() => ({}))
    const travelId = body?.travelId !== undefined && body?.travelId !== null && body?.travelId !== ''
      ? Number(body.travelId) || null
      : null
    const visibility = body?.visibility === 'SPACE' ? 'SPACE' : 'PUBLIC'

    const result = await getPostService().shareToCircle(parseInt(id), { travelId, visibility })
    if (auth.username) {
      writeAuditLog({
        username: auth.username,
        action: 'UPDATE',
        resourceType: 'TravelPost',
        resourceId: String(id),
        metadata: { op: 'share-to-circle', travelId, visibility },
      }).catch(() => {})
    }
    return ok({ result })
  } catch (error: any) {
    console.error('[POST /api/admin/posts/:id/share] Error:', error?.message)
    return fail(error.message || '分享失败', 400)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return unauthorized('未授权')
  }
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied

  const { id } = await params
  try {
    await getPostService().unshareToCircle(parseInt(id))
    if (auth.username) {
      writeAuditLog({
        username: auth.username,
        action: 'UPDATE',
        resourceType: 'TravelPost',
        resourceId: String(id),
        metadata: { op: 'unshare-from-circle' },
      }).catch(() => {})
    }
    return ok({ success: true })
  } catch (error: any) {
    console.error('[DELETE /api/admin/posts/:id/share] Error:', error?.message)
    return fail(error.message || '取消分享失败', 400)
  }
}
