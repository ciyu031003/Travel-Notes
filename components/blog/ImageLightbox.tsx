'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

interface ImageLightboxProps {
  selector?: string
}

const BOUND_ATTR = 'data-lightbox-bound'

export default function ImageLightbox({ selector = 'article.prose img' }: ImageLightboxProps) {
  const [images, setImages] = useState<string[]>([])
  const [currentIndex, setCurrentIndex] = useState<number>(-1)

  const isOpen = currentIndex >= 0 && currentIndex < images.length

  const close = useCallback(() => setCurrentIndex(-1), [])
  const next = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % images.length)
  }, [images.length])
  const prev = useCallback(() => {
    setCurrentIndex(prev => (prev - 1 + images.length) % images.length)
  }, [images.length])

  // 绑定图片点击事件
  useEffect(() => {
    const bindImages = () => {
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(selector))
      const srcs = imgs
        .map(img => img.currentSrc || img.src)
        .filter(Boolean)
      setImages(srcs)

      imgs.forEach((img, index) => {
        if (img.hasAttribute(BOUND_ATTR)) {
          // 已绑定过，仅更新 data-index 以防顺序变化
          img.setAttribute('data-lightbox-index', String(index))
          return
        }
        img.setAttribute(BOUND_ATTR, 'true')
        img.setAttribute('data-lightbox-index', String(index))
        img.classList.add('cursor-zoom-in')
        img.addEventListener('click', (e) => {
          e.preventDefault()
          const idx = Number(img.getAttribute('data-lightbox-index') || index)
          setCurrentIndex(idx)
        })
      })
    }

    bindImages()

    const observer = new MutationObserver(() => bindImages())
    observer.observe(document.body, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [selector])

  // 键盘事件
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', handleKey)
    // 锁定滚动
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen, close, next, prev])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-8"
      onClick={close}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={close}
        className="absolute top-4 right-4 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="关闭"
      >
        <X className="w-6 h-6" />
      </button>

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); prev() }}
            className="absolute left-4 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="上一张"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); next() }}
            className="absolute right-4 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="下一张"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        </>
      )}

      <img
        src={images[currentIndex]}
        alt=""
        className="max-h-full max-w-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
          {currentIndex + 1} / {images.length}
        </div>
      )}
    </div>
  )
}
