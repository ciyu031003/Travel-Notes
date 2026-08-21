import { NextRequest } from 'next/server'
import { getCurrentUserId } from '@/lib/current-user'
import { getUserCapabilities } from '@/lib/modules/space/permissions'
import { ok, unauthorized } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return unauthorized()
  const capabilities = await getUserCapabilities(userId)
  return ok({ capabilities })
}
