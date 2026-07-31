import { getPostService, getRepoService } from '@/lib/container'
import { ok, serverError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const postService = getPostService()
    const repoService = getRepoService()

    const [stats, repos] = await Promise.all([
      postService.getLearningStats(),
      repoService.getAllRepos(),
    ])

    return ok({ ...stats, repoCount: repos.length })
  } catch (error: any) {
    console.error('[GET /api/stats/learning] Error:', error?.message || error)
    return serverError()
  }
}
