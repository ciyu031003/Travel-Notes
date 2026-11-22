'use client'

import MeUserRelationPage from '@/components/social/MeUserRelationPage'

export default function FollowingPage() {
  return (
    <MeUserRelationPage
      endpoint="following"
      title="我的关注"
      eyebrow="甜途 · 关注"
      subtitle="你在旅行圈关注的人"
    />
  )
}
