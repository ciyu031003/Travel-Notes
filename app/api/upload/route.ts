import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { prisma } from '@/lib/db'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
const MAX_FILE_SIZE = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const postIdStr = formData.get('postId') as string | null

    if (!files || files.length === 0) {
      return NextResponse.json({ error: '未上传任何文件' }, { status: 400 })
    }

    if (!postIdStr) {
      return NextResponse.json({ error: '缺少文章 ID，请先保存文章后再上传图片' }, { status: 400 })
    }

    const postId = parseInt(postIdStr, 10)
    if (isNaN(postId)) {
      return NextResponse.json({ error: '无效的文章 ID' }, { status: 400 })
    }

    const post = await prisma.post.findUnique({ where: { id: postId } })
    if (!post) {
      return NextResponse.json({ error: '文章不存在' }, { status: 404 })
    }

    const createdIds: number[] = []

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json({ error: `不支持的文件类型: ${file.type}` }, { status: 400 })
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `文件太大: ${file.name} 超过 10MB` }, { status: 400 })
      }

      if (file.size === 0) {
        return NextResponse.json({ error: `文件为空: ${file.name}` }, { status: 400 })
      }

      const buffer = Buffer.from(await file.arrayBuffer())

      const maxOrderResult = await prisma.postImage.aggregate({
        where: { postId },
        _max: { order: true },
      })
      const nextOrder = (maxOrderResult._max.order ?? -1) + 1

      const postImage = await prisma.postImage.create({
        data: {
          postId,
          data: buffer,
          mimeType: file.type,
          order: nextOrder,
        },
      })

      createdIds.push(postImage.id)
    }

    // Append new IDs to the post's images array
    let existingIds: number[] = []
    if (post.images) {
      try {
        const parsed = JSON.parse(post.images)
        if (Array.isArray(parsed)) {
          existingIds = parsed.filter((v: any) => typeof v === 'number')
        }
      } catch {}
    }

    const allIds = [...existingIds, ...createdIds]

    const needCoverUpdate =
      !post.cover ||
      post.cover === '' ||
      post.cover.startsWith('/uploads/')

    await prisma.post.update({
      where: { id: postId },
      data: {
        images: JSON.stringify(allIds),
        ...(needCoverUpdate ? { cover: `/api/images/${allIds[0]}` } : {}),
      },
    })

    const urls = createdIds.map((id) => `/api/images/${id}`)
    return NextResponse.json({ urls })
  } catch (error: any) {
    console.error('[Upload] Error:', error?.message)
    console.error('[Upload] Stack:', error?.stack)
    return NextResponse.json({ error: error.message || '上传失败' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { url } = body

    if (!url || !url.startsWith('/api/images/')) {
      return NextResponse.json({ error: '无效的资源路径' }, { status: 400 })
    }

    const imageId = parseInt(url.replace('/api/images/', ''), 10)
    if (isNaN(imageId)) {
      return NextResponse.json({ error: '无效的图片 ID' }, { status: 400 })
    }

    const image = await prisma.postImage.findUnique({ where: { id: imageId } })
    if (!image) {
      return NextResponse.json({ error: '图片不存在' }, { status: 404 })
    }

    const postId = image.postId
    await prisma.postImage.delete({ where: { id: imageId } })

    const remaining = await prisma.postImage.findMany({
      where: { postId },
      orderBy: { order: 'asc' },
      select: { id: true },
    })

    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, cover: true } })
    if (post) {
      const newCover = post.cover === url
        ? (remaining.length > 0 ? `/api/images/${remaining[0].id}` : null)
        : post.cover
      await prisma.post.update({
        where: { id: postId },
        data: {
          images: JSON.stringify(remaining.map((r) => r.id)),
          cover: newCover,
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Upload DELETE] Error:', error?.message)
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 500 })
  }
}
