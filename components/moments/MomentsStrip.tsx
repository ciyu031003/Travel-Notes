'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Sparkles, ArrowRight } from 'lucide-react'

interface MomentItem {
  id: number
  content: string
  tags: string[] | null
  createdAt: string
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function MomentsStrip() {
  const [moments, setMoments] = useState<MomentItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/moments?page=1&pageSize=3')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.data?.data) setMoments(json.data.data)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return null
  if (moments.length === 0) return null

  return (
    <section className="px-3 pb-8 md:px-5">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-2xl border border-[#E8DDD8]/70 bg-white/85 p-6 shadow-[0_10px_28px_-12px_rgba(90,102,112,0.18)] md:p-8">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="flex items-center gap-2.5 text-base font-semibold text-[#3D4852]">
              <Sparkles className="h-[18px] w-[18px] text-[#A64E61]" />
              碎碎念
            </h2>
            <Link
              href="/moments"
              className="inline-flex items-center gap-1 text-xs text-[#A64E61] transition-colors hover:text-[#8B3A4C]"
            >
              全部
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {moments.map((moment) => (
              <Link
                key={moment.id}
                href="/moments"
                className="group block rounded-xl border border-[#E8DDD8]/60 bg-white p-4 transition-all hover:border-[#E8B8C2]/70 hover:shadow-md"
              >
                <p className="text-sm leading-relaxed text-[#3D4852] line-clamp-3 whitespace-pre-wrap break-words">
                  {moment.content}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[11px] text-[#5A6670]">{timeAgo(moment.createdAt)}</span>
                  {moment.tags && moment.tags.length > 0 && (
                    <span className="rounded-full bg-[#F5DCE0]/50 px-1.5 py-0.5 text-[10px] text-[#A64E61]">
                      #{moment.tags[0]}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
