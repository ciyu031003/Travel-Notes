'use client'

/**
 * 旅行计划详情 · 结构化行程编辑器（P2 重写）。
 *
 * 与旧版（基本信息 + 清单）的差别：
 *   · 顶部安全区 + 返回 + 标题 + 「编辑计划」入口（不再压状态栏）；
 *   · Hero 概览：目的地 / 日期 / 天数 / 人数 / 状态胶囊 / 已填进度 / 在线成员；
 *   · 吸顶天切换器（tablist）：切天只换当天面板，不整页跳转；
 *   · 时间轴块：类型图标 / 时间 / 标题 / 地点 / 花销 / 勾选，点击开底部编辑器；
 *   · Yjs 协同：文本（标题/地点/备注）双光标，块级「谁在改」提示，离线先写本机；
 *   · 底部液态玻璃转换卡（三态 + 公开开关），不再放页面中部；
 *   · 出行清单保留为折叠区（tasks 语义不变），避免老功能回归。
 *
 * 数据流：GET 详情先渲染 → 文档就绪后以 Y.Doc 为准 → REST 写响应合并回文档。
 * 性能：Hero 只订阅 stats/plan，天切换只渲染当前天，每张卡只订阅自己那一块。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { Icon } from '@/components/mobile/Icon'
import { Button } from '@/components/mobile/Button'
import { LargeTitle } from '@/components/mobile/LargeTitle'
import { ActionSheet } from '@/components/mobile/ActionSheet'
import { Delete, Plane, Plus, RefreshCw, Sparkles } from '@/lib/mobile/icon-system'
import { toast } from '@/lib/mobile/toast-store'
import { apiUrl } from '@/lib/api-base'
import { spaceRoleLabelOf } from '@/lib/mobile/space-system'
import type { SpaceOverviewMember } from '@/lib/modules/space/space-overview.types'
import type { CollabUser, PlanDetailPayload, PlanRecord } from '@/lib/client/plan-collab-types'
import { isItemFilled } from '@/lib/client/plan-collab-store'
import { SpacePlanComposer } from './SpacePlanComposer'
import { SpaceReveal } from '../SpaceReveal'
import { SpaceSection } from '../SpaceSection'
import { SPACE_DUR, SPACE_EASE_OUT } from '../space-motion'
import {
  PlanCollabProvider,
  useCollabStatus,
  useDayItems,
  usePlanDays,
  usePlanRecord,
  usePlanStats,
  usePlanStore,
} from './plan-collab-context'
import { PlanOverviewHero } from './PlanOverviewHero'
import { PlanDayTabs } from './PlanDayTabs'
import { PlanDayTimeline } from './PlanDayTimeline'
import { PlanItemEditor } from './PlanItemEditor'
import { PlanConvertCard } from './PlanConvertCard'
import { PlanChecklist } from './PlanChecklist'
import { dayDateLabel } from './plan-itinerary-meta'
import { userSlot } from './plan-user-color'
import { errorMessageOf, spacePlansHref } from './plan-types'

interface MeProfile {
  id?: number
  username?: string
  nickname?: string | null
  avatarUrl?: string | null
}

/**
 * 旅行计划详情（页面级，不是弹层）。
 * 路由：/space/plans?slug=...&plan=...（静态导出可用，见 plan-types 注释）。
 */
