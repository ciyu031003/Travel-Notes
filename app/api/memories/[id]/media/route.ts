import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { memoryService } from '@/lib/modules/memory/memory.service'

export const dynamic = 'force-dynamic'

/**
 * v3.1 M2-A2：回忆-媒体 多对多关联。
 * POST /api/memories/[id]/media    { mediaIds: number[] } 关联
 * DELETE /api/memories/[id]/media  { mediaIds: number[] } 移除关联
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const memoryId = parseInt(id, 10)
  if (isNaN(memoryId)) {
    return NextResponse.json({ error: '无效的回忆 ID' }, { status: 400 })
  }
  try {
    const body = await request.json()
    const mediaIds = Array.isArray(body?.mediaIds) ? body.mediaIds : []
    if (mediaIds.length === 0) {
      return NextResponse.json({ error: '缺少 mediaIds' }, { status: 400 })
    }
    await memoryService.attachMedia(auth.username, memoryId, mediaIds)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '关联失败' }, { status: 403 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const memoryId = parseInt(id, 10)
  if (isNaN(memoryId)) {
    return NextResponse.json({ error: '无效的回忆 ID' }, { status: 400 })
  }
  try {
    const body = await request.json()
    const mediaIds = Array.isArray(body?.mediaIds) ? body.mediaIds : []
    if (mediaIds.length === 0) {
      return NextResponse.json({ error: '缺少 mediaIds' }, { status: 400 })
    }
    await memoryService.detachMedia(auth.username, memoryId, mediaIds)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '移除关联失败' }, { status: 403 })
  }
}
