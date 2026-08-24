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
  const [loaded, setLoaded] = useState<Set<string>>(new Set())

  const markLoaded = useCallback((key: string) => {
    setLoaded((prev) => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }, [])

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

  // 滚动视差：图片随滚动轻微上下位移，切换更连贯（rAF 直写 style，不触发 React 渲染）
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const sections = Array.from(container.querySelectorAll<HTMLElement>('[data-index]'))
    const wraps = sections.map((section) => section.querySelector<HTMLElement>('.travel-media-parallax'))

    let raf = 0
    const update = () => {
      raf = 0
      const h = container.clientHeight || window.innerHeight
      const scrollTop = container.scrollTop
      wraps.forEach((wrap, i) => {
        if (!wrap) return
        const progress = (i * h - scrollTop) / h
        const y = progress * -9
        wrap.style.transform = `translate3d(0, ${y}%, 0)`
      })
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }

    update()
    container.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      container.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [mediaItems])

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
            className="h-screen snap-start relative overflow-hidden"
          >
            <div className="travel-media-parallax absolute -inset-y-[14%] inset-x-0">
              {/* 暖色渐变占位：图片加载中/失败时显示，避免黑屏 */}
              <div className="absolute inset-0 bg-gradient-to-br from-travel-sakura via-travel-bloom/50 to-travel-mist dark:from-[#32261D] dark:via-[#3A2B21] dark:to-[#22303A]" />
              {item.type === 'image' ? (
                <Image
                  key={`${item.type}-${index}-${index === visibleIndex ? animationKey : 'idle'}`}
                  src={item.url}
                  alt={`${title} - ${index + 1}`}
                  fill
                  sizes="100vw"
                  priority={index === 0}
                  fetchPriority={index === 0 ? 'high' : 'auto'}
                  className={`object-cover transition-opacity duration-700 ${
                    loaded.has(`img-${index}`) ? 'opacity-100' : 'opacity-0'
                  } ${`${index === visibleIndex ? 'travel-media-enter' : ''}`}`}
                  onLoad={() => markLoaded(`img-${index}`)}
                  onError={() => markLoaded(`img-${index}`)}
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
            </div>
            {/* 底部海报渐变遮罩（下重上轻） */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/20 pointer-events-none" />
            {/* 轻微暗角（胶片感） */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,0.38) 100%)' }}
            />
            {/* 细颗粒噪点（海报质感） */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay"
              style={{
                backgroundImage:
                  "url('data:image/svg+xml,%3Csvg viewBox=\"0 0 256 256\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cfilter id=\"n\"%3E%3CfeTurbulence type=\"fractalNoise\" baseFrequency=\"0.9\" numOctaves=\"2\" stitchTiles=\"stitch\"/%3E%3C/filter%3E%3Crect width=\"100%25\" height=\"100%25\" filter=\"url(%23n)\" /%3E%3C/svg%3E')",
              }}
            />

            {index === visibleIndex && showText && (
              <div
                key={`text-${index}-${animationKey}`}
                className="absolute inset-0 pointer-events-none"
              >
                {/* 顶部：meta（地点 · 日期） */}
                <div className="absolute left-6 right-6 top-20 md:left-10 md:right-10 flex items-start justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-white/90 text-sm animate-fade-down" style={{ animationDelay: '0.05s' }}>
                    {location && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="w-4 h-4" />
                        {location}
                      </span>
                    )}
                    {date && (
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="w-4 h-4" />
                        {new Date(date).toLocaleDateString('zh-CN')}
                      </span>
                    )}
                  </div>

                  {/* 右上角：页码 */}
                  <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5 text-xs text-white backdrop-blur-md animate-fade-down" style={{ animationDelay: '0.1s' }}>
                    <span>{index + 1} / {mediaItems.length}</span>
                    {item.type === 'video' && (
                      <span className="flex items-center gap-1">
                        <span className="h-1 w-1 rounded-full bg-white/60" />
                        视频
                      </span>
                    )}
                  </div>
                </div>

                {/* 底部：海报文字块（左下角，不居中） */}
                <div className="absolute bottom-0 left-0 right-0 p-6 pb-28 md:p-12 md:pb-32">
                  {description && (
                    <p
                      className="mb-3 max-w-xl text-sm leading-relaxed text-white/85 md:mb-4 md:text-base"
                      style={{
                        animation: 'fadeSlideUp 0.8s cubic-bezier(0.23, 1, 0.32, 1) forwards',
                        animationDelay: '0.18s',
                        opacity: 0,
                      }}
                    >
                      {description}
                    </p>
                  )}
                  <h2
                    className="font-display max-w-3xl text-4xl font-bold leading-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] md:text-6xl"
                    style={{
                      letterSpacing: '0.06em',
                      animation: 'fadeSlideUp 0.8s cubic-bezier(0.23, 1, 0.32, 1) forwards',
                      animationDelay: '0.08s',
                      opacity: 0,
                    }}
                  >
                    {title}
                  </h2>
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
                <ChevronDown className="w-5 h-5 animate-[chevron-float_1.8s_ease-in-out_infinite]" />
              </button>
            )}

            {index === visibleIndex && index === mediaItems.length - 1 && (
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/50">
                <span className="text-xs tracking-wide">继续阅读文章</span>
                <ChevronDown className="w-5 h-5 animate-[chevron-float_1.8s_ease-in-out_infinite]" />
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
