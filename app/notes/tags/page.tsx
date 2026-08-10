import Link from 'next/link'
import { Tag } from 'lucide-react'
import { getPostService } from '@/lib/container'

export const revalidate = 300

export const metadata = {
  title: '标签云 | 学习笔记',
  description: '浏览所有标签，快速发现感兴趣的内容',
}

// 按 count 映射字号
function tagSizeClass(count: number): string {
  if (count >= 10) return 'text-2xl'
  if (count >= 5) return 'text-xl'
  if (count >= 3) return 'text-lg'
  return 'text-base'
}

// 按 count 渐变颜色：count 越多颜色越深（rose-400 → rose-600）
function tagColorClass(count: number): string {
  if (count >= 10) return 'text-rose-600 dark:text-rose-300'
  if (count >= 5) return 'text-rose-500 dark:text-rose-300'
  if (count >= 3) return 'text-rose-400 dark:text-rose-400'
  return 'text-rose-400 dark:text-rose-400'
}

export default async function TagsPage() {
  const postService = getPostService()
  const tags = await postService.getAllTagsAcrossModules()

  const totalPosts = tags.reduce((sum, t) => sum + t.count, 0)

  return (
    <div className="container-custom">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300 rounded-full text-sm mb-4">
            <Tag className="w-4 h-4" />
            <span>标签云</span>
          </div>
          <h1 className="text-4xl font-bold mb-3 text-gray-900 dark:text-gray-100">标签云</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            共 {tags.length} 个标签，{totalPosts} 篇文章
          </p>
        </header>

        {tags.length === 0 ? (
          <div className="card p-12 text-center">
            <Tag className="w-16 h-16 mx-auto mb-4 text-rose-200" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">暂无标签</p>
            <Link
              href="/notes"
              className="inline-flex items-center gap-1 text-sm text-rose-500 hover:text-rose-600 transition-colors"
            >
              返回学习笔记
            </Link>
          </div>
        ) : (
          <div className="card p-8">
            <div className="flex flex-wrap gap-3 justify-center items-center">
              {tags.map((tag) => (
                <Link
                  key={tag.name}
                  href={`/notes/tags/${encodeURIComponent(tag.name)}`}
                  className={`group inline-flex items-baseline gap-1 ${tagSizeClass(tag.count)} ${tagColorClass(tag.count)} font-medium hover:scale-110 hover:text-rose-500 transition-all duration-200`}
                  title={`${tag.name}（${tag.count} 篇）`}
                >
                  <span>#{tag.name}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 group-hover:text-rose-400">
                    {tag.count}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            href="/notes"
            className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-rose-500 transition-colors"
          >
            ← 返回学习笔记
          </Link>
        </div>
      </div>
    </div>
  )
}

