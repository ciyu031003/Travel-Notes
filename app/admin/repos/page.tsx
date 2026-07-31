'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Edit2, Trash2, ArrowLeft, Star, Folder, Code2 } from 'lucide-react'

interface Repo {
  id: number
  name: string
  displayName?: string
  description?: string
  language?: string
  stars?: number
  cover?: string
  tags?: string[] | string
  repoPath?: string
}

export default function AdminReposPage() {
  const [repos, setRepos] = useState<Repo[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchRepos()
  }, [])

  const fetchRepos = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/repos')
      const data = await res.json()
      const list = data?.data?.repos ?? data?.repos ?? []
      setRepos(list)
    } catch {
      console.error('Failed to fetch repos')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await fetch(`/api/admin/repos/${deleteId}`, { method: 'DELETE' })
      setDeleteId(null)
      fetchRepos()
    } catch {
      console.error('Failed to delete repo')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-green-500 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          返回仪表盘
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Code2 className="w-6 h-6 text-green-500" />
              代码仓库管理
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              共 {repos.length} 个仓库
            </p>
          </div>
          <Link
            href="/admin/repos/new"
            className="ribbon-hover inline-flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors relative overflow-hidden"
          >
            <Plus className="w-4 h-4" />
            新建仓库
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-500">加载中...</div>
        ) : repos.length === 0 ? (
          <div className="card p-12 text-center text-gray-500">
            <Folder className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>暂无仓库，点击右上角新建仓库开始</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">名称</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">展示名</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">语言</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">星标</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {repos.map((repo) => (
                    <tr key={repo.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Folder className="w-4 h-4 text-green-500 flex-shrink-0" />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{repo.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                        {repo.displayName || '-'}
                      </td>
                      <td className="px-6 py-4">
                        {repo.language ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                            {repo.language}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300">
                          <Star className="w-4 h-4 text-yellow-400" />
                          <span>{repo.stars ?? 0}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/repos/${repo.id}/edit`}
                            className="p-2 text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            title="编辑"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => setDeleteId(repo.id)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">确认删除</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              此操作不可撤销，确定要删除这个仓库吗？磁盘文件不会被删除。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? '删除中...' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
