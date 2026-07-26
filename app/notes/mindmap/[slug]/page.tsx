import { notFound } from 'next/navigation'
import { getPostBySlug, getPosts } from '@/lib/content'
import { formatDate } from '@/lib/utils'
import { Calendar, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import MermaidRenderer from '@/components/mdx/MermaidRenderer'

export async function generateStaticParams() {
  const posts = await getPosts('tech/mindmaps')
  return posts.map(post => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPostBySlug('tech/mindmaps', slug)
  if (!post) return { title: '思维导图不存在' }
  return {
    title: post.title,
    description: post.description,
  }
}

export default async function MindmapDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPostBySlug('tech/mindmaps', slug)

  if (!post) {
    notFound()
  }

  return (
    <div className="container-custom">
      <article className="max-w-4xl mx-auto">
        <Link
          href="/notes/mindmap"
          className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-primary-500 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回思维导图
        </Link>

        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">{post.title}</h1>
          <div className="flex items-center gap-4 text-gray-500 text-sm">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {formatDate(post.date)}
            </span>
          </div>
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
