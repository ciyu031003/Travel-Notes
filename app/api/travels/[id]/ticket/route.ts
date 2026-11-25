import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getCurrentUserId } from '@/lib/current-user'
import { prisma } from '@/lib/db'
import { canViewResourceById } from '@/lib/modules/access'
import { guardTravelWrite } from '@/lib/modules/travel/api-guard'
import { asApiErrorFromResponse, parseIdParam, withRouteErrors } from '@/lib/api/schemas/common'

export const dynamic = 'force-dynamic'

/**
 * 旅程纪念票的「票面覆盖」（跨设备同步）。
 * ---------------------------------------------------------------------------
 * 票面本体是旅程的**派生投影**（lib/ticket/derive），不需要建表；但用户手工调过的
 * 那几个字段（交通方式/出发到达/车次/时刻/座位/检票口）原先只存 localStorage，
 * 换手机/清缓存就丢。这里把覆盖层落到 Travel.ticketOverride（JSON，nullable），
 * 与 /api/travels 列表一起下发，客户端按 travelId 合并。
 *
 * 权限与 days / expenses / memories 完全一致：读走 canViewResourceById，
 * 写走 guardTravelWrite（OWNER / 空间 MEMBER 都可改）。
 */

const TRANSPORTS = new Set(['flight', 'hsr', 'train'])
const DEPART_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_TEXT = 40

/** 白名单式净化：只保留 TicketOverride 认识的字段，脏值一律丢掉（可空 = 回默认） */
function sanitizeOverride(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object') return null
  const src = raw as Record<string, unknown>
  const out: Record<string, string> = {}
  const text = (v: unknown, max = MAX_TEXT): string | null => {
    if (typeof v !== 'string') return null
    const s = v.trim()
    if (!s) return ''
    return s.length > max ? s.slice(0, max) : s
  }
  if (typeof src.transport === 'string' && TRANSPORTS.has(src.transport)) out.transport = src.transport
  for (const key of ['fromCity', 'toCity', 'number', 'seat', 'gate'] as const) {
    const v = text(src[key])
    if (v !== null) out[key] = v
  }
  if (typeof src.departTime === 'string') {
    const v = src.departTime.trim()
    if (!v) out.departTime = ''
    else if (DEPART_TIME_RE.test(v)) out.departTime = v
  }
  return Object.keys(out).length > 0 ? out : null
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const travelId = parseInt(id, 10)
  if (!Number.isFinite(travelId)) return NextResponse.json({ error: '旅行 ID 无效' }, { status: 400 })
  const userId = await getCurrentUserId()
  if (!(await canViewResourceById('Travel', travelId, userId))) {
    return NextResponse.json({ error: '旅行不存在' }, { status: 404 })
  }
  const row = await prisma.travel.findUnique({ where: { id: travelId }, select: { ticketOverride: true } })
  return NextResponse.json({ override: row?.ticketOverride ?? null })
}

export const PUT = withRouteErrors(async (request, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const travelId = parseIdParam(id, '旅行 ID')

  const guard = await guardTravelWrite(request, travelId)
  if (!guard.ok) throw await asApiErrorFromResponse(guard.response)

  // 允许直接传 null / {} 表示「恢复默认票面」
  let payload: unknown = null
  try {
    payload = await request.json()
  } catch {
    payload = null
  }
  const override = sanitizeOverride((payload as { override?: unknown } | null)?.override)

  const row = await prisma.travel.update({
    where: { id: travelId },
    // Prisma 的 JSON 列要用 DbNull 才能清成 NULL；传 undefined 是"不更新"
    data: { ticketOverride: override ? override : Prisma.DbNull },
    select: { ticketOverride: true },
  })
  return NextResponse.json({ override: row.ticketOverride ?? null })
})
