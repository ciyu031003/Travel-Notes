import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { spaceService } from '@/lib/modules/space/space.service'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  try {
    const spaces = await spaceService.listMySpaces(auth.username)
    return NextResponse.json({ spaces })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  try {
    const body = await request.json()
    const result = await spaceService.createSpace(auth.username, {
      name: body?.name,
      slug: body?.slug,
      description: body?.description,
    })
    return NextResponse.json({ success: true, spaceId: result.id }, { status: 201 })
  } catch (error: any) {
    const status = error?.message?.includes('已存在') ? 409 : 400
    return NextResponse.json({ error: error.message || '创建失败' }, { status })
  }
}
