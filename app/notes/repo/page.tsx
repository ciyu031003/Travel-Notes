'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Folder, Star } from 'lucide-react'

export default function RepoListPage() {
  const [repos, setRepos] = useState<string[]>([])
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
              key={repo}
              href={`/notes/repo/${repo}`}
              className="card p-6 hover:border-green-300 group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Folder className="w-6 h-6 text-green-500" />
                  <h3 className="text-lg font-semibold group-hover:text-green-500 transition-colors">
                    {repo}
                  </h3>
                </div>
                <Star className="w-5 h-5 text-gray-300" />
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                点击查看项目源码和文件结构
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
