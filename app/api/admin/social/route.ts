import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  try {
    const [postCount, likeCount, commentCount, favoriteCount, reportCount, pendingReportCount, userCount] = await Promise.all([
      prisma.travelPost.count(),
      prisma.postLike.count(),
      prisma.comment.count(),
      prisma.postFavorite.count(),
      prisma.report.count(),
      prisma.report.count({ where: { status: 'PENDING' } }),
      prisma.user.count(),
    ])

    const [posts, comments, reports] = await Promise.all([
      prisma.travelPost.findMany({
        orderBy: { publishedAt: 'desc' },
        take: 20,
        include: {
          author: { select: { id: true, username: true } },
          travel: { select: { title: true, location: true } },
        },
      }),
      prisma.comment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          user: { select: { id: true, username: true } },
          post: { select: { id: true, title: true } },
        },
      }),
      prisma.report.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          reporter: { select: { id: true, username: true } },
          post: { select: { id: true, title: true } },
        },
      }),
    ])

    return NextResponse.json({
      success: true,
      stats: { postCount, likeCount, commentCount, favoriteCount, reportCount, pendingReportCount, userCount },
      posts,
      comments,
      reports,
    })
  } catch (e) {
    console.error('[GET /api/admin/social]', (e as Error)?.message)
    return NextResponse.json({ error: '获取社交管理数据失败' }, { status: 500 })
  }
}
