'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, ZoomIn, ChevronUp, ChevronDown, Trash2, XCircle, ImageOff } from 'lucide-react'

export interface ImageUploaderProps {
  images: string[]
  postId?: number | string
  onUploaded: (urls: string[]) => void
  onRemoved: (index: number) => void
  onReordered: (images: string[]) => void
  onSetCover: (index: number) => void
  cover?: string
}

export default function ImageUploader({
  images,
  postId,
  onUploaded,
  onRemoved,
  onReordered,
  onSetCover,
  cover = '',
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageError = (imgUrl: string) => {
    setImageErrors((prev) => new Set(prev).add(imgUrl))
  }

  const handleFileUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return

    setUploading(true)
    try {
      const formUpload = new FormData()
      fileArray.forEach((file) => {
        formUpload.append('files', file)
      })

      if (postId) {
        formUpload.append('postId', String(postId))
      }

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formUpload,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || '上传失败')
      }

      const data = await res.json()
      onUploaded(data.urls)
    } catch (error: any) {
      alert(error.message || '图片上传失败')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const files = e.dataTransfer.files
      if (files.length > 0) {
        handleFileUpload(files)
      }
    },
    []
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const handleDragOverImage = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    const newImages = [...images]
    const [removed] = newImages.splice(draggedIndex, 1)
    newImages.splice(index, 0, removed)
    onReordered(newImages)
    setDraggedIndex(index)
  }

  const moveImage = (index: number, direction: 'up' | 'down') => {
    const newImages = [...images]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newImages.length) return
    ;[newImages[index], newImages[targetIndex]] = [newImages[targetIndex], newImages[index]]
    onReordered(newImages)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          旅行照片管理
        </label>
        <span className="text-xs text-gray-500">{images.length} 张照片</span>
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

      {images.length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((img, index) => (
            <div
              key={`${img}-${index}`}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOverImage(e, index)}
              className={`group relative h-32 rounded-lg overflow-hidden border-2 transition-all bg-gradient-to-br from-gray-100 to-gray-200 ${
                cover === img
                  ? 'border-sky-500 ring-2 ring-sky-500/30'
                  : 'border-transparent'
              } ${draggedIndex === index ? 'opacity-50' : ''} cursor-move`}
            >
              {img && !imageErrors.has(img) && (
                <img
                  src={img}
                  alt={`图片 ${index + 1}`}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => setImagePreview(img)}
                  onError={() => handleImageError(img)}
                />
              )}
              {imageErrors.has(img) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 text-red-500">
                  <ImageOff className="w-8 h-8 mb-1" />
                  <span className="text-xs">加载失败</span>
                </div>
              )}

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
                    onClick={() => onSetCover(index)}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      cover === img
                        ? 'bg-primary-500 text-white'
                        : 'bg-white/90 text-gray-700 hover:bg-white'
                    }`}
                    title="设为封面"
                  >
                    封面
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
                    disabled={index === images.length - 1}
                    className="p-1.5 bg-white/90 rounded text-gray-700 hover:bg-white disabled:opacity-30"
                    title="下移"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoved(index)}
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
