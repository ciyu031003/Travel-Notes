import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { prisma } from '@/lib/db'
import { normalizePreferences, readStoredPreferences } from '@/lib/modules/user/preferences'

export const dynamic = 'force-dynamic'

/**
 * 保存新用户偏好问卷（也用于"跳过"）。
 *
 * 「只弹一次」的幂等锚点是 `User.preferencesCompletedAt`：
 *  · 首次提交（无论完成还是跳过）写入答案 + 打上完成时间；
 *  · 之后再次提交只更新答案，**不重置**完成时间 —— 于是刷新/换设备都不会再弹。
 * 客户端据此字段决定是否渲染问卷（见 `shouldShowPreferenceSurvey`）。
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.payload?.userId) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const userId = auth.payload.userId

  try {
    const body = await request.json().catch(() => ({}))
    const prefs = normalizePreferences(body)

    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true, preferencesCompletedAt: true },
    })
    if (!current) return NextResponse.json({ error: '用户不存在' }, { status: 404 })

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
  } catch (error) {
    console.error('[PATCH /api/me/preferences]', (error as Error)?.message || error)
    return NextResponse.json({ error: '保存失败' }, { status: 500 })
  }
}
