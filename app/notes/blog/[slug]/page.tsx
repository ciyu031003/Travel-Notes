import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { Calendar, ArrowLeft, MapPin } from 'lucide-react'
import { getPostService } from '@/lib/container'
import { formatDate } from '@/lib/utils'
import MermaidRenderer from '@/components/mdx/MermaidRenderer'
import ReadingProgress from '@/components/blog/ReadingProgress'
import TableOfContents from '@/components/blog/TableOfContents'
import CodeBlockEnhancer from '@/components/blog/CodeBlockEnhancer'
import ImageLightbox from '@/components/blog/ImageLightbox'
import PostShare from '@/components/blog/PostShare'
import PostNavigation from '@/components/blog/PostNavigation'
import RelatedPosts from '@/components/blog/RelatedPosts'
import ReadingTime from '@/components/blog/ReadingTime'

export const dynamic = 'force-dynamic'

export async function generateStaticParams() {
  const postService = getPostService()
  const posts = await postService.getPostsHybrid('tech/blog')
  return posts.map(post => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const postService = getPostService()
  const post = await postService.getPostBySlugHybrid('tech/blog', slug)
  if (!post) return { title: '文章不存在' }
  return {
    title: post.title,
    description: post.description,
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const postService = getPostService()
  const post = await postService.getPostBySlugHybrid('tech/blog', slug)

  if (!post) {
    notFound()
  }

  // 并行获取上一篇/下一篇 + 相关文章
  const [adjacent, related] = await Promise.all([
    postService.getAdjacentPosts('blog', post.date),
    postService
      .getPostsByTag(post.tags?.[0] || '', 'blog')
      .then(ps => ps.filter(p => p.slug !== slug).slice(0, 3)),
  ])

  // 服务端构造当前页 URL（用于分享按钮）
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000'
  const protocol = h.get('x-forwarded-proto') || 'http'
  const shareUrl = `${protocol}://${host}/notes/blog/${slug}`

  return (
    <div className="container-custom">
      <ReadingProgress />
      <div className="max-w-7xl mx-auto flex gap-8">
        {/* 主内容区 */}
        <article className="flex-1 min-w-0 max-w-3xl">
          <Link
            href="/notes/blog"
            className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-primary-500 mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回技术博客
          </Link>

          <header className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900 dark:text-gray-100">
              {post.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-gray-500 dark:text-gray-400 text-sm">
              <ReadingTime minutes={post.readMinutes} />
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(post.date)}
              </span>
              {post.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {post.location}
                </span>
              )}
            </div>
            {post.tags && post.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {post.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-rose-50 dark:bg-rose-900/20 text-rose-500 dark:text-rose-300 text-xs rounded-full"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </header>

          <div
            className="prose prose-lg dark:prose-invert max-w-none prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-a:text-primary-500 prose-pre:!bg-gray-900 prose-pre:!text-gray-100"
            dangerouslySetInnerHTML={{ __html: post.contentHtml }}
          />

          <MermaidRenderer />
          <CodeBlockEnhancer />
          <ImageLightbox />

          <PostShare url={shareUrl} title={post.title} />

          <PostNavigation
            prev={adjacent.prev ? { slug: adjacent.prev.slug, title: adjacent.prev.title } : null}
            next={adjacent.next ? { slug: adjacent.next.slug, title: adjacent.next.title } : null}
            basePath="/notes/blog"
          />

          <RelatedPosts
            posts={related.map(p => ({
              slug: p.slug,
              title: p.title,
              date: p.date,
              description: p.description,
              tags: p.tags,
            }))}
            basePath="/notes/blog"
          />
        </article>

        {/* 右侧 TOC */}
        <aside className="hidden lg:block w-64 flex-shrink-0">
          <TableOfContents toc={post.toc} />
        </aside>
      </div>
    </div>
  )
}
