import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { normalizePreferences, readStoredPreferences } from '@/lib/modules/user/preferences'
import { ApiError } from '@/lib/api-response'
import { withAuth, parseBody } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

/**
 * 偏好问卷请求体（P1-17）：问卷字段由 normalizePreferences 归一（未知键会被过滤），
 * 这里只要求是 JSON 对象，避免把数组/字符串当对象传进 service。
 */
const PreferencesSchema = z.record(z.string(), z.unknown())

/**
 * 保存新用户偏好问卷（也用于"跳过"）。
 *
 * 「只弹一次」的幂等锚点是 `User.preferencesCompletedAt`：
 *  · 首次提交（无论完成还是跳过）写入答案 + 打上完成时间；
 *  · 之后再次提交只更新答案，**不重置**完成时间 —— 于是刷新/换设备都不会再弹。
 * 客户端据此字段决定是否渲染问卷（见 `shouldShowPreferenceSurvey`）。
 */
export const PATCH = withAuth(async (request, ctx) => {
  const userId = ctx.userId
  if (!userId) throw new ApiError('UNAUTHORIZED', '未授权', 401)

  const body = await parseBody(request, PreferencesSchema)
  const prefs = normalizePreferences(body)

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true, preferencesCompletedAt: true },
  })
  if (!current) throw new ApiError('NOT_FOUND', '用户不存在', 404)

  const completedAt = current.preferencesCompletedAt ?? new Date()
  await prisma.user.update({
    where: { id: userId },
    data: {
      // 跳过时也保留已经点过的答案（用户可能点了一半才跳）
      preferences: { ...readStoredPreferences(current.preferences), ...prefs } as never,
      preferencesCompletedAt: completedAt,
    },
  })

  return NextResponse.json({
    success: true,
    preferences: prefs,
    preferencesCompletedAt: completedAt.toISOString(),
  })
})
