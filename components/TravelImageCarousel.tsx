'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { MapPin, Heart, ImageOff } from 'lucide-react'

interface TravelImageCarouselProps {
  images: string[]
  intervalMs?: number
}

interface DecorItem {
  type: 'heart' | 'pin'
  top: string
  left: string
  size: number
  delay: string
  duration: string
  color: string
  rotate: number
}

const DECOR_POSITIONS: Omit<DecorItem, 'type' | 'color'>[] = [
  { top: '6%', left: '8%', size: 22, delay: '0s', duration: '4s', rotate: -12 },
  { top: '14%', left: '82%', size: 18, delay: '1.2s', duration: '5s', rotate: 8 },
  { top: '40%', left: '4%', size: 16, delay: '0.6s', duration: '4.5s', rotate: 20 },
  { top: '58%', left: '90%', size: 24, delay: '2s', duration: '5.5s', rotate: -6 },
  { top: '78%', left: '12%', size: 20, delay: '0.3s', duration: '4.8s', rotate: 14 },
  { top: '86%', left: '78%', size: 18, delay: '1.8s', duration: '5.2s', rotate: -18 },
]

export default function TravelImageCarousel({
  images,
  intervalMs = 30000,
}: TravelImageCarouselProps) {
  const total = images.length
  const [currentIndex, setCurrentIndex] = useState(0)
  const [animState, setAnimState] = useState<'enter' | 'idle' | 'exit'>('idle')
  const [imageError, setImageError] = useState<Record<number, boolean>>({})

  const goTo = useCallback(
    (index: number) => {
      if (total === 0) return
      const next = ((index % total) + total) % total
      if (next === currentIndex) return
      setAnimState('exit')
      setTimeout(() => {
        setCurrentIndex(next)
        setAnimState('enter')
        setTimeout(() => setAnimState('idle'), 1200)
      }, 500)
    },
    [currentIndex, total],
  )

  const next = useCallback(() => {
    goTo(currentIndex + 1)
  }, [currentIndex, goTo])

  useEffect(() => {
    if (total <= 1) return
    const timer = setInterval(() => {
      next()
    }, intervalMs)
    return () => clearInterval(timer)
  }, [total, intervalMs, next])

  useEffect(() => {
    if (total > 0 && animState === 'idle') {
      setAnimState('enter')
      setTimeout(() => setAnimState('idle'), 1200)
    }
  }, [])

  const decorItems = useMemo<DecorItem[]>(() => {
    const palette: DecorItem['color'][] = ['#F5DCE0', '#E8B8C2', '#A8C8DC', '#D6E8F0']
    return DECOR_POSITIONS.map((p, i) => ({
      ...p,
      type: i % 2 === 0 ? 'heart' : 'pin',
      color: palette[i % palette.length],
    }))
  }, [])

  const getImageAnimationStyle = (): React.CSSProperties => {
    if (animState === 'enter') {
      return {
        transform: 'scale(1) rotate(0deg)',
        opacity: 1,
        transition: 'transform 1.2s cubic-bezier(0.22, 1, 0.36, 1), opacity 1.2s ease-out',
      }
    }
    if (animState === 'exit') {
      return {
        transform: 'scale(1.2) rotate(3deg)',
        opacity: 0,
        transition: 'transform 0.5s ease-in, opacity 0.5s ease-in',
      }
    }
    return {
      transform: 'scale(0.3) rotate(-8deg)',
      opacity: 0,
      transition: 'none',
    }
  }

  if (total === 0) {
    return (
      <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-xl bg-gradient-to-br from-[#F5DCE0] via-[#FAFBF7] to-[#D6E8F0] flex items-center justify-center">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {decorItems.map((d, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                top: d.top,
                left: d.left,
                animation: `carousel-float ${d.duration} ease-in-out ${d.delay} infinite`,
              }}
            >
              {d.type === 'heart' ? (
                <Heart
                  size={d.size}
                  color={d.color}
                  fill={d.color}
                  style={{ transform: `rotate(${d.rotate}deg)` }}
                />
              ) : (
                <MapPin
                  size={d.size}
                  color={d.color}
                  fill={d.color}
                  style={{ transform: `rotate(${d.rotate}deg)` }}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center gap-3 text-center px-6 relative z-10">
          <div className="w-20 h-20 rounded-full bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-lg">
            <ImageOff className="w-10 h-10 text-[#5A6670]" />
          </div>
          <p className="text-[#5A6670] text-base font-medium">暂无旅行照片</p>
          <p className="text-[#5A6670]/70 text-sm">上传照片开启美好的旅行回忆</p>
        </div>
        <style jsx>{`
          @keyframes carousel-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-12px); }
          }
        `}</style>
      </div>
    )
  }

  const currentImage = images[currentIndex]
  const hasError = imageError[currentIndex]

  return (
    <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-xl bg-gradient-to-br from-[#F5DCE0] via-[#FAFBF7] to-[#D6E8F0]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {decorItems.map((d, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              top: d.top,
              left: d.left,
              animation: `carousel-float ${d.duration} ease-in-out ${d.delay} infinite`,
            }}
          >
            {d.type === 'heart' ? (
              <Heart
                size={d.size}
                color={d.color}
                fill={d.color}
                style={{ transform: `rotate(${d.rotate}deg)` }}
              />
            ) : (
              <MapPin
                size={d.size}
                color={d.color}
                fill={d.color}
                style={{ transform: `rotate(${d.rotate}deg)` }}
              />
            )}
          </div>
        ))}
      </div>

      <div className="absolute inset-0 flex items-center justify-center p-8 sm:p-10 md:p-14">
        <div
          className="relative rounded-2xl overflow-hidden shadow-2xl bg-[#FAFBF7]"
          style={{
            width: 'min(88%, 380px)',
            aspectRatio: '4 / 5',
            ...getImageAnimationStyle(),
          }}
        >
          {hasError ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[#FAFBF7]">
              <ImageOff className="w-12 h-12 text-[#5A6670]/50" />
              <p className="text-sm text-[#5A6670]/70">图片加载失败</p>
            </div>
          ) : (
            <img
              src={currentImage.startsWith('/') ? currentImage : currentImage}
              alt={`旅行照片 ${currentIndex + 1}`}
              className="w-full h-full object-cover"
              draggable={false}
              onError={() =>
                setImageError((prev) => ({ ...prev, [currentIndex]: true }))
              }
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" />
          <div className="absolute inset-0 rounded-2xl ring-1 ring-black/5 pointer-events-none" />
        </div>
      </div>

      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          {images.map((_, index) => (
            <button
              key={index}
              onClick={() => goTo(index)}
              className={`rounded-full transition-all duration-300 ${
                index === currentIndex
                  ? 'w-6 h-2 bg-[#E8B8C2]'
                  : 'w-2 h-2 bg-[#5A6670]/25 hover:bg-[#5A6670]/50'
              }`}
              aria-label={`跳转到第 ${index + 1} 张`}
            />
          ))}
        </div>
        <div className="px-3 py-1 rounded-full bg-white/70 backdrop-blur-sm shadow-sm">
          <span className="text-xs font-medium text-[#5A6670]">
            第 {currentIndex + 1} / {total} 张
          </span>
        </div>
      </div>

      <style jsx>{`
        @keyframes carousel-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
      `}</style>
    </div>
  )
}
