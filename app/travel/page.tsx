import { getPostService } from '@/lib/container'
import TravelClient from './TravelClient'

export const revalidate = 300

export const metadata = {
  title: '旅行记录 | 一起走过的地方',
  description: '记录我们一起旅行的美好时光',
}

export default async function TravelPage() {
  const postService = getPostService()
  const posts = await postService.getPostsHybrid('travel')

  return <TravelClient posts={posts} />
}

