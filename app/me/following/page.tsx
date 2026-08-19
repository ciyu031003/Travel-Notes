import { getCurrentUser } from '@/lib/current-user'
import { redirect } from 'next/navigation'
import UserList from '@/components/social/UserList'

export const dynamic = 'force-dynamic'

export default async function FollowingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return <UserList endpoint={'/api/social/users/' + user.id + '/following'} title="我的关注" />
}
