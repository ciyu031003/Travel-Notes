import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { parseBody, withAuth } from '@/lib/api/handler'
import { spaceService } from '@/lib/modules/space/space.service'
import { parseIdParam, toApiError } from '@/lib/api/schemas/common'
import {
  AddSpaceMemberSchema,
  RemoveSpaceMemberSchema,
  UpdateSpaceMemberRoleSchema,
} from '@/lib/api/schemas/space'

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
    const members = await spaceService.listMembers(auth.username, spaceId)
    return NextResponse.json({ members })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 403 })
  }
}

/** P1-17：三个写方法的 body 都由 zod 校验（username 必填、role 非法回落 MEMBER 的原语义保留）。 */
export const POST = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const spaceId = parseIdParam(id, '空间 ID')
  const body = await parseBody(request, AddSpaceMemberSchema)
  try {
    await spaceService.addMember(ctx.username || '', spaceId, body.username, body.role)
    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    throw toApiError(error, '添加失败', 400)
  }
})

/** 调整成员角色（仅 OWNER；不允许把最后一个主人降级） */
export const PATCH = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const spaceId = parseIdParam(id, '空间 ID')
  const body = await parseBody(request, UpdateSpaceMemberRoleSchema)
  try {
    await spaceService.updateMemberRole(ctx.username || '', spaceId, body.username, body.role)
    return NextResponse.json({ success: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : ''
    throw toApiError(error, '调整失败', msg.includes('无权') ? 403 : 400)
  }
})

export const DELETE = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const spaceId = parseIdParam(id, '空间 ID')
  const body = await parseBody(request, RemoveSpaceMemberSchema)
  try {
    await spaceService.removeMember(ctx.username || '', spaceId, body.username)
    return NextResponse.json({ success: true })
  } catch (error) {
    throw toApiError(error, '移除失败', 403)
  }
})
