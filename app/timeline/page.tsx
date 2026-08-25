'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MapPin, Sparkles, CalendarDays } from 'lucide-react'
import TimelineCover from '@/components/timeline/TimelineCover'
import AsyncState from '@/components/AsyncState'
import { formatDate } from '@/lib/utils'
import { apiUrl } from '@/lib/api-base'

interface TimelineEntry {
  id: number
  type: 'travel' | 'memory'
  title: string
  date: string
  description?: string
  location?: string | null
  slug?: string
  cover?: string | null
  travelTitle?: string
  mood?: string | null
}

interface TimelineYear {
  year: number
  entries: TimelineEntry[]
}

export default function TimelinePage() {
  const [years, setYears] = useState<TimelineYear[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(apiUrl('/api/timeline'))
      .then((r) => r.json())
      .then((j) => {
        if (j && j.error) setError(String(j.error))
        else setYears(j?.years || [])
      })
      .catch(() => setError('网络错误，请稍后重试'))
  }, [])

  if (error) {
    return <AsyncState variant="error" message={error} title="时间线加载失败" />
  }
  if (!years) {
    return <AsyncState variant="loading" message="正在整理你的旅行时间线…" />
  }

  return (
    <div className="container-custom py-10 md:py-14">
      <header className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-travel-sakura/50 dark:bg-travel-accent/20 text-travel-accent dark:text-travel-accentSoft rounded-full text-sm mb-4">
          <CalendarDays className="w-4 h-4" />
          <span>旅行时间线</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-travel-inkStrong dark:text-[#F1EFEA]">走过的时光</h1>
        <p className="text-travel-ink/70 dark:text-shell-muted mt-2">按年份回顾每一段旅行与回忆</p>
      </header>

      {years.length === 0 ? (
        <div className="card p-12 text-center text-travel-ink/60">
          <Sparkles className="w-10 h-10 mx-auto mb-3 text-travel-accentSoft" />
          <p>时间线还是空的，从第一段旅行开始记录吧</p>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto">
          {years.map(({ year, entries }) => (
            <section key={year} className="relative pl-8 md:pl-12 mb-10">
              <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-travel-sakura via-travel-sakura to-transparent dark:from-travel-accentStrong/60 dark:via-travel-accentStrong/30" />
              <h2 className="relative inline-flex items-center gap-2 mb-6">
                <span className="absolute -left-8 md:-left-12 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-travel-accentSoft border-4 border-white dark:border-[#0A0A0A] shadow" />
                <span className="text-2xl font-bold text-travel-inkStrong dark:text-[#F1EFEA]">{year}</span>
              </h2>

              <div className="space-y-4">
                {entries.map((entry) => (
                  <div key={entry.type + '-' + entry.id} className="group">
                    {entry.type === 'travel' && entry.slug ? (
                      <Link href={'/travel/' + entry.slug} className="card ribbon-hover block p-5 hover:border-travel-sakura dark:hover:border-travel-accentStrong transition-colors">
                        <TimelineItem entry={entry} />
                      </Link>
                    ) : (
                      <div className="card p-5">
                        <TimelineItem entry={entry} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function TimelineItem({ entry }: { entry: TimelineEntry }) {
  const isTravel = entry.type === 'travel'
  return (
    <div className="flex gap-4">
      {isTravel && entry.cover && (
        <div className="relative hidden h-20 w-24 shrink-0 overflow-hidden rounded-xl sm:block">
          <TimelineCover src={entry.cover} alt={entry.title} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-2">
          <span className={'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ' + (isTravel ? 'bg-travel-sakura/50 dark:bg-travel-accent/20 text-travel-accent dark:text-travel-accentSoft' : 'bg-travel-mist/50 dark:bg-travel-sky/20 text-travel-sky dark:text-travel-sky')}>
            {isTravel ? <MapPin className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
            {isTravel ? '旅行' : '回忆'}
          </span>
          <span className="text-xs text-travel-ink/50 dark:text-shell-muted">{formatDate(entry.date)}</span>
          {!isTravel && entry.travelTitle && <span className="text-xs text-travel-ink/50 dark:text-shell-muted">· {entry.travelTitle}</span>}
        </div>
        <h3 className="text-base font-semibold text-travel-inkStrong dark:text-[#F1EFEA] group-hover:text-travel-accent transition-colors">{entry.title}</h3>
        {entry.description && <p className="text-sm text-travel-ink/70 dark:text-shell-muted mt-1 line-clamp-2">{entry.description}</p>}
        {(entry.location || entry.mood) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entry.location && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-travel-sakura/40 dark:bg-white/5 text-travel-ink/70 dark:text-shell-muted">
                <MapPin className="w-3 h-3" />
                {entry.location}
              </span>
            )}
            {entry.mood && <span className="text-[11px] px-2 py-0.5 rounded-full bg-travel-sakura/40 dark:bg-white/5 text-travel-ink/70 dark:text-shell-muted">{entry.mood}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
