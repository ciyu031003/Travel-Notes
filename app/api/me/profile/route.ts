import { NextRequest } from 'next/server'
import { z } from 'zod'
import { updateMyProfile } from '@/lib/modules/social/profile.service'
import { ok, unauthorized, ApiError } from '@/lib/api-response'
import { withAuth, parseBody } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

/** 资料编辑请求体（P1-17）：字段可选，但类型必须是字符串/空 */
const UpdateProfileSchema = z.object({
  nickname: z.string().max(64).nullable().optional(),
  bio: z.string().max(1_000).nullable().optional(),
})

export const PATCH = withAuth(async (request, ctx) => {
  if (!ctx.userId) return unauthorized()
  const body = await parseBody(request, UpdateProfileSchema)
  try {
    const data = await updateMyProfile(ctx.userId, { nickname: body.nickname, bio: body.bio })
    return ok(data)
  } catch (e: any) {
    // 业务校验错误（昵称/签名/用户不存在）→ 400，其余按未预期异常（500，细节只进日志）
    if (e?.message && /昵称|签名|用户不存在/.test(e.message)) {
      throw new ApiError('VALIDATION_ERROR', e.message, 400)
    }
    throw e
  }
})
