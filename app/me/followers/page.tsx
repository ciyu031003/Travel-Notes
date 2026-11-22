'use client'

import MeUserRelationPage from '@/components/social/MeUserRelationPage'

export default function FollowersPage() {
  return (
    <MeUserRelationPage
      endpoint="followers"
      title="我的粉丝"
      eyebrow="甜途 · 粉丝"
      subtitle="关注你旅程的人"
    />
  )
}
