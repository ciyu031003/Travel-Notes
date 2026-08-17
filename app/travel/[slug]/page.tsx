import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPostService } from '@/lib/container'
import { getTravelBySlug } from '@/lib/modules/travel/travel.service'
import { formatDate } from '@/lib/utils'
import { Calendar, MapPin } from 'lucide-react'
import MermaidRenderer from '@/components/mdx/MermaidRenderer'
import TravelDetailClient from './TravelDetailClient'
import dynamicImport from 'next/dynamic'

const VideoPlayer = dynamicImport(() => import('@/components/VideoPlayer'))

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const { getCurrentUserId } = await import('@/lib/current-user')
  const userId = await getCurrentUserId()
  const travel = await getTravelBySlug(slug, userId)
  if (travel) {
    return { title: travel.title, description: travel.description ?? undefined }
  }
  // 旧 Post 游记回退：标签页标题显示真实游记标题
  try {
    const postService = getPostService()
    const legacyPost = await postService.getPostBySlugHybrid('travel', slug, userId)
    if (legacyPost) {
      return { title: legacyPost.title, description: legacyPost.description || undefined }
    }
  } catch {}
  return { title: '文章不存在' }
}

export default async function TravelDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const { getCurrentUserId } = await import('@/lib/current-user')
  const userId = await getCurrentUserId()
  const postService = getPostService()

  // 新 Travel 优先；旧 Post 兜底（Travel 表为空时也能打开历史游记）
  let travel = await getTravelBySlug(slug, userId)
  let legacyPost = null
  if (!travel) {
    legacyPost = await postService.getPostBySlugHybrid('travel', slug, userId).catch(() => null)
  }

  const legacyImages = (legacyPost as any)?.images || []
  const legacyVideos = (legacyPost as any)?.videos || []

  // travel 为空且无旧 Post 时 404；否则统一走「全屏图廊 + 文章」布局
  if (!travel && !legacyPost) {
    notFound()
  }

  const record: any = travel ?? legacyPost
  const images = travel
    ? travel.cover
      ? [travel.cover, ...legacyImages]
      : legacyImages
    : legacyImages
  const videos = legacyVideos
  const detailTitle = record.title
  const detailDescription = travel ? travel.description ?? undefined : (legacyPost?.description || undefined)
  const detailLocation = travel ? travel.location ?? undefined : (legacyPost?.location || undefined)
  const detailDate = travel ? travel.startDate ?? '' : (legacyPost?.date || '')
  const detailTags = travel?.tags ?? null
  const contentHtml = travel ? travel.contentHtml : ((legacyPost as any)?.contentHtml || (legacyPost as any).content)

  const imageProps = {
    images,
    videos,
    title: detailTitle,
    description: detailDescription,
    location: detailLocation,
    date: detailDate,
    postSlug: slug,
  }

  return (
    <div className="bg-[#FAFBF7] min-h-screen">
      {(imageProps.images.length > 0 || imageProps.videos.length > 0) && (
        <TravelDetailClient {...imageProps} />
      )}

      <div className="container-custom pt-6">
        <Link
          href={`/travel/${slug}/record`}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#F5DCE0] border border-[#E8B8C2]/50 text-[#5A6670] rounded-full text-sm font-medium hover:bg-[#EED2D8] transition-colors"
        >
          ✍️ 记录今日
        </Link>
      </div>
      <div id={`detail-${slug}`} className="container-custom">
        <article className="max-w-3xl mx-auto pt-24 pb-16">
          <header className="mb-8 text-center">
            <h1 className="text-3xl md:text-4xl font-bold mb-4 text-[#5A6670]">{detailTitle}</h1>
            <div className="flex items-center justify-center gap-4 text-[#5A6670]/60 text-sm">
              {detailDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(detailDate)}
                </span>
              )}
              {detailLocation && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {detailLocation}
                </span>
              )}
            </div>
            {detailTags && detailTags.length > 0 && (
              <div className="flex justify-center gap-2 mt-4">
                {detailTags.map((tag: string) => (
                  <span key={tag} className="px-3 py-1 bg-[#F5DCE0]/40 border border-[#E8B8C2]/50 text-[#5A6670] text-xs rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </header>

          {videos.length > 0 && (
            <div className="mb-8">
              <VideoPlayer videos={videos} className="aspect-video" />
            </div>
          )}

          <div
            className="prose prose-lg max-w-none prose-headings:text-[#5A6670] prose-p:text-[#5A6670]/80 prose-a:text-[#E8B8C2]"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
          
          <MermaidRenderer />
        </article>
      </div>
    </div>
  )
}