export function SpacePlanDetail({
  spaceId,
  spaceSlug,
  planId,
  canEdit,
  members = [],
}: {
  spaceId: number
  spaceSlug: string
  planId: number
  canEdit: boolean
  members?: SpaceOverviewMember[]
}) {
  const [detail, setDetail] = useState<PlanDetailPayload | null>(null)
  const [me, setMe] = useState<MeProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const detailPath = '/api/spaces/' + spaceId + '/plans/' + planId

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [detailRes, meRes] = await Promise.all([
        fetch(apiUrl(detailPath), { credentials: 'include' }),
        fetch(apiUrl('/api/me'), { credentials: 'include' }).catch(() => null),
      ])
      const json = (await detailRes.json().catch(() => ({}))) as PlanDetailPayload & { error?: string }
      if (detailRes.status === 404) throw new Error('这个计划可能已被删除')
      if (!detailRes.ok) throw new Error(json.error || '获取计划失败')
      if (meRes && meRes.ok) {
        const meJson = (await meRes.json().catch(() => null)) as { data?: MeProfile } | MeProfile | null
        if (meJson && typeof meJson === 'object' && 'data' in meJson) {
          setMe((meJson as { data?: MeProfile }).data ?? null)
        } else {
          setMe(meJson as MeProfile | null)
        }
      }
      setDetail(json)
    } catch (err) {
      setError(errorMessageOf(err, '获取计划失败'))
    } finally {
      setLoading(false)
    }
  }, [detailPath])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <PlanDetailSkeleton spaceSlug={spaceSlug} />
  if (error || !detail) {
    return (
      <div className="m-gutter m-safe-top pb-24">
        <LargeTitle title="旅行计划" eyebrow="甜途 · 旅行计划" back={spacePlansHref(spaceSlug)} collapsible={false} />
        <div className="mt-10 flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ui-social-surface2)] text-[var(--ui-social-faint)]">
            <Icon icon={Plane} size="lg" />
          </span>
          <p className="mt-3 max-w-[280px] text-[13px] leading-5 text-[var(--ui-social-muted)]">
            {error || '没有找到这个计划'}
          </p>
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" onClick={() => void load()}>
              重试
            </Button>
            <Button href={spacePlansHref(spaceSlug)}>回计划列表</Button>
          </div>
        </div>
      </div>
    )
  }

  const user: CollabUser = {
    id: Number(me?.id ?? 0),
    username: me?.username || '',
    nickname: me?.nickname ?? null,
    slot: userSlot(Number(me?.id ?? 0), me?.username),
  }

  return (
    <MotionConfig reducedMotion="user">
      <PlanCollabProvider
        key={planId}
        spaceId={spaceId}
        planId={planId}
        canEdit={canEdit}
        user={user}
        detail={detail}
      >
        <PlanDetailBody
          spaceId={spaceId}
          spaceSlug={spaceSlug}
          planId={planId}
          canEdit={canEdit}
          members={members}
        />
      </PlanCollabProvider>
    </MotionConfig>
  )
}

