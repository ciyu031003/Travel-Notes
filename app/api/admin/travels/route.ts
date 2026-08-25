import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { listTravels, createTravel } from '@/lib/modules/travel/travel.service'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'

const TRAVEL_TYPES = ['ALONE', 'COUPLE', 'FAMILY', 'FRIENDS', 'BFF', 'GROUP', 'OTHER']

/** 校验并归一化同行者列表：[{ name, relation? }]，最多 10 人 */
function normalizeCompanions(raw: unknown): unknown[] | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw)) throw new Error('同行者格式无效')
  if (raw.length > 10) throw new Error('同行者最多 10 人')
  const out: { name: string; relation?: string }[] = []
  for (const item of raw) {
    const name = String((item as any)?.name || '').trim().slice(0, 40)
    if (!name) continue
    const relation = String((item as any)?.relation || '').trim().slice(0, 20)
    out.push(relation ? { name, relation } : { name })
  }
  return out.length > 0 ? out : undefined
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  try {
    const travels = await listTravels(auth.payload?.userId)
    return NextResponse.json({ travels })
  } catch {
    return NextResponse.json({ travels: [] })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied
  try {
    const body = await request.json()
    const title = String(body?.title || '').trim()
    if (!title) {
      return NextResponse.json({ error: '请输入旅行名称' }, { status: 400 })
    }
    if (body?.travelType && !TRAVEL_TYPES.includes(String(body.travelType))) {
      return NextResponse.json({ error: '旅行类型无效' }, { status: 400 })
    }
    let companions: unknown[] | undefined
    try {
      companions = normalizeCompanions(body?.companions)
    } catch (e: any) {
      return NextResponse.json({ error: e.message || '同行者格式无效' }, { status: 400 })
    }
    const result = await createTravel({
      title,
      description: body?.description ? String(body.description) : undefined,
      startDate: body?.startDate || undefined,
      endDate: body?.endDate || undefined,
      ownerId: auth.payload?.userId,
      isPublic: Boolean(body?.isPublic),
      travelType: (body?.travelType as any) || undefined,
      companions,
    })
    writeAuditLog({ username: auth.username, action: 'CREATE', resourceType: 'Travel', resourceId: String(result.id), metadata: { title } }).catch(() => {})
    return NextResponse.json({ success: true, id: result.id }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '创建失败' }, { status: 400 })
  }
}
