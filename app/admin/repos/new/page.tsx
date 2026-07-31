'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Star } from 'lucide-react'

interface RepoFormData {
  name: string
  displayName: string
  description: string
  language: string
  stars: string
  cover: string
  tags: string
  repoPath: string
}

const inputClass =
  'w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:border-green-400'
const labelClass =
  'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5'

export default function AdminRepoNewPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [repoPathTouched, setRepoPathTouched] = useState(false)
  const [formData, setFormData] = useState<RepoFormData>({
    name: '',
    displayName: '',
    description: '',
    language: '',
    stars: '0',
    cover: '',
    tags: '',
    repoPath: '',
  })

  const setField = <K extends keyof RepoFormData>(key: K, value: RepoFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const handleNameChange = (value: string) => {
    setField('name', value)
    if (!repoPathTouched) {
      setField('repoPath', value ? `content/tech/repos/${value}` : '')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!formData.name.trim()) {
      setError('请填写仓库名称（name）')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: formData.name.trim(),
        displayName: formData.displayName.trim(),
        description: formData.description.trim() || undefined,
        language: formData.language.trim() || undefined,
        stars: Number(formData.stars) || 0,
        cover: formData.cover.trim() || undefined,
        tags: formData.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        repoPath: formData.repoPath.trim() || `content/tech/repos/${formData.name.trim()}`,
      }

      const res = await fetch('/api/admin/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || '创建失败')
      }

      router.push('/admin/repos')
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/admin/repos"
          className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-green-500 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          返回仓库列表
        </Link>

        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">新建仓库</h2>

        <form onSubmit={handleSubmit} className="card p-6 space-y-5">
          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>
                仓库名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="如：network-utils"
                className={inputClass}
              />
              <p className="text-xs text-gray-400 mt-1">URL slug，仅支持字母、数字、连字符</p>
            </div>
            <div>
              <label className={labelClass}>展示名</label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => setField('displayName', e.target.value)}
                placeholder="如：网络工具集"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>简介</label>
            <textarea
              value={formData.description}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="一句话描述这个项目"
              rows={3}
              className={inputClass}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>主语言</label>
              <input
                type="text"
                value={formData.language}
                onChange={(e) => setField('language', e.target.value)}
                placeholder="如：Python / TypeScript"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>星标数</label>
              <div className="relative">
                <Star className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yellow-400" />
                <input
                  type="number"
                  min="0"
                  value={formData.stars}
                  onChange={(e) => setField('stars', e.target.value)}
                  className={`${inputClass} pl-9`}
                />
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>封面图 URL</label>
            <input
              type="text"
              value={formData.cover}
              onChange={(e) => setField('cover', e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>标签</label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setField('tags', e.target.value)}
              placeholder="多个标签用英文逗号分隔，如：工具,网络,Python"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>仓库磁盘路径</label>
            <input
              type="text"
              value={formData.repoPath}
              onChange={(e) => {
                setRepoPathTouched(true)
                setField('repoPath', e.target.value)
              }}
              placeholder="content/tech/repos/{name}"
              className={inputClass}
            />
            <p className="text-xs text-gray-400 mt-1">默认 content/tech/repos/{`{name}`}，可手动修改</p>
          </div>

          {error && (
            <div className="px-4 py-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Link
              href="/admin/repos"
              className="px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              取消
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="ribbon-hover inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-lg transition-colors disabled:opacity-50 relative overflow-hidden"
            >
              <Save className="w-4 h-4" />
              {saving ? '保存中...' : '保存仓库'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
