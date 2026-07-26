'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, MapPin, BookOpen, BrainCircuit, Code2, Calendar, Tag, Image, FileText, Eye, Trash2, Upload, X, GripVertical, ChevronUp, ChevronDown, ZoomIn, XCircle } from 'lucide-react'
import TravelPreviewModal from '@/components/TravelPreviewModal'

const typeIcons: Record<string, any> = {
  travel: MapPin,
  blog: BookOpen,
  mindmap: BrainCircuit,
  repo: Code2,
}

const typeLabels: Record<string, string> = {
  travel: '旅行记录',
  blog: '技术博客',
  mindmap: '思维导图',
  repo: '代码仓库',
}

export default function AdminEditPage() {
  const router = useRouter()
  const params = useParams()
  const isNew = !params.id || params.id === 'new'

  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    content: '',
    date: new Date().toISOString().split('T')[0],
    cover: '',
    images: [] as string[],
    tags: '',
    location: '',
    type: 'travel',
    summary: '',
    published: true,
  })
  const [preview, setPreview] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!isNew) {
      fetchPost()
    }
  }, [isNew])

  const fetchPost = async () => {
    try {
      const res = await fetch(`/api/admin/posts/${params.id}`)
      if (res.ok) {
        const data = await res.json()
        const post = data.post
        setFormData({
          title: post.title,
          slug: post.slug,
          content: post.content,
          date: new Date(post.date).toISOString().split('T')[0],
          cover: post.cover || '',
          images: post.images || [],
          tags: post.tags ? (Array.isArray(post.tags) ? post.tags.join(', ') : JSON.parse(post.tags).join(', ')) : '',
          location: post.location || '',
          type: post.type,
          summary: post.summary || '',
          published: post.published,
        })
      }
    } catch {
      console.error('Failed to fetch post')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const tagsArray = formData.tags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)

    const payload = {
      ...formData,
      tags: tagsArray,
      date: new Date(formData.date),
      slug: formData.slug || formData.title.toLowerCase().replace(/\s+/g, '-'),
    }

    try {
      if (isNew) {
        await fetch('/api/admin/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await fetch(`/api/admin/posts/${params.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      router.push('/admin')
    } catch (error: any) {
      alert(error.message || '保存失败')
    } finally {
      setLoading(false)
    }
  }

  const generateSlug = () => {
    const slug = formData.title
      .toLowerCase()
      .replace(/[\s\u4e00-\u9fa5]+/g, '-')
      .replace(/[^\w-]/g, '')
      .replace(/-+/g, '-')
      .trim()
    setFormData({ ...formData, slug })
  }

  const handleFileUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return

    setUploading(true)
    try {
      const formUpload = new FormData()
      fileArray.forEach(file => {
        formUpload.append('files', file)
      })

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formUpload,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || '上传失败')
      }

      const data = await res.json()
      setFormData(prev => ({
        ...prev,
        images: [...prev.images, ...data.urls],
        cover: prev.cover || data.urls[0] || '',
      }))
    } catch (error: any) {
      alert(error.message || '图片上传失败')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileUpload(files)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const removeImage = async (index: number) => {
    const imageUrl = formData.images[index]
    const newImages = formData.images.filter((_, i) => i !== index)

    setFormData(prev => ({
      ...prev,
      images: newImages,
      cover: prev.cover === imageUrl ? (newImages[0] || '') : prev.cover,
    }))

    if (imageUrl.startsWith('/uploads/')) {
      try {
        await fetch('/api/upload', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: imageUrl }),
        })
      } catch {
        // ignore cleanup errors
      }
    }
  }

  const setAsCover = (index: number) => {
    setFormData(prev => ({
      ...prev,
      cover: prev.images[index] || '',
    }))
  }

  const moveImage = (index: number, direction: 'up' | 'down') => {
    const newImages = [...formData.images]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newImages.length) return
    ;[newImages[index], newImages[targetIndex]] = [newImages[targetIndex], newImages[index]]
    setFormData(prev => ({ ...prev, images: newImages }))
  }

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const handleDragOverImage = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    const newImages = [...formData.images]
    const [removed] = newImages.splice(draggedIndex, 1)
    newImages.splice(index, 0, removed)
    setFormData(prev => ({ ...prev, images: newImages }))
    setDraggedIndex(index)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                返回
              </Link>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                {isNew ? '新建文章' : '编辑文章'}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPreview(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                <Eye className="w-4 h-4" />
                预览
              </button>
              <button
                type="submit"
                form="post-form"
                disabled={loading}
                className="inline-flex items-center gap-2 px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {loading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form id="post-form" onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">标题</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                onBlur={() => { if (!formData.slug) generateSlug() }}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="请输入文章标题"
                required
              />
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <FileText className="w-4 h-4 inline mr-2" />
                正文内容 (支持 Markdown)
              </label>
              <textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                rows={20}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="在这里书写你的 Markdown 内容..."
                required
              />
            </div>

            {formData.type === 'travel' && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Image className="w-4 h-4 inline mr-2" />
                    旅行照片管理
                  </label>
                  <span className="text-xs text-gray-500">{formData.images.length} 张照片</span>
                </div>

                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                    dragOver
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleFileUpload(e.target.files)
                      }
                    }}
                  />
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-gray-500">上传中...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-10 h-10 text-gray-400" />
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        点击或拖拽图片到此处上传
                      </p>
                      <p className="text-xs text-gray-400">
                        支持多张图片同时上传，JPG / PNG / GIF / WEBP
                      </p>
                    </div>
                  )}
                </div>

                {formData.images.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {formData.images.map((img, index) => (
                      <div
                        key={`${img}-${index}`}
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleDragOverImage(e, index)}
                        className={`group relative rounded-lg overflow-hidden border-2 transition-all ${
                          formData.cover === img
                            ? 'border-primary-500 ring-2 ring-primary-500/30'
                            : 'border-transparent'
                        } ${draggedIndex === index ? 'opacity-50' : ''} cursor-move`}
                      >
                        <img
                          src={img.startsWith('/') ? img : img}
                          alt={`图片 ${index + 1}`}
                          className="w-full h-32 object-cover cursor-pointer"
                          onClick={() => setImagePreview(img)}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            target.src = `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=travel&image_size=square`
                          }}
                        />

                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => setImagePreview(img)}
                              className="p-1.5 bg-white/90 rounded text-gray-700 hover:bg-white transition-colors"
                              title="预览"
                            >
                              <ZoomIn className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setAsCover(index)}
                              className={`px-2 py-1 text-xs rounded transition-colors ${
                                formData.cover === img
                                  ? 'bg-primary-500 text-white'
                                  : 'bg-white/90 text-gray-700 hover:bg-white'
                              }`}
                              title="设为封面"
                            >
                              {formData.cover === img ? '封面' : '封面'}
                            </button>
                            <button
                              type="button"
                              onClick={() => moveImage(index, 'up')}
                              disabled={index === 0}
                              className="p-1.5 bg-white/90 rounded text-gray-700 hover:bg-white disabled:opacity-30"
                              title="上移"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveImage(index, 'down')}
                              disabled={index === formData.images.length - 1}
                              className="p-1.5 bg-white/90 rounded text-gray-700 hover:bg-white disabled:opacity-30"
                              title="下移"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeImage(index)}
                              className="p-1.5 bg-red-500 rounded text-white hover:bg-red-600 transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">分类</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(typeLabels).map(([key, label]) => {
                    const Icon = typeIcons[key]
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFormData({ ...formData, type: key })}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          formData.type === key
                            ? 'bg-primary-500 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Calendar className="w-4 h-4 inline mr-2" />
                  日期
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Slug</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="url-slug"
                  />
                  <button
                    type="button"
                    onClick={generateSlug}
                    className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
                  >
                    生成
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Tag className="w-4 h-4 inline mr-2" />
                  标签 (用逗号分隔)
                </label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="标签1, 标签2, 标签3"
                />
              </div>

              {formData.type === 'travel' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <MapPin className="w-4 h-4 inline mr-2" />
                    地点
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="例如：广东广州"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Image className="w-4 h-4 inline mr-2" />
                  封面图 URL (可选，优先使用上传图片的第一张)
                </label>
                <input
                  type="text"
                  value={formData.cover}
                  onChange={(e) => setFormData({ ...formData, cover: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="https://example.com/image.jpg 或留空使用上传图片"
                />
                {formData.images.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    当前封面: {formData.cover || formData.images[0]}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">摘要</label>
                <textarea
                  value={formData.summary}
                  onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="简短描述这篇文章..."
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="published"
                  checked={formData.published}
                  onChange={(e) => setFormData({ ...formData, published: e.target.checked })}
                  className="w-4 h-4 text-primary-500 border-gray-300 rounded focus:ring-primary-500"
                />
                <label htmlFor="published" className="text-sm text-gray-700 dark:text-gray-300">
                  立即发布
                </label>
              </div>
            </div>
          </div>
        </form>
      </main>

      <TravelPreviewModal
        isOpen={preview}
        onClose={() => setPreview(false)}
        formData={formData}
      />

      {imagePreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setImagePreview(null)}
        >
          <button
            type="button"
            onClick={() => setImagePreview(null)}
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/20 rounded-full transition-colors"
          >
            <XCircle className="w-8 h-8" />
          </button>
          <img
            src={imagePreview}
            alt="预览"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}