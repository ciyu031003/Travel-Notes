'use client'

import { useParams } from 'next/navigation'
import UserProfile from '@/components/social/UserProfile'

export default function CircleUserPage() {
  const params = useParams()
  const raw = typeof params?.id === 'string' ? params.id : ''
  const id = parseInt(raw, 10)
  return <UserProfile userId={Number.isFinite(id) ? id : 0} />
}
