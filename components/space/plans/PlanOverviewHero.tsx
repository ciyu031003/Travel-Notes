'use client'

/**
 * 计划概览（Hero）：目的地 / 日期区间 / N 天 / 参与人数 / 状态胶囊 / 已填进度 / 在线成员。
 *
 * 用 .lg-card 玻璃底：这是页面上唯一一张「大块玻璃」（另一张是底部转换卡），
 * 其余列表保持实心 surface，避免整页都在模糊背景上做 backdrop-filter。
 */
import { Icon } from '@/components/mobile/Icon'
import { AlertCircle, CalendarDays, CheckCircle2, Clock, MapPin, Sparkles, Users, Plane, RefreshCw } from '@/lib/mobile/icon-system'
import { cn } from '@/lib/utils'
import { fmtDateRange, fmtBudget, planDayCount, planStatusLabelOf } from './plan-types'
import { useCollabStatus, usePlanPeers, usePlanRecord, usePlanStats, usePlanStore } from './plan-collab-context'
import { displayName, userSlot } from './plan-user-color'
import type { CollabUser } from '@/lib/client/plan-collab-types'

const STATUS_ICON: Record<string, typeof Clock> = {
  PLANNING: Clock,
  CONFIRMED: CheckCircle2,
  DONE: Sparkles,
}

export function PlanOverviewHero({
  canEdit,
  members,
  onEdit,
}: {
  canEdit: boolean
  members: Array<{ username: string; nickname: string | null; avatarUrl: string | null; role: string }>
  onEdit: () => void
}) {
  const store = usePlanStore()
  const plan = usePlanRecord()
  const stats = usePlanStats()
  const peers = usePlanPeers()
  const status = useCollabStatus()

  const days = planDayCount(plan.startDate, plan.endDate) ?? stats.dayCount
  const range = fmtDateRange(plan.startDate, plan.endDate)
  const presence = store.getInitialPresence()

  // 在线成员：WS awareness（实时）∪ REST presence（刚打开时还没连上）
  const onlineUsers: CollabUser[] = []
  const seen = new Set<string>()
  for (const peer of peers) {
    if (!peer.user) continue
    const key = `u${peer.user.id}`
    if (seen.has(key)) continue
    seen.add(key)
    onlineUsers.push(peer.user)
  }
  for (const row of presence) {
    const key = `u${row.userId}`
    if (seen.has(key)) continue
    seen.add(key)
    onlineUsers.push({ id: row.userId, username: row.username, nickname: row.nickname, slot: userSlot(row.userId, row.username) })
  }

  const converted = plan.convertedTravelId != null
  const StatusIcon = STATUS_ICON[plan.status] ?? Clock

  return (
    <section className="plan-hero lg-card" aria-label="计划概览">
      <div className="plan-hero-top">
        <div className="min-w-0">
          <p className="plan-hero-eyebrow">甜途 · 一起计划的旅行</p>
          <h1 className="plan-hero-title">{plan.destination || plan.title}</h1>
        </div>
        <span className="plan-status-pill" data-status={plan.status.toLowerCase()}>
          <Icon icon={StatusIcon} size="sm" />
          {planStatusLabelOf(plan.status)}
        </span>
      </div>

      <div className="plan-hero-meta">
        <span className="plan-hero-meta-item">
          <Icon icon={CalendarDays} size="sm" />
          {range || '日期还没定'}
        </span>
        <span className="plan-hero-meta-item">
          <Icon icon={CalendarDays} size="sm" />
          {days > 0 ? `${days} 天` : '天数待定'}
        </span>
        <span className="plan-hero-meta-item">
          <Icon icon={Users} size="sm" />
          {members.length > 0 ? `${members.length} 人一起` : '1 人'}
        </span>
        {plan.budget != null && (
          <span className="plan-hero-meta-item">
            <Icon icon={Sparkles} size="sm" />
            {fmtBudget(plan.budget)}
          </span>
        )}
        {mixedDestination(plan.destination) && (
          <span className="plan-hero-meta-item">
            <Icon icon={MapPin} size="sm" />
            {plan.title}
          </span>
        )}
      </div>

      <div className="plan-hero-progress">
        <div className="plan-hero-progress-head">
          <span>
            已填 <strong>{stats.filled}</strong>/{stats.total} 项
          </span>
          <span className="plan-hero-progress-days">
            {stats.done > 0 ? `${stats.done} 项已完成` : stats.gapCount > 0 ? `还差 ${stats.gapCount} 项` : '全部填好'}
          </span>
        </div>
        <div
          className="plan-hero-progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={stats.percent}
          aria-label={`行程已填 ${stats.filled}/${stats.total} 项`}
        >
          <span className="plan-hero-progress-fill" style={{ transform: `scaleX(${stats.percent / 100})` }} />
        </div>
      </div>

      <div className="plan-hero-foot">
        <div className="plan-hero-online">
          {onlineUsers.length > 0 ? (
            <>
              <span className="plan-avatar-stack" aria-hidden="true">
                {onlineUsers.slice(0, 4).map((user) => (
                  <span key={user.id} className="plan-avatar" data-slot={user.slot} title={displayName(user)}>
                    {displayName(user).slice(0, 1)}
                  </span>
                ))}
              </span>
              <span className="plan-hero-online-label">
                {onlineUsers.length === 1 ? `${displayName(onlineUsers[0])} 在线` : `${onlineUsers.length} 人在线`}
              </span>
            </>
          ) : status === 'live' ? (
            <span className="plan-hero-online-label">你是第一个到的人</span>
          ) : (
            <span className="plan-hero-online-label">
              <span className="plan-status-dot" data-status={status} aria-hidden="true" />
              {status === 'connecting' ? '正在接入协同…' : status === 'offline' ? '离线：改动先存本机' : '协同未连接'}
            </span>
          )}
        </div>

        <div className="plan-hero-actions">
          {status === 'offline' && (
            <button type="button" className="plan-hero-retry" onClick={() => store.retryConnection()}>
              <Icon icon={RefreshCw} size="sm" />
              重试
            </button>
          )}
          {canEdit && (
            <button type="button" className="plan-hero-edit" onClick={onEdit}>
              编辑计划
            </button>
          )}
          {converted && (
            <span className="plan-hero-travel">
              <Icon icon={Plane} size="sm" />
              已成记录
            </span>
          )}
        </div>
      </div>

      {status === 'offline' && (
        <p className="plan-hero-offline">
          <Icon icon={AlertCircle} size="sm" />
          网络断开时文字改动会先保存在本机，恢复后自动合并；改类型/时间需要联网。
        </p>
      )}

      <p className={cn('plan-hero-owner', !plan.createdBy && 'hidden')}>
        {plan.createdBy ? `发起到「${plan.title}」的是 ${plan.createdBy}` : null}
      </p>
    </section>
  )
}

/** 目的地很长时（如「云南 · 大理 · 双廊」）把计划标题也展示出来，避免信息丢失 */
function mixedDestination(destination: string | null): boolean {
  return Boolean(destination && destination.length > 8)
}
