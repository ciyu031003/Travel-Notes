import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPostService } from '@/lib/container'
import { getTravelBySlug } from '@/lib/modules/travel/travel.service'
import { formatDate } from '@/lib/utils'
import { Calendar, MapPin } from 'lucide-react'
import MermaidRenderer from '@/components/mdx/MermaidRenderer'
import TravelDetailClient from './TravelDetailClient'
import dynamic from 'next/dynamic'

const VideoPlayer = dynamic(() => import('@/components/VideoPlayer'))

export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const travel = await getTravelBySlug(slug)
  if (!travel) return { title: '文章不存在' }
  return {
    title: travel.title,
    description: travel.description ?? undefined,
  }
}

export default async function TravelDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const travel = await getTravelBySlug(slug)

  if (!travel) {
    notFound()
  }

  // 新 Travel 优先；旧 Post 仅用于补充尚未迁移到 Media 的图片/视频
  const postService = getPostService()
  const legacyPost = await postService.getPostBySlugHybrid('travel', slug).catch(() => null)
  const legacyImages = (legacyPost as any)?.images || []
  const legacyVideos = (legacyPost as any)?.videos || []

  const images = travel.cover ? [travel.cover, ...legacyImages] : legacyImages
  const videos = legacyVideos

  const imageProps = {
    images,
    videos,
    title: travel.title,
    description: travel.description ?? undefined,
    location: travel.location ?? undefined,
    date: travel.startDate ?? '',
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
            <h1 className="text-3xl md:text-4xl font-bold mb-4 text-[#5A6670]">{travel.title}</h1>
            <div className="flex items-center justify-center gap-4 text-[#5A6670]/60 text-sm">
              {travel.startDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(travel.startDate)}
                </span>
              )}
              {travel.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {travel.location}
                </span>
              )}
            </div>
            {travel.tags && travel.tags.length > 0 && (
              <div className="flex justify-center gap-2 mt-4">
                {travel.tags.map((tag: string) => (
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
            dangerouslySetInnerHTML={{ __html: travel.contentHtml }}
          />
          
          <MermaidRenderer />
        </article>
      </div>
    </div>
  )
}
