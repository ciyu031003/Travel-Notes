import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { spaceService } from '@/lib/modules/space/space.service'
import type { SpaceRole } from '@/lib/modules/space/permissions'

const ROLES: SpaceRole[] = ['OWNER', 'MEMBER', 'VIEWER']

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
    await spaceService.addMember(auth.username, spaceId, body?.username, role)
    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '添加失败' }, { status: 400 })
  }
}
