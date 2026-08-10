import Link from 'next/link'
import { getPostService } from '@/lib/container'
import { formatDate } from '@/lib/utils'
import { BrainCircuit, Calendar, ArrowRight, Plus } from 'lucide-react'

export const revalidate = 300

export const metadata = {
  title: '思维导图 | 知识体系',
  description: '系统化知识梳理，构建完整知识体系',
}

export default async function MindmapPage() {
  const postService = getPostService()
  const mindmaps = await postService.getPostsHybrid('tech/mindmaps')

  return (
    <div className="container-custom">
      <header className="mb-12 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full text-sm mb-4">
          <BrainCircuit className="w-4 h-4" />
          <span>知识图谱</span>
        </div>
        <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-gray-100">思维导图</h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          系统化梳理各领域知识，构建完整的技术知识体系
        </p>
      </header>

      {mindmaps.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <BrainCircuit className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="mb-4">还没有思维导图，开始梳理你的知识体系吧~</p>
          <Link
            href="/admin/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg text-sm hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            如何创建思维导图
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mindmaps.map((map) => (
            <Link
              key={map.slug}
              href={`/notes/mindmap/${map.slug}`}
              className="card ribbon-hover p-6 hover:border-purple-300 dark:hover:border-purple-700 group"
            >
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-300">
                <BrainCircuit className="w-6 h-6 text-purple-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100 group-hover:text-purple-500 dark:group-hover:text-purple-300 transition-colors">
                {map.title}
              </h3>
              {map.description && (
                <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-2 mb-3">
                  {map.description}
                </p>
              )}
              <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                <Calendar className="w-3 h-3" />
                {formatDate(map.date)}
              </div>
              {map.tags && map.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {map.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-purple-50 dark:bg-purple-900/20 text-purple-500 dark:text-purple-300 text-[11px] rounded-full"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-4 flex items-center gap-1 text-xs text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">
                查看导图
                <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

