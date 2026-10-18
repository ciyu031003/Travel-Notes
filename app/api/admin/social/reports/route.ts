import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { handleReport, listReportsForAdmin, type ReportAction } from '@/lib/modules/social/moderation.service'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { ReportActionSchema, ReportListQuerySchema } from '@/lib/api/schemas/admin'

export const dynamic = 'force-dynamic'

/**
 * v3.1 M3-B2：举报治理处理。
 * GET  /api/admin/social/reports?status=PENDING&page=1&pageSize=20 → 举报列表（含帖子/作者）
 * POST /api/admin/social/reports/{id} { action } → 处理举报（驳回/下架/隐藏评论/封禁警告）
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) return NextResponse.json({ error: '未授权' }, { status: 401 })
  const denied = await requireCapability(auth.payload?.userId, 'canManageSocial')
  if (denied) return denied
  try {
    // P1-17：query 用 zod（status 枚举、page/pageSize coerce 正整数）
    const { searchParams } = new URL(request.url)
    const parsedQuery = ReportListQuerySchema.safeParse(Object.fromEntries(searchParams))
    if (!parsedQuery.success) {
      return errorResponse(new ApiError('INVALID_QUERY', '查询参数不合法', 400), getRequestId(request))
    }
    const status = parsedQuery.data.status
    const page = parsedQuery.data.page ?? 1
    const pageSize = parsedQuery.data.pageSize ?? 20
    const result = await listReportsForAdmin(status, page, pageSize)
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    console.error('[GET /api/admin/social/reports]', (e as Error)?.message)
    return NextResponse.json({ error: '获取举报列表失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) return NextResponse.json({ error: '未授权' }, { status: 401 })
  const denied = await requireCapability(auth.payload?.userId, 'canManageSocial')
  if (denied) return denied
  try {
    // P1-17：body 用 zod（reportId 正整数、action 枚举）
    const { reportId, action } = await parseBody(request, ReportActionSchema)
    const result = await handleReport(action as ReportAction, reportId)
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    if (e instanceof ApiError) return errorResponse(e, getRequestId(request))
    const msg = e?.message || '处理失败'
    return NextResponse.json({ error: msg }, { status: msg.includes('已处理') ? 409 : 500 })
  }
}
