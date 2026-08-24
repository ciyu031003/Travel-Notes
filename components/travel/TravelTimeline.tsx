'use client'

import { useEffect, useState, useCallback } from 'react'
import { CalendarDays, MapPin, Camera, Sparkles, Loader2 } from 'lucide-react'
import { apiUrl } from '@/lib/api-base'
import MemoryPhotoPicker from './MemoryPhotoPicker'

interface TimelineDay {
  id: number
  date: string | null
  title: string | null
  summary: string | null
  sortOrder: number
  itinerary: { id: number; title: string; startTime: string | null; endTime: string | null; type: string; notes: string | null; locationName: string | null }[]
  memories: { id: number; title: string; content: string | null; mood: string | null; happenedAt: string | null; photos: { id: number; url: string }[] }[]
  photos: { id: number; url: string }[]
}

const MOOD_LABEL: Record<string, string> = {
  开心: '开心', 幸福: '幸福', 想念: '想念', 期待: '期待', 平静: '平静', 累: '累了',
}

function formatDay(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return dateStr
  }
}

/**
 * v3.1 M1-A4：旅行按天叙事时间线（天=章节：日期 → 行程 → 照片 → 回忆）。
 */
export default function TravelTimeline({ travelId }: { travelId: number }) {
  const [days, setDays] = useState<TimelineDay[] | null>(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(() => {
    let alive = true
    fetch(apiUrl(`/api/travels/${travelId}/timeline`), { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return
        if (j?.timeline?.days) setDays(j.timeline.days)
        else setError(j?.error || '时间线加载失败')
      })
      .catch(() => { if (alive) setError('网络错误') })
    return () => { alive = false }
  }, [travelId])

  useEffect(() => {
    const cleanup = load()
    return cleanup
  }, [load, reloadKey])

  if (error) return null // 静默降级：时间线失败不阻塞详情页
  if (days === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-travel-ink/40">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">时间线加载中...</span>
      </div>
    )
  }
  if (days.length === 0) return null

  return (
    <section className="mt-14">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl font-bold text-travel-ink flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-travel-bloom" />
          按天回顾
        </h2>
        <span className="text-xs text-travel-ink/50">{days.length} 天</span>
      </div>

      <div className="relative">
        {/* 时间线竖线 */}
        <span className="absolute left-[9px] top-2 bottom-2 w-px bg-gradient-to-b from-travel-bloom/60 via-travel-mist/50 to-transparent" aria-hidden="true" />

        <div className="space-y-8">
          {days.map((day, idx) => (
            <div key={day.id} className="relative pl-8">
              {/* 节点 */}
              <span className="absolute left-0 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-travel-bloom/50 bg-travel-cream">
                <span className="h-2 w-2 rounded-full bg-travel-bloom" />
              </span>

              <div className="rounded-2xl border border-travel-dim/60 bg-white/60 p-5 shadow-sm">
                {/* 章节头 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-travel-ink">DAY {String(idx + 1).padStart(2, '0')}</span>
                  {day.date && <span className="text-xs text-travel-ink/50">{formatDay(day.date)}</span>}
                  {day.title && <span className="text-sm font-medium text-travel-ink/80">· {day.title}</span>}
                </div>
                {day.summary && <p className="mt-1.5 text-sm text-travel-ink/70 leading-relaxed">{day.summary}</p>}

                {/* 行程项 */}
                {day.itinerary.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {day.itinerary.map((it) => (
                      <span key={it.id} className="inline-flex items-center gap-1 rounded-full bg-travel-mist/40 px-2.5 py-1 text-xs text-travel-ink/80">
                        <MapPin className="h-3 w-3 text-travel-bloom" />
                        {it.title}
                        {it.locationName ? `（${it.locationName}）` : ''}
                      </span>
                    ))}
                  </div>
                )}

                {/* 照片墙 */}
                {day.photos.length > 0 && (
                  <div className="mt-3 grid grid-cols-4 gap-1.5">
                    {day.photos.slice(0, 8).map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={p.id} src={p.url} alt="" className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
                    ))}
                    {day.photos.length > 8 && (
                      <div className="flex aspect-square items-center justify-center rounded-lg bg-travel-sakura/50 text-xs text-travel-ink/70">
                        +{day.photos.length - 8}
                      </div>
                    )}
                  </div>
                )}

                {/* 回忆 */}
                {day.memories.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {day.memories.map((mem) => (
                      <div key={mem.id} className="flex items-start gap-2 rounded-xl bg-travel-sakura/30 px-3 py-2.5">
                        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-travel-bloom" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-travel-ink">
                            {mem.title}
                            {mem.mood && <span className="ml-1.5 text-xs font-normal text-travel-ink/50">· {MOOD_LABEL[mem.mood] || mem.mood}</span>}
                          </p>
                          {mem.content && <p className="mt-0.5 text-sm text-travel-ink/70 leading-relaxed line-clamp-3 whitespace-pre-wrap">{mem.content}</p>}
                          {mem.photos.length > 0 && (
                            <div className="mt-1.5 flex gap-1">
                              {mem.photos.slice(0, 3).map((p) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={p.id} src={p.url} alt="" className="h-12 w-12 rounded-md object-cover" loading="lazy" />
                              ))}
                            </div>
                          )}
                          <MemoryPhotoPicker memoryId={mem.id} onDone={() => setReloadKey((k) => k + 1)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {day.itinerary.length === 0 && day.photos.length === 0 && day.memories.length === 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-travel-ink/40">
                    <Camera className="h-3 w-3" /> 这一天还没有记录
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
