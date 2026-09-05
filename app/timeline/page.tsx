'use client'

import Link from 'next/link'
import { MapPin, Sparkles, CalendarDays } from 'lucide-react'
import TimelineCover from '@/components/timeline/TimelineCover'
import AsyncState from '@/components/AsyncState'
import { formatDate } from '@/lib/utils'
import { useApi } from '@/lib/client/use-api'
import { apiUrl } from '@/lib/api-base'
import { travelDetailHref } from '@/lib/routes'

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

interface TimelineApiData {
  years: TimelineYear[]
}

export default function TimelinePage() {
  // 阶段 A · A2：统一取数层
  const { data, error, loading } = useApi<TimelineApiData>(apiUrl('/api/timeline'))
  const years = data?.years ?? []

  if (error) {
    return <AsyncState variant="error" message={error} title="时间线加载失败" />
  }
  if (loading) {
    return <AsyncState variant="loading" message="正在整理你的旅行时间线…" />
  }

  const allEntries = years.flatMap((y) => y.entries)
  const travelCount = allEntries.filter((e) => e.type === 'travel').length
  const memoryCount = allEntries.length - travelCount

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(228,180,120,0.16),transparent_72%)]" />

      <div className="relative container-custom py-10 md:py-14">
        <header className="mb-12 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-travel-inkStrong dark:text-shell-text md:text-5xl">走过的时光</h1>
          <div className="mx-auto mt-4 flex items-center justify-center gap-3">
            <span className="h-px w-10 bg-travel-bloom/60" />
            <span className="text-sm text-travel-ink/70 dark:text-shell-muted">按年份回顾每一段旅行与回忆</span>
            <span className="h-px w-10 bg-travel-bloom/60" />
          </div>
          <p className="mt-3 text-xs tracking-[0.28em] text-travel-accent/80 dark:text-travel-bloom/80">
            {travelCount} 段旅程 · {memoryCount} 段回忆
          </p>
        </header>

        {years.length === 0 ? (
          <div className="relative mx-auto max-w-xl rounded-2xl border border-travel-line/70 bg-white/90 px-6 py-14 text-center shadow-[0_18px_40px_-28px_rgba(90,102,112,0.4)] dark:bg-shell-surface/90">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-travel-sakura/60 text-travel-accent">
              <Sparkles className="h-7 w-7" />
            </div>
            <p className="mt-4 text-base font-medium text-travel-inkStrong dark:text-shell-text">时间线还是空的</p>
            <p className="mt-1 text-sm text-travel-ink/60 dark:text-shell-muted">从第一段旅行开始，慢慢收藏路上的光</p>
          </div>
        ) : (
          <div className="relative mx-auto max-w-3xl">
            {years.map(({ year, entries }) => (
              <section key={year} className="relative mb-12 pl-8 md:pl-12">
                <div className="absolute bottom-0 left-0 top-0 w-px bg-gradient-to-b from-travel-bloom via-travel-sakura to-transparent dark:from-travel-bloom/60 dark:via-travel-sakura/25" />
                <h2 className="relative mb-6 flex items-center gap-3">
                  <span className="absolute -left-8 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-travel-accentSoft shadow ring-4 ring-white dark:ring-[#12161C] md:-left-12" />
                  <span className="text-2xl font-bold tracking-tight text-travel-inkStrong dark:text-shell-text md:text-3xl">{year}</span>
                  <span className="h-px flex-1 bg-gradient-to-r from-travel-sakura/70 to-transparent" />
                </h2>

                <div className="space-y-5">
                  {entries.map((entry) => (
                    <div key={entry.type + '-' + entry.id} className="group relative">
                      <span className="absolute -left-8 top-7 h-3 w-3 -translate-x-1/2 rounded-full bg-[var(--surface,white)] ring-2 ring-travel-bloom/70 dark:bg-[#161B22] md:-left-12" />
                      {entry.type === 'travel' && entry.slug ? (
                        <Link
                          href={travelDetailHref(entry.slug)}
                          className="block rounded-2xl border border-travel-line/70 bg-white/90 p-5 shadow-[0_14px_34px_-24px_rgba(90,102,112,0.5)] transition-all duration-300 hover:-translate-y-0.5 hover:border-travel-bloom/70 hover:shadow-[0_20px_44px_-24px_rgba(168,95,58,0.4)] dark:bg-shell-surface/90"
                        >
                          <TimelineItem entry={entry} />
                        </Link>
                      ) : (
                        <div className="rounded-2xl border border-travel-line/70 bg-white/80 p-5 shadow-[0_14px_34px_-26px_rgba(90,102,112,0.45)] transition-all duration-300 hover:-translate-y-0.5 hover:border-travel-bloom/50 dark:bg-shell-surface/80">
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
        <h3 className="text-base font-semibold text-travel-inkStrong dark:text-shell-text group-hover:text-travel-accent transition-colors">{entry.title}</h3>
        {entry.description && <p className="text-sm text-travel-ink/70 dark:text-shell-muted mt-1 line-clamp-2">{entry.description}</p>}
        {(entry.location || entry.mood) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entry.location && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-travel-sakura/40 dark:bg-white/5 text-travel-ink/70 dark:text-shell-muted">
                <MapPin className="w-3 h-3" />
                {entry.location}
              </span>
            )}
            {entry.mood && <span className="text-xs px-2 py-0.5 rounded-full bg-travel-sakura/40 dark:bg-white/5 text-travel-ink/70 dark:text-shell-muted">{entry.mood}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
