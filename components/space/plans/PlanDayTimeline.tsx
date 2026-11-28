'use client'

/**
 * 时间轴上的一块（SpacePlanItem 卡片）。
 *
 * 只订阅自己这一块（usePlanItem）—— 别人改另一块/另一个字时这张卡不重渲染。
 * 右上角显示「谁正在编辑这一块」的彩色点（awareness.editingItemId），
 * 未填满的块用虚线 + 「填内容」CTA（任务 §4）。
 */
import { Checkbox } from '@/components/mobile/Checkbox'
import { IconBadge } from '@/components/mobile/IconBadge'
import { toast } from '@/lib/mobile/toast-store'
import { isItemFilled } from '@/lib/client/plan-collab-store'
import type { PlanItemRow } from '@/lib/client/plan-collab-types'
import { usePlanItem, usePlanPeers, usePlanStore } from './plan-collab-context'
import { PLAN_ITEM_KIND_ICON, PLAN_ITEM_KIND_TONE, moneyLabel, planItemKindOf, wallTimeLabel } from './plan-itinerary-meta'

export function PlanItemCard({
  itemId,
  canEdit,
  onOpen,
}: {
  itemId: number
  canEdit: boolean
  onOpen: (itemId: number) => void
}) {
  const item = usePlanItem(itemId)
  const store = usePlanStore()
  const peers = usePlanPeers()
  if (!item) return null

  const kind = planItemKindOf(item.kind)
  const filled = isItemFilled(item)
  const editors = peers.filter((peer) => peer.editingItemId === itemId)
  const time = wallTimeLabel(item.startAt)
  const endTime = wallTimeLabel(item.endAt)
  // 左侧轨道已经显示开始时间，这里只补「到几点 / 地点 / 花销」，避免同一行出现两次 09:00
  const meta = [endTime ? '至 ' + endTime : '', item.place, moneyLabel(item.costCents)].filter(Boolean).join(' · ')

  const toggle = async (next: boolean) => {
    try {
      await store.toggleItem(itemId)
      if (next) toast.success('已勾掉这一项')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '勾选失败')
    }
  }

  return (
    <li
      id={`plan-block-${item.id}`}
      className="plan-block"
      data-kind={kind}
      data-done={item.done ? 'true' : undefined}
      data-filled={filled ? 'true' : 'false'}
      data-editors={editors.length > 0 ? 'true' : undefined}
    >
      <div className="plan-block-rail" aria-hidden="true">
        <span className="plan-block-time">{time || '待定'}</span>
        <span className="plan-block-node" />
      </div>

      <div className="plan-block-card">
        <button
          type="button"
          className="plan-block-open"
          onClick={() => onOpen(itemId)}
          aria-label={`编辑行程块：${item.title || '待定'}`}
        >
          <IconBadge icon={PLAN_ITEM_KIND_ICON[kind]} tone={PLAN_ITEM_KIND_TONE[kind]} size="sm" />
          <span className="plan-block-body">
            <span className="plan-block-title">
              {item.title && item.title !== '待定' ? item.title : '待定'}
            </span>
            <span className="plan-block-meta">{meta || (filled ? '' : '还没填内容')}</span>
          </span>
          {!filled && <span className="plan-block-cta">填内容</span>}
        </button>

        <div className="plan-block-actions">
          <Checkbox
            bare
            checked={item.done}
            disabled={!canEdit}
            onCheckedChange={(next) => void toggle(next)}
            label={item.title || '这一项'}
          />
        </div>

        {editors.length > 0 && (
          <span className="plan-block-editors" aria-live="polite">
            {editors.slice(0, 3).map((peer) => (
              <span
                key={peer.clientId}
                className="plan-block-editor-dot"
                data-slot={peer.user?.slot ?? 0}
                title={`${peer.user?.nickname || peer.user?.username || '有人'}正在编辑这一块`}
              >
                {(peer.user?.nickname || peer.user?.username || '有').slice(0, 1)}
              </span>
            ))}
            <span className="plan-block-editors-label">
              {editors.length === 1
                ? `${editors[0].user?.nickname || editors[0].user?.username || '有人'}正在改`
                : `${editors.length} 人正在改`}
            </span>
          </span>
        )}
      </div>
    </li>
  )
}

/** 时间轴容器（一天的所有块 + 空态 CTA） */
export function PlanDayTimeline({
  items,
  canEdit,
  onOpen,
  onAdd,
}: {
  items: ReadonlyArray<PlanItemRow>
  canEdit: boolean
  onOpen: (itemId: number) => void
  onAdd: () => void
}) {
  if (items.length === 0) {
    return (
      <div className="plan-day-empty">
        <p className="plan-day-empty-text">这一天还没有安排。</p>
        {canEdit && (
          <button type="button" className="plan-day-empty-cta" onClick={onAdd}>
            填第一项
          </button>
        )}
      </div>
    )
  }
  return (
    <ul className="plan-timeline">
      {items.map((item) => (
        <PlanItemCard key={item.id} itemId={item.id} canEdit={canEdit} onOpen={onOpen} />
      ))}
    </ul>
  )
}
