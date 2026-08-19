import PostDetail from '@/components/social/PostDetail'

export const dynamic = 'force-dynamic'

export default async function CirclePostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params
  const id = parseInt(postId, 10)
  return <PostDetail postId={Number.isFinite(id) ? id : 0} />
}
