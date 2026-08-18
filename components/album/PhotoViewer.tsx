'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react'

export interface PhotoViewerItem {
  src: string
  alt?: string
  exif?: string
}

interface PhotoViewerProps {
  images: PhotoViewerItem[]
  index: number
  onClose: () => void
  onIndexChange?: (index: number) => void
}

/**
 * 全屏照片查看器：
 * - 左右切换 / 键盘方向键 / 移动端滑动
 * - 双击或缩放按钮 1x ↔ 1.8x
 * - 页码 + EXIF（若传入）
 * 双指捏合缩放留待移动端手势专项增强。
 */
export default function PhotoViewer({ images, index, onClose, onIndexChange }: PhotoViewerProps) {
  const [scale, setScale] = useState(1)
  const touchStartX = useRef<number | null>(null)

  const current = images[index]

  const go = useCallback(
    (next: number) => {
      if (images.length === 0) return
      const clamped = (next + images.length) % images.length
      onIndexChange?.(clamped)
      setScale(1)
    },
    [images.length, onIndexChange]
  )

  useEffect(() => {
    if (!current) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') go(index - 1)
      if (e.key === 'ArrowRight') go(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, index, onClose, go])

  if (!current) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={current.alt || '照片查看器'}
      onClick={onClose}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null
      }}
      onTouchEnd={(e) => {
        const startX = touchStartX.current
        touchStartX.current = null
        if (startX === null) return
        const endX = e.changedTouches[0]?.clientX ?? startX
        const delta = endX - startX
        if (Math.abs(delta) > 48) go(index + (delta < 0 ? 1 : -1))
      }}
    >
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setScale((s) => (s === 1 ? 1.8 : 1))}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-album-text1 border border-white/15 hover:bg-white/20 transition-colors"
          aria-label={scale === 1 ? '放大' : '缩小'}
        >
          {scale === 1 ? <ZoomIn className="w-4 h-4" /> : <ZoomOut className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-album-text1 border border-white/15 hover:bg-white/20 transition-colors"
          aria-label="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              go(index - 1)
            }}
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-album-text1 border border-white/15 hover:bg-white/20 transition-colors"
            aria-label="上一张"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              go(index + 1)
            }}
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-album-text1 border border-white/15 hover:bg-white/20 transition-colors"
            aria-label="下一张"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}

      <div
        className="relative flex max-h-[88vh] max-w-[92vw] items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={() => setScale((s) => (s === 1 ? 1.8 : 1))}
      >
        <div className="overflow-hidden rounded-xl">
          <Image
            src={current.src}
            alt={current.alt || ''}
            width={1200}
            height={900}
            className="max-h-[82vh] w-auto object-contain transition-transform duration-200"
            style={{ transform: `scale(${scale})` }}
          />
        </div>
      </div>

      <div className="absolute bottom-4 inset-x-0 z-10 flex flex-col items-center gap-1 px-4 text-center" onClick={(e) => e.stopPropagation()}>
        {current.exif && <p className="text-xs text-album-text2">{current.exif}</p>}
        <p className="text-sm tabular-nums text-album-text1">
          {index + 1} / {images.length}
        </p>
      </div>
    </div>
  )
}
