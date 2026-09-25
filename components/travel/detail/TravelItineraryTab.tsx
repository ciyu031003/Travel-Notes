'use client'

import { useState } from 'react'
import { CalendarDays, MapPin, Plus, Clock, Sparkles } from 'lucide-react'
import { ActionSheet } from '@/components/mobile/ActionSheet'
import { Button } from '@/components/mobile/Button'
import { Icon } from '@/components/mobile/Icon'
import { Loader } from '@/components/mobile/Loader'
import MemoryComposer from '@/components/travel/MemoryComposer'
import { AddDaySheet } from '@/components/travel/TravelTimeline'
import { itineraryIconOf } from '@/lib/mobile/icon-system'
import { apiUrl } from '@/lib/api-base'
import { toast } from '@/lib/mobile/toast-store'
import { dayDateLabel, dayFullLabel, formatTime } from './format'
import AddItinerarySheet from './AddItinerarySheet'
import type { TimelineDay, TimelineItineraryItem } from './types'

/**
 * 「行程」tab —— 每天干什么。
 *
 * 对齐参考产品（截图：广州市7日游）的三件事：
 *  1. **横向日期胶囊**（总览 | 10.01 周四 | 10.02 周五 …）切换查看范围；
 *  2. 每天一个区块、**行内「＋ 添加」**，而不是让用户去别处找入口；
 *  3. 条目是 **图标 + 标题 + 起止时间 + 备注** 的时间轴形态。
 *
 * 此前这块 UI 埋在详情页最底部（`TravelTimeline`），且被全屏相册盖住 ——
 * 真机反馈的「我该怎么去规划每天干什么，没有入口」就是它。
 */
