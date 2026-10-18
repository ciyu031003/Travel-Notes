import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { parseBody, withAuth } from '@/lib/api/handler'
import { spaceService } from '@/lib/modules/space/space.service'
import { parseIdParam, toApiError } from '@/lib/api/schemas/common'
import { CreateInviteSchema } from '@/lib/api/schemas/space'

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
  try {
    const invites = await spaceService.listInvites(auth.username, spaceId)
    return NextResponse.json({ invites })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 403 })
  }
}

/**
 * 生成邀请码（P1-17）：role 非法仍回落 MEMBER、有效期仍夹到 1..30 天（原语义），
 * 只是把手工 parseInt/白名单判断换成 zod 校验 + 归一。
 */
export const POST = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const spaceId = parseIdParam(id, '空间 ID')
  const body = await parseBody(request, CreateInviteSchema)
  try {
    const result = await spaceService.createInvite(ctx.username || '', spaceId, body.role, body.expiresInDays)
    return NextResponse.json({ success: true, ...result }, { status: 201 })
  } catch (error) {
    throw toApiError(error, '生成邀请失败', 403)
  }
})
