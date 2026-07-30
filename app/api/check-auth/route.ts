import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'

export async function GET(request: Request) {
  const result = await requireAuth(request as any)
  if (!result.authenticated) {
    return NextResponse.json({ authenticated: false }, { status: 200 })
  }
  return NextResponse.json({ authenticated: true, username: result.username })
}
