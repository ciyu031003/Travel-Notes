import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { spaceService } from '@/lib/modules/space/space.service'

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  try {
    const body = await request.json()
    const code = String(body?.code || '').trim()
    const result = await spaceService.joinByInvite(auth.username, code)
    return NextResponse.json({ success: true, ...result }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '加入失败' }, { status: 400 })
  }
}
