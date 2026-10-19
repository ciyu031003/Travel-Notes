import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { listTravels, createTravel } from '@/lib/modules/travel/travel.service'
import { isSpaceContentEditor } from '@/lib/modules/access/space-scope'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'
import { ApiError } from '@/lib/api-response'
import { withAuth, parseBody } from '@/lib/api/handler'
import { prisma } from '@/lib/db'
import { readIdempotencyKey, withIdempotency } from '@/lib/api/idempotency'

const TRAVEL_TYPES = ['ALONE', 'COUPLE', 'FAMILY', 'FRIENDS', 'BFF', 'GROUP', 'OTHER'] as const

/**
 * 创建旅行的请求体 schema（P1-17）：此前全靠手写 if，字段类型/长度/数组上限分散且易漏。
 * 成功响应保持不变（{ success, id, slug } 201）。
 */
const CompanionSchema = z.object({
  name: z.string().max(40).optional(),
  relation: z.string().max(20).optional(),
})

const CreateTravelSchema = z.object({
  title: z.string().trim().min(1, '请输入旅行名称').max(255, '旅行名称过长'),
  travelType: z.enum(TRAVEL_TYPES, { message: '旅行类型无效' }).optional().nullable(),
  companions: z.array(CompanionSchema).max(10, '同行者最多 10 人').optional().nullable(),
  spaceId: z.union([z.number(), z.string(), z.null()]).optional(),
  visibility: z.string().optional().nullable(),
  description: z.string().max(50_000, '描述过长').optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  location: z.string().max(200).optional().nullable(),
})

/** 校验并归一化目的地：可选，最长 120 字（DB 列 255），去掉首尾空白 */
function normalizeLocation(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined
  const v = String(raw).trim().slice(0, 120)
  return v || undefined
}

/** 校验并归一化同行者列表：[{ name, relation? }]，最多 10 人（空名条目不落库） */
function normalizeCompanions(raw: unknown): unknown[] | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw)) throw new ApiError('INVALID_COMPANIONS', '同行者格式无效', 400)
  if (raw.length > 10) throw new ApiError('INVALID_COMPANIONS', '同行者最多 10 人', 400)
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

export const POST = withAuth(async (request, ctx) => {
  const denied = await requireCapability(ctx.userId, 'canManageContent')
  if (denied) return denied

  const body = await parseBody(request, CreateTravelSchema)
  const companions = normalizeCompanions(body.companions)

  /**
   * 创建时就归属到某个空间（「一键加入空间」的落点）。
   * 必须校验我在该空间是 OWNER/MEMBER —— 只读成员不能往里塞内容，非成员更不能。
   */
  let spaceId: number | null = null
  if (body.spaceId !== undefined && body.spaceId !== null && body.spaceId !== '') {
    const n = Number(body.spaceId)
    if (!Number.isFinite(n) || n <= 0) {
      throw new ApiError('INVALID_SPACE_ID', '无效的空间 ID', 400)
    }
    const canPut = await isSpaceContentEditor(n, ctx.userId, ctx.username || '')
    if (!canPut) {
      throw new ApiError('SPACE_READONLY', '你在这个空间里是只读成员，不能往里添加内容', 403)
    }
    spaceId = n
  }

  const VISIBILITIES = ['PRIVATE', 'SPACE', 'PUBLIC']
  const rawVisibility = body.visibility ? String(body.visibility).toUpperCase() : ''
  const visibility = VISIBILITIES.includes(rawVisibility)
    ? (rawVisibility as 'PRIVATE' | 'SPACE' | 'PUBLIC')
    : // 未指定时：放进空间的默认「空间可见」，否则默认「仅自己」（与表单默认一致，更安全）
      spaceId
      ? 'SPACE'
      : 'PRIVATE'

  // B4：离线队列重试会带同一个 Idempotency-Key；命中直接返回首次创建的主键（绝不重复建旅行）
  const idempotencyKey = readIdempotencyKey(request)

  try {
    const idem = await withIdempotency({
      key: idempotencyKey,
      userId: ctx.userId,
      entityType: 'Travel',
      run: async () => {
        const result = await createTravel({
          title: body.title,
          description: body.description ? String(body.description) : undefined,
          startDate: body.startDate || undefined,
          endDate: body.endDate || undefined,
          location: normalizeLocation(body.location),
          ownerId: ctx.userId,
          isPublic: visibility === 'PUBLIC',
          visibility,
          spaceId,
          travelType: (body.travelType as any) || undefined,
          companions,
        })
        return { entityId: result.id, value: result.slug }
      },
    })

    if (idem.replayed) {
      // 重放：ClientMutation 只存 entityId，slug 回查一次（成功响应结构保持不变）
      const existing =
        idem.entityId != null
          ? await prisma.travel
              .findUnique({ where: { id: idem.entityId }, select: { slug: true } })
              .catch(() => null)
          : null
      return NextResponse.json({ success: true, id: idem.entityId, slug: existing?.slug ?? '' }, { status: 201 })
    }

    const entityId = idem.entityId as number
    writeAuditLog({
      username: ctx.username || 'unknown',
      action: 'CREATE',
      resourceType: 'Travel',
      resourceId: String(entityId),
      spaceId,
      metadata: { title: body.title, location: normalizeLocation(body.location) ?? null, visibility },
    }).catch(() => {})
    // 回传 slug：前台新建后直接跳 /travel/<slug>
    return NextResponse.json({ success: true, id: entityId, slug: idem.value ?? '' }, { status: 201 })
  } catch (error: any) {
    throw new ApiError('CREATE_FAILED', error?.message || '创建失败', 400)
  }
})
