import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getSpaceOverviewBySlug } from '@/lib/modules/space/space-overview.service'
import { SpaceAccessError } from '@/lib/modules/space/permissions'

/**
 * 空间概览（按 slug）—— 供**移动端静态导出壳**使用。
 *
 * 为什么必须有这个入口：Capacitor 壳是 `output: 'export'` 的静态站点，
 * 没有 Node 服务端，页面的动态段（`/space/<slug>`）无法在构建期渲染真实数据。
 * 因此移动端页面的架构与 `/travel/[slug]` 一致：
 *   · 构建期只产出一个占位页（`generateStaticParams → placeholder`）；
 *   · 客户端读出 URL 里的 slug，来这里取数据。
 * Web 端（服务端渲染）可以直接用同一份装配函数，不必绕 HTTP。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { slug } = await params
  if (!slug) {
    return NextResponse.json({ error: '无效的空间标识' }, { status: 400 })
  }

  const url = new URL(request.url)
  const activity = parseInt(url.searchParams.get('activity') || '20', 10) || 20

  try {
    const overview = await getSpaceOverviewBySlug(auth.username, slug, { activity })
    if (!overview) {
      return NextResponse.json({ error: '空间不存在' }, { status: 404 })
    }
    return NextResponse.json(overview)
  } catch (error: any) {
    if (error instanceof SpaceAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 500 })
  }
}
