import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { listAnniversaries, createAnniversary } from '@/lib/modules/anniversary/anniversary.service'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  try {
    const anniversaries = await listAnniversaries()
    return NextResponse.json({ anniversaries })
  } catch {
    return NextResponse.json({ anniversaries: [] })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  try {
    const body = await request.json()
    const title = String(body?.title || '').trim()
    if (!title) {
      return NextResponse.json({ error: '请输入纪念日名称' }, { status: 400 })
    }
    const date = new Date(body?.date)
    if (isNaN(date.getTime())) {
      return NextResponse.json({ error: '请输入有效日期' }, { status: 400 })
    }

    const result = await createAnniversary({
      title,
      date,
      recurring: body?.recurring !== false,
      description: body?.description ? String(body.description) : undefined,
      userId: auth.payload?.userId,
    })
    writeAuditLog({
      username: auth.username,
      action: 'CREATE',
      resourceType: 'Anniversary',
      resourceId: String(result.id),
      metadata: { title },
    }).catch(() => {})
    return NextResponse.json({ success: true, id: result.id }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '创建失败' }, { status: 400 })
  }
}
