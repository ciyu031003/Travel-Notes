'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { XCircle, Video } from 'lucide-react'
import TravelPreviewModal from '@/components/TravelPreviewModal'
import PostEditorHeader from '@/components/admin/editor/PostEditorHeader'
import PostTitleInput from '@/components/admin/editor/PostTitleInput'
import PostMetaPanel from '@/components/admin/editor/PostMetaPanel'
import ImageUploader from '@/components/admin/editor/ImageUploader'
import VideoUploader, { VideoItem } from '@/components/admin/editor/VideoUploader'
import MarkdownEditor from '@/components/admin/editor/MarkdownEditor'
import DocumentImporter, { ImportedDocument } from '@/components/admin/editor/DocumentImporter'
import { usePostForm, PostFormData } from '@/components/admin/editor/hooks/usePostForm'

type TabMode = 'manual' | 'import'

export default function AdminEditPage() {
  const router = useRouter()
  const params = useParams()
  const idParam = Array.isArray(params.id) ? params.id[0] : params.id
  const isNew = !idParam || idParam === 'new'

  const { formData, setFormData, setField } = usePostForm()

  const [tabMode, setTabMode] = useState<TabMode>('manual')
  const [preview, setPreview] = useState(false)
  const [videoPreview, setVideoPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isNew) {
      fetchPost()
    }
  }, [isNew])

  const fetchPost = async () => {
    try {
      const res = await fetch(`/api/admin/posts/${idParam}`)
      if (res.ok) {
        const data = await res.json()
        const post = data.data?.post
        const videosData: VideoItem[] = Array.isArray(post.videos)
          ? post.videos.map((v: any) => {
              if (typeof v === 'string') return { url: v }
              return { url: v.url, thumbnail: v.thumbnail, duration: v.duration }
            })
          : []

        setFormData({
          title: post.title,
          slug: post.slug,
          content: post.content,
          date: new Date(post.date).toISOString().split('T')[0],
          cover: post.cover || '',
          images: post.images || [],
          videos: videosData,
          tags: post.tags
            ? Array.isArray(post.tags)
              ? post.tags.join(', ')
              : JSON.parse(post.tags).join(', ')
            : '',
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

  const generateSlugFromTitle = (title: string): string => {
    const timestamp = Date.now().toString(36)
    const englishPart = title
      .toLowerCase()
      .replace(/[\u4e00-\u9fa5]/g, ' ')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')

    if (englishPart && englishPart.length >= 2) {
      return `${englishPart}-${timestamp}`
    }
    return `post-${timestamp}`
  }

  const generateSlug = () => {
    const slug = generateSlugFromTitle(formData.title)
    setField('slug', slug)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const tagsArray = formData.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    const finalSlug = formData.slug || generateSlugFromTitle(formData.title)

    const payload = {
      title: formData.title,
      slug: finalSlug,
      content: formData.content,
      cover: formData.cover,
      images: formData.images,
      videos: formData.videos,
      tags: tagsArray,
      location: formData.location,
      type: formData.type,
      summary: formData.summary,
      published: formData.published,
      date: new Date(formData.date),
    }

    try {
      let res: Response
      if (isNew) {
        res = await fetch('/api/admin/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch(`/api/admin/posts/${idParam}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `保存失败 (HTTP ${res.status})`)
      }

      router.push('/admin')
      router.refresh()
    } catch (error: any) {
      alert(error.message || '保存失败')
    } finally {
      setLoading(false)
    }
  }

  const handleImageUploaded = (urls: string[]) => {
    setFormData((prev) => ({
      ...prev,
      images: [...prev.images, ...urls],
      cover: prev.cover || urls[0] || '',
    }))
  }

  const handleImageRemoved = (index: number) => {
    const imageUrl = formData.images[index]
    const newImages = formData.images.filter((_, i) => i !== index)

    setFormData((prev) => ({
      ...prev,
      images: newImages,
      cover: prev.cover === imageUrl ? newImages[0] || '' : prev.cover,
    }))

    if (imageUrl.startsWith('/api/images/')) {
      fetch('/api/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imageUrl }),
      }).catch(() => {})
    }
  }

  const handleSetCover = (index: number) => {
    setField('cover', formData.images[index] || '')
  }

  const handleVideoUploaded = (videos: VideoItem[]) => {
    setFormData((prev) => ({
      ...prev,
      videos: [...prev.videos, ...videos],
    }))
  }

  const handleVideoRemoved = (index: number) => {
    const video = formData.videos[index]
    const newVideos = formData.videos.filter((_, i) => i !== index)

    setFormData((prev) => ({ ...prev, videos: newVideos }))

    if (video && video.url.startsWith('/uploads/videos/')) {
      fetch('/api/admin/videos/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: video.url }),
      }).catch(() => {})
    }
  }

  const handleImported = (doc: ImportedDocument) => {
    const patch: Partial<PostFormData> = {
      title: doc.title,
      slug: doc.slug,
      content: doc.content,
      date: doc.date || formData.date,
      summary: doc.description || '',
      cover: doc.cover || '',
      tags: Array.isArray(doc.tags) ? doc.tags.join(', ') : '',
    }
    setFormData((prev) => ({ ...prev, ...patch }))
    setTabMode('manual')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PostEditorHeader
        isNew={isNew}
        onPreview={() => setPreview(true)}
        loading={loading}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex gap-2">
          <button
            type="button"
            onClick={() => setTabMode('manual')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tabMode === 'manual'
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            手动编辑
          </button>
          <button
            type="button"
            onClick={() => setTabMode('import')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tabMode === 'import'
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            文档导入发布
          </button>
        </div>

        {tabMode === 'manual' ? (
          <form id="post-form" onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <PostTitleInput
                title={formData.title}
                slug={formData.slug}
                date={formData.date}
                onChange={(field, value) => setField(field as keyof PostFormData, value)}
                onGenerateSlug={generateSlug}
              />

              <MarkdownEditor
                content={formData.content}
                onChange={(value) => setField('content', value)}
              />

              {formData.type === 'travel' && (
                <>
                  <ImageUploader
                    images={formData.images}
                    postId={!isNew && idParam ? idParam : undefined}
                    onUploaded={handleImageUploaded}
                    onRemoved={handleImageRemoved}
                    onReordered={(imgs) => setField('images', imgs)}
                    onSetCover={handleSetCover}
                    cover={formData.cover}
                  />
                  <VideoUploader
                    videos={formData.videos}
                    onUploaded={handleVideoUploaded}
                    onRemoved={handleVideoRemoved}
                    onReordered={(vids) => setField('videos', vids)}
                  />
                </>
              )}
            </div>

            <div className="space-y-6">
              <PostMetaPanel
                type={formData.type}
                tags={formData.tags}
                location={formData.location}
                cover={formData.cover}
                summary={formData.summary}
                published={formData.published}
                imagesCount={formData.images.length}
                videosCount={formData.videos.length}
                onChange={(field, value) => setField(field as keyof PostFormData, value)}
              />
            </div>
          </form>
        ) : (
          <DocumentImporter onImported={handleImported} />
        )}
      </main>

      <TravelPreviewModal
        isOpen={preview}
        onClose={() => setPreview(false)}
        formData={formData}
      />

      {videoPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setVideoPreview(null)}
        >
          <button
            type="button"
            onClick={() => setVideoPreview(null)}
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/20 rounded-full transition-colors"
          >
            <XCircle className="w-8 h-8" />
          </button>
          <video
            src={videoPreview}
            className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl"
            controls
            autoPlay
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
