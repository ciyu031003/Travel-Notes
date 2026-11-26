import { NextRequest, NextResponse } from 'next/server'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { prisma } from '@/lib/db'
import { withAuth } from '@/lib/api/handler'
import { parseIdParam } from '@/lib/api/schemas/common'
import { requireSpaceOwner, SpaceAccessError } from '@/lib/modules/space/permissions'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 12 * 1024 * 1024

/**
 * 空间背景图（用户上传）
 * ---------------------------------------------------------------------------
 * 用户要求：「我的空间」背景可以用自己上传的图片；「我的」页空间左侧图标也显示这张图。
 *
 * 一次上传产出两张 webp：
 *   · 主图 1600×900（Hero 背景，object-fit: cover 会按容器裁切，等于"等比例铺满"）
 *   · 方形缩略图 360×360（「我的」/列表卡片的小图标，等比例缩放后居中裁切）
 * 颜色/裁切由 sharp 的 fit:'cover' + position:'attention' 决定：横图缩放时优先保住主体。
 *
 * 权限：仅空间 OWNER（与「空间设置」同一套权限）；文件写到 public/uploads/space-covers，
 * 与头像/头图同一目录约定，静态壳与 Web 都能直接读。
 */

const DIR_NAME = 'space-covers'

function safeName(spaceId: number): string {
  return `${spaceId}-${Date.now()}`
}

export const POST = withAuth(async (request: NextRequest, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const spaceId = parseIdParam(id, '空间 ID')

  try {
    await requireSpaceOwner(ctx.username || '', spaceId)
  } catch (error) {
    const status = error instanceof SpaceAccessError ? 403 : 400
    return NextResponse.json({ error: '只有空间主人可以更换背景' }, { status })
  }

  const formData = await request.formData()
  const file = formData.get('cover')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '请选择背景图片' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: '仅支持图片文件' }, { status: 400 })
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: '背景图不能超过 12MB' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const dir = path.join(process.cwd(), 'public', 'uploads', DIR_NAME)
  await mkdir(dir, { recursive: true })
  const base = safeName(spaceId)
  const mainName = `${base}.webp`
  const thumbName = `${base}-thumb.webp`

  const [main, thumb] = await Promise.all([
    sharp(buffer)
      .rotate()
      .resize(1600, 900, { fit: 'cover', position: sharp.strategy.attention })
      .webp({ quality: 82 })
      .toBuffer(),
    sharp(buffer)
      .rotate()
      .resize(360, 360, { fit: 'cover', position: sharp.strategy.attention })
      .webp({ quality: 84 })
      .toBuffer(),
  ])

  await Promise.all([
    writeFile(path.join(dir, mainName), main),
    writeFile(path.join(dir, thumbName), thumb),
  ])

  const coverUrl = `/uploads/${DIR_NAME}/${mainName}`
  const coverThumbUrl = `/uploads/${DIR_NAME}/${thumbName}`

  await prisma.space.update({ where: { id: spaceId }, data: { coverUrl, coverThumbUrl } })

  return NextResponse.json({ success: true, coverUrl, coverThumbUrl })
})

/** 移除背景：回到空间类型渐变 */
export const DELETE = withAuth(async (_request: NextRequest, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const spaceId = parseIdParam(id, '空间 ID')

  try {
    await requireSpaceOwner(ctx.username || '', spaceId)
  } catch (error) {
    const status = error instanceof SpaceAccessError ? 403 : 400
    return NextResponse.json({ error: '只有空间主人可以移除背景' }, { status })
  }

  await prisma.space.update({ where: { id: spaceId }, data: { coverUrl: null, coverThumbUrl: null } })
  return NextResponse.json({ success: true, coverUrl: null, coverThumbUrl: null })
})
