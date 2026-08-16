'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import NextImage from 'next/image'
import { MapPin, Heart, ImageOff } from 'lucide-react'

const DISPLAY_DURATION = 6000
const CROSSFADE_DURATION = 800

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
  intervalMs,
}: TravelImageCarouselProps) {
  const total = images.length
  const [currentIndex, setCurrentIndex] = useState(0)
  const [prevIndex, setPrevIndex] = useState(-1)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [imageError, setImageError] = useState<Record<string, boolean>>({})
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const preloadRef = useRef<HTMLImageElement | null>(null)

  const displayDuration = intervalMs ? Math.min(intervalMs, 8000) : DISPLAY_DURATION

  const preloadNext = useCallback(
    (nextIdx: number) => {
      if (total === 0) return
      const nextUrl = images[nextIdx]
      if (!nextUrl) return
      const img = new Image()
      img.src = nextUrl
      preloadRef.current = img
      return img
    },
    [images, total],
  )

  const goTo = useCallback(
    (index: number) => {
      if (total <= 1 || isTransitioning) return
      const next = ((index % total) + total) % total
      if (next === currentIndex) return

      setPrevIndex(currentIndex)
      setIsTransitioning(false)

      const preloadImg = preloadNext(next)

      const startTransition = () => {
        setCurrentIndex(next)

        requestAnimationFrame(() => {
          setIsTransitioning(true)

          setTimeout(() => {
            setPrevIndex(-1)
            setIsTransitioning(false)
          }, CROSSFADE_DURATION)
        })
      }

      if (preloadImg && preloadImg.complete) {
        startTransition()
      } else if (preloadImg) {
        const onLoad = () => startTransition()
        const onError = () => startTransition()
        preloadImg.addEventListener('load', onLoad)
        preloadImg.addEventListener('error', onError)
        setTimeout(startTransition, 1500)
      } else {
        startTransition()
      }
    },
    [total, currentIndex, isTransitioning, preloadNext],
  )

  const next = useCallback(() => {
    goTo(currentIndex + 1)
  }, [currentIndex, goTo])

  useEffect(() => {
    if (total <= 1) return
    timerRef.current = setInterval(() => {
      if (!isTransitioning) {
        next()
      }
    }, displayDuration + CROSSFADE_DURATION)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [total, displayDuration, next, isTransitioning])

  useEffect(() => {
    if (total > 0) {
      preloadNext((currentIndex + 1) % total)
    }
  }, [currentIndex, total, preloadNext])

  const decorItems = useMemo<DecorItem[]>(() => {
    const palette: DecorItem['color'][] = ['#F5DCE0', '#E8B8C2', '#A8C8DC', '#D6E8F0']
    return DECOR_POSITIONS.map((p, i) => ({
      ...p,
      type: i % 2 === 0 ? 'heart' : 'pin',
      color: palette[i % palette.length],
    }))
  }, [])

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
  const prevImage = prevIndex >= 0 ? images[prevIndex] : null
  const currentHasError = imageError[currentImage]
  const prevHasError = prevImage ? imageError[prevImage] : false

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
          }}
        >
          {/* 底层：当前图片（始终可见，作为基底） */}
          {currentHasError ? (
            <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-3 bg-[#FAFBF7]">
              <ImageOff className="w-12 h-12 text-[#5A6670]/50" />
              <p className="text-sm text-[#5A6670]/70">图片加载失败</p>
            </div>
          ) : (
            <NextImage
              key={`cur-${currentIndex}`}
              src={currentImage}
              alt={`旅行照片 ${currentIndex + 1}`}
              fill
              sizes="(max-width: 768px) 88vw, 380px"
              className="object-cover"
              draggable={false}
              style={{
                opacity: 1,
                transform: 'scale(1)',
                transition: 'none',
                animation: isTransitioning ? 'none' : `carousel-zoom-in 600ms ease-out`,
              }}
              onError={() =>
                setImageError((prev) => ({ ...prev, [currentImage]: true }))
              }
            />
          )}

          {/* 顶层：上一张图片（正在淡出，覆盖在当前图片之上） */}
          {prevImage && !prevHasError && (
            <NextImage
              key={`prev-${prevIndex}`}
              src={prevImage}
              alt={`上一张 ${prevIndex + 1}`}
              fill
              sizes="(max-width: 768px) 88vw, 380px"
              className="object-cover"
              draggable={false}
              style={{
                opacity: isTransitioning ? 0 : 1,
                transform: isTransitioning ? 'scale(1.04)' : 'scale(1)',
                transition: `opacity ${CROSSFADE_DURATION}ms ease-out, transform ${CROSSFADE_DURATION}ms ease-out`,
              }}
              onError={() =>
                setImageError((prev) => ({ ...prev, [prevImage]: true }))
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
        @keyframes carousel-zoom-in {
          0% { transform: scale(0.94); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  )
}

