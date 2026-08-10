import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Tag, ArrowLeft, Calendar, BookOpen, BrainCircuit } from 'lucide-react'
import { getPostService } from '@/lib/container'
import { formatDate } from '@/lib/utils'
import type { PostMetaDB } from '@/lib/db-posts'

export const revalidate = 300

interface PageProps {
  params: Promise<{ tag: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { tag } = await params
  const tagName = decodeURIComponent(tag)
  return {
    title: `标签：${tagName} | 学习笔记`,
    description: `查看「${tagName}」标签下的全部文章与思维导图`,
  }
}

// 根据文章类型决定路由
function postHref(post: PostMetaDB): string {
  return post.type === 'mindmap'
    ? `/notes/mindmap/${post.slug}`
    : `/notes/blog/${post.slug}`
}

function ModuleBadge({ post }: { post: PostMetaDB }) {
  if (post.type === 'mindmap') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-500">
        <BrainCircuit className="w-3.5 h-3.5" />
        思维导图
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-500">
      <BookOpen className="w-3.5 h-3.5" />
      博客
    </span>
  )
}

export default async function TagDetailPage({ params }: PageProps) {
  const { tag } = await params
  const tagName = decodeURIComponent(tag)

  if (!tagName) {
    notFound()
  }

  const postService = getPostService()
  const posts = await postService.getPostsByTag(tagName)

  return (
    <div className="container-custom">
      <div className="max-w-4xl mx-auto">
        <header className="mb-10">
          <Link
            href="/notes/tags"
            className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-rose-500 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            标签云
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300 rounded-full text-sm">
              <Tag className="w-4 h-4" />
              <span>#{tagName}</span>
            </div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              共 {posts.length} 篇内容
            </span>
          </div>
          <h1 className="text-3xl font-bold mt-4 text-gray-900 dark:text-gray-100">
            标签：{tagName}
          </h1>
        </header>

        {posts.length === 0 ? (
          <div className="card p-12 text-center">
            <Tag className="w-16 h-16 mx-auto mb-4 text-rose-200" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              该标签下暂无文章
            </p>
            <Link
              href="/notes/tags"
              className="inline-flex items-center gap-1 text-sm text-rose-500 hover:text-rose-600 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              查看全部标签
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <Link
                key={`${post.type}-${post.slug}-${post.id}`}
                href={postHref(post)}
                className="card ribbon-hover block p-5 hover:border-rose-200 dark:hover:border-rose-800 group"
              >
                <div className="flex items-center gap-2 mb-2">
                  <ModuleBadge post={post} />
                  <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                    <Calendar className="w-3 h-3" />
                    {formatDate(post.date)}
                  </span>
                </div>
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 group-hover:text-rose-500 transition-colors mb-2">
                  {post.title}
                </h2>
                {post.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                    {post.description}
                  </p>
                )}
                {post.tags && post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {post.tags.map((t) => (
                      <span
                        key={t}
                        className={`text-[11px] px-2 py-0.5 rounded-full ${
                          t === tagName
                            ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300'
                        }`}
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            href="/notes/tags"
            className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-rose-500 transition-colors"
          >
            ← 查看全部标签
          </Link>
        </div>
      </div>
    </div>
  )
}

