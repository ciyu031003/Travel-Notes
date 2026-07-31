'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Folder, Star } from 'lucide-react'

interface RepoItem {
  name: string
  displayName?: string
  description?: string
  language?: string
  stars?: number
  cover?: string
  tags?: string[]
}

export default function RepoListPage() {
  const [repos, setRepos] = useState<RepoItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRepos = async () => {
      try {
        const res = await fetch('/api/repos')
        if (res.ok) {
          const data = await res.json()
          setRepos(data.repos || [])
        }
      } catch {}
      setLoading(false)
    }
    fetchRepos()
  }, [])

  return (
    <div className="container-custom">
      <header className="mb-12">
        <h1 className="text-3xl font-bold mb-4">代码仓库</h1>
        <p className="text-gray-600 dark:text-gray-400">
          个人项目展示，支持在线浏览文件目录和源代码
        </p>
      </header>

      {loading ? (
        <div className="text-center py-16 text-gray-500">
          <p>加载中...</p>
        </div>
      ) : repos.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Folder className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>还没有代码项目，添加第一个仓库吧~</p>
          <p className="text-sm mt-2">将项目文件夹放入 content/tech/repos/ 目录即可</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {repos.map(repo => (
            <Link
              key={repo.name}
              href={`/notes/repo/${repo.name}`}
              className="card p-6 hover:border-green-300 group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Folder className="w-6 h-6 text-green-500" />
                  <h3 className="text-lg font-semibold group-hover:text-green-500 transition-colors">
                    {repo.displayName || repo.name}
                  </h3>
                </div>
                {repo.stars !== undefined && repo.stars > 0 ? (
                  <div className="flex items-center gap-1 text-yellow-500">
                    <Star className="w-5 h-5 fill-yellow-500" />
                    <span className="text-sm font-medium">{repo.stars}</span>
                  </div>
                ) : (
                  <Star className="w-5 h-5 text-gray-300" />
                )}
              </div>
              {repo.description ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-2">
                  {repo.description}
                </p>
              ) : (
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  点击查看项目源码和文件结构
                </p>
              )}
              {repo.language && (
                <span className="inline-block mt-3 px-2 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                  {repo.language}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
