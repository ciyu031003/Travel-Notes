import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { getSiteService } from '@/lib/container'
import { generateAlbumToken, ALBUM_COOKIE } from '@/lib/album-auth'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const inputDate = (body.date || '').trim()

    if (!inputDate) {
      return NextResponse.json({ success: false, error: '请输入日期' }, { status: 400 })
    }

    // 读取「当前登录用户」的纪念日（多用户：每个用户各自设置）
    // 未登录时（如登录页的相册解锁）回退到首个用户的纪念日
    const auth = await requireAuth(request as any)
    const username = auth.authenticated ? auth.username : undefined

    const siteService = getSiteService()
    const config = await siteService.getSiteConfig(username)
    let expectedDate = config.anniversaryStart

    // 兜底：账号设置里未设置时，用该用户最早的一条纪念日记录（纪念日管理里添加的）
    if (!expectedDate) {
      try {
        const anniversary = await prisma.anniversary.findFirst({
          where: auth.authenticated && auth.payload?.userId
            ? { OR: [{ userId: auth.payload.userId }, { userId: null }] }
            : {},
          orderBy: { date: 'asc' },
          select: { date: true },
        })
        if (anniversary) expectedDate = anniversary.date.toISOString().slice(0, 10)
      } catch {
        // 忽略，保持原错误提示
      }
    }

    if (!expectedDate) {
      return NextResponse.json({ success: false, error: '系统未设置纪念日' }, { status: 400 })
    }

    const normalize = (s: string) => s.replace(/[./年]/g, '-').replace(/[月]/g, '-').replace(/日/g, '').trim()
    const normalizedInput = normalize(inputDate)
    const normalizedExpected = normalize(expectedDate)

    const isValid =
      inputDate === expectedDate ||
      normalizedInput === normalizedExpected ||
      inputDate.replace(/-/g, '') === expectedDate.replace(/-/g, '')

    if (isValid) {
      const token = await generateAlbumToken(expectedDate)
      const response = NextResponse.json({ success: true })
      response.cookies.set(ALBUM_COOKIE, token, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        httpOnly: true,
        sameSite: 'lax',
      })
      return response
    }

    return NextResponse.json({ success: false, error: '日期不正确' }, { status: 401 })
  } catch {
    return NextResponse.json({ success: false, error: '验证失败' }, { status: 500 })
  }
}
