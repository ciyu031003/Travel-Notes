'use client'

import Link from 'next/link'
import { motion } from 'motion/react'
import {
  CalendarDays,
  ChevronRight,
  MapPin,
  Plane,
  Sparkles,
} from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { Pill } from '@/components/mobile/Pills'
import { SPACE_DUR, SPACE_EASE_OUT } from '../space-motion'
import {
  PLAN_STATUS_ICONS,
  PLAN_STATUS_TONES,
  fmtBudget,
  fmtDateRange,
  planDayCount,
  planProgress,
  planStatusLabelOf,
  spacePlanDetailHref,
  type SpacePlan,
} from './plan-types'

/**
 * 计划卡片（列表项）。
 *
 * 信息优先级：标题 → 目的地/日期 → 清单进度。已转成旅行记录的计划额外带一条
 * 「已成旅行记录」提示 —— 这是产品闭环的终点，用户需要一眼看到它走到了哪一步。
 */
export function SpacePlanCard({ plan, spaceSlug }: { plan: SpacePlan; spaceSlug: string }) {
  const range = fmtDateRange(plan.startDate, plan.endDate)
  const days = planDayCount(plan.startDate, plan.endDate)
  const progress = planProgress(plan)
  const converted = plan.convertedTravelId != null

  return (
    <Link
      href={spacePlanDetailHref(spaceSlug, plan.id)}
      className="m-card-pressable block rounded-2xl bg-[var(--ui-social-surface)] p-3.5 ring-1 ring-[var(--ui-space-hairline)]"
    >
      <div className="flex items-start gap-3">
        {/* 状态色：规划中=空间主题色 / 已敲定=日光黄 / 已完成=中性灰。
            色值都在 space.css 的 .space-plan-tile 里，组件只传 data-status。 */}
        <span className="space-plan-tile flex h-10 w-10 flex-none items-center justify-center rounded-xl" data-status={plan.status}>
          <Icon icon={PlanIconOf(plan)} size="md" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-[15px] font-semibold text-[var(--ui-social-text)]">
              {plan.title}
            </p>
            <Pill
              icon={PLAN_STATUS_ICONS[plan.status]}
              tone={PLAN_STATUS_TONES[plan.status]}
              size="sm"
              className="flex-none"
            >
              {planStatusLabelOf(plan.status)}
            </Pill>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--ui-social-faint)]">
            {plan.destination && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <Icon icon={MapPin} size="sm" />
                <span className="truncate">{plan.destination}</span>
              </span>
            )}
            {range && (
              <span className="inline-flex items-center gap-1">
                <Icon icon={CalendarDays} size="sm" />
                {range}
              </span>
            )}
            {days != null && <span>{days} 天</span>}
            {plan.budget != null && <span>预算 {fmtBudget(plan.budget)}</span>}
          </div>
        </div>
        <span className="mt-2 flex-none text-[var(--ui-social-faint)]">
          <Icon icon={ChevronRight} size="sm" />
        </span>
      </div>

      {/* 清单进度：有清单才显示，空清单不占一行。
          U1：进度用 scaleX 表达（transform），进场从 0 长到当前值；
          改进度时（勾选后回到列表）也是同一条 transform 过渡 —— 不碰 width，
          8 张卡片同时刷新也不会触发一次重排。减动效时 motion 直接落到终值。 */}
      {plan.taskCount > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] text-[var(--ui-social-muted)]">
            <span>
              共享清单 {plan.taskDoneCount}/{plan.taskCount}
            </span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <div
            className="space-plan-progress mt-1"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label={`清单完成 ${progress}%`}
          >
            <motion.span
              className="space-plan-progress-fill"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: progress / 100 }}
              transition={{ duration: SPACE_DUR.slow, ease: SPACE_EASE_OUT }}
            />
          </div>
        </div>
      )}

      {converted && (
        <div className="mt-2.5 flex items-center gap-1 text-[11px] text-[var(--ui-space-accent-strong)]">
          <Icon icon={Sparkles} size="sm" />
          已成旅行记录
        </div>
      )}
    </Link>
  )
}

function PlanIconOf(plan: SpacePlan) {
  if (plan.convertedTravelId != null) return Sparkles
  if (plan.destination) return Plane
  return CalendarDays
}

export default SpacePlanCard