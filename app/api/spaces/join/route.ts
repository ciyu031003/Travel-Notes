import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { spaceService } from '@/lib/modules/space/space.service'
import { ApiError } from '@/lib/api-response'
import { withAuth, parseBody } from '@/lib/api/handler'

/** 加入空间：邀请码必填（P1-17 统一 body 校验） */
const JoinSpaceSchema = z.object({
  code: z.string().trim().min(1, '请输入邀请码').max(64, '邀请码格式无效'),
})

export const POST = withAuth(async (request, ctx) => {
  const body = await parseBody(request, JoinSpaceSchema)
  try {
    const result = await spaceService.joinByInvite(ctx.username || '', body.code)
    return NextResponse.json({ success: true, ...result }, { status: 201 })
  } catch (error: any) {
    throw new ApiError('JOIN_FAILED', error?.message || '加入失败', 400)
  }
})
