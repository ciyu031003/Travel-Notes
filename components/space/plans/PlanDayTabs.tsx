'use client'

/**
 * 天切换器（吸顶 tablist）。
 *
 * 为什么是 tablist：切天只换「当前天」的面板，不跳页、不滚整页 —— 这是
 * 结构化行程编辑的主导航，语义上就是一组标签页；键盘支持 ← → Home End。
 * 吸顶位置让开系统状态栏（--ui-mobile-system-top），避免压住时间栏。
 */
import { useRef } from 'react'
import { dayDateLabel, dayDateWeekLabel } from './plan-itinerary-meta'
import type { PlanDayRow } from '@/lib/client/plan-collab-types'
import { useCollabStatus } from './plan-collab-context'

export function PlanDayTabs({
  days,
  activeDayId,
  onChange,
}: {
  days: ReadonlyArray<PlanDayRow>
  activeDayId: number | null
  onChange: (dayId: number) => void
}) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const status = useCollabStatus()
  if (days.length === 0) return null

  const move = (direction: 1 | -1) => {
    if (activeDayId == null) return
    const index = days.findIndex((day) => day.id === activeDayId)
    const next = days[Math.min(days.length - 1, Math.max(0, index + direction))]
    if (next && next.id !== activeDayId) onChange(next.id)
  }

  return (
    <div className="plan-day-tabs-sticky">
      <div className="plan-day-tabs" ref={listRef} role="tablist" aria-label="按天查看行程">
        {days.map((day, index) => {
          const active = day.id === activeDayId
          return (
            <button
              key={day.id}
              type="button"
              role="tab"
              id={`plan-day-tab-${day.id}`}
              aria-selected={active}
              aria-controls={`plan-day-panel-${day.id}`}
              tabIndex={active ? 0 : -1}
              className="plan-day-tab"
              onClick={() => onChange(day.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') {
                  event.preventDefault()
                  move(1)
                } else if (event.key === 'ArrowLeft') {
                  event.preventDefault()
                  move(-1)
                } else if (event.key === 'Home') {
                  event.preventDefault()
                  onChange(days[0].id)
                } else if (event.key === 'End') {
                  event.preventDefault()
                  onChange(days[days.length - 1].id)
                }
              }}
            >
              <span className="plan-day-tab-index">Day {index + 1}</span>
              <span className="plan-day-tab-date">{dayDateLabel(day.date) || '未定日期'}</span>
            </button>
          )
        })}
      </div>
      <p className="plan-day-tabs-meta">
        {days.find((day) => day.id === activeDayId)?.date
          ? dayDateWeekLabel(days.find((day) => day.id === activeDayId)?.date)
          : `${days.length} 天行程`}
        {status === 'live' && <span className="plan-day-tabs-live">实时协同中</span>}
        {status === 'offline' && <span className="plan-day-tabs-offline">离线：改动会先存在本机</span>}
      </p>
    </div>
  )
}
