import UserProfile from '@/components/social/UserProfile'

export const dynamic = 'force-dynamic'

export default async function CircleUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = parseInt(id, 10)
  return <UserProfile userId={Number.isFinite(userId) ? userId : 0} />
}
