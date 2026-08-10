import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Calendar, ArrowLeft, FileText } from 'lucide-react'
import { getPostService } from '@/lib/container'
import { formatDate } from '@/lib/utils'
import ReadingTime from '@/components/blog/ReadingTime'
import MindmapAutoSwitch from '@/components/mindmap/MindmapAutoSwitch'
import MindmapHint from '@/components/mindmap/MindmapHint'

export const revalidate = 300

export async function generateStaticParams() {
  const postService = getPostService()
  const posts = await postService.getPostsHybrid('tech/mindmaps')
  return posts.map(post => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const postService = getPostService()
  const post = await postService.getPostBySlugHybrid('tech/mindmaps', slug)
  if (!post) return { title: '思维导图不存在' }
  return {
    title: post.title,
    description: post.description,
  }
}

export default async function MindmapDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const postService = getPostService()
  const post = await postService.getPostBySlugHybrid('tech/mindmaps', slug)

  if (!post) {
    notFound()
  }

  return (
    <div className="container-custom">
      <article className="max-w-6xl mx-auto">
        <Link
          href="/notes/mindmap"
          className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-primary-500 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回思维导图
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
          </div>
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {post.tags.map((tag: string) => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-500 dark:text-purple-300 text-xs rounded-full"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </header>

        {/* 思维导图主体：默认走 markmap 渲染器 */}
        <div className="mb-6">
          <MindmapAutoSwitch
            content={post.content}
            frontMatter={{ renderer: 'markmap' }}
            title={post.title}
          />
        </div>

        {/* 操作提示 */}
        <MindmapHint />

        {/* 可选：原文 Markdown（折叠展开） */}
        <details className="mt-8 group">
          <summary className="cursor-pointer text-sm text-gray-500 hover:text-purple-500 flex items-center gap-2 transition-colors">
            <FileText className="w-4 h-4" />
            查看原文 Markdown
          </summary>
          <pre className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl overflow-x-auto text-sm text-gray-700 dark:text-gray-300">
            {post.content}
          </pre>
        </details>
      </article>
    </div>
  )
}

