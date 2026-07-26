import { NextResponse } from 'next/server'
import { getRepoFileTree, getRepoReadme } from '@/lib/repos'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ repo: string }> }
) {
  try {
    const { repo } = await params
    const tree = getRepoFileTree(repo)
    const readme = getRepoReadme(repo)

    if (!tree) {
      return NextResponse.json({ error: 'Repo not found' }, { status: 404 })
    }

    return NextResponse.json({ tree, readme })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch repo' }, { status: 500 })
  }
}
