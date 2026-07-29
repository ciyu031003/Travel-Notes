import { NextResponse } from 'next/server'
import { getSiteSettings } from '@/lib/auth'
import { generateAlbumToken, ALBUM_COOKIE } from '@/lib/album-auth'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const inputDate = (body.date || '').trim()

    if (!inputDate) {
      return NextResponse.json({ success: false, error: '请输入日期' }, { status: 400 })
    }

    const settings = await getSiteSettings()
    const expectedDate = settings.anniversaryStart

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
      const token = await generateAlbumToken()
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
