import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { APP_VERSION, APP_BUILD_NUMBER } from '@/lib/app-version'

export const dynamic = 'force-dynamic'

/**
 * v3.1 M4-D3：健康检查端点（监控/探活用）。
 * GET /api/health → { status, version, db, uptime }
 * - db: ok / fail（DB ping，供探活与部署验证）
 */
export async function GET() {
  const startedAt = process.env.STARTED_AT ? Number(process.env.STARTED_AT) : 0
  let db = 'ok'
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    db = 'fail'
  }
  const status = db === 'ok' ? 'ok' : 'degraded'
  return NextResponse.json(
    {
      status,
      version: APP_VERSION,
      buildNumber: APP_BUILD_NUMBER,
      db,
      uptime: startedAt ? Math.round((Date.now() - startedAt) / 1000) : null,
      ts: new Date().toISOString(),
    },
    { status: db === 'ok' ? 200 : 503 },
  )
}
