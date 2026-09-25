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

/** 调整成员角色（仅 OWNER；不允许把最后一个主人降级） */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    await spaceService.updateMemberRole(auth.username, spaceId, String(body?.username || ''), role)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    const msg = error?.message || '调整失败'
    const status = msg.includes('无权') ? 403 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const username = String(body?.username || '').trim()
    if (!username) {
      return NextResponse.json({ error: '缺少成员用户名' }, { status: 400 })
    }
    await spaceService.removeMember(auth.username, spaceId, username)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '移除失败' }, { status: 403 })
  }
}
