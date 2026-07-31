import { NextResponse } from 'next/server'
import { getRepoService } from '@/lib/container'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ repo: string }> }
) {
  try {
    const { repo } = await params
    const repoService = getRepoService()

    const [tree, fileResult] = await Promise.all([
      repoService.getRepoFiles(repo),
      repoService.getRepoFile(repo, 'README.md'),
    ])

    if (!tree) {
      return NextResponse.json({ error: 'Repo not found' }, { status: 404 })
    }

    return NextResponse.json({ tree, readme: fileResult?.content ?? null })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch repo' }, { status: 500 })
  }
}
