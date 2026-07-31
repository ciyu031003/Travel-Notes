import { NextResponse } from 'next/server'
import { getRepoService } from '@/lib/container'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ repo: string }> }
) {
  try {
    const { repo } = await params
    const { searchParams } = new URL(request.url)
    const filePath = searchParams.get('path')

    if (!filePath) {
      return NextResponse.json({ error: 'File path is required' }, { status: 400 })
    }

    const repoService = getRepoService()
    const result = await repoService.getRepoFile(repo, filePath)

    if (result === null) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    return NextResponse.json({ content: result.content })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch file' }, { status: 500 })
  }
}
