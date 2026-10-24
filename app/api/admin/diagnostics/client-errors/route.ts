import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { listClientErrors } from '@/lib/modules/diagnostics/client-error'
import { getRequestId } from '@/lib/api/handler'
import { ApiError, errorResponse } from '@/lib/api-response'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'

export const dynamic = 'force-dynamic'

/**
 * 站主查询客户端错误（P-07 后半，1.29.0）。
 *
 * 权限与审计日志同级（canViewAudit = 站主）：错误堆栈里可能出现路径/账号线索，
 * 不对普通管理员开放。游标分页（before=id），首次不带 before 取最新 50 条。
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const denied = await requireCapability(auth.payload?.userId, 'canViewAudit')
  if (denied) return denied

  try {
    const url = new URL(request.url)
    const kind = url.searchParams.get('kind') || undefined
    const beforeRaw = Number(url.searchParams.get('before'))
    const before = Number.isInteger(beforeRaw) && beforeRaw > 0 ? beforeRaw : undefined
    const rows = await listClientErrors({ kind, before, limit: 50 })
    return NextResponse.json({
      success: true,
      items: rows,
      /** 下一次查询的游标：空数组时为 null */
      nextBefore: rows.length === 50 ? rows[rows.length - 1].id : null,
    })
  } catch (error: unknown) {
    return errorResponse(
      new ApiError('DIAGNOSTICS_QUERY_FAILED', error instanceof Error ? error.message : '查询失败', 500),
      getRequestId(request),
    )
  }
}

/** 站主手动清理（滚动保留靠定时任务是外部资源，先给一个显式删除入口） */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const denied = await requireCapability(auth.payload?.userId, 'canViewAudit')
  if (denied) return denied

  try {
    const url = new URL(request.url)
    const beforeRaw = Number(url.searchParams.get('beforeDays'))
    const days = Number.isInteger(beforeRaw) && beforeRaw > 0 ? Math.min(beforeRaw, 365) : 30
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const { prisma } = await import('@/lib/db')
    const result = await prisma.clientErrorLog.deleteMany({ where: { createdAt: { lt: cutoff } } })
    writeAuditLog({
      username: auth.username,
      action: 'PURGE_CLIENT_ERRORS',
      resourceType: 'ClientErrorLog',
      resourceId: String(days),
      metadata: { deleted: result.count, olderThanDays: days },
    }).catch(() => {})
    return NextResponse.json({ success: true, deleted: result.count })
  } catch (error: unknown) {
    return errorResponse(
      new ApiError('DIAGNOSTICS_PURGE_FAILED', error instanceof Error ? error.message : '清理失败', 500),
      getRequestId(request),
    )
  }
}
