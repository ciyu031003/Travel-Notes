import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { handleReport, listReportsForAdmin, type ReportAction } from '@/lib/modules/social/moderation.service'

export const dynamic = 'force-dynamic'

const ACTIONS: ReportAction[] = ['DISMISS', 'TAKEDOWN_POST', 'HIDE_COMMENT', 'BAN_USER']

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
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || undefined
    const page = parseInt(searchParams.get('page') || '1', 10) || 1
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10) || 20
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
    const body = await request.json()
    const reportId = parseInt(body?.reportId, 10)
    if (isNaN(reportId)) return NextResponse.json({ error: '无效的举报 ID' }, { status: 400 })
    const action = String(body?.action || '')
    if (!ACTIONS.includes(action as ReportAction)) {
      return NextResponse.json({ error: '无效的处理动作' }, { status: 400 })
    }
    const result = await handleReport(action as ReportAction, reportId)
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    const msg = e?.message || '处理失败'
    return NextResponse.json({ error: msg }, { status: msg.includes('已处理') ? 409 : 500 })
  }
}
