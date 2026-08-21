import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { listAuditLogs } from '@/lib/modules/audit/audit-log.service'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const denied = await requireCapability(auth.payload?.userId, 'canViewAudit')
  if (denied) return denied
  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 500)
  try {
    const logs = await listAuditLogs({ limit })
    return NextResponse.json({ logs })
  } catch {
    return NextResponse.json({ logs: [] })
  }
}
