import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getSiteService } from '@/lib/container'

export async function GET(request: Request) {
  const authResult = await requireAuth(request as any)
  if (!authResult.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const siteService = getSiteService()
  const config = await siteService.getSiteConfig(authResult.username)
  return NextResponse.json({
    anniversaryStart: config.anniversaryStart,
  })
}

export async function POST(request: Request) {
  const authResult = await requireAuth(request as any)
  if (!authResult.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  // P0-3：纪念日起点是「作用于本人」的配置（旧密码校验），不要求站点主能力位
  try {
    const body = await request.json()
    const { anniversaryStart, currentPassword } = body

    if (!currentPassword) {
      return NextResponse.json({ error: '请输入当前密码以验证身份' }, { status: 400 })
    }

    const siteService = getSiteService()

    const verifyResult = await siteService.verifyPassword(currentPassword, authResult.username)
    if (!verifyResult.success) {
      return NextResponse.json({ error: '当前密码错误' }, { status: 401 })
    }

    if (anniversaryStart && !/^\d{4}-\d{2}-\d{2}$/.test(anniversaryStart)) {
      return NextResponse.json({ error: '日期格式不正确' }, { status: 400 })
    }

    // 严格按当前登录用户名定位（P0-3：无 username 时 service 返回失败，不再写错人）
    const updateResult = await siteService.updateAnniversaryStart(anniversaryStart || null, authResult.username)
    if (!updateResult.success) {
      return NextResponse.json({ error: updateResult.error || '更新失败' }, { status: 401 })
    }

    return NextResponse.json({
      success: true,
      anniversaryStart: anniversaryStart || null,
    })
  } catch {
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}
