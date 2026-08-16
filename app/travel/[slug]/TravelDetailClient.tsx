'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ChevronDown, ArrowLeft, MapPin, Calendar, Play, Pause } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

interface VideoInfo {
  url: string
  thumbnail?: string
  duration?: number
  width?: number
  height?: number
}

interface TravelDetailClientProps {
  images: string[]
  videos?: VideoInfo[]
  title: string
  description?: string
  location?: string
  date?: string
  postSlug: string
}

type MediaItem =
  | { type: 'image'; url: string }
  | { type: 'video'; url: string; thumbnail?: string }

export default function TravelDetailClient({
  images,
  videos = [],
  title,
  description,
  location,
  date,
}: TravelDetailClientProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([])
  const [visibleIndex, setVisibleIndex] = useState(0)
  const [showText, setShowText] = useState(false)
  const [animationKey, setAnimationKey] = useState(0)
  const [isMuted, setIsMuted] = useState(true)
  const [playingVideos, setPlayingVideos] = useState<Set<number>>(new Set())

  const mediaItems = useMemo<MediaItem[]>(() => {
    const items: MediaItem[] = []
    images.forEach((url) => items.push({ type: 'image', url }))
    videos.forEach((v) => items.push({ type: 'video', url: v.url, thumbnail: v.thumbnail }))
    return items
  }, [images, videos])

  const playVisibleVideo = useCallback((index: number) => {
    const item = mediaItems[index]
    if (!item || item.type !== 'video') return

    const videoEl = videoRefs.current[index]
    if (videoEl) {
      videoEl.muted = isMuted
      videoEl.currentTime = 0
      videoEl.play().catch(() => {})
      setPlayingVideos((prev) => {
        const next = new Set(prev)
        next.add(index)
        return next
      })
    }
  }, [mediaItems, isMuted])

  const pauseAllVideos = useCallback(() => {
    videoRefs.current.forEach((videoEl) => {
      if (videoEl) {
        videoEl.pause()
      }
    })
    setPlayingVideos(new Set())
  }, [])

  useEffect(() => {
    if (mediaItems.length === 0) return

    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = Number(entry.target.getAttribute('data-index'))
          if (isNaN(index)) return

          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            setShowText(false)
            setVisibleIndex(index)
            setAnimationKey((prev) => prev + 1)

            const item = mediaItems[index]
            if (item?.type === 'video') {
              pauseAllVideos()
              setTimeout(() => {
                playVisibleVideo(index)
                setTimeout(() => setShowText(true), 400)
              }, 100)
            } else {
              pauseAllVideos()
              setTimeout(() => setShowText(true), 300)
            }
          } else if (!entry.isIntersecting && entry.intersectionRatio < 0.3) {
            const item = mediaItems[index]
            if (item?.type === 'video') {
              const videoEl = videoRefs.current[index]
              if (videoEl) {
                videoEl.pause()
                setPlayingVideos((prev) => {
                  const next = new Set(prev)
                  next.delete(index)
                  return next
                })
              }
            }
          }
        })
      },
      { root: container, threshold: [0.3, 0.6, 0.8] }
    )

    const sections = container.querySelectorAll('[data-index]')
    sections.forEach((section) => observer.observe(section))

    return () => observer.disconnect()
  }, [mediaItems, playVisibleVideo, pauseAllVideos])

  const scrollToSection = (index: number) => {
    const container = containerRef.current
    if (!container) return

    setShowText(false)
    container.scrollTo({
      top: index * container.clientHeight,
      behavior: 'smooth',
    })

    const item = mediaItems[index]
    if (item?.type === 'video') {
      pauseAllVideos()
      setTimeout(() => {
        playVisibleVideo(index)
        setVisibleIndex(index)
        setAnimationKey((prev) => prev + 1)
        setTimeout(() => setShowText(true), 400)
      }, 500)
    } else {
      setTimeout(() => {
        setVisibleIndex(index)
        setAnimationKey((prev) => prev + 1)
        setTimeout(() => setShowText(true), 300)
      }, 500)
    }
  }

  const toggleVideoPlay = (index: number) => {
    const videoEl = videoRefs.current[index]
    if (!videoEl) return

    if (videoEl.paused) {
      videoEl.play().catch(() => {})
      setPlayingVideos((prev) => {
        const next = new Set(prev)
        next.add(index)
        return next
      })
    } else {
      videoEl.pause()
      setPlayingVideos((prev) => {
        const next = new Set(prev)
        next.delete(index)
        return next
      })
    }
  }

  const toggleMute = (index: number) => {
    const videoEl = videoRefs.current[index]
    if (!videoEl) return

    const newMuted = !isMuted
    setIsMuted(newMuted)
    videoEl.muted = newMuted
  }

  if (mediaItems.length === 0) return null

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
        {mediaItems.map((item, index) => (
          <section
            key={`${item.type}-${index}`}
            data-index={index}
            className="h-screen snap-start relative"
          >
            {item.type === 'image' ? (
              <Image
                src={item.url}
                alt={`${title} - ${index + 1}`}
                fill
                sizes="100vw"
                className="object-cover"
                draggable={false}
              />
            ) : (
              <video
                ref={(el) => { videoRefs.current[index] = el }}
                src={item.url.startsWith('/') ? item.url : item.url}
                poster={item.thumbnail}
                className="absolute inset-0 w-full h-full object-cover"
                muted={isMuted}
                loop
                playsInline
                preload="metadata"
                onClick={() => toggleVideoPlay(index)}
              />
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/50 pointer-events-none" />

            {index === visibleIndex && showText && (
              <div
                key={`text-${index}-${animationKey}`}
                className="absolute inset-0 pointer-events-none"
              >
                {/* Vertical title on the left side */}
                <div className="absolute left-6 md:left-10 top-1/2 -translate-y-1/2 flex items-center h-[70vh]">
                  <h2
                    className="text-3xl md:text-5xl font-bold text-white drop-shadow-lg text-glow"
                    style={{
                      writingMode: 'vertical-rl',
                      textOrientation: 'upright',
                      letterSpacing: '0.15em',
                      animation: 'textReveal 0.8s cubic-bezier(0.23, 1, 0.32, 1) forwards',
                    }}
                  >
                    {title}
                  </h2>
                </div>

                {/* Bottom-right: page counter + description */}
                <div className="absolute bottom-24 right-6 md:right-10 max-w-md text-right">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/15 backdrop-blur-md border border-white/25 text-white rounded-full text-sm mb-4 animate-fade-down" style={{ animationDelay: '0.1s' }}>
                    <span>{index + 1} / {mediaItems.length}</span>
                    {item.type === 'video' && (
                      <span className="flex items-center gap-1">
                        <span className="w-1 h-1 bg-white/60 rounded-full" />
                        视频
                      </span>
                    )}
                  </div>

                  {description && (
                    <p
                      className="text-white/85 text-sm md:text-base leading-relaxed"
                      style={{
                        animation: 'fadeSlideUp 0.8s cubic-bezier(0.23, 1, 0.32, 1) forwards',
                        animationDelay: '0.2s',
                        opacity: 0,
                      }}
                    >
                      {description}
                    </p>
                  )}
                </div>
              </div>
            )}

            {index === visibleIndex && item.type === 'video' && (
              <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-auto">
                <button
                  onClick={() => toggleVideoPlay(index)}
                  className="w-12 h-12 rounded-full bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center text-white hover:bg-white/25 transition-all hover:scale-110"
                >
                  {playingVideos.has(index) ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </button>
                <button
                  onClick={() => toggleMute(index)}
                  className="px-3 h-9 rounded-full bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center text-white/90 hover:bg-white/25 transition-all text-xs"
                >
                  {isMuted ? '🔇 开启声音' : '🔊 静音'}
                </button>
              </div>
            )}

            {index === visibleIndex && index < mediaItems.length - 1 && (
              <button
                onClick={() => scrollToSection(index + 1)}
                className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/50 hover:text-white transition-colors pointer-events-auto"
              >
                <span className="text-xs tracking-wide">向下滚动</span>
                <ChevronDown className="w-5 h-5 animate-bounce" />
              </button>
            )}

            {index === visibleIndex && index === mediaItems.length - 1 && (
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/50">
                <span className="text-xs tracking-wide">继续阅读文章</span>
                <ChevronDown className="w-5 h-5 animate-bounce" />
              </div>
            )}
          </section>
        ))}
      </div>

      <div className="fixed right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-2">
        {mediaItems.map((item, index) => (
          <button
            key={`nav-${index}`}
            onClick={() => scrollToSection(index)}
            className={`rounded-full transition-all duration-300 relative group ${
              index === visibleIndex
                ? 'bg-white h-12 w-2'
                : 'bg-white/30 hover:bg-white/50 h-8 w-2'
            }`}
            aria-label={`第 ${index + 1} 项`}
          >
            {item.type === 'video' && (
              <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-sky-400" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
