'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface StackedImageSliderProps {
  images: string[]
  className?: string
  aspectRatio?: string
}

export default function StackedImageSlider({
  images,
  className = '',
  aspectRatio = 'aspect-[4/5]',
}: StackedImageSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [direction, setDirection] = useState<'left' | 'right'>('right')
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)

  const total = images.length

  const goTo = useCallback((index: number) => {
    if (isAnimating) return
    setDirection(index > currentIndex ? 'right' : 'left')
    setIsAnimating(true)
    setCurrentIndex(index)
    setTimeout(() => setIsAnimating(false), 500)
  }, [currentIndex, isAnimating])

  const next = useCallback(() => {
    goTo((currentIndex + 1) % total)
  }, [currentIndex, total, goTo])

  const prev = useCallback(() => {
    goTo((currentIndex - 1 + total) % total)
  }, [currentIndex, total, goTo])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX
  }

  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) return
    const diff = touchStartX.current - touchEndX.current
    if (Math.abs(diff) > 50) {
      if (diff > 0) next()
      else prev()
    }
    touchStartX.current = null
    touchEndX.current = null
  }

  useEffect(() => {
    if (total <= 1) return
    const timer = setInterval(() => {
      next()
    }, 6000)
    return () => clearInterval(timer)
  }, [total, next])

  if (total === 0) return null

  const getImageStyle = (index: number) => {
    const offset = ((index - currentIndex) % total + total) % total
    const normalizedOffset = offset > total / 2 ? offset - total : offset

    let translateX = normalizedOffset * 40
    let scale = 1 - Math.abs(normalizedOffset) * 0.08
    let zIndex = 100 - Math.abs(normalizedOffset)
    let opacity = Math.abs(normalizedOffset) > 2 ? 0 : 1 - Math.abs(normalizedOffset) * 0.2
    let rotateY = normalizedOffset * -15

    if (normalizedOffset === 0) {
      translateX = 0
      scale = 1
      opacity = 1
      rotateY = 0
    }

    return {
      transform: `translateX(${translateX}px) scale(${scale}) rotateY(${rotateY}deg)`,
      zIndex,
      opacity,
      transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
    }
  }

  return (
    <div
      className={`relative ${aspectRatio} w-full ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl bg-gradient-to-br from-[#F5DCE0] via-[#E8D5E0] to-[#D6E8F0]">
        {images.map((img, index) => (
          <div
            key={`${img}-${index}`}
            className="absolute inset-0 cursor-pointer"
            style={getImageStyle(index)}
            onClick={() => {
              if (index !== currentIndex) {
                goTo(index)
              } else {
                next()
              }
            }}
          >
            {img && (
              <img loading="lazy" decoding="async"
                src={img.startsWith('/') ? img : img}
                alt={`图片 ${index + 1}`}
                className="w-full h-full object-cover"
                draggable={false}
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent rounded-2xl pointer-events-none" />
            <div className="absolute inset-0 rounded-2xl ring-1 ring-black/5 dark:ring-white/10 pointer-events-none" />
          </div>
        ))}
      </div>

      {total > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev() }}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-[200] w-10 h-10 bg-white/80 dark:bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:bg-white dark:hover:bg-black/70 transition-colors opacity-0 group-hover:opacity-100"
            style={{ opacity: isAnimating ? 0.7 : 1 }}
            aria-label="上一张"
          >
            <ChevronLeft className="w-5 h-5 text-gray-800 dark:text-white" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next() }}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-[200] w-10 h-10 bg-white/80 dark:bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:bg-white dark:hover:bg-black/70 transition-colors opacity-0 group-hover:opacity-100"
            style={{ opacity: isAnimating ? 0.7 : 1 }}
            aria-label="下一张"
          >
            <ChevronRight className="w-5 h-5 text-gray-800 dark:text-white" />
          </button>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2">
            {images.map((_, index) => (
              <button
                key={index}
                onClick={(e) => { e.stopPropagation(); goTo(index) }}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  index === currentIndex
                    ? 'bg-white w-6'
                    : 'bg-white/50 hover:bg-white/80'
                }`}
                aria-label={`跳转到第 ${index + 1} 张`}
              />
            ))}
          </div>

          <div className="absolute -left-2 top-4 bg-white dark:bg-gray-800 rounded-lg shadow-md px-3 py-1.5 flex items-center gap-2 z-[200]">
            <span className="text-lg font-bold text-primary-500">{String(currentIndex + 1).padStart(2, '0')}</span>
            <span className="text-xs text-gray-400">/ {String(total).padStart(2, '0')}</span>
          </div>
        </>
      )}
    </div>
  )
}
