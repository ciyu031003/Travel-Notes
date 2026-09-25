'use client'

import { CalendarDays, ImageIcon, Sparkles, Wallet } from 'lucide-react'
import { Button } from '@/components/mobile/Button'
import { Icon } from '@/components/mobile/Icon'
import { itineraryIconOf } from '@/lib/mobile/icon-system'
import { dayFullLabel, formatMoney, formatTime, rangeDays } from './format'
import type { ExpenseItem, TimelineDay, TravelInfoForDetail, ViewerPhotoLike } from './types'

/**
 * 「总览」tab —— 一屏看清这趟旅行有什么（对齐参考产品的总览页）。
 *
 * 每块都只是**摘要 + 一个出口**：相册横滑 → 打开沉浸视图；行程摘要 → 切到行程 tab；
 * 花销 → 切到花销 tab。不给重复操作按钮，避免与各 tab 的入口打架。
 */
export default function TravelOverviewTab({
  travel,
  days,
  expenseState,
  photos,
  onOpenViewer,
  onGoTab,
}: {
  travel: TravelInfoForDetail
  days: TimelineDay[]
  expenseState: { expenses: ExpenseItem[]; total: number; budget: number | null } | null
  photos: ViewerPhotoLike[]
  onOpenViewer: (photos: ViewerPhotoLike[], index: number) => void
  onGoTab: (tab: 'itinerary' | 'album' | 'expense') => void
}) {
  const daysCount = rangeDays(travel.startDate, travel.endDate)
  const itineraryCount = days.reduce((s, d) => s + d.itinerary.length, 0)
  const memoryCount = days.reduce((s, d) => s + d.memories.length, 0)
  const total = expenseState?.total ?? 0
  const budget = expenseState?.budget ?? null

  /** 行程摘要：取前 3 条，带上是第几天 */
  const upcoming = days
    .flatMap((d, i) => d.itinerary.map((it) => ({ it, dayLabel: dayFullLabel(d.date, i) })))
    .slice(0, 3)

  const latestMemories = days
    .flatMap((d) => d.memories)
    .filter((m) => m.content || m.title)
    .slice(-2)
    .reverse()

  const nothingYet = itineraryCount === 0 && memoryCount === 0 && photos.length === 0 && total === 0

  return (
    <div className="space-y-5 pb-4">
      {travel.description && (
        <p className="px-0.5 text-[14px] leading-relaxed text-[var(--m-muted)]">{travel.description}</p>
      )}

      {/* 规划摘要：几天 / 去过哪 / 几个行程 / 花了多少 —— 打开旅行先看到的就是它 */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-0.5 text-[13px] text-[var(--m-muted)]">
        {daysCount != null && <span className="tabular-nums">{daysCount} 天</span>}
        {travel.location && <span>· {travel.location}</span>}
        <span>· {itineraryCount} 个行程</span>
        <span>· {photos.length} 张照片</span>
        {total > 0 && <span>· 已花 ¥{formatMoney(total)}</span>}
      </div>

      {nothingYet && (
        <div className="m-card px-5 py-8 text-center">
          <Icon icon={Sparkles} size="lg" tone="faint" className="mx-auto" />
          <p className="mt-3 text-sm text-[var(--m-muted)]">这趟旅程还没有内容</p>
          <p className="mt-1 text-xs text-[var(--m-faint)]">安排行程、上传照片、记一笔花销，都会出现在这里</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button size="sm" onClick={() => onGoTab('itinerary')}>安排行程</Button>
            <Button size="sm" variant="secondary" onClick={() => onGoTab('album')}>上传照片</Button>
          </div>
        </div>
      )}

      {/* 相册横滑 */}
      {photos.length > 0 && (
        <section>
          <div className="m-section-title">
            <span>照片</span>
            <button
              type="button"
              onClick={() => onGoTab('album')}
              className="text-xs font-medium text-[var(--m-accent-strong)]"
            >
              全部 {photos.length} 张
            </button>
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {photos.slice(0, 12).map((p, i) => (
              <button
                key={(p.id ?? p.url) + '-' + i}
                type="button"
                onClick={() => onOpenViewer(photos, i)}
                className="relative h-28 w-28 flex-none overflow-hidden rounded-2xl bg-[var(--m-surface-2)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 行程摘要 */}
      <section className="m-card p-4">
        <div className="flex items-center gap-2">
          <Icon icon={CalendarDays} size="sm" className="text-[var(--m-accent-strong)]" />
          <span className="m-body font-semibold text-[var(--m-text)]">行程</span>
          <span className="text-[12px] text-[var(--m-muted)]">
            {days.length} 天 · {itineraryCount} 个安排
          </span>
          <button
            type="button"
            onClick={() => onGoTab('itinerary')}
            className="ml-auto text-[13px] font-medium text-[var(--m-accent-strong)]"
          >
            去安排
          </button>
        </div>
        {upcoming.length === 0 ? (
          <p className="mt-2.5 text-[13px] text-[var(--m-faint)]">还没有安排行程</p>
        ) : (
          <ul className="mt-2.5 space-y-2">
            {upcoming.map(({ it, dayLabel }) => (
              <li key={it.id} className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]">
                  <Icon icon={itineraryIconOf(it.type)} size="sm" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-[var(--m-text)]">{it.title}</span>
                  <span className="block text-[12px] text-[var(--m-faint)]">
                    {dayLabel}
                    {it.startTime ? ` · ${formatTime(it.startTime)}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 花销摘要 */}
      <section className="m-card p-4">
        <div className="flex items-center gap-2">
          <Icon icon={Wallet} size="sm" className="text-[var(--m-accent-strong)]" />
          <span className="m-body font-semibold text-[var(--m-text)]">花销</span>
          <button
            type="button"
            onClick={() => onGoTab('expense')}
            className="ml-auto text-[13px] font-medium text-[var(--m-accent-strong)]"
          >
            记一笔
          </button>
        </div>
        <div className="mt-2 flex items-end gap-2">
          <span className="text-[24px] font-bold tabular-nums text-[var(--m-text)]">¥{formatMoney(total)}</span>
          {budget != null && (
            <span className="pb-0.5 text-[12px] text-[var(--m-muted)]">/ 预算 ¥{formatMoney(budget)}</span>
          )}
        </div>
        {budget != null && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--m-surface-2)]">
            <div
              className="h-full rounded-full bg-[var(--m-accent)]"
              style={{ width: `${budget > 0 ? Math.min(100, Math.round((total / budget) * 100)) : 0}%` }}
            />
          </div>
        )}
      </section>

      {/* 最新回忆 */}
      {latestMemories.length > 0 && (
        <section>
          <div className="m-section-title">
            <span>最近记录</span>
            <span className="text-xs text-[var(--m-muted)]">共 {memoryCount} 条</span>
          </div>
          <div className="mt-2 space-y-2">
            {latestMemories.map((m) => (
              <div key={m.id} className="m-card p-3.5">
                <p className="text-[14px] font-medium text-[var(--m-text)]">{m.title}</p>
                {m.content && (
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--m-muted)]">
                    {m.content}
                  </p>
                )}
                {m.photos.length > 0 && (
                  <div className="mt-2 flex gap-1.5">
                    {m.photos.slice(0, 4).map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={p.id}
                        src={p.url}
                        alt=""
                        className="h-14 w-14 rounded-lg object-cover"
                        loading="lazy"
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {photos.length > 0 && (
        <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-[var(--m-faint)]">
          <Icon icon={ImageIcon} size="sm" />
          点任意照片进入沉浸相册
        </p>
      )}
    </div>
  )
}
