import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { spaceService } from '@/lib/modules/space/space.service'
import type { SpaceRole } from '@/lib/modules/space/permissions'

const ROLES: SpaceRole[] = ['MEMBER', 'VIEWER']

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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const body = await request.json()
    const role: SpaceRole = ROLES.includes(body?.role) ? body.role : 'MEMBER'
    const days = Math.min(30, Math.max(1, parseInt(body?.expiresInDays, 10) || 7))
    const result = await spaceService.createInvite(auth.username, spaceId, role, days)
    return NextResponse.json({ success: true, ...result }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '生成邀请失败' }, { status: 403 })
  }
}
