import Link from 'next/link'
import { getPosts } from '@/lib/content'
import { BrainCircuit } from 'lucide-react'

export const metadata = {
  title: '思维导图 | 知识体系',
  description: '系统化知识梳理，构建完整知识体系',
}

export default async function MindmapPage() {
  const mindmaps = await getPosts('tech/mindmaps')

  return (
    <div className="container-custom">
      <header className="mb-12 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full text-sm mb-4">
          <BrainCircuit className="w-4 h-4" />
          <span>知识图谱</span>
        </div>
        <h1 className="text-4xl font-bold mb-4">思维导图</h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          系统化梳理各领域知识，构建完整的技术知识体系
        </p>
      </header>

      {mindmaps.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <BrainCircuit className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>还没有思维导图，开始梳理你的知识体系吧~</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mindmaps.map(map => (
            <Link
              key={map.slug}
              href={`/notes/mindmap/${map.slug}`}
              className="card p-6 hover:border-purple-300 group"
            >
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <BrainCircuit className="w-6 h-6 text-purple-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2 group-hover:text-purple-500 transition-colors">
                {map.title}
              </h3>
              {map.description && (
                <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-2">
                  {map.description}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
