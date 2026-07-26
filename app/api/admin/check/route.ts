import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { isRequirePasswordChange } from '@/lib/auth'

export async function GET(request: Request) {
  const result = await requireAuth(request as any)
  if (!result.authenticated) {
    return NextResponse.json({ authenticated: false }, { status: 200 })
  }
  const requireChange = await isRequirePasswordChange()
  return NextResponse.json({
    authenticated: true,
    username: result.username,
    requirePasswordChange: requireChange,
  })
}
