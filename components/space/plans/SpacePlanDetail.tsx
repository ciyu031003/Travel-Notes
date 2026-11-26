'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Delete,
  MapPin,
  Plus,
  Plane,
  Sparkles,
  Users,
  X,
} from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { Button } from '@/components/mobile/Button'
import { Checkbox } from '@/components/mobile/Checkbox'
import { LargeTitle } from '@/components/mobile/LargeTitle'
import { LoaderBlock } from '@/components/mobile/Loader'
import { ActionSheet } from '@/components/mobile/ActionSheet'
import { toast } from '@/lib/mobile/toast-store'
import { apiUrl } from '@/lib/api-base'
import { travelDetailHref } from '@/lib/routes'
import { spaceRoleLabelOf } from '@/lib/mobile/space-system'
import type { SpaceOverviewMember } from '@/lib/modules/space/space-overview.types'
import { SpacePlanComposer } from './SpacePlanComposer'
import {
  PLAN_STATUSES,
  PLAN_TASK_KINDS,
  PLAN_TASK_KIND_ICONS,
  PLAN_TASK_KIND_LABELS,
  PLAN_TASK_KIND_SHORT,
  errorMessageOf,
  fmtBudget,
  fmtDateRange,
  planDayCount,
  planProgress,
  planStatusLabelOf,
  planTaskKindOf,
  spacePlansHref,
  type PlanStatus,
  type PlanTaskKind,
  type SpacePlan,
} from './plan-types'

/** 状态 → 可点选 chips 的文案（顺序固定：规划中 → 已敲定 → 已完成） */
const STATUS_CHIP_ICONS: Record<PlanStatus, typeof Clock> = {
  PLANNING: Clock,
  CONFIRMED: CheckCircle2,
  DONE: Sparkles,
}

