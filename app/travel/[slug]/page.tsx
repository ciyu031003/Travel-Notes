import { notFound } from 'next/navigation'
import { getPostService } from '@/lib/container'
import { formatDate } from '@/lib/utils'
import { Calendar, MapPin } from 'lucide-react'
import MermaidRenderer from '@/components/mdx/MermaidRenderer'
import TravelDetailClient from './TravelDetailClient'
import VideoPlayer from '@/components/VideoPlayer'

export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const postService = getPostService()
  const post = await postService.getPostBySlugHybrid('travel', slug)
  if (!post) return { title: '文章不存在' }
  return {
    title: post.title,
    description: post.description,
  }
}

export default async function TravelDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const postService = getPostService()
  const post = await postService.getPostBySlugHybrid('travel', slug)

  if (!post) {
    notFound()
  }

  const images = (post as any).images || []
  const videos = (post as any).videos || []

  const imageProps = {
    images: images.length > 0 ? images : (post.cover ? [post.cover] : []),
    videos: videos,
    title: post.title,
    description: post.description,
    location: post.location ?? undefined,
    date: post.date,
    postSlug: slug,
  }

  return (
    <div className="bg-[#FAFBF7] min-h-screen">
      {(imageProps.images.length > 0 || imageProps.videos.length > 0) && (
        <TravelDetailClient {...imageProps} />
      )}

      <div id={`detail-${slug}`} className="container-custom">
        <article className="max-w-3xl mx-auto pt-24 pb-16">
          <header className="mb-8 text-center">
            <h1 className="text-3xl md:text-4xl font-bold mb-4 text-[#5A6670]">{post.title}</h1>
            <div className="flex items-center justify-center gap-4 text-[#5A6670]/60 text-sm">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {formatDate(post.date)}
              </span>
              {post.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {post.location}
                </span>
              )}
            </div>
            {post.tags && post.tags.length > 0 && (
              <div className="flex justify-center gap-2 mt-4">
                {post.tags.map((tag: string) => (
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
            dangerouslySetInnerHTML={{ __html: post.contentHtml }}
          />
          
          <MermaidRenderer />
        </article>
      </div>
    </div>
  )
}

