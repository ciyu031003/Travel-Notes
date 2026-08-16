'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, ChevronLeft, ChevronRight, Calendar, MapPin, Tag, ArrowLeft, Play } from 'lucide-react'
import { remark } from 'remark'
import remarkGfm from 'remark-gfm'
import remarkHtml from 'remark-html'

interface VideoInfo {
  url: string
  thumbnail?: string
  duration?: number
  width?: number
  height?: number
}

interface PreviewFormData {
  title: string
  content: string
  date: string
  cover?: string
  images: string[]
  videos?: VideoInfo[]
  tags: string
  location: string
  type: string
  summary: string
}

interface TravelPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  formData: PreviewFormData
}

type MediaItem =
  | { type: 'image'; url: string }
  | { type: 'video'; url: string; thumbnail?: string }

export default function TravelPreviewModal({ isOpen, onClose, formData }: TravelPreviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [contentHtml, setContentHtml] = useState('')

  const mediaItems = useMemo<MediaItem[]>(() => {
    const items: MediaItem[] = []
    const imgs = formData.images.length > 0
      ? formData.images
      : formData.cover
      ? [formData.cover]
      : []
    imgs.forEach((url) => items.push({ type: 'image', url }))
    ;(formData.videos || []).forEach((v) => items.push({ type: 'video', url: v.url, thumbnail: v.thumbnail }))
    return items
  }, [formData.images, formData.cover, formData.videos])

  // 内容变更 400ms 防抖后再渲染，避免输入时预览闪烁/卡顿
  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(async () => {
      try {
        const processed = await remark()
          .use(remarkGfm)
          .use(remarkHtml, { sanitize: false })
          .process(formData.content || '')
        setContentHtml(processed.toString())
      } catch {
        setContentHtml(formData.content || '')
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [formData.content, isOpen])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const next = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % mediaItems.length)
  }, [mediaItems.length])

  const prev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + mediaItems.length) % mediaItems.length)
  }, [mediaItems.length])

  const tagsArray = formData.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
              <ArrowLeft className="w-4 h-4" />
              预览模式
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="container-custom py-8 px-6">
            <article className="max-w-3xl mx-auto">
              {mediaItems.length > 0 && (
                <div className="mb-8">
                  {mediaItems.length === 1 ? (
                    <div className="relative rounded-2xl overflow-hidden shadow-lg bg-gradient-to-br from-[#F5DCE0] via-[#E8D5E0] to-[#D6E8F0]">
                      {mediaItems[0].type === 'image' ? (
                        <img
                          src={mediaItems[0].url.startsWith('/') ? mediaItems[0].url : mediaItems[0].url}
                          alt={formData.title || '旅行照片'}
                          className="w-full max-h-[500px] object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            target.style.display = 'none'
                          }}
                        />
                      ) : (
                        <video
                          src={mediaItems[0].url.startsWith('/') ? mediaItems[0].url : mediaItems[0].url}
                          poster={mediaItems[0].thumbnail}
                          className="w-full max-h-[500px] object-cover bg-black"
                          controls
                          muted
                          loop
                          playsInline
                        />
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="relative rounded-2xl overflow-hidden shadow-lg bg-gradient-to-br from-[#F5DCE0] via-[#E8D5E0] to-[#D6E8F0]">
                        <div className="relative aspect-[16/9] bg-gray-100 dark:bg-gray-800">
                          {mediaItems.map((item, index) => (
                            item.type === 'image' ? (
                              item.url && (
                                <img
                                  key={`img-${index}`}
                                  src={item.url.startsWith('/') ? item.url : item.url}
                                  alt={`旅行照片 ${index + 1}`}
                                  className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ${
                                    index === currentIndex
                                      ? 'opacity-100 scale-100'
                                      : 'opacity-0 scale-105'
                                  }`}
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement
                                    target.style.display = 'none'
                                  }}
                                />
                              )
                            ) : (
                              <video
                                key={`video-${index}`}
                                src={item.url.startsWith('/') ? item.url : item.url}
                                poster={item.thumbnail}
                                className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ${
                                  index === currentIndex
                                    ? 'opacity-100 scale-100'
                                    : 'opacity-0 scale-105'
                                }`}
                                controls={index === currentIndex}
                                muted
                                loop
                                playsInline
                                autoPlay={index === currentIndex}
                              />
                            )
                          ))}

                          <button
                            onClick={prev}
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 dark:bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:bg-white dark:hover:bg-black/70 transition-colors"
                          >
                            <ChevronLeft className="w-5 h-5 text-gray-800 dark:text-white" />
                          </button>
                          <button
                            onClick={next}
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 dark:bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:bg-white dark:hover:bg-black/70 transition-colors"
                          >
                            <ChevronRight className="w-5 h-5 text-gray-800 dark:text-white" />
                          </button>

                          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
                            {mediaItems.map((_, index) => (
                              <button
                                key={index}
                                onClick={() => setCurrentIndex(index)}
                                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                                  index === currentIndex
                                    ? 'bg-white w-6'
                                    : 'bg-white/50 hover:bg-white/80'
                                }`}
                              />
                            ))}
                          </div>

                          <div className="absolute top-4 right-4 bg-black/50 text-white text-sm px-3 py-1 rounded-full backdrop-blur-sm flex items-center gap-2">
                            <span>{currentIndex + 1} / {mediaItems.length}</span>
                            {mediaItems[currentIndex]?.type === 'video' && (
                              <span className="flex items-center gap-1 text-sky-300">
                                <Play className="w-3 h-3" />
                                视频
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                        {mediaItems.map((item, index) => (
                          <button
                            key={`thumb-${index}`}
                            onClick={() => setCurrentIndex(index)}
                            className={`relative aspect-square rounded-lg overflow-hidden transition-all bg-gradient-to-br from-[#F5DCE0] to-[#D6E8F0] ${
                              index === currentIndex
                                ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-900'
                                : 'opacity-60 hover:opacity-100'
                            }`}
                          >
                            {item.type === 'image' ? (
                              item.url && (
                                <img
                                  src={item.url.startsWith('/') ? item.url : item.url}
                                  alt={`缩略图 ${index + 1}`}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement
                                    target.style.display = 'none'
                                  }}
                                />
                              )
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                                <Play className="w-5 h-5 text-white/70" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              <header className="mb-8">
                <h1 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900 dark:text-white">
                  {formData.title || '未命名文章'}
                </h1>
                <div className="flex items-center gap-4 text-gray-500 dark:text-gray-400 text-sm flex-wrap">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {formData.date || new Date().toISOString().split('T')[0]}
                  </span>
                  {formData.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {formData.location}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Tag className="w-4 h-4" />
                    &apos;旅行记录&apos;
                  </span>
                </div>
                {tagsArray.length > 0 && (
                  <div className="flex gap-2 mt-4 flex-wrap">
                    {tagsArray.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 text-xs rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </header>

              {formData.summary && (
                <p className="text-lg text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                  {formData.summary}
                </p>
              )}

              <div
                className="prose prose-lg dark:prose-invert max-w-none prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-a:text-primary-500 prose-img:rounded-xl prose-img:shadow-lg"
                dangerouslySetInnerHTML={{ __html: contentHtml || '<p class="text-gray-400 dark:text-gray-500">暂无内容，请在编辑器中书写内容...</p>' }}
              />
            </article>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            这是预览模式，关闭后可继续编辑
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-colors text-sm"
          >
            关闭预览
          </button>
        </div>
      </div>
    </div>
  )
}

