import { NextResponse } from 'next/server'
import { getRepoService } from '@/lib/container'

export async function GET() {
  try {
    const repoService = getRepoService()
    const result = await repoService.getAllRepos()
    return NextResponse.json({ repos: result })
  } catch (error: any) {
    console.error('[GET /api/repos] Error:', error?.message)
    return NextResponse.json({ error: 'Failed to fetch repos' }, { status: 500 })
  }
}
