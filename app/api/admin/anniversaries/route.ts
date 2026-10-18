import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { listAnniversaries, createAnniversary } from '@/lib/modules/anniversary/anniversary.service'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { AnniversaryCreateSchema } from '@/lib/api/schemas/admin'

// reviewed-no-body-input: GET 只读纪念日列表，无请求体
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
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied
  try {
    // P1-17：body 统一 zod；日期字符串可解析性仍在此校验（zod 只保证类型/长度）
    const body = await parseBody(request, AnniversaryCreateSchema)
    const date = new Date(body.date)
    if (isNaN(date.getTime())) {
      throw new ApiError('INVALID_DATE', '请输入有效日期', 400)
    }

    const result = await createAnniversary({
      title: body.title,
      date,
      recurring: body.recurring !== false,
      description: body.description ? String(body.description) : undefined,
      userId: auth.payload?.userId,
    })
    writeAuditLog({
      username: auth.username,
      action: 'CREATE',
      resourceType: 'Anniversary',
      resourceId: String(result.id),
      metadata: { title: body.title },
    }).catch(() => {})
    return NextResponse.json({ success: true, id: result.id }, { status: 201 })
  } catch (error: any) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    return NextResponse.json({ error: error.message || '创建失败' }, { status: 400 })
  }
}
