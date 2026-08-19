import { getCurrentUser } from '@/lib/current-user'
import { redirect } from 'next/navigation'
import MeHome from '@/components/social/MeHome'

export const dynamic = 'force-dynamic'

export default async function MePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return <MeHome userId={user.id} username={user.username} />
}
