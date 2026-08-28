'use client'

import { useCallback, useEffect, useRef } from 'react'
import { BookOpen, Camera, MapPin } from 'lucide-react'
import type { Book } from '@/components/album/travel-book/TravelBook'
import './postcard.css'

// 倾斜强度（度）
const TILT_X = 9
const TILT_Y = 11
// 波浪滚动附加（度）
const ROLL = 1.4
// 静止随机倾斜（东倒西歪但不重叠）：伪随机哈希混合正负角度，
// 让连续 id 也能出现左倾/右倾交错，而不是全朝同一方向倒。
function baseRot(id: number): number {
  const t = Math.abs(Math.sin(id * 12.9898) * 43758.5453) % 1
  return Math.round((t * 13 - 6.5) * 10) / 10 // -6.5..6.5 度
}

function fmtDate(v: string | null): string {
  if (!v) return ''
  try {
    const d = new Date(v)
    if (isNaN(d.getTime())) return ''
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return ''
  }
}

const TRAVEL_TYPE_LABELS: Record<string, string> = {
  ALONE: '独旅', COUPLE: '情侣', FAMILY: '家庭', FRIENDS: '朋友', BFF: '闺蜜/兄弟', GROUP: '结伴', OTHER: '其他',
}

export default function PostcardCard({ book, onOpen }: { book: Book; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const rot = baseRot(book.travelId || 0)
  const reducedRef = useRef(false)

  useEffect(() => {
    reducedRef.current = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  }, [])

  const onMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current
    if (!el || reducedRef.current) return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    const rx = (0.5 - py) * TILT_X * 2
    const ry = (px - 0.5) * TILT_Y * 2
    const rz = (px - 0.5) * 2 * ROLL
    el.style.transition = 'transform 45ms linear'
    el.style.transform = `perspective(920px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotate(${(rot + rz).toFixed(2)}deg) translateY(-3px)`
  }, [rot])

  const onLeave = useCallback(() => {
    const el = ref.current
    if (!el || reducedRef.current) return
    el.style.transition = 'transform 680ms cubic-bezier(0.16,1,0.3,1)'
    el.style.transform = `rotate(${rot}deg)`
  }, [rot])

  useEffect(() => {
    const el = ref.current
    return () => {
      if (el) el.style.transform = ''
    }
  }, [])

  const cover = book.coverThumb || book.coverPreview
  const date = fmtDate(book.startDate)

  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      className="pcard"
      style={{ '--rot': rot + 'deg' } as React.CSSProperties}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      aria-label={`打开《${book.title}》旅行画册`}
    >
      {/* 穿孔纸底 */}
      <span className="pcard-frame" aria-hidden="true" />

      {/* 内容层 */}
      <span className="pcard-inner">
        <span className="pcard-media">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt={book.title} loading="lazy" />
          ) : (
            <span className="pcard-empty"><Camera className="h-8 w-8" /></span>
          )}
        </span>
        <span className="pcard-body">
          <span className="pcard-title">{book.title}</span>
          <span className="pcard-meta">
            {book.location && <span><MapPin className="h-3 w-3" />{book.location}</span>}
            {date && <span>{date}</span>}
          </span>
          <span className="pcard-thin">
            <span><BookOpen className="h-3 w-3" />{book.dayCount} 章</span>
            <span><Camera className="h-3 w-3" />{book.photoCount} 图</span>
            {book.travelType && <span className="pcard-pill">{TRAVEL_TYPE_LABELS[book.travelType] || book.travelType}</span>}
          </span>
        </span>
      </span>
    </button>
  )
}
