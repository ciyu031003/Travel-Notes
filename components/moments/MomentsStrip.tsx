'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react'

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
        if (!cancelled && json?.data) setMoments(json.data)
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
    <section className="px-3 md:px-5 pb-6">
      <div className="max-w-6xl mx-auto">
        <div className="relative bg-gradient-to-br from-white/90 to-[#FDF3F5]/90 rounded-3xl p-6 md:p-8 shadow-lg border border-[#E8B8C2]/25 overflow-hidden">
          <div className="absolute top-0 left-0 w-40 h-40 bg-[#F5DCE0]/30 rounded-full blur-3xl" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-5">
              <div className="inline-flex items-center gap-2 text-[#5A4A3A] text-sm font-medium">
                <Sparkles className="w-4 h-4 text-[#E8B8C2]" />
                <span>碎碎念</span>
              </div>
              <Link
                href="/moments"
                className="inline-flex items-center gap-1 text-xs text-[#8B4A5A] hover:text-[#C495A0] transition-colors"
              >
                全部
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              {moments.map((moment) => (
                <Link
                  key={moment.id}
                  href="/moments"
                  className="group bg-white/70 hover:bg-white rounded-2xl p-4 border border-[#E8B8C2]/20 transition-all hover:shadow-md"
                >
                  <p className="text-sm text-[#3D4852] leading-relaxed line-clamp-3 whitespace-pre-wrap break-words">
                    {moment.content}
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-[11px] text-[#8B7355]/50">{timeAgo(moment.createdAt)}</span>
                    {moment.tags && moment.tags.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#F5DCE0]/40 text-[#8B4A5A]">
                        #{moment.tags[0]}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
