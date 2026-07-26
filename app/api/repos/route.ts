import { NextResponse } from 'next/server'
import { getAllRepos } from '@/lib/repos'

export async function GET() {
  try {
    const repos = getAllRepos()
    return NextResponse.json({ repos })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch repos' }, { status: 500 })
  }
}
