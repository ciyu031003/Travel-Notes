import Link from 'next/link'
import { BookMarked, Calendar } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface RelatedPost {
  slug: string
  title: string
  date: string
  description?: string
  tags?: string[]
}

interface RelatedPostsProps {
  posts: RelatedPost[]
  basePath: string
}

export default function RelatedPosts({ posts, basePath }: RelatedPostsProps) {
  if (!posts || posts.length === 0) return null

  return (
    <section className="mt-12">
      <div className="flex items-center gap-2 mb-5 text-gray-700 dark:text-gray-200 font-medium">
        <BookMarked className="w-4 h-4 text-rose-400" />
        <span>相关文章</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {posts.map(post => (
          <Link
            key={post.slug}
            href={`${basePath}/${post.slug}`}
            className="group card p-5 hover:border-rose-200"
          >
            <div className="flex items-center gap-1 text-xs text-gray-400 mb-2">
              <Calendar className="w-3 h-3" />
              <span>{formatDate(post.date)}</span>
            </div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 group-hover:text-rose-500 line-clamp-2 transition-colors mb-2">
              {post.title}
            </h3>
            {post.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {post.description}
              </p>
            )}
            {post.tags && post.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {post.tags.slice(0, 3).map(tag => (
                  <span
                    key={tag}
                    className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-500 dark:text-rose-300"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </section>
  )
}
