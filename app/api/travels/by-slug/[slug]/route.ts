import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const travel = await prisma.travel.findFirst({
    where: { slug },
    select: { id: true, title: true, slug: true, spaceId: true },
  })
  if (!travel) return NextResponse.json({ travel: null }, { status: 404 })
  return NextResponse.json({ travel })
}
