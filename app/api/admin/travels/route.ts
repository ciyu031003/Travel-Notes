import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { listTravels, createTravel } from '@/lib/modules/travel/travel.service'
import { isSpaceContentEditor } from '@/lib/modules/access/space-scope'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'

const TRAVEL_TYPES = ['ALONE', 'COUPLE', 'FAMILY', 'FRIENDS', 'BFF', 'GROUP', 'OTHER']

/** 校验并归一化目的地：可选，最长 120 字（DB 列 255），去掉首尾空白 */
function normalizeLocation(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined
  const v = String(raw).trim().slice(0, 120)
  return v || undefined
}

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
    /**
     * 创建时就归属到某个空间（「一键加入空间」的落点）。
     * 必须校验我在该空间是 OWNER/MEMBER —— 只读成员不能往里塞内容，非成员更不能。
     */
    let spaceId: number | null = null
    if (body?.spaceId !== undefined && body?.spaceId !== null && body?.spaceId !== '') {
      const n = Number(body.spaceId)
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json({ error: '无效的空间 ID' }, { status: 400 })
      }
      const canPut = await isSpaceContentEditor(n, auth.payload?.userId, auth.username)
      if (!canPut) {
        return NextResponse.json({ error: '你在这个空间里是只读成员，不能往里添加内容' }, { status: 403 })
      }
      spaceId = n
    }

    const VISIBILITIES = ['PRIVATE', 'SPACE', 'PUBLIC']
    const rawVisibility = body?.visibility ? String(body.visibility).toUpperCase() : ''
    const visibility = VISIBILITIES.includes(rawVisibility)
      ? (rawVisibility as 'PRIVATE' | 'SPACE' | 'PUBLIC')
      : // 未指定时：放进空间的默认「空间可见」，否则默认「仅自己」（与表单默认一致，更安全）
        spaceId
        ? 'SPACE'
        : 'PRIVATE'

    const result = await createTravel({
      title,
      description: body?.description ? String(body.description) : undefined,
      startDate: body?.startDate || undefined,
      endDate: body?.endDate || undefined,
      location: normalizeLocation(body?.location),
      ownerId: auth.payload?.userId,
      isPublic: visibility === 'PUBLIC',
      visibility,
      spaceId,
      travelType: (body?.travelType as any) || undefined,
      companions,
    })
    writeAuditLog({ username: auth.username, action: 'CREATE', resourceType: 'Travel', resourceId: String(result.id), spaceId, metadata: { title, location: normalizeLocation(body?.location) ?? null, visibility } }).catch(() => {})
    // 回传 slug：前台新建后直接跳 /travel/<slug>
    return NextResponse.json({ success: true, id: result.id, slug: result.slug }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '创建失败' }, { status: 400 })
  }
}
