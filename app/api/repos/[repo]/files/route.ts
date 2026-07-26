import { NextResponse } from 'next/server'
import { getFileContent } from '@/lib/repos'

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

    const content = getFileContent(repo, filePath)

    if (content === null) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    return NextResponse.json({ content })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch file' }, { status: 500 })
  }
}
