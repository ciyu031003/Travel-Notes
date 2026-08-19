import { NextRequest } from 'next/server'
import { listFollowing } from '@/lib/modules/social/social.service'
import { ok, fail } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = parseInt(id, 10)
  if (isNaN(userId)) return fail('无效 ID', 400)
  return ok(await listFollowing(userId))
}