function PlanDetailBody({
  spaceId,
  spaceSlug,
  planId,
  canEdit,
  members,
}: {
  spaceId: number
  spaceSlug: string
  planId: number
  canEdit: boolean
  members: SpaceOverviewMember[]
}) {
  const router = useRouter()
  const store = usePlanStore()
  const plan = usePlanRecord()
  const days = usePlanDays()
  const stats = usePlanStats()
  const status = useCollabStatus()

  const [activeDayId, setActiveDayId] = useState<number | null>(null)
  const [editorItemId, setEditorItemId] = useState<number | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [adding, setAdding] = useState(false)

  // 默认落在第一天；天被删/挪走后回落到第一天
  useEffect(() => {
    if (days.length === 0) return
    if (activeDayId == null || !days.some((day) => day.id === activeDayId)) {
      setActiveDayId(days[0].id)
    }
  }, [days, activeDayId])

  const activeDay = useMemo(() => days.find((day) => day.id === activeDayId) ?? null, [days, activeDayId])
  const activeIndex = activeDay ? days.findIndex((day) => day.id === activeDay.id) : -1
  const items = useDayItems(activeDayId ?? -1)
  const filledCount = items.filter((item) => isItemFilled(item)).length

  const scrollToGap = useCallback(() => {
    const gap = stats.firstGap
    if (!gap) return
    setActiveDayId(gap.dayId)
    window.setTimeout(() => {
      const targetId = gap.itemId != null ? 'plan-block-' + gap.itemId : 'plan-day-panel-' + gap.dayId
      const element = document.getElementById(targetId)
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (gap.itemId != null) setEditorItemId(gap.itemId)
    }, 120)
  }, [stats.firstGap])

  const addItem = async (dayId: number) => {
    setAdding(true)
    try {
      const item = await store.createItem({ dayId, kind: 'SPOT' })
      setEditorItemId(item.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '新增失败')
    } finally {
      setAdding(false)
    }
  }

  const remove = async () => {
    setDeleting(true)
    try {
      const res = await fetch(apiUrl('/api/spaces/' + spaceId + '/plans/' + planId), {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(json.error || '删除失败')
      }
      toast.success('计划已删除')
      router.push(spacePlansHref(spaceSlug))
    } catch (err) {
      toast.error(errorMessageOf(err, '删除失败'))
      setDeleting(false)
    }
  }

  return (
    <div className="plan-detail pb-24">
      <div className="m-gutter m-safe-top">
        <LargeTitle
          title={plan.title}
          eyebrow={'甜途 · 旅行计划' + (status === 'live' ? ' · 实时协同中' : '')}
          subtitle={plan.destination ? plan.destination : undefined}
          back={spacePlansHref(spaceSlug)}
          collapsible={false}
          trailing={
            canEdit ? (
              <button
                type="button"
                aria-label="编辑计划信息"
                onClick={() => setComposerOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--ui-social-surface)] text-[var(--ui-space-accent-strong)] ring-1 ring-[var(--ui-social-line)]"
              >
                <Icon icon={Sparkles} size="md" />
              </button>
            ) : undefined
          }
          trailingLabel={canEdit ? '编辑' : undefined}
        />
      </div>

      <div className="m-gutter pt-2">
        <SpaceReveal>
          <PlanOverviewHero canEdit={canEdit} members={members} onEdit={() => setComposerOpen(true)} />
        </SpaceReveal>

        {days.length === 0 ? (
          <section className="plan-empty-days">
            <p className="plan-empty-days-title">这条计划还没有日程</p>
            <p className="plan-empty-days-desc">
              旧计划的日期还在，但还没有按天生成行程骨架。在计划列表里重新发起一个带日期的计划，就能得到每天的时间轴。
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <Button href={spacePlansHref(spaceSlug)} size="sm">
                回计划列表
              </Button>
              {canEdit && (
                <Button variant="secondary" size="sm" onClick={() => setComposerOpen(true)}>
                  编辑计划信息
                </Button>
              )}
            </div>
          </section>
        ) : (
          <>
            <PlanDayTabs days={days} activeDayId={activeDayId} onChange={setActiveDayId} />

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeDayId ?? 'day'}
                id={'plan-day-panel-' + (activeDayId ?? 'none')}
                role="tabpanel"
                aria-labelledby={'plan-day-tab-' + (activeDayId ?? 'none')}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: SPACE_DUR.base, ease: SPACE_EASE_OUT }}
              >
                {activeDay && (
                  <>
                    <div className="plan-day-head">
                      <div className="min-w-0">
                        <p className="plan-day-eyebrow">
                          {'Day ' + (activeIndex + 1)}
                          {dayDateLabel(activeDay.date) ? ' · ' + dayDateLabel(activeDay.date) : ''}
                        </p>
                        <h2 className="plan-day-title">{activeDay.title || '这一天'}</h2>
                        {(activeDay.theme || activeDay.summary) &&
                          (activeDay.theme || activeDay.summary) !== activeDay.title && (
                            <p className="plan-day-theme">{activeDay.theme || activeDay.summary}</p>
                          )}
                      </div>
                      <div className="plan-day-side">
                        <span className="plan-day-count">
                          {items.length > 0 ? '已填 ' + filledCount + '/' + items.length : '空'}
                        </span>
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={Plus}
                            loading={adding}
                            onClick={() => void addItem(activeDay.id)}
                          >
                            加一项
                          </Button>
                        )}
                      </div>
                    </div>

                    <PlanDayTimeline
                      items={items}
                      canEdit={canEdit}
                      onOpen={(itemId) => setEditorItemId(itemId)}
                      onAdd={() => void addItem(activeDay.id)}
                    />
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </>
        )}

        <PlanChecklist canEdit={canEdit} />

        {members.length > 0 && (
          <SpaceSection title="参与成员" meta={members.length + ' 人'} className="plan-members">
            <ul className="plan-members-list">
              {members.map((member) => (
                <li key={member.username} className="plan-member">
                  <span className="plan-avatar" data-slot={userSlot(member.id, member.username)} aria-hidden="true">
                    {(member.nickname || member.username).slice(0, 1)}
                  </span>
                  <span className="plan-member-name">{member.nickname || member.username}</span>
                  <span className="plan-member-role">{spaceRoleLabelOf(member.role)}</span>
                </li>
              ))}
            </ul>
          </SpaceSection>
        )}

        {plan.note && <p className="plan-detail-note">{plan.note}</p>}

        <PlanConvertCard canEdit={canEdit} onScrollToGap={scrollToGap} />

        {status === 'offline' && (
          <p className="plan-offline-note" role="status">
            <Icon icon={RefreshCw} size="sm" />
            协同通道离线：文字改动会先存在本机，联网后自动同步。
            <button type="button" className="plan-offline-retry" onClick={() => store.retryConnection()}>
              重试连接
            </button>
          </p>
        )}

        {canEdit && (
          <button type="button" onClick={() => setDeleteOpen(true)} disabled={deleting} className="plan-delete-plan">
            <Icon icon={Delete} size="sm" />
            删除这个计划
          </button>
        )}
      </div>

      {canEdit && (
        <>
          <PlanItemEditor
            open={editorItemId != null}
            itemId={editorItemId}
            days={days}
            activeDayId={activeDayId}
            onClose={() => setEditorItemId(null)}
            onMoved={(dayId) => setActiveDayId(dayId)}
          />
          <SpacePlanComposer
            open={composerOpen}
            onClose={() => setComposerOpen(false)}
            spaceId={spaceId}
            plan={plan}
            onSaved={(next) => store.applyPlanRecord(next as PlanRecord)}
          />
          <ActionSheet
            open={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            title={'删除「' + plan.title + '」后，日程与清单都会消失（已转成的旅行记录会保留）'}
            options={[{ label: '删除计划', destructive: true, onClick: () => void remove() }]}
          />
        </>
      )}
    </div>
  )
}

