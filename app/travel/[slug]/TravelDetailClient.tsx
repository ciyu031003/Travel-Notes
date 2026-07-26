'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronDown, ArrowLeft, MapPin, Calendar } from 'lucide-react'
import Link from 'next/link'

interface TravelDetailClientProps {
  images: string[]
  title: string
  description?: string
  location?: string
  date?: string
  postSlug: string
}

export default function TravelDetailClient({
  images,
  title,
  description,
  location,
  date,
}: TravelDetailClientProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())
  const [visibleIndex, setVisibleIndex] = useState(0)
  const [showText, setShowText] = useState(true)
  const [animationKey, setAnimationKey] = useState(0)
  const imgRefs = useRef<(HTMLImageElement | null)[]>([])

  const handleImageLoad = useCallback((index: number) => {
    setLoadedImages(prev => {
      if (prev.has(index)) return prev
      const next = new Set(prev)
      next.add(index)
      return next
    })
  }, [])

  useEffect(() => {
    const imgElements = imgRefs.current
    imgElements.forEach((img, index) => {
      if (img && img.complete && img.naturalWidth > 0) {
        handleImageLoad(index)
      }
    })
  }, [handleImageLoad, images.length])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            const index = Number(entry.target.getAttribute('data-index'))
            if (!isNaN(index)) {
              setShowText(false)
              setVisibleIndex(index)
              setAnimationKey(prev => prev + 1)

              const checkAndShow = () => {
                if (loadedImages.has(index)) {
                  setTimeout(() => setShowText(true), 200)
                } else {
                  setTimeout(checkAndShow, 150)
                }
              }
              checkAndShow()
            }
          }
        })
      },
      { root: container, threshold: [0.6, 0.8] }
    )

    const sections = container.querySelectorAll('[data-index]')
    sections.forEach(section => observer.observe(section))

    return () => observer.disconnect()
  }, [loadedImages])

  const scrollToSection = (index: number) => {
    const container = containerRef.current
    if (!container) return

    setShowText(false)
    container.scrollTo({
      top: index * container.clientHeight,
      behavior: 'smooth',
    })

    setTimeout(() => {
      setVisibleIndex(index)
      setAnimationKey(prev => prev + 1)
      const checkAndShow = () => {
        setLoadedImages(prev => {
          if (prev.has(index)) {
            setTimeout(() => setShowText(true), 200)
          } else {
            setTimeout(checkAndShow, 150)
          }
          return prev
        })
      }
      checkAndShow()
    }, 500)
  }

  return (
    <div className="fixed inset-0 bg-black z-50">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto h-14 flex items-center justify-between px-6">
          <Link
            href="/travel"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>返回旅行记录</span>
          </Link>
          <div className="flex items-center gap-4 text-white/60 text-sm">
            {location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {location}
              </span>
            )}
            {date && (
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {new Date(date).toLocaleDateString('zh-CN')}
              </span>
            )}
          </div>
        </div>
      </nav>

      <div
        ref={containerRef}
        className="h-screen overflow-y-scroll snap-y snap-mandatory"
      >
        {images.map((img, index) => (
          <section
            key={`${img}-${index}`}
            data-index={index}
            className="h-screen snap-start relative"
          >
            <img
              ref={(el) => { imgRefs.current[index] = el }}
              src={img.startsWith('/') ? img : img}
              alt={`${title} - ${index + 1}`}
              className="absolute inset-0 w-full h-full object-cover"
              onLoad={() => handleImageLoad(index)}
            />

            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/40 pointer-events-none" />

            {index === visibleIndex && showText && (
              <div 
                key={`text-${index}-${animationKey}`} 
                className="absolute inset-0 flex flex-col justify-center items-center px-8"
              >
                <div 
                  className="max-w-2xl text-center"
                  style={{
                    animation: 'fadeIn 0.5s ease-out forwards'
                  }}
                >
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/20 backdrop-blur-md border border-white/30 text-white rounded-full text-sm mb-5">
                    <span>{index + 1} / {images.length}</span>
                  </div>
                  <h2 className="text-3xl md:text-5xl font-bold text-white mb-5 drop-shadow-lg">
                    {title}
                  </h2>
                  {description && (
                    <p className="text-white/85 text-base md:text-lg max-w-lg mx-auto leading-relaxed">
                      {description}
                    </p>
                  )}
                </div>
              </div>
            )}

            {index === visibleIndex && index < images.length - 1 && (
              <button
                onClick={() => scrollToSection(index + 1)}
                className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/50 hover:text-white transition-colors"
              >
                <span className="text-xs tracking-wide">向下滚动</span>
                <ChevronDown className="w-5 h-5 animate-bounce" />
              </button>
            )}

            {index === visibleIndex && index === images.length - 1 && (
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/50">
                <span className="text-xs tracking-wide">继续阅读文章</span>
                <ChevronDown className="w-5 h-5 animate-bounce" />
              </div>
            )}
          </section>
        ))}
      </div>

      <div className="fixed right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-2">
        {images.map((_, index) => (
          <button
            key={index}
            onClick={() => scrollToSection(index)}
            className={`rounded-full transition-all duration-300 ${
              index === visibleIndex
                ? 'bg-white h-12 w-2'
                : 'bg-white/30 hover:bg-white/50 h-8 w-2'
            }`}
            aria-label={`第 ${index + 1} 张`}
          />
        ))}
      </div>
    </div>
  )
}
