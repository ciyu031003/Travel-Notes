'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Plane, Plus, RefreshCw } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { Loader } from '@/components/mobile/Loader'
import { apiUrl } from '@/lib/api-base'
import { SpaceSection } from '../SpaceSection'
import { SpacePlanCard } from './SpacePlanCard'
import { SpacePlanComposer } from './SpacePlanComposer'
import { errorMessageOf, type SpacePlan } from './plan-types'

/**
 * 空间详情里的「旅行计划」区块（可整块插进 SpaceDetail）。
 *
 * 契约：`<SpacePlanSection spaceId spaceSlug canEdit />`
 *   · spaceId / spaceSlug：空间主键与 slug（详情页链接要用 slug 走 query 路由）；
 *   · canEdit：OWNER/MEMBER 为 true（可发起计划）；VIEWER 为 false（只读）。
 *
 * 它是**自取数**的独立区块：不依赖 SpaceDetail 的任何 state，
 * 这样重构详情页的同事可以直接插一行，不会和他们的改动打架。
 *
 * 视觉沿用 S2 重构后的区块骨架（SpaceSection / SpaceEmpty 同款标题与空态）：
 * 标题 16px 中性层，主题色只给「发起」这类 CTA 与卡片上的状态点。
 */
export function SpacePlanSection({
  spaceId,
  spaceSlug,
  canEdit,
}: {
  spaceId: number
  spaceSlug: string
  canEdit: boolean
}) {
  const [plans, setPlans] = useState<SpacePlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/spaces/${spaceId}/plans`), { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '加载旅行计划失败')
      setPlans(Array.isArray(json.plans) ? (json.plans as SpacePlan[]) : [])
    } catch (e) {
      setError(errorMessageOf(e, '加载旅行计划失败'))
    } finally {
      setLoading(false)
    }
  }, [spaceId])

  useEffect(() => {
    void load()
  }, [load])

  const openComposer = () => setComposerOpen(true)

  return (
    <SpaceSection
      title="一起计划的旅行"
      meta={!loading && plans.length > 0 ? `${plans.length} 个` : undefined}
      action={
        canEdit && !loading && plans.length > 0 ? (
          <button
            type="button"
            onClick={openComposer}
            className="m-pressable inline-flex flex-none items-center gap-0.5 text-[13px] font-medium text-[var(--ui-space-accent-strong)]"
          >
            <Icon icon={Plus} size="sm" />
            发起
          </button>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader variant="ring" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-dashed border-[var(--ui-social-line)] px-4 py-4">
          <span className="flex-none text-[var(--ui-social-faint)]">
            <Icon icon={AlertCircle} size="sm" />
          </span>
          <p className="min-w-0 flex-1 text-[13px] leading-5 text-[var(--ui-social-muted)]">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="m-pressable inline-flex flex-none items-center gap-1 text-[13px] font-medium text-[var(--ui-space-accent-strong)]"
          >
            <Icon icon={RefreshCw} size="sm" />
            重试
          </button>
        </div>
      ) : plans.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-dashed border-[var(--ui-social-line)] px-4 py-4">
          <span className="flex-none text-[var(--ui-social-faint)]">
            <Icon icon={Plane} size="sm" />
          </span>
          <p className="min-w-0 flex-1 text-[13px] leading-5 text-[var(--ui-social-muted)]">
            还没有一起计划的旅行
          </p>
          {canEdit ? (
            <button
              type="button"
              onClick={openComposer}
              className="m-pressable flex-none text-[13px] font-medium text-[var(--ui-space-accent-strong)]"
            >
              发起计划
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <SpacePlanCard key={plan.id} plan={plan} spaceSlug={spaceSlug} />
          ))}
          {canEdit && (
            <button
              type="button"
              onClick={openComposer}
              className="m-pressable flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[var(--ui-social-line)] py-3 text-[13px] text-[var(--ui-social-muted)]"
            >
              <Icon icon={Plus} size="sm" />
              再发起一个计划
            </button>
          )}
        </div>
      )}

      {canEdit && (
        <SpacePlanComposer
          open={composerOpen}
          onClose={() => setComposerOpen(false)}
          spaceId={spaceId}
          onSaved={() => void load()}
        />
      )}
    </SpaceSection>
  )
}

export default SpacePlanSection