/**
 * 旅行计划详情（页面级，不是弹层）。
 *
 * 为什么做成整页：基本信息 + 共享清单 + 成员 + 转换动作，内容量已经超过一个
 * BottomSheet 的合理高度；而且清单需要「边聊边勾」，整页更适合反复回来。
 *
 * 路由：`/space/plans?slug=...&plan=...`（静态导出可用，见 plan-types 注释）。
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
  const router = useRouter()
  const [plan, setPlan] = useState<SpacePlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [converting, setConverting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [newTask, setNewTask] = useState('')
  const [newTaskKind, setNewTaskKind] = useState<PlanTaskKind>('TODO')
  const [taskError, setTaskError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/spaces/${spaceId}/plans/${planId}`), { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (res.status === 404) throw new Error('这个计划可能已被删除')
      if (!res.ok) throw new Error(json.error || '获取计划失败')
      setPlan(json.plan as SpacePlan)
    } catch (e) {
      setError(errorMessageOf(e, '获取计划失败'))
    } finally {
      setLoading(false)
    }
  }, [spaceId, planId])

  useEffect(() => {
    void load()
  }, [load])

  const patch = async (payload: Record<string, unknown>): Promise<SpacePlan | null> => {
    const res = await fetch(apiUrl(`/api/spaces/${spaceId}/plans/${planId}`), {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || '保存失败')
    const next = (json.plan || null) as SpacePlan | null
    if (next) setPlan(next)
    return next
  }

  /* ── 清单 ─────────────────────────────────────────────────────────── */

  const grouped = useMemo(() => {
    const tasks = plan?.tasks || []
    return PLAN_TASK_KINDS.map((kind) => ({
      kind,
      items: tasks.filter((t) => planTaskKindOf(t.kind) === kind),
    })).filter((g) => g.items.length > 0)
  }, [plan])

  const toggleTask = async (taskId: string, done: boolean) => {
    if (!plan) return
    setBusyTaskId(taskId)
    // 乐观更新：多人一起勾时先给触感反馈，失败再回滚
    setPlan({
      ...plan,
      tasks: plan.tasks.map((t) => (t.id === taskId ? { ...t, done } : t)),
    })
    try {
      await patch({ toggleTask: { id: taskId, done } })
    } catch (e) {
      setPlan(plan)
      toast.error(errorMessageOf(e, '勾选失败'))
    } finally {
      setBusyTaskId(null)
    }
  }

  const addTask = async () => {
    if (!plan) return
    const text = newTask.trim()
    if (!text) return
    setTaskError('')
    setBusyTaskId('__add__')
    try {
      await patch({
        tasks: [...plan.tasks.map(toTaskPayload), { text, kind: newTaskKind, done: false }],
      })
      setNewTask('')
    } catch (e) {
      setTaskError(errorMessageOf(e, '添加失败'))
    } finally {
      setBusyTaskId(null)
    }
  }

  const removeTask = async (taskId: string) => {
    if (!plan) return
    setBusyTaskId(taskId)
    try {
      await patch({ tasks: plan.tasks.filter((t) => t.id !== taskId).map(toTaskPayload) })
    } catch (e) {
      toast.error(errorMessageOf(e, '删除失败'))
    } finally {
      setBusyTaskId(null)
    }
  }

  /* ── 动作 ─────────────────────────────────────────────────────────── */

  const convert = async () => {
    setConverting(true)
    try {
      const res = await fetch(apiUrl(`/api/spaces/${spaceId}/plans/${planId}/convert`), {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '转换失败')
      if (json.plan) setPlan(json.plan as SpacePlan)
      toast.success(json.alreadyConverted ? '这条计划已经转过了' : '已生成旅行草稿，去补内容吧')
    } catch (e) {
      toast.error(errorMessageOf(e, '转换失败'))
    } finally {
      setConverting(false)
    }
  }

  const remove = async () => {
    setDeleting(true)
    try {
      const res = await fetch(apiUrl(`/api/spaces/${spaceId}/plans/${planId}`), {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || '删除失败')
      }
      toast.success('计划已删除')
      router.push(spacePlansHref(spaceSlug))
    } catch (e) {
      toast.error(errorMessageOf(e, '删除失败'))
      setDeleting(false)
    }
  }

  /* ── 渲染 ─────────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="m-gutter pb-24 pt-2">
        <LargeTitle title="旅行计划" eyebrow="甜途 · 旅行计划" back={spacePlansHref(spaceSlug)} />
        <LoaderBlock label="正在打开计划…" />
      </div>
    )
  }

  if (error || !plan) {
    return (
      <div className="m-gutter pb-24 pt-2">
        <LargeTitle title="旅行计划" eyebrow="甜途 · 旅行计划" back={spacePlansHref(spaceSlug)} />
        <div className="mt-10 flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-[var(--m-radius-card)] bg-[var(--ui-social-surface2)] text-[var(--ui-social-faint)]">
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

  const progress = planProgress(plan)
  const days = planDayCount(plan.startDate, plan.endDate)
  const range = fmtDateRange(plan.startDate, plan.endDate)
  const creatorMember = members.find((m) => m.username === plan.createdBy)
  const creatorLabel = creatorMember ? creatorMember.nickname || creatorMember.username : plan.createdBy
  const convertedHref = plan.convertedTravelSlug ? travelDetailHref(plan.convertedTravelSlug) : null
  const converted = plan.convertedTravelId != null

  return (
    <div className="pb-24">
      <div className="m-gutter pt-2">
        <LargeTitle
          title={plan.title}
          eyebrow="甜途 · 旅行计划"
          subtitle={plan.destination ? `${plan.destination} · ${planStatusLabelOf(plan.status)}` : planStatusLabelOf(plan.status)}
          back={spacePlansHref(spaceSlug)}
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
        {/* ── 基本信息 ── */}
        <section className="rounded-2xl bg-[var(--ui-social-surface)] p-4 ring-1 ring-[var(--ui-space-hairline)]">
          <div className="flex flex-wrap items-center gap-2">
            {PLAN_STATUSES.map((s) => {
              const active = plan.status === s
              return (
                <button
                  key={s}
                  type="button"
                  disabled={!canEdit || active}
                  onClick={async () => {
                    if (!canEdit) return
                    try {
                      await patch({ status: s })
                      toast.success(`已标记为${planStatusLabelOf(s)}`)
                    } catch (e) {
                      toast.error(errorMessageOf(e, '更新状态失败'))
                    }
                  }}
                  className={
                    active
                      ? 'inline-flex items-center gap-1 rounded-full bg-[var(--ui-space-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ui-space-accent-text)] ring-1 ring-[var(--ui-space-accent)]'
                      : 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-[var(--ui-social-muted)] ring-1 ring-[var(--ui-social-line)] disabled:opacity-60'
                  }
                  aria-pressed={active}
                >
                  <Icon icon={STATUS_CHIP_ICONS[s]} size="sm" />
                  {planStatusLabelOf(s)}
                </button>
              )
            })}
          </div>

          <dl className="mt-3.5 space-y-2 text-[13px]">
            <InfoRow icon={CalendarDays} label="日期">
              {range || '还没定日期'}
              {days != null && <span className="ml-1.5 text-[11px] text-[var(--ui-social-faint)]">{days} 天</span>}
            </InfoRow>
            <InfoRow icon={MapPin} label="目的地">
              {plan.destination || '还没定'}
            </InfoRow>
            {plan.budget != null && (
              <InfoRow icon={Sparkles} label="预算">
                {fmtBudget(plan.budget)}
              </InfoRow>
            )}
            {creatorLabel && (
              <InfoRow icon={Users} label="发起人">
                {creatorLabel}
              </InfoRow>
            )}
          </dl>

          {plan.note && (
            <p className="mt-3 whitespace-pre-wrap rounded-[var(--m-radius-control)] bg-[var(--ui-social-surface2)] p-3 text-[13px] leading-5 text-[var(--ui-social-text)]">
              {plan.note}
            </p>
          )}
        </section>

        {/* ── 一键转成旅行记录 ── */}
        <section className="mt-4">
          {converted ? (
            <div className="rounded-2xl bg-[var(--ui-space-accent-soft)] p-3.5">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--ui-space-accent-text)]">
                <Icon icon={Sparkles} size="sm" />
                已转成旅行记录
              </p>
              <p className="mt-1 text-[11px] text-[var(--ui-space-accent-text)] opacity-85">
                计划的标题、日期、预算和备注都已带过去，进旅行里补行程与照片就行。
              </p>
              {convertedHref && (
                <Link
                  href={convertedHref}
                  className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--ui-space-accent-strong)]"
                >
                  去看这条旅行
                  <Icon icon={ChevronRight} size="sm" />
                </Link>
              )}
            </div>
          ) : (
            canEdit && (
              <Button block size="lg" icon={Plane} loading={converting} onClick={() => void convert()}>
                把计划变成旅行记录
              </Button>
            )
          )}
        </section>

        {/* ── 共享清单 ── */}
        <section className="mt-6 rounded-2xl bg-[var(--ui-social-surface)] p-4 ring-1 ring-[var(--ui-space-hairline)]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[16px] font-semibold leading-6 tracking-[-0.01em] text-[var(--ui-social-text)]">
              共享清单
            </h2>
            <span className="text-[11px] tabular-nums text-[var(--ui-social-faint)]">
              {plan.taskDoneCount}/{plan.taskCount} 已完成
            </span>
          </div>

          {plan.taskCount > 0 && (
            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--ui-social-surface2)]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label={`清单完成 ${progress}%`}
            >
              <span
                className="block h-full rounded-full bg-[var(--ui-space-accent-strong)] transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {plan.taskCount === 0 ? (
            <p className="mt-3 rounded-[var(--m-radius-control)] bg-[var(--ui-social-surface-50)] px-3 py-4 text-center text-[13px] text-[var(--ui-social-muted)]">
              清单还是空的。写下要办的事、要带的东西、想去的地方。
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {grouped.map((group) => (
                <div key={group.kind}>
                  <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold tracking-[0.06em] text-[var(--ui-social-faint)]">
                    <Icon icon={PLAN_TASK_KIND_ICONS[group.kind]} size="sm" />
                    {PLAN_TASK_KIND_LABELS[group.kind]}
                  </p>
                  <ul className="space-y-0.5">
                    {group.items.map((task) => (
                      <li key={task.id} className="flex items-center gap-1.5">
                        <Checkbox
                          bare
                          checked={task.done}
                          disabled={!canEdit || busyTaskId === task.id}
                          onCheckedChange={(next) => void toggleTask(task.id, next)}
                          label={task.text}
                          className="flex-none"
                        />
                        <span className="min-w-0 flex-1 py-2">
                          <span
                            className={
                              task.done
                                ? 'block truncate text-[15px] text-[var(--ui-social-faint)] line-through'
                                : 'block truncate text-[15px] text-[var(--ui-social-text)]'
                            }
                          >
                            {task.text}
                          </span>
                          {task.done && task.doneBy && (
                            <span className="block text-[11px] text-[var(--ui-social-faint)]">
                              {task.doneBy} 勾掉
                            </span>
                          )}
                        </span>
                        {canEdit && (
                          <button
                            type="button"
                            aria-label={`删除清单项：${task.text}`}
                            disabled={busyTaskId === task.id}
                            onClick={() => void removeTask(task.id)}
                            className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[var(--ui-social-faint)] transition hover:text-[var(--danger-soft)] disabled:opacity-50"
                          >
                            <Icon icon={X} size="sm" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {canEdit && (
            <div className="mt-3 border-t border-[var(--ui-social-line)] pt-3">
              <div className="flex items-center gap-1.5">
                <input
                  value={newTask}
                  onChange={(e) => {
                    setNewTask(e.target.value)
                    setTaskError('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void addTask()
                    }
                  }}
                  placeholder={`添加${PLAN_TASK_KIND_SHORT[newTaskKind]}…`}
                  maxLength={120}
                  aria-label="新增清单项"
                  className="h-11 min-w-0 flex-1 rounded-[var(--m-radius-control)] bg-[var(--ui-social-surface2)] px-3 text-[13px] text-[var(--ui-social-text)] outline-none placeholder:text-[var(--ui-social-faint)] focus-visible:ring-2 focus-visible:ring-[var(--ui-space-accent)]"
                />
                <Button
                  size="sm"
                  icon={Plus}
                  loading={busyTaskId === '__add__'}
                  disabled={!newTask.trim()}
                  onClick={() => void addTask()}
                >
                  添加
                </Button>
              </div>
              <div className="mt-2 flex gap-1.5">
                {PLAN_TASK_KINDS.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setNewTaskKind(kind)}
                    aria-pressed={newTaskKind === kind}
                    className={
                      newTaskKind === kind
                        ? 'rounded-full bg-[var(--ui-space-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ui-space-accent-text)]'
                        : 'rounded-full px-2.5 py-1 text-[11px] text-[var(--ui-social-muted)] ring-1 ring-[var(--ui-social-line)]'
                    }
                  >
                    {PLAN_TASK_KIND_SHORT[kind]}
                  </button>
                ))}
              </div>
              {taskError && <p className="mt-2 text-[13px] text-[var(--danger-soft)]">{taskError}</p>}
            </div>
          )}
        </section>

        {/* ── 参与成员（空间成员共享这个计划） ── */}
        {members.length > 0 && (
          <section className="mt-6 rounded-2xl bg-[var(--ui-social-surface)] p-4 ring-1 ring-[var(--ui-space-hairline)]">
            <h2 className="text-[16px] font-semibold leading-6 tracking-[-0.01em] text-[var(--ui-social-text)]">
              参与成员（{members.length}）
            </h2>
            <ul className="mt-2.5 space-y-1.5">
              {members.map((m) => (
                <li key={m.username} className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[var(--ui-space-accent-soft)] text-[11px] font-semibold text-[var(--ui-space-accent-strong)]">
                    {(m.nickname || m.username).slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ui-social-text)]">
                    {m.nickname || m.username}
                  </span>
                  <span className="flex-none text-[11px] text-[var(--ui-social-faint)]">
                    {spaceRoleLabelOf(m.role)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {canEdit && (
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            disabled={deleting}
            className="m-pressable mt-6 flex w-full items-center justify-center gap-1.5 rounded-full py-3 text-[13px] text-[var(--ui-social-faint)] transition-colors hover:text-[var(--danger-soft)] disabled:opacity-50"
          >
            <Icon icon={Delete} size="sm" />
            删除这个计划
          </button>
        )}
      </div>

      {canEdit && (
        <>
          <SpacePlanComposer
            open={composerOpen}
            onClose={() => setComposerOpen(false)}
            spaceId={spaceId}
            plan={plan}
            onSaved={(next) => setPlan(next)}
          />
          <ActionSheet
            open={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            title={`删除「${plan.title}」后，清单与计划信息都会消失（已转成的旅行记录会保留）`}
            options={[{ label: '删除计划', destructive: true, onClick: () => void remove() }]}
          />
        </>
      )}
    </div>
  )
}

/** 把本地任务对象收窄成 PATCH 接受的形状（去掉服务端生成的审计字段也行，这里保持原样最省事） */
function toTaskPayload(task: SpacePlan['tasks'][number]) {
  return { id: task.id, text: task.text, kind: task.kind, done: task.done, doneBy: task.doneBy, doneAt: task.doneAt }
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: typeof Clock
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex-none text-[var(--ui-social-faint)]">
        <Icon icon={icon} size="sm" />
      </span>
      <dt className="w-14 flex-none text-[var(--ui-social-muted)]">{label}</dt>
      <dd className="min-w-0 flex-1 text-[var(--ui-social-text)]">{children}</dd>
    </div>
  )
}

export default SpacePlanDetail