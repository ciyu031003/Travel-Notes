'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { X, ChevronLeft, ChevronRight, Camera, Info } from 'lucide-react'

export interface ExifInfo {
  make?: string
  model?: string
  fNumber?: number
  exposureTime?: string
  iso?: number
  focalLength?: number
  dateTaken?: string
  width?: number
  height?: number
}

interface AlbumLightboxProps {
  images: string[]
  initialIndex: number
  cityName?: string
  onClose: () => void
}

function imageIdFromUrl(url: string): number | null {
  const match = url.match(/\/api\/images\/(\d+)(?:[/?]|$)/)
  if (!match) return null
  const id = parseInt(match[1], 10)
  return isNaN(id) ? null : id
}

export default function AlbumLightbox({
  images,
  initialIndex,
  cityName,
  onClose,
}: AlbumLightboxProps) {
  const [index, setIndex] = useState(initialIndex)
  const [exif, setExif] = useState<ExifInfo | null>(null)
  const [exifLoading, setExifLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const touchStartX = useRef<number | null>(null)

  const currentImage = images[index]

  useEffect(() => {
    setIndex(initialIndex)
  }, [initialIndex])

  // 图片切换时重置状态并加载 EXIF
  useEffect(() => {
    setLoaded(false)
    setExif(null)
    setExifLoading(false)

    const id = imageIdFromUrl(currentImage)
    if (id === null) return
    setExifLoading(true)
    let cancelled = false
    fetch(`/api/images/${id}/meta`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.data?.exif) setExif(json.data.exif)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setExifLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentImage])

  const next = useCallback(() => {
    setIndex((prev) => (prev + 1) % images.length)
  }, [images.length])

  const prev = useCallback(() => {
    setIndex((prev) => (prev - 1 + images.length) % images.length)
  }, [images.length])

  // 键盘导航 + 滚动锁定
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', handleKey)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = originalOverflow
    }
  }, [next, prev, onClose])

  const hasExif =
    exif &&
    (exif.make || exif.model || exif.fNumber || exif.exposureTime || exif.iso || exif.focalLength || exif.dateTaken)

  const exifItems: Array<{ label: string; value: string }> = []
  if (exif) {
    const model = [exif.make, exif.model].filter(Boolean).join(' ')
    if (model) exifItems.push({ label: '相机', value: model })
    if (exif.fNumber) exifItems.push({ label: '光圈', value: `f/${exif.fNumber}` })
    if (exif.exposureTime) exifItems.push({ label: '快门', value: exif.exposureTime })
    if (exif.iso) exifItems.push({ label: 'ISO', value: String(exif.iso) })
    if (exif.focalLength) exifItems.push({ label: '焦距', value: `${exif.focalLength}mm` })
    if (exif.dateTaken) exifItems.push({ label: '拍摄时间', value: exif.dateTaken })
    if (exif.width && exif.height) exifItems.push({ label: '尺寸', value: `${exif.width} × ${exif.height}` })
  }

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/95 flex flex-col"
      role="dialog"
      aria-modal="true"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return
        const dx = e.changedTouches[0].clientX - touchStartX.current
        if (Math.abs(dx) > 50) {
          if (dx < 0) next()
          else prev()
        }
        touchStartX.current = null
      }}
    >
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 text-white/90 z-10">
        <div className="flex items-center gap-2 text-sm">
          <Camera className="w-4 h-4 text-white/60" />
          <span>{cityName || '相册'}</span>
          <span className="text-white/40">
            {index + 1} / {images.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="关闭"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* 主图区 */}
      <div className="flex-1 relative min-h-0 flex items-center justify-center px-4">
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute left-2 sm:left-4 z-10 p-2 rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/60 transition-colors"
              aria-label="上一张"
            >
              <ChevronLeft className="w-7 h-7" />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-2 sm:right-4 z-10 p-2 rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/60 transition-colors"
              aria-label="下一张"
            >
              <ChevronRight className="w-7 h-7" />
            </button>
          </>
        )}

        <Image
          key={currentImage}
          src={currentImage}
          alt={`${cityName || '相册'} 照片 ${index + 1}`}
          fill
          sizes="100vw"
          className={`object-contain transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
        />
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* 底部：EXIF + 缩略图 */}
      <div className="px-4 sm:px-6 py-4 z-10">
        {exifLoading ? (
          <p className="text-xs text-white/40 mb-3 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            读取相机信息...
          </p>
        ) : exifItems.length > 0 ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3 text-xs text-white/70">
            {exifItems.map((item) => (
              <span key={item.label} className="flex items-center gap-1.5">
                <span className="text-white/40">{item.label}</span>
                <span className="font-medium text-white/90">{item.value}</span>
              </span>
            ))}
          </div>
        ) : (
          <div className="h-5 mb-3" />
        )}

        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {images.map((img, i) => (
              <button
                key={img + i}
                type="button"
                onClick={() => setIndex(i)}
                className={`relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 transition-all ${
                  i === index ? 'ring-2 ring-white ring-offset-2 ring-offset-black' : 'opacity-60 hover:opacity-100'
                }`}
              >
                <Image
                  src={img}
                  alt={`缩略图 ${i + 1}`}
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
