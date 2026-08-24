'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MapPin, Sparkles, CalendarDays } from 'lucide-react'
import TimelineCover from '@/components/timeline/TimelineCover'
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
    return <div className="container-custom flex min-h-[60vh] items-center justify-center text-gray-500">{error}</div>
  }
  if (!years) {
    return <div className="container-custom flex min-h-[60vh] items-center justify-center text-gray-500">加载中…</div>
  }

  return (
    <div className="container-custom py-10 md:py-14">
      <header className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-travel-sakura/50 dark:bg-travel-accent/20 text-travel-accent dark:text-travel-accentSoft rounded-full text-sm mb-4">
          <CalendarDays className="w-4 h-4" />
          <span>旅行时间线</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-100">走过的时光</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">按年份回顾每一段旅行与回忆</p>
      </header>

      {years.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">
          <Sparkles className="w-10 h-10 mx-auto mb-3 text-travel-sakura" />
          <p>时间线还是空的，从第一段旅行开始记录吧</p>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto">
          {years.map(({ year, entries }) => (
            <section key={year} className="relative pl-8 md:pl-12 mb-10">
              <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-travel-sakura via-travel-sakura to-transparent dark:from-travel-accentStrong/60 dark:via-travel-accentStrong/30" />
              <h2 className="relative inline-flex items-center gap-2 mb-6">
                <span className="absolute -left-8 md:-left-12 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-travel-accentSoft border-4 border-white dark:border-gray-900 shadow" />
                <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{year}</span>
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
          <span className={'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ' + (isTravel ? 'bg-travel-sakura/50 dark:bg-travel-accent/20 text-travel-accent dark:text-travel-accentSoft' : 'bg-purple-50 dark:bg-purple-900/30 text-purple-500 dark:text-purple-300')}>
            {isTravel ? <MapPin className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
            {isTravel ? '旅行' : '回忆'}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(entry.date)}</span>
          {!isTravel && entry.travelTitle && <span className="text-xs text-gray-400 dark:text-gray-500">· {entry.travelTitle}</span>}
        </div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 group-hover:text-travel-accent transition-colors">{entry.title}</h3>
        {entry.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{entry.description}</p>}
        {(entry.location || entry.mood) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entry.location && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">
                <MapPin className="w-3 h-3" />
                {entry.location}
              </span>
            )}
            {entry.mood && <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">{entry.mood}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
