'use client'

import Link from 'next/link'
import Image from 'next/image'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Plus, Trash2, Loader2, AlertCircle, Upload, Images, X } from 'lucide-react'
import AdminShell from '@/components/admin/AdminShell'

interface AlbumItem {
  id: number
  title: string
  description: string | null
  coverUrl: string | null
  mediaCount: number
  date: string | null
}

interface MediaItem {
  id: number
  url: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
}

interface AlbumDetail extends AlbumItem {
  media: MediaItem[]
}

export default function AdminAlbumsPage() {
  const [albums, setAlbums] = useState<AlbumItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const [selected, setSelected] = useState<number | null>(null)
  const [detail, setDetail] = useState<AlbumDetail | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const fetchAlbums = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/albums')
      if (res.ok) {
        const data = await res.json()
        setAlbums(data.albums || [])
      }
    } catch {} finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAlbums() }, [fetchAlbums])

  const fetchDetail = useCallback(async (id: number) => {
    const res = await fetch(`/api/admin/albums/${id}`)
    if (res.ok) {
      const data = await res.json()
      setDetail(data.album || null)
    }
  }, [])

  useEffect(() => {
    if (selected !== null) fetchDetail(selected)
  }, [selected, fetchDetail])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!title.trim()) {
      setError('请输入相册名称')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || '创建失败')
        return
      }
      setTitle(''); setDescription('')
      await fetchAlbums()
      setSelected(data.id)
    } catch {
      setError('网络错误')
    } finally {
      setCreating(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selected || !e.target.files?.length) return
    setUploading(true)
    setUploadError('')
    const fd = new FormData()
    for (const file of Array.from(e.target.files)) fd.append('files', file)
    try {
      const res = await fetch(`/api/admin/albums/${selected}/media`, { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setUploadError(data.error || '上传失败')
      } else {
        await fetchDetail(selected)
        await fetchAlbums()
      }
    } catch {
      setUploadError('网络错误')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleRemoveMedia = async (mediaId: number) => {
    if (!selected) return
    const res = await fetch(`/api/admin/albums/${selected}/media`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaId }),
    })
    if (res.ok) {
      await fetchDetail(selected)
      await fetchAlbums()
    }
  }

  const handleDeleteAlbum = async () => {
    if (!selected || !confirm('确定删除该相册及其全部照片？')) return
    const res = await fetch(`/api/admin/albums/${selected}`, { method: 'DELETE' })
    if (res.ok) {
      setSelected(null)
      setDetail(null)
      await fetchAlbums()
    }
  }

  return (
    <AdminShell title="相册管理">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-travel-accent dark:hover:text-travel-accentSoft transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          返回后台
        </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">相册管理</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          创建纪念相册并上传照片（支持批量、自动压缩与元数据清理）
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* 左：相册列表 + 创建 */}
        <div>
          <form onSubmit={handleCreate} className="card p-5 mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4 text-travel-accentSoft" />
              新建相册
            </h2>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="相册名称"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-travel-accentSoft"
              />
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 bg-travel-accent hover:bg-travel-accentStrong disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
              >
                {creating ? '创建中...' : '创建'}
              </button>
            </div>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简介（可选）"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-travel-accentSoft"
            />
            {error && (
              <p className="flex items-center gap-1 mt-2 text-xs text-red-500">
                <AlertCircle className="w-3.5 h-3.5" /> {error}
              </p>
            )}
          </form>

          {loading ? (
            <div className="text-center py-10 text-gray-500">加载中...</div>
          ) : albums.length === 0 ? (
            <div className="card p-6 text-center text-gray-500">还没有相册</div>
          ) : (
            <div className="space-y-2">
              {albums.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelected(a.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${
                    selected === a.id
                      ? 'bg-travel-sakura/50 dark:bg-travel-accent/20 border border-travel-sakura dark:border-travel-accent/40'
                      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-travel-sakura'
                  }`}
                >
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                    {a.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <Image src={a.coverUrl} alt="" fill sizes="48px" className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <Images className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{a.title}</p>
                    <p className="text-xs text-gray-500">{a.mediaCount} 张照片</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 右：相册详情 */}
        <div className="card p-5">
          {!selected || !detail ? (
            <div className="text-center py-16 text-gray-500">选择一个相册查看与管理照片</div>
          ) : (
            <>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{detail.title}</h2>
                  {detail.description && (
                    <p className="text-sm text-gray-500">{detail.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{detail.mediaCount} 张照片</p>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteAlbum}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  删除相册
                </button>
              </div>

              <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-500 hover:border-travel-accentSoft cursor-pointer mb-4">
                <Upload className="w-4 h-4" />
                {uploading ? '上传中...' : '点击上传照片（支持多选）'}
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
              {uploadError && (
                <p className="text-xs text-red-500 mb-3">{uploadError}</p>
              )}

              {detail.media.length === 0 ? (
                <div className="text-center py-10 text-gray-400">还没有照片，上传第一张吧</div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {detail.media.map((m) => (
                    <div key={m.id} className="relative group aspect-square rounded-lg overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <Image src={m.url} alt="" fill sizes="100vw" className="object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveMedia(m.id)}
                        className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      </div>
    </AdminShell>
  )
}


