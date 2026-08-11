'use client'

import { useEffect, useRef, useMemo, useCallback } from 'react'
import { Camera, Sparkles } from 'lucide-react'

interface PhotoRiverProps {
  images: string[]
  cityName?: string
  onPhotoClick: (index: number) => void
}

interface PhotoLayout {
  depth: number // 视差深度：越大越靠前/移动越快
  y: number // 垂直位置基准（相对中心）
  rot: number // 旋转角
  bobSpeed: number
  bobAmp: number
  bobPhase: number
}

/**
 * 星河相片流：照片如同漂浮在星河中，缓慢平滑流动（视差 + 上下浮动），无缝循环
 */
export default function PhotoRiver({ images, cityName, onPhotoClick }: PhotoRiverProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const photoRefs = useRef<(HTMLButtonElement | null)[]>([])
  const layoutRef = useRef<PhotoLayout[]>([])
  const phaseRef = useRef(0)
  const sizeRef = useRef({ cardW: 220, cardH: 300, gap: 36, top: 0, containerW: 0, totalW: 0 })
  const rafRef = useRef(0)

  const layouts = useMemo<PhotoLayout[]>(() => {
    return images.map((_, i) => {
      const r = Math.random()
      return {
        depth: 0.6 + r * 0.8,
        y: (Math.random() - 0.5) * 90,
        rot: (Math.random() - 0.5) * 10,
        bobSpeed: 0.25 + Math.random() * 0.4,
        bobAmp: 6 + Math.random() * 12,
        bobPhase: Math.random() * Math.PI * 2,
      }
    })
  }, [images])

  const measure = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const w = el.clientWidth
    const cardW = Math.min(240, Math.max(150, w * 0.28))
    const cardH = cardW * 1.32
    const gap = Math.max(28, cardW * 0.22)
    sizeRef.current = {
      cardW,
      cardH,
      gap,
      top: el.clientHeight / 2,
      containerW: w,
      totalW: images.length * (cardW + gap),
    }
  }, [images.length])

  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    const container = containerRef.current

    let last = 0
    const step = (time: number) => {
      const dt = last ? (time - last) / 1000 : 0
      last = time
      phaseRef.current += dt * 34 // 基础流速（px/s）

      const { cardW, gap, totalW, containerW, top } = sizeRef.current
      const s = phaseRef.current
      const center = containerW / 2

      for (let i = 0; i < images.length; i++) {
        const layout = layoutRef.current[i] || layouts[i]
        layoutRef.current[i] = layout
        const el1 = photoRefs.current[i]
        const el2 = photoRefs.current[i + images.length]
        if (!el1 || !el2) continue

        // 视差：深度越大移动越快
        const flow = s * (0.5 + layout.depth * 0.9)
        const baseX = i * (cardW + gap)
        let x = ((baseX - flow) % totalW + totalW) % totalW
        const bob = Math.sin(time / 1000 * layout.bobSpeed + layout.bobPhase) * layout.bobAmp

        const apply = (el: HTMLButtonElement, xPos: number) => {
          const dx = xPos - center
          // 深度缩放（中心对称的视差大小）
          const scale = 0.72 + layout.depth * 0.38
          const zOffset = (dx / Math.max(1, containerW)) * (layout.depth - 0.8) * 46
          el.style.transform = `translate3d(${xPos}px, ${top + layout.y + bob + zOffset}px, 0) translate(-50%, -50%) rotate(${layout.rot}deg) scale(${scale})`
        }
        apply(el1, x)
        apply(el2, x - totalW)
        el1.style.zIndex = String(Math.round(layout.depth * 10))
        el2.style.zIndex = String(Math.round(layout.depth * 10))
      }
      rafRef.current = requestAnimationFrame(step)
    }

    const onVisibility = () => {
      cancelAnimationFrame(rafRef.current)
      if (!document.hidden) rafRef.current = requestAnimationFrame(step)
    }
    document.addEventListener('visibilitychange', onVisibility)
    rafRef.current = requestAnimationFrame(step)
    void container

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', measure)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [images.length, layouts, measure])

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/40">
        <Camera className="w-12 h-12 mb-3 opacity-40" />
        <p className="text-sm">这座城市的星河还未点亮</p>
      </div>
    )
  }

  const doubled = [...images, ...images]

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
    >
      {/* 顶部提示 */}
      <div className="absolute top-5 inset-x-0 z-30 flex justify-center pointer-events-none">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-white/85 text-xs sm:text-sm">
          <Sparkles className="w-3.5 h-3.5 text-amber-200/80" />
          {cityName ? `${cityName} · 点击照片，留下你的留言` : '点击照片，留下你的留言'}
        </div>
      </div>

      {doubled.map((img, idx) => {
        const layout = layouts[idx % images.length]
        return (
          <button
            key={`${img}-${idx}`}
            ref={(el) => { photoRefs.current[idx] = el }}
            type="button"
            onClick={() => onPhotoClick(idx % images.length)}
            className="absolute left-0 top-0 will-change-transform group cursor-pointer outline-none"
            style={{ width: sizeRef.current.cardW, height: sizeRef.current.cardH }}
            aria-label={`查看照片 ${idx + 1}`}
          >
            <div className={`w-full h-full rounded-2xl overflow-hidden shadow-[0_24px_60px_-12px_rgba(0,0,0,0.5)] shadow-[0_0_30px_rgba(120,130,255,0.08)] border border-white/10 bg-black/25 backdrop-blur-sm transition-transform duration-300 group-hover:scale-[1.03] ${layout.depth > 1.1 ? 'ring-1 ring-amber-200/30' : ''}`}>
              <img
                src={img}
                alt={`${cityName || ''} 照片 ${idx + 1}`}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="w-full h-full object-cover"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent pointer-events-none" />
            </div>
          </button>
        )
      })}
    </div>
  )
}
