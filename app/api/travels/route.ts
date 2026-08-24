import { NextRequest, NextResponse } from 'next/server'
import { getPostService } from '@/lib/container'
import { getCurrentUserId } from '@/lib/current-user'

export const dynamic = 'force-dynamic'

/**
 * 旅行记录列表（面向 /travel 前台地图与列表）。
 * v3.1 起统一走旧 Post(type=travel) 模型，与首页 /api/home、数据看板保持一致：
 * 因真实旅行数据存储于 Post 表，新 Travel 规划模型尚未作为前台数据源，
 * 避免"新模型优先命中空记录导致地图/统计为空"的回归（bugfix）。
 */
export async function GET(_request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    const postService = getPostService()
    const posts = await postService.getPostsHybrid('travel', userId)
    return NextResponse.json({ posts })
  } catch (error) {
    console.error('[GET /api/travels]', error)
    return NextResponse.json({ error: '获取旅行记录失败' }, { status: 500 })
  }
}
