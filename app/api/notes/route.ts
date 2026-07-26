import { NextResponse } from 'next/server'
import { getAllRepos } from '@/lib/repos'
import { getPosts } from '@/lib/content'

export async function GET() {
  try {
    const [blogPosts, repos, mindmaps] = await Promise.all([
      getPosts('tech/blog'),
      Promise.resolve(getAllRepos()),
      getPosts('tech/mindmaps'),
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
