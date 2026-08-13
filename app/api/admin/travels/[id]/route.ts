import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getTravelDetail, updateTravel, deleteTravel } from '@/lib/modules/travel/travel.service'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const travelId = parseInt(id, 10)
  if (isNaN(travelId)) return NextResponse.json({ error: '无效 ID' }, { status: 400 })
  const travel = await getTravelDetail(travelId)
  if (!travel) return NextResponse.json({ error: '旅行不存在' }, { status: 404 })
  return NextResponse.json({ travel })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const travelId = parseInt(id, 10)
  if (isNaN(travelId)) return NextResponse.json({ error: '无效 ID' }, { status: 400 })
  try {
    const body = await request.json()
    await updateTravel(travelId, body)
    writeAuditLog({ username: auth.username, action: 'UPDATE', resourceType: 'Travel', resourceId: String(travelId) }).catch(() => {})
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
  const { id } = await params
  const travelId = parseInt(id, 10)
  if (isNaN(travelId)) return NextResponse.json({ error: '无效 ID' }, { status: 400 })
  try {
    await deleteTravel(travelId)
    writeAuditLog({ username: auth.username, action: 'DELETE', resourceType: 'Travel', resourceId: String(travelId) }).catch(() => {})
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 400 })
  }
}
