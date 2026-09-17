import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { canManageTravel, updateTravelInfo } from '@/lib/modules/travel/travel.service'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const travel = await prisma.travel.findFirst({
    where: { slug },
    select: { id: true, title: true, slug: true, spaceId: true },
  })
  if (!travel) return NextResponse.json({ travel: null }, { status: 404 })
  return NextResponse.json({ travel })
}

/**
 * 编辑旅行基本信息：标题 / 目的地 / 日期区间 / 描述。
 *
 * 为什么需要：用户反馈"建完的旅行看不到、也没法进一步设置"——
 * 此前除后台 /admin 外，前台**没有任何**修改入口：目的地写错、日期漏填都无法补救，
 * 只能删掉重建（而删除会连带回忆与照片）。这里补上前台的编辑闭环。
 *
 * 权限与其它前台写接口一致：owner 或空间成员（`canManageTravel`）。
 * 标题变更会重算 slug，响应里回传新 slug，前台据此 replace 地址。
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)

  try {
    const travel = await prisma.travel.findFirst({ where: { slug }, select: { id: true } })
    if (!travel) return NextResponse.json({ error: '旅行不存在' }, { status: 404 })
    if (!(await canManageTravel(travel.id, auth.payload?.userId))) {
      return NextResponse.json({ error: '无权编辑该旅行' }, { status: 403 })
    }

    const body = await request.json()
    const result = await updateTravelInfo(travel.id, {
      title: body?.title !== undefined ? String(body.title) : undefined,
      location: body?.location !== undefined ? String(body.location) : undefined,
      description: body?.description !== undefined ? String(body.description ?? '') : undefined,
      startDate: body?.startDate !== undefined ? (body.startDate ? String(body.startDate) : null) : undefined,
      endDate: body?.endDate !== undefined ? (body.endDate ? String(body.endDate) : null) : undefined,
    })

    return NextResponse.json({ success: true, slug: result.slug, daysChanged: result.daysChanged })
  } catch (error) {
    return NextResponse.json({ error: (error as Error)?.message || '保存失败' }, { status: 400 })
  }
}
