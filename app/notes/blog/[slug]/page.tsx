import { notFound } from 'next/navigation'
import { getPostService } from '@/lib/container'
import { formatDate } from '@/lib/utils'
import { Calendar, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import MermaidRenderer from '@/components/mdx/MermaidRenderer'

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

  return (
    <div className="container-custom">
      <article className="max-w-3xl mx-auto">
        <Link
          href="/notes/blog"
          className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-primary-500 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回技术博客
        </Link>

        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">{post.title}</h1>
          <div className="flex items-center gap-4 text-gray-500 text-sm">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {formatDate(post.date)}
            </span>
            {post.location && (
              <span>📍 {post.location}</span>
            )}
          </div>
          {post.tags && post.tags.length > 0 && (
            <div className="flex gap-2 mt-4">
              {post.tags.map((tag: string) => (
                <span key={tag} className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </header>

        <div
          className="prose prose-lg dark:prose-invert max-w-none prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-a:text-primary-500"
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />
        
        <MermaidRenderer />
      </article>
    </div>
  )
}