function PlanDetailSkeleton({ spaceSlug }: { spaceSlug: string }) {
  return (
    <div className="m-gutter m-safe-top pb-24">
      <LargeTitle title="旅行计划" eyebrow="甜途 · 旅行计划" back={spacePlansHref(spaceSlug)} collapsible={false} />
      <div className="mt-6 space-y-4" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">正在打开计划…</span>
        <div className="rounded-3xl bg-[var(--ui-social-surface)] p-4 ring-1 ring-[var(--ui-space-hairline)]">
          <div className="flex gap-2">
            <span className="m-skeleton block h-6 w-16 rounded-full" />
            <span className="m-skeleton block h-6 w-20 rounded-full" />
          </div>
          <div className="mt-4 space-y-2.5">
            <span className="m-skeleton block h-5 w-2/3" />
            <span className="m-skeleton block h-4 w-1/2" />
            <span className="m-skeleton mt-3 block h-2 w-full rounded-full" />
          </div>
        </div>
        <div className="flex gap-2">
          <span className="m-skeleton block h-12 w-20 rounded-2xl" />
          <span className="m-skeleton block h-12 w-20 rounded-2xl" />
          <span className="m-skeleton block h-12 w-20 rounded-2xl" />
        </div>
        <div className="rounded-2xl bg-[var(--ui-social-surface)] p-4 ring-1 ring-[var(--ui-space-hairline)]">
          <div className="space-y-3">
            <span className="m-skeleton block h-16 w-full rounded-2xl" />
            <span className="m-skeleton block h-16 w-full rounded-2xl" />
            <span className="m-skeleton block h-16 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default SpacePlanDetail
