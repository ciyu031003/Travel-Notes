'use client'

import { useEffect, useRef, useState } from 'react'

/* ==========================================================================
   画册图片加载策略（Album 2.0 M2）
   page-flip 会把**所有**页元素一次性载入 DOM（portrait 模式还会克隆页元素，
   上游 README 明说 "uses cloning of html elements"），因此「只渲染 current ± 1」
   在 page-flip 内部无法做到。等价的有效做法是控制**网络与解码**：
     · 只有进入（或接近）视口的图才设 src —— 其余保持占位，不发请求；
     · 当前跨页与前后各一跨页的图用 img.decode() 预热（见 lib/modules/album/book/preload）。
   ========================================================================== */

/** 距视口多远开始加载（page-flip 的页在书的两侧铺开，留一屏余量） */
const LAZY_ROOT_MARGIN = '600px'

function canObserve(): boolean {
  return typeof window !== 'undefined' && typeof window.IntersectionObserver !== 'undefined'
}

/**
 * 视口内才加载的画册图片。
 * - 容器进入视口前不设 src（零请求）；
 * - 加载失败显示可见占位，不静默留白；
 * - 复用父级传入的 className，保证版式与主题样式不变。
 */
export function LazyArtImage({
  src,
  alt,
  className,
  placeholderUrl,
  eager = false,
  fetchPriority,
  onLoaded,
}: {
  src: string | null | undefined
  alt: string
  className?: string
  /** 进入视口前铺的模糊占位（BLUR 变体，约 16px 宽，代价极小） */
  placeholderUrl?: string | null
  /** 首屏图（封面）立即加载，不等 observer */
  eager?: boolean
  /** 仅封面这类 LCP 图给 'high'；其余保持 auto（过度提升优先级会拖慢整体） */
  fetchPriority?: 'high' | 'low' | 'auto'
  onLoaded?: () => void
}) {
  const hostRef = useRef<HTMLSpanElement | null>(null)
  const [visible, setVisible] = useState(eager || !canObserve())
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (visible) return
    const host = hostRef.current
    if (!host) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            io.disconnect()
            return
          }
        }
      },
      { rootMargin: LAZY_ROOT_MARGIN },
    )
    io.observe(host)
    return () => io.disconnect()
  }, [visible])

  const showImage = visible && !!src && !failed

  return (
    <span ref={hostRef} className="art-img-host">
      {!failed && placeholderUrl && !loaded && (
        <span className="photo-blur" style={{ backgroundImage: `url(${placeholderUrl})` }} aria-hidden="true" />
      )}
      {failed && <PhotoFailMark alt={alt} />}
      {showImage && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src as string}
          alt={alt}
          decoding="async"
          fetchPriority={fetchPriority}
          className={`${className ?? ''}${loaded ? ' is-img-loaded' : ''}`}
          onLoad={() => {
            setLoaded(true)
            onLoaded?.()
          }}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  )
}

/** 图片加载失败占位（可见，不静默留白） */
export function PhotoFailMark({ alt }: { alt: string }) {
  return (
    <span className="photo-fallback" role="img" aria-label={`${alt}（照片加载失败）`}>
      <span className="photo-fallback-mark" aria-hidden="true" />
      <span className="photo-fallback-text">照片加载失败</span>
    </span>
  )
}
