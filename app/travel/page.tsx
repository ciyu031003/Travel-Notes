import { getPostService } from '@/lib/container'
import { listTravels } from '@/lib/modules/travel/travel.service'
import TravelClient from './TravelClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: '旅行记录 | 一起走过的地方',
  description: '记录我们一起旅行的美好时光',
}

export default async function TravelPage() {
  const { getCurrentUserId } = await import('@/lib/current-user')
  const userId = await getCurrentUserId()
  // 新 Travel 模型优先；尚未迁移时回退旧 Post(type=travel)
  const travels = await listTravels(userId)
  if (travels.length > 0) {
    const posts = travels.map((t) => ({
      id: t.id,
      slug: t.slug,
      title: t.title,
      date: t.startDate ?? '',
      description: t.description ?? undefined,
      cover: t.cover ?? undefined,
      images: [] as string[],
      videos: [] as unknown[],
      tags: t.tags ?? [],
      location: t.location ?? undefined,
      type: 'travel',
      published: true,
    }))
    return <TravelClient posts={posts} />
  }

  const postService = getPostService()
  const posts = await postService.getPostsHybrid('travel', userId)
  return <TravelClient posts={posts} />
}
