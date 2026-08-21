import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { updateAnniversary, deleteAnniversary } from '@/lib/modules/anniversary/anniversary.service'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied
  const { id } = await params
  const anniversaryId = parseInt(id, 10)
  if (isNaN(anniversaryId)) {
    return NextResponse.json({ error: '无效 ID' }, { status: 400 })
  }
  try {
    const body = await request.json()
    const input: any = {}
    if (body.title !== undefined) input.title = String(body.title).trim()
    if (body.date !== undefined) {
      const date = new Date(body.date)
      if (isNaN(date.getTime())) return NextResponse.json({ error: '无效日期' }, { status: 400 })
      input.date = date
    }
    if (body.recurring !== undefined) input.recurring = !!body.recurring
    if (body.description !== undefined) input.description = body.description ? String(body.description) : null

    await updateAnniversary(anniversaryId, input)
    writeAuditLog({ username: auth.username, action: 'UPDATE', resourceType: 'Anniversary', resourceId: String(anniversaryId) }).catch(() => {})
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '更新失败' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied
  const { id } = await params
  const anniversaryId = parseInt(id, 10)
  if (isNaN(anniversaryId)) {
    return NextResponse.json({ error: '无效 ID' }, { status: 400 })
  }
  try {
    await deleteAnniversary(anniversaryId)
    writeAuditLog({ username: auth.username, action: 'DELETE', resourceType: 'Anniversary', resourceId: String(anniversaryId) }).catch(() => {})
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 400 })
  }
}
