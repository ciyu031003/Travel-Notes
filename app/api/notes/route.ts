import { NextResponse } from 'next/server'
import { getPostService, getRepoService } from '@/lib/container'

export async function GET() {
  try {
    const postService = getPostService()
    const repoService = getRepoService()
    const [blogPosts, repoMetas, mindmaps] = await Promise.all([
      postService.getPostsHybrid('tech/blog'),
      repoService.getAllRepos(),
      postService.getPostsHybrid('tech/mindmaps'),
    ])

    return NextResponse.json({
      blogCount: blogPosts.length,
      repoCount: repoMetas.length,
      mindmapCount: mindmaps.length,
      recentPosts: blogPosts.slice(0, 4),
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch notes data' }, { status: 500 })
  }
}
