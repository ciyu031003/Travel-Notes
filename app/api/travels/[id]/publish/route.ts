import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, parseBody } from '@/lib/api/handler'
import { ApiError } from '@/lib/api-response'
import { parseIdParam } from '@/lib/api/schemas/common'
import { prisma } from '@/lib/db'
import { travelService } from '@/lib/modules/travel/space-travel.service'
import { requireSpaceRole, SpaceAccessError } from '@/lib/modules/space/permissions'
import { syncConvertedTravelMemoryVisibility } from '@/lib/modules/space/space-plan.service'

/**
 * POST /api/travels/[id]/publish —— 发布 / 取消发布到旅行圈（P3 / R7）。
 *
 * 为什么单独开一个轻量端点：公开能力（`syncTravelPost`）早就存在，但只有后台/导入路径
 * 会碰它，前台"这条旅行要不要出现在旅行圈"没有稳定入口。这里把三档可见性收成一个动作：
 *   · PUBLIC → 进旅行圈（TravelPost upsert，feed 缓存立即失效）；
 *   · SPACE / PRIVATE → 从旅行圈下架（TravelPost 删除）。
 *
 * 权限：**旅行作者**（ownerId）或**所属空间的 OWNER**。
 *  · 转换出来的旅行 ownerId = 转换发起人，所以"谁把计划变成记录，谁能发"；
 *  · 空间 OWNER 兜底，避免成员退出空间后记录没人能管。
 *
 * 落库复用 `travelService.updateTravel`（与 PATCH /api/travels/[id] 同一条写路径），
 * 保证 visibility 与 TravelPost 投影、feed 缓存失效行为一致，不另写一套。
 *
 * 回忆同步（P3 复核补充）：产品定义"公开后别的用户能看到"，所以**计划转换生成的回忆**
 * （convert 时记进 plan.convert 事件的那批）跟着同档变化：PUBLIC → 回忆 PUBLIC，
 * SPACE/PRIVATE → 一并降级。用户手工建的回忆不在这个 id 集合里，始终不受影响。
 */
const PublishSchema = z.object({
  visibility: z.enum(['PUBLIC', 'SPACE', 'PRIVATE'], { message: '可见性不合法' }),
})

type Ctx = { params: Promise<{ id: string }> }

export const POST = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as Ctx
  const { id } = await params
  const travelId = parseIdParam(id, '旅行 ID')
  const body = await parseBody(request, PublishSchema)

  const travel = await prisma.travel.findUnique({
    where: { id: travelId },
    select: { id: true, spaceId: true, ownerId: true },
  })
  if (!travel) throw new ApiError('NOT_FOUND', '旅行不存在', 404)

  // —— 作者 / 空间 OWNER 才能改可见性 ——
  const isAuthor = ctx.userId != null && travel.ownerId != null && travel.ownerId === ctx.userId
  if (!isAuthor) {
    if (travel.spaceId == null) {
      throw new ApiError('FORBIDDEN', '只有旅行作者可以设置可见性', 403)
    }
    try {
      await requireSpaceRole(ctx.username || '', travel.spaceId, ['OWNER'])
    } catch (error) {
      if (error instanceof SpaceAccessError) {
        throw new ApiError('FORBIDDEN', error.message || '权限不足', 403)
      }
      throw error
    }
  }

  try {
    await travelService.updateTravel(ctx.username || '', travelId, { visibility: body.visibility })
  } catch (error) {
    if (error instanceof SpaceAccessError) {
      throw new ApiError('FORBIDDEN', error.message || '权限不足', 403)
    }
    const message = (error as Error)?.message || '发布失败'
    throw new ApiError(message.includes('不存在') ? 'NOT_FOUND' : 'PUBLISH_FAILED', message, message.includes('不存在') ? 404 : 400)
  }

  // 计划生成的回忆跟着同档：公开时照片才进文章；取消公开时一并回落（只动计划这批）
  let memoriesSynced = 0
  try {
    memoriesSynced = await syncConvertedTravelMemoryVisibility(travelId, body.visibility)
  } catch (error) {
    // 旅行可见性已经改完，回忆没同步上属于"部分完成"：如实返回 500 让前端重试（操作幂等）
    console.error('[publish] 计划生成的回忆可见性同步失败:', (error as Error)?.message)
    throw new ApiError('PUBLISH_FAILED', '可见性已更新，但回忆同步失败，请重试', 500)
  }

  // published 以「旅行圈投影是否真的存在」为准，而不是只回显请求参数：
  // updateTravel 的 TravelPost 同步是旁路（失败只记日志），这里如实告诉前端结果。
  const post = await prisma.travelPost.findUnique({ where: { travelId }, select: { id: true } })
  return NextResponse.json({
    success: true,
    visibility: body.visibility,
    published: !!post,
    // 本次同步了多少条「计划生成的回忆」（非计划转换的旅行恒为 0）
    memoriesSynced,
  })
})
