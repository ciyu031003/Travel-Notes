'use client'

import { useCallback, useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import type { BookSpread } from '@/lib/modules/album/book/types'

/**
 * 缩略图胶片条（2026-11-28 · U3）
 * ---------------------------------------------------------------------------
 * 阅读器的「我在哪 / 想去哪」两条信息原来只有底部的 03 / 12 文本，缺少空间感。
 * 这里给一条真正的胶片条：
 *
 *   · 一屏一个缩略块（与对开口径一致），缩略图取该对开第一张照片；
 *   · 当前页的指示器用 motion 的 layoutId 玻璃框——翻页时它自己滑到新位置
 *     （纯 transform 补间，不触发重排）；
 *   · 翻页时胶片条自动把当前项居中（直接改 scrollLeft，不用 scrollIntoView，
 *     避免把整页/台面一起滚走），reduce-motion 下改成瞬时跳转；
 *   · 点击任意缩略图 = 跳页（交给 page-flip 的绝对跳转，不是逐页翻），
 *     章节直达/Home/End 与它共用同一个 goToSpread。
 *
 * 性能：缩略图一律 loading="lazy" + decoding="async"，只有可见的几块会发请求；
 * 整个条子只读 spreads 的封面字段，照片加载不会改变页面集合（不重建整本书）。
 */
export default function BookFilmstrip({
  spreads,
  current,
  onJump,
  reduceMotion,
}: {
  spreads: BookSpread[]
  /** 当前对开序号 */
  current: number
  onJump: (index: number) => void
  /** reduce-motion：指示器不补间、滚动不缓动 */
  reduceMotion: boolean
}) {
  const stripRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  // 当前页居中：改 scrollLeft 而不是 scrollIntoView，避免带动整页滚动
  useEffect(() => {
    const strip = stripRef.current
    const item = itemRefs.current[current]
    if (!strip || !item) return
    const target = item.offsetLeft - strip.clientWidth / 2 + item.offsetWidth / 2
    const left = Math.max(0, target)
    if (typeof strip.scrollTo === 'function') {
      strip.scrollTo({ left, behavior: reduceMotion ? 'auto' : 'smooth' })
    } else {
      strip.scrollLeft = left
    }
  }, [current, reduceMotion])

  const setItemRef = useCallback((index: number) => {
    return (el: HTMLButtonElement | null) => {
      itemRefs.current[index] = el
    }
  }, [])

  if (spreads.length <= 1) return null

  return (
    <div className="book-filmstrip-wrap">
      <div
        ref={stripRef}
        className="book-filmstrip"
        role="group"
        aria-label="快速翻页"
      >
        {spreads.map((spread, index) => {
          const active = index === current
          const photo = spread.left?.photos?.[0] ?? spread.right?.photos?.[0] ?? null
          const thumb = photo ? photo.thumbnailUrl || photo.previewUrl : null
          const label = '第 ' + (index + 1) + ' 页' + (spread.left?.title || spread.right?.title ? '：' + (spread.left?.title || spread.right?.title) : '')
          return (
            <button
              key={spread.id}
              ref={setItemRef(index)}
              type="button"
              className="book-filmstrip__item"
              data-empty={thumb ? 'false' : 'true'}
              aria-label={label}
              aria-current={active ? 'true' : undefined}
              onClick={() => onJump(index)}
            >
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" loading="lazy" decoding="async" />
              ) : (
                <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              )}
              {active && (
                <motion.span
                  aria-hidden="true"
                  className="book-filmstrip__pill"
                  layoutId="book-filmstrip-pill"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 520, damping: 42, mass: 0.6 }
                  }
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
