import { getCurrentUser } from '@/lib/current-user'
import { redirect } from 'next/navigation'
import MeHome from '@/components/social/MeHome'
import { getMyProfile } from '@/lib/modules/social/profile.service'

export const dynamic = 'force-dynamic'

export default async function MePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = (await getMyProfile(user.id)) ?? {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    accountId: user.accountId,
    createdAt: null,
    recentTravel: null,
    dashboard: null,
    stats: { postCount: 0, followerCount: 0, followingCount: 0, favoriteCount: 0, tripCount: 0, placeCount: 0, photoCount: 0, dayCount: 0, momentCount: 0 },
  }
  return <MeHome initial={profile} />
}
