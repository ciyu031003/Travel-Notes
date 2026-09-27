'use client'

import { useParams } from 'next/navigation'
import PostDetail from '@/components/social/PostDetail'
import EdgeSwipeBack from '@/components/mobile/EdgeSwipeBack'

export default function CirclePostShell() {
  const params = useParams()
  const raw = typeof params?.postId === 'string' ? params.postId : ''
  const id = parseInt(raw, 10)
  return (
    <>
      <EdgeSwipeBack />
      <PostDetail postId={Number.isFinite(id) ? id : 0} />
    </>
  )
}
