import { NextResponse } from 'next/server'
import { listAnniversaries } from '@/lib/modules/anniversary/anniversary.service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const anniversaries = await listAnniversaries()
    return NextResponse.json({ anniversaries })
  } catch (error: any) {
    console.error('[GET /api/anniversaries] Error:', error?.message)
    return NextResponse.json({ anniversaries: [] })
  }
}