export default function TravelItineraryTab({
  travelId,
  days,
  loading,
  onChanged,
}: {
  travelId: number
  days: TimelineDay[]
  loading: boolean
  onChanged: () => void
}) {
  /** 'all' = 总览（所有天）；数字 = 某一天 */
  const [scope, setScope] = useState<'all' | number>('all')
  const [addingDay, setAddingDay] = useState(false)
  const [editing, setEditing] = useState<{ dayId: number; item: TimelineItineraryItem } | null>(null)
  const [addTo, setAddTo] = useState<{ dayId: number } | null>(null)
  const [actionItem, setActionItem] = useState<{ dayId: number; item: TimelineItineraryItem } | null>(null)
  /** 在某一天「记一笔」（复用详情页同一个 MemoryComposer） */
  const [recordDay, setRecordDay] = useState<{ id: number; label: string; date: string | null } | null>(null)

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader />
      </div>
    )
  }

  if (days.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-sm text-[var(--m-muted)]">还没有可安排的日期</p>
        <p className="mt-1 text-xs text-[var(--m-faint)]">补一个日期，就能按天安排行程</p>
        <Button className="mt-4" icon={Plus} onClick={() => setAddingDay(true)}>
          添加一天
        </Button>
        <AddDaySheet travelId={travelId} onClose={() => setAddingDay(false)} onDone={onChanged} />
      </div>
    )
  }

  const visibleDays = scope === 'all' ? days : days.filter((d) => d.id === scope)

  return (
    <div className="pb-4">
      {/* 日期胶囊：总览 + 每天 */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 pt-1">
        <button
          type="button"
          aria-pressed={scope === 'all'}
          onClick={() => setScope('all')}
          className={'m-chip shrink-0 ' + (scope === 'all' ? 'm-chip-active' : '')}
        >
          总览
        </button>
        {days.map((d, i) => (
          <button
            key={d.id}
            type="button"
            aria-pressed={scope === d.id}
            onClick={() => setScope(d.id)}
            className={'m-chip shrink-0 ' + (scope === d.id ? 'm-chip-active' : '')}
          >
            {dayDateLabel(d.date, i)}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {visibleDays.map((day) => {
          const index = days.findIndex((d) => d.id === day.id)
          const empty = day.itinerary.length === 0
          return (
            <section key={day.id} className="m-card p-4">
              <div className="flex items-center gap-2">
                <Icon icon={CalendarDays} size="sm" className="text-[var(--m-accent-strong)]" />
                <span className="m-body font-semibold text-[var(--m-text)]">
                  {dayFullLabel(day.date, index)}
                </span>
                {/* 自动生成的「DAY 01」标题与左侧标签重复，只在用户真的写了名字时才显示 */}
                {day.title && !/^DAY\s*\d+$/i.test(day.title.trim()) && (
                  <span className="min-w-0 truncate text-[13px] text-[var(--m-muted)]">· {day.title}</span>
                )}
              </div>
              {day.summary && (
                <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--m-muted)]">{day.summary}</p>
              )}

              {/* 时间轴条目 */}
              {empty ? (
                <p className="mt-3 text-[13px] text-[var(--m-faint)]">这一天还没有安排</p>
              ) : (
                <ul className="mt-3 space-y-1">
                  {day.itinerary.map((it) => (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => setActionItem({ dayId: day.id, item: it })}
                        className="flex w-full items-start gap-3 rounded-xl px-1 py-2 text-left active:bg-[var(--m-surface-2)]"
                      >
                        <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]">
                          <Icon icon={itineraryIconOf(it.type)} size="sm" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="m-body block truncate font-medium text-[var(--m-text)]">{it.title}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[var(--m-muted)]">
                            {(it.startTime || it.endTime) && (
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                <Icon icon={Clock} size="sm" />
                                {formatTime(it.startTime)}
                                {it.endTime ? ` – ${formatTime(it.endTime)}` : ''}
                              </span>
                            )}
                            {it.locationName && (
                              <span className="inline-flex items-center gap-1">
                                <Icon icon={MapPin} size="sm" />
                                {it.locationName}
                              </span>
                            )}
                          </span>
                          {it.notes && (
                            <span className="mt-1 block whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--m-faint)]">
                              {it.notes}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* 这一天的回忆（"记一笔"写下的内容）：与行程同层展示，
                  否则用户记完一笔在按天视图里找不到它 */}
              {day.memories.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {day.memories.map((mem) => (
                    <li key={mem.id} className="rounded-xl bg-[var(--m-accent-soft)] px-3 py-2.5">
                      <p className="text-[13px] font-medium text-[var(--m-text)]">
                        {mem.title}
                        {mem.mood ? (
                          <span className="ml-1.5 text-[11px] font-normal text-[var(--m-muted)]">· {mem.mood}</span>
                        ) : null}
                      </p>
                      {mem.content && (
                        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--m-muted)]">
                          {mem.content}
                        </p>
                      )}
                      {mem.photos.length > 0 && (
                        <div className="mt-1.5 flex gap-1.5">
                          {mem.photos.slice(0, 4).map((p) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={p.id}
                              src={p.url}
                              alt=""
                              className="h-12 w-12 rounded-md object-cover"
                              loading="lazy"
                            />
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Plus}
                  onClick={() => setAddTo({ dayId: day.id })}
                >
                  添加行程
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Sparkles}
                  onClick={() => setRecordDay({ id: day.id, label: dayFullLabel(day.date, index), date: day.date })}
                >
                  记一笔
                </Button>
              </div>
            </section>
          )
        })}
      </div>

      <div className="mt-5 flex justify-center">
        <Button variant="ghost" icon={Plus} onClick={() => setAddingDay(true)}>
          加一天
        </Button>
      </div>

      {/* 抽屉与弹层 */}
      {addTo && (
        <AddItinerarySheet
          open
          travelId={travelId}
          days={days}
          defaultDayId={addTo.dayId}
          onClose={() => setAddTo(null)}
          onDone={onChanged}
        />
      )}
      {editing && (
        <AddItinerarySheet
          open
          travelId={travelId}
          days={days}
          defaultDayId={editing.dayId}
          editing={editing}
          onClose={() => setEditing(null)}
          onDone={onChanged}
        />
      )}
      <ActionSheet
        open={Boolean(actionItem)}
        title={actionItem?.item.title}
        onClose={() => setActionItem(null)}
        options={[
          {
            label: '编辑这条行程',
            onClick: () => {
              if (actionItem) setEditing(actionItem)
            },
          },
          {
            label: '删除这条行程',
            destructive: true,
            onClick: async () => {
              if (!actionItem) return
              const res = await fetch(apiUrl(`/api/travels/${travelId}/itinerary/${actionItem.item.id}`), {
                method: 'DELETE',
                credentials: 'include',
              }).catch(() => null)
              if (res && res.ok) {
                toast.success('已删除')
                onChanged()
              } else {
                toast.error('删除失败')
              }
            },
          },
        ]}
      />
      {recordDay && (
        <MemoryComposer
          travelId={travelId}
          dayId={recordDay.id}
          dayLabel={recordDay.label}
          dayDate={recordDay.date}
          onClose={() => setRecordDay(null)}
          onDone={onChanged}
        />
      )}
      {addingDay && (
        <AddDaySheet travelId={travelId} onClose={() => setAddingDay(false)} onDone={onChanged} />
      )}
    </div>
  )
}
