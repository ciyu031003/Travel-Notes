import { getPosts } from '@/lib/content'
import TravelClient from './TravelClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: '旅行记录 | 一起走过的地方',
  description: '记录我们一起旅行的美好时光',
}

export default async function TravelPage() {
  const posts = await getPosts('travel')
  
  return <TravelClient posts={posts} />
}
