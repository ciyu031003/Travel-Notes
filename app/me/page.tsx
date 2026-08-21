import { getCurrentUser } from '@/lib/current-user'
import { redirect } from 'next/navigation'
import MeHome from '@/components/social/MeHome'
import { getMyProfile } from '@/lib/modules/social/profile.service'

export const dynamic = 'force-dynamic'

export default async function MePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getMyProfile(user.id)
  if (!profile) redirect('/login')
  return <MeHome initial={profile} />
}
