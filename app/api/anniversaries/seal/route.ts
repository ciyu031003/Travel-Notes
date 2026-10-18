import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { skipDbOnBuild } from '@/lib/db-guard'

export const dynamic = 'force-dynamic'

/**
 * 登录门封条日期（P1-14 新增）：只返回**最早一条公开纪念日**的 month/day。
 *
 * 为什么不复用 /api/anniversaries：那里的最小粒度是整条记录（标题/描述/完整日期），
 * 而登录门只需要「月.日」来盖章。独立端点把信息面收到最小：
 * 不返回标题、不返回描述、不返回年份（年份本身能推断关系开始时间）。
 * 没有公开纪念日时返回 month/day = null，前端回退「启程」。
 */
export async function GET() {
  try {
    // 构建期无数据库：返回 null，前端回退默认封条
    if (skipDbOnBuild()) return NextResponse.json({ month: null, day: null })

    const first = await prisma.anniversary.findFirst({
      where: { isPublic: true },
      orderBy: { date: 'asc' },
      select: { date: true },
    })
    if (!first) return NextResponse.json({ month: null, day: null })
    return NextResponse.json({ month: first.date.getMonth() + 1, day: first.date.getDate() })
  } catch (error: any) {
    console.error('[GET /api/anniversaries/seal] Error:', error?.message)
    return NextResponse.json({ month: null, day: null })
  }
}
