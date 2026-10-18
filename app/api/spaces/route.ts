import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth-middleware'
import { spaceService } from '@/lib/modules/space/space.service'
import { ApiError } from '@/lib/api-response'
import { withAuth, parseBody } from '@/lib/api/handler'

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

/** 创建空间请求体（P1-17）：slug 可选（服务端会派生），名称必填 */
const CreateSpaceSchema = z.object({
  name: z.string().trim().min(1, '请输入空间名称').max(200, '空间名称过长'),
  slug: z.string().trim().max(200).optional().nullable(),
  description: z.string().max(50_000, '描述过长').optional().nullable(),
  spaceType: z.enum(['COUPLE', 'FAMILY', 'FRIENDS', 'SOLO', 'OTHER'], { message: '空间类型无效' }).optional().nullable(),
})

export const POST = withAuth(async (request, ctx) => {
  const body = await parseBody(request, CreateSpaceSchema)
  try {
    const result = await spaceService.createSpace(ctx.username || '', {
      name: body.name,
      // service 内部对空 slug 会自动派生（见 slugifySpaceName），这里给空串而非 undefined
      slug: body.slug ?? '',
      description: body.description ?? undefined,
      // 空间类型（情侣/家人/朋友/个人/其他）：原先这个字段传不进来，
      // 老版本会落 schema 默认 COUPLE / 新版本归一为 OTHER，界面上都不是用户选的那个
      spaceType: body.spaceType ?? undefined,
    })
    // slug 现由服务端生成（中文名派生为空时回退随机 `sp-xxxxxxxx`），一并返回便于前端跳转空间页
    return NextResponse.json({ success: true, spaceId: result.id, slug: result.slug }, { status: 201 })
  } catch (error: any) {
    const msg = error?.message || '创建失败'
    throw new ApiError(msg.includes('已存在') ? 'SPACE_EXISTS' : 'CREATE_FAILED', msg, msg.includes('已存在') ? 409 : 400)
  }
})
