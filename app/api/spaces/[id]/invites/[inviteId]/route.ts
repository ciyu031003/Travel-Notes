import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { spaceService } from '@/lib/modules/space/space.service'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; inviteId: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id, inviteId } = await params
  const spaceId = parseInt(id, 10)
  const invId = parseInt(inviteId, 10)
  if (isNaN(spaceId) || isNaN(invId)) {
    return NextResponse.json({ error: '无效的参数' }, { status: 400 })
  }
  try {
    await spaceService.revokeInvite(auth.username, spaceId, invId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '撤销失败' }, { status: 403 })
  }
}
