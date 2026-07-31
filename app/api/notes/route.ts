import { NextResponse } from 'next/server'
import { getPostService, getRepoService } from '@/lib/container'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const postService = getPostService()
    const repoService = getRepoService()
    const [blogPosts, repoMetas, mindmaps, stats, popularTags] = await Promise.all([
      postService.getPostsHybrid('tech/blog'),
      repoService.getAllRepos(),
      postService.getPostsHybrid('tech/mindmaps'),
      postService.getLearningStats(),
      postService.getAllTags('blog').then((tags) => tags.slice(0, 10)),
    ])

    return NextResponse.json({
      blogCount: blogPosts.length,
      repoCount: repoMetas.length,
      mindmapCount: mindmaps.length,
      recentPosts: blogPosts.slice(0, 4),
      stats,
      popularTags,
    })
  } catch (error: any) {
    console.error('[GET /api/notes] Error:', error?.message || error)
    return NextResponse.json({ error: 'Failed to fetch notes data' }, { status: 500 })
  }
}
