'use client'

import { useState, useRef } from 'react'
import { Upload, Play, ChevronUp, ChevronDown, Trash2, Video, Eye } from 'lucide-react'

export interface VideoItem {
  url: string
  thumbnail?: string
  duration?: number
}

export interface VideoUploaderProps {
  videos: VideoItem[]
  onUploaded: (videos: VideoItem[]) => void
  onRemoved: (index: number) => void
  onReordered: (videos: VideoItem[]) => void
}

export default function VideoUploader({
  videos,
  onUploaded,
  onRemoved,
  onReordered,
}: VideoUploaderProps) {
  const [videoUploading, setVideoUploading] = useState(false)
  const [videoDraggedIndex, setVideoDraggedIndex] = useState<number | null>(null)
  const [videoPreview, setVideoPreview] = useState<string | null>(null)
  const videoFileInputRef = useRef<HTMLInputElement>(null)

  const handleVideoUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return

    setVideoUploading(true)
    try {
      const formUpload = new FormData()
      fileArray.forEach((file) => {
        formUpload.append('files', file)
      })

      const res = await fetch('/api/admin/videos/upload', {
        method: 'POST',
        body: formUpload,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || '视频上传失败')
      }

      const data = await res.json()
      const newVideos = data.videos.map((v: any) => ({ url: v.url }))
      onUploaded(newVideos)
    } catch (error: any) {
      alert(error.message || '视频上传失败')
    } finally {
      setVideoUploading(false)
      if (videoFileInputRef.current) {
        videoFileInputRef.current.value = ''
      }
    }
  }

  const moveVideo = (index: number, direction: 'up' | 'down') => {
    const newVideos = [...videos]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newVideos.length) return
    ;[newVideos[index], newVideos[targetIndex]] = [newVideos[targetIndex], newVideos[index]]
    onReordered(newVideos)
  }

  const handleVideoDragStart = (index: number) => {
    setVideoDraggedIndex(index)
  }

  const handleVideoDragEnd = () => {
    setVideoDraggedIndex(null)
  }

  const handleDragOverVideo = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (videoDraggedIndex === null || videoDraggedIndex === index) return
    const newVideos = [...videos]
    const [removed] = newVideos.splice(videoDraggedIndex, 1)
    newVideos.splice(index, 0, removed)
    onReordered(newVideos)
    setVideoDraggedIndex(index)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          旅行视频管理
        </label>
        <span className="text-xs text-gray-500">{videos.length} 个视频</span>
      </div>

      <div
        onClick={() => videoFileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          videoUploading
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
        }`}
      >
        <input
          ref={videoFileInputRef}
          type="file"
          multiple
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleVideoUpload(e.target.files)
            }
          }}
        />
        {videoUploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">视频上传中...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-10 h-10 text-gray-400" />
            <p className="text-sm text-gray-600 dark:text-gray-300">
              点击上传视频文件
            </p>
            <p className="text-xs text-gray-400">
              支持 MP4 / WebM / MOV 等格式，单个视频最大 500MB
            </p>
          </div>
        )}
      </div>

      {videos.length > 0 && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {videos.map((video, index) => (
            <div
              key={`video-${index}`}
              draggable
              onDragStart={() => handleVideoDragStart(index)}
              onDragEnd={handleVideoDragEnd}
              onDragOver={(e) => handleDragOverVideo(e, index)}
              className={`group relative rounded-lg overflow-hidden border-2 transition-all bg-gray-900 ${
                videoDraggedIndex === index ? 'opacity-50' : ''
              } cursor-move`}
            >
              <div className="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 relative">
                <video
                  src={video.url}
                  poster={video.thumbnail}
                  className="w-full h-full object-cover"
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  onMouseEnter={(e) => {
                    const v = e.target as HTMLVideoElement
                    v.play().catch(() => {})
                  }}
                  onMouseLeave={(e) => {
                    const v = e.target as HTMLVideoElement
                    v.pause()
                    v.currentTime = 0
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <Play className="w-5 h-5 text-white ml-0.5" />
                  </div>
                </div>
              </div>

              <div className="absolute top-2 right-2 flex gap-1">
                <button
                  type="button"
                  onClick={() => setVideoPreview(video.url)}
                  className="p-1.5 bg-white/80 rounded text-gray-700 hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity"
                  title="预览"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveVideo(index, 'up')}
                  disabled={index === 0}
                  className="p-1.5 bg-white/80 rounded text-gray-700 hover:bg-white disabled:opacity-30 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="上移"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveVideo(index, 'down')}
                  disabled={index === videos.length - 1}
                  className="p-1.5 bg-white/80 rounded text-gray-700 hover:bg-white disabled:opacity-30 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="下移"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemoved(index)}
                  className="p-1.5 bg-red-500 rounded text-white hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                <p className="text-xs text-white/80 truncate">
                  {video.url.split('/').pop() || `视频 ${index + 1}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

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
            <Video className="w-8 h-8" />
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
