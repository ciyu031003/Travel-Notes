'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { X, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { IconButton } from '@/components/mobile/IconButton'

export interface ViewerPhoto {
  id?: number
  url: string
}

/**
 * 全屏沉浸相册 —— **二级视图，不是详情页本身**。
 *
 * 这是本次重构里最关键的一处修复。此前 `TravelDetailClient` 只要旅行里有图就
 * 无条件渲染成 `fixed inset-0 bg-black z-50` 且**没有关闭按钮**，于是同一页里的
 * 「记录今日 / 编辑信息 / 记一笔 / 添加行程」全部被盖在 z-50 之下、物理上点不到 ——
 * 真机反馈的「上传/规划/修改三个入口都找不到」的总根因。
 *
 * 现在它必须由「相册」tab 显式打开（`open`），并且：
 *  · 左上角有明确的关闭按钮（不是只有系统返回键）
 *  · Android 物理返回键 / 浏览器返回 先关闭查看器，而不是直接离开详情页（pushState + popstate）
 *  · Esc 关闭
 */
export default function TravelPhotoViewer({
  open,
  photos,
  startIndex = 0,
  title,
  location,
  date,
  onClose,
  onSetCover,
}: {
  open: boolean
  photos: ViewerPhoto[]
  startIndex?: number
  title?: string
  location?: string
  date?: string
  onClose: () => void
  /** 传入即在沉浸视图里给出「设为封面」（照片必须带 media id） */
  onSetCover?: (photo: ViewerPhoto) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(startIndex)
  const [chromeVisible, setChromeVisible] = useState(true)
  /** 是否已压入一条历史记录（决定关闭时是 history.back() 还是直接 onClose） */
  const pushedRef = useRef(false)
  /** 避免 popstate 与关闭按钮重复触发 onClose */
  const closingRef = useRef(false)

  const close = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    if (pushedRef.current) {
      // 让 popstate 处理关闭，保持历史栈干净
      window.history.back()
      return
    }
    onClose()
  }, [onClose])

  // 打开：压一条历史 + 监听返回
  useEffect(() => {
    if (!open) return
    setIndex(Math.max(0, Math.min(startIndex, Math.max(0, photos.length - 1))))
    setChromeVisible(true)
    closingRef.current = false
    try {
      window.history.pushState({ travelPhotoViewer: true }, '')
      pushedRef.current = true
    } catch {
      pushedRef.current = false
    }
    const onPop = () => {
      pushedRef.current = false
      if (!closingRef.current) closingRef.current = true
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startIndex, photos.length])

  // 定位到起始页（打开时一次性）
  useEffect(() => {
    if (!open) return
    const el = containerRef.current
    if (!el) return
    el.scrollTop = Math.max(0, startIndex) * el.clientHeight
  }, [open, startIndex])

  if (!open || photos.length === 0) return null

  const go = (next: number) => {
    const el = containerRef.current
    if (!el) return
    const target = Math.max(0, Math.min(next, photos.length - 1))
    el.scrollTo({ top: target * el.clientHeight, behavior: 'smooth' })
    setIndex(target)
  }

  // z-[110]：低于 ToastHost(120) 与「记一笔」抽屉(130)，高于底部 tab(40) 与普通抽屉(95)
  return (
    <div className="fixed inset-0 z-[110] bg-black" role="dialog" aria-modal="true" aria-label="旅行相册">
      {/* 顶栏：明确的关闭入口 + 页码 */}
      <div
        className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-2 pb-2"
        style={{
          paddingTop: 'max(8px, env(safe-area-inset-top))',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)',
        }}
      >
        <button
          type="button"
          onClick={close}
          aria-label="关闭相册"
          className="flex h-11 items-center gap-1 rounded-full px-3 text-[15px] font-medium text-white active:scale-95"
        >
          <Icon icon={ArrowLeft} size="sm" />
          返回
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-[13px] text-white/80">{title}</span>
        {onSetCover && photos[index]?.id != null && (
          <button
            type="button"
            onClick={() => onSetCover(photos[index])}
            className="shrink-0 rounded-full px-3 py-2 text-[13px] font-medium text-white active:scale-95"
          >
            设为封面
          </button>
        )}
        <IconButton icon={X} label="关闭" variant="plain" onClick={close} className="text-white" />
      </div>

      <div
        ref={containerRef}
        className="h-full snap-y snap-mandatory overflow-y-scroll"
        onScroll={(e) => {
          const el = e.currentTarget
          const h = el.clientHeight || 1
          const next = Math.round(el.scrollTop / h)
          if (next !== index) setIndex(next)
        }}
        onClick={() => setChromeVisible((v) => !v)}
      >
        {photos.map((p, i) => (
          <section key={(p.id ?? 'p') + '-' + i} className="relative flex h-full snap-start items-center justify-center">
            <Image
              src={p.url}
              alt={`${title || '旅行照片'} - ${i + 1}`}
              fill
              sizes="100vw"
              priority={i === index}
              className="object-contain"
              draggable={false}
            />
          </section>
        ))}
      </div>

      {chromeVisible && (
        <>
          {/* 底部：地点 / 日期 / 页码 */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-5 text-white"
            style={{
              paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
              background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)',
            }}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-6 text-[13px] text-white/85">
              {location && <span>{location}</span>}
              {date && <span>{new Date(date).toLocaleDateString('zh-CN')}</span>}
              <span className="ml-auto tabular-nums">
                {index + 1} / {photos.length}
              </span>
            </div>
          </div>

          {photos.length > 1 && (
            <>
              <button
                type="button"
                aria-label="上一张"
                onClick={(e) => { e.stopPropagation(); go(index - 1) }}
                disabled={index === 0}
                className="absolute left-2 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur-md disabled:opacity-0"
              >
                <Icon icon={ChevronLeft} size="md" />
              </button>
              <button
                type="button"
                aria-label="下一张"
                onClick={(e) => { e.stopPropagation(); go(index + 1) }}
                disabled={index === photos.length - 1}
                className="absolute right-2 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur-md disabled:opacity-0"
              >
                <Icon icon={ChevronRight} size="md" />
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
