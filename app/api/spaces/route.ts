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
      // 空间类型（情侣/家人/朋友/个人/其他）：原先这个字段传不进来，
      // 老版本会落 schema 默认 COUPLE / 新版本归一为 OTHER，界面上都不是用户选的那个
      spaceType: body?.spaceType,
    })
    // slug 现由服务端生成（中文名派生为空时回退随机 `sp-xxxxxxxx`），一并返回便于前端跳转空间页
    return NextResponse.json({ success: true, spaceId: result.id, slug: result.slug }, { status: 201 })
  } catch (error: any) {
    const status = error?.message?.includes('已存在') ? 409 : 400
    return NextResponse.json({ error: error.message || '创建失败' }, { status })
  }
}
