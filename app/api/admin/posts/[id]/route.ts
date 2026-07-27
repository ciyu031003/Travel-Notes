import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { prisma } from '@/lib/db'
import { updateDBPost, deleteDBPost } from '@/lib/db-posts'

function parseImages(images: string | null): string[] {
  if (!images) return []
  try {
    const parsed = JSON.parse(images)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const post = await prisma.post.findUnique({ where: { id: parseInt(id) } })
    if (!post) {
      return NextResponse.json({ error: '文章不存在' }, { status: 404 })
    }
    const postData = {
      ...post,
      images: parseImages(post.images),
    }
    return NextResponse.json({ post: postData })
  } catch {
    return NextResponse.json({ error: '获取失败' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const { id } = await params
  try {
    const body = await request.json()
    const post = await updateDBPost(parseInt(id), body)
    return NextResponse.json({ post })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '更新失败' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const { id } = await params
  try {
    await deleteDBPost(parseInt(id))
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 500 })
  }
}
