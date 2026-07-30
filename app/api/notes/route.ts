import { NextResponse } from 'next/server'
import { getAllRepos } from '@/lib/repos'
import { getPostService } from '@/lib/container'

export async function GET() {
  try {
    const postService = getPostService()
    const [blogPosts, repos, mindmaps] = await Promise.all([
      postService.getPostsHybrid('tech/blog'),
      Promise.resolve(getAllRepos()),
      postService.getPostsHybrid('tech/mindmaps'),
    ])

    return NextResponse.json({
      blogCount: blogPosts.length,
      repoCount: repos.length,
      mindmapCount: mindmaps.length,
      recentPosts: blogPosts.slice(0, 4),
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch notes data' }, { status: 500 })
  }
}
