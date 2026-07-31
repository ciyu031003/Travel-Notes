import { NextResponse } from 'next/server'
import { getRepoService } from '@/lib/container'

export async function GET() {
  try {
    const repoService = getRepoService()
    const repoMetas = await repoService.getAllRepos()
    const repos = repoMetas.map((r) => r.name)
    return NextResponse.json({ repos })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch repos' }, { status: 500 })
  }
}
