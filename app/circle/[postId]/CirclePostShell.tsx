'use client'

import { useParams } from 'next/navigation'
import PostDetail from '@/components/social/PostDetail'

export default function CirclePostShell() {
  const params = useParams()
  const raw = typeof params?.postId === 'string' ? params.postId : ''
  const id = parseInt(raw, 10)
  // 左缘右滑返回由全局壳（LayoutContent）的 EdgeSwipeBack 提供：
  // 此前页面又挂一份，同一手势两套监听都 commit → 一滑退两层（真机 bug）。
  return <PostDetail postId={Number.isFinite(id) ? id : 0} />
}
