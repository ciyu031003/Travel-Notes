import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { travelService } from '@/lib/modules/travel/space-travel.service'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(_request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const spaceId = parseInt(id, 10)
  if (isNaN(spaceId)) {
    return NextResponse.json({ error: '无效的空间 ID' }, { status: 400 })
  }
  try {
    const travels = await travelService.listTravels(auth.username, spaceId)
    return NextResponse.json({ travels })
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
    const result = await travelService.createTravel(auth.username, {
      spaceId,
      title: body?.title,
      slug: body?.slug,
      description: body?.description ?? null,
      startDate: body?.startDate ?? null,
      endDate: body?.endDate ?? null,
      status: body?.status ?? undefined,
      visibility: body?.visibility ?? undefined,
      travelType: body?.travelType ?? undefined,
      companions: body?.companions ?? undefined,
    })
    return NextResponse.json({ success: true, travelId: result.id }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '创建失败' }, { status: 400 })
  }
}
