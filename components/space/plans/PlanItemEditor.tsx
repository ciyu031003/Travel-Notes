'use client'

/**
 * 行程块编辑器（底部抽屉）。
 *
 * 交互约定（协同场景）：
 *   · 标题 / 地点 / 备注 → 直接写 Y.Text，两个人可以在同一段文字里同时打字，
 *     面板里能看到对方的彩色插入符（见 CollabTextArea）；
 *   · 类型 / 时间 / 花销 / 照片 → 走 REST（行级 version 乐观锁），响应合并回 Y.Doc；
 *   · 409 不弹窗打断：先在面板顶部出一条「刚被别人改过」的提示，可选
 *     「用对方的」或「保留我的」，并把对方改成了什么写清楚；
 *   · 全部即时保存，没有「保存」按钮 —— 关掉抽屉不会丢改动。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BottomSheet } from '@/components/mobile/BottomSheet'
import { Button } from '@/components/mobile/Button'
import { Checkbox } from '@/components/mobile/Checkbox'
import { Icon } from '@/components/mobile/Icon'
import { IconBadge } from '@/components/mobile/IconBadge'
import RemoteImage from '@/components/mobile/RemoteImage'
import { AlertCircle, Check, Delete, RefreshCw } from '@/lib/mobile/icon-system'
import { toast } from '@/lib/mobile/toast-store'
import { apiUrl } from '@/lib/api-base'
import { cn } from '@/lib/utils'
import type { PlanConflictInfo, PlanDayRow, PlanItemKind, PlanItemRow } from '@/lib/client/plan-collab-types'
import { usePlanItem, usePlanPeers, usePlanStore } from './plan-collab-context'
import { CollabTextArea } from './PlanCollabTextArea'
import {
  PLAN_ITEM_KINDS,
  PLAN_ITEM_KIND_ICON,
  PLAN_ITEM_KIND_LABEL,
  PLAN_ITEM_KIND_TONE,
  centsToYuanText,
  dayDateLabel,
  moneyLabel,
  wallTimeLabel,
  yuanTextToCents,
} from './plan-itinerary-meta'
import { isItemFilled } from '@/lib/client/plan-collab-store'

interface PhotoCandidate {
  id: number
  url: string | null
}

/** 把「对方当前行」和我提交的字段差写成人话，冲突提示里用 */
function describeServerChange(current: PlanItemRow, patch: Partial<PlanItemRow>): string {
  const parts: string[] = []
  if (patch.kind != null) parts.push(`类型改成了「${PLAN_ITEM_KIND_LABEL[current.kind]}」`)
  if (patch.startAt !== undefined) parts.push(`时间改成了 ${wallTimeLabel(current.startAt) || '待定'}`)
  if (patch.costCents !== undefined) parts.push(`花销改成了 ${moneyLabel(current.costCents) || '未填'}`)
  if (patch.mediaIds !== undefined) parts.push('照片被人改过')
  return parts.length > 0 ? `${current.updatedBy || '有人'}刚把${parts.join('，')}` : `${current.updatedBy || '有人'}刚改过这一块`
}

export function PlanItemEditor({
  open,
  itemId,
  days,
  activeDayId,
  onClose,
  onMoved,
}: {
  open: boolean
  itemId: number | null
  days: ReadonlyArray<PlanDayRow>
  activeDayId: number | null
  onClose: () => void
  onMoved: (dayId: number) => void
}) {
  const store = usePlanStore()
  const item = usePlanItem(itemId ?? -1)
  const peers = usePlanPeers()

  const [conflict, setConflict] = useState<PlanConflictInfo | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [costText, setCostText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [photosOpen, setPhotosOpen] = useState(false)
  const [candidates, setCandidates] = useState<PhotoCandidate[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingCost = useRef<number | null | undefined>(undefined)

  const editors = peers.filter((peer) => peer.editingItemId === (itemId ?? -1))

  // 只在「打开 / 换一块」时重置：远端改了花销不要清掉冲突提示，否则冲突条会一闪而过
  useEffect(() => {
    if (!open || !item) return
    setCostText(centsToYuanText(item.costCents))
    setConflict(null)
    setError('')
    setBusy(null)
    setConfirmDelete(false)
    setPhotosOpen(false)
    pendingCost.current = undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只跟随 open/item 身份，避免远端更新时重置面板
  }, [open, item?.id])

  // 关掉面板前把还没落库的花销补提交（防抖窗口内关闭）
  useEffect(() => {
    if (open) return
    const pending = pendingCost.current
    pendingCost.current = undefined
    if (pending !== undefined && item) {
      void store.updateItem(item.id, { costCents: pending }).catch(() => undefined)
    }
  }, [open, item, store])

  const handleWriteResult = useCallback(
    async (result: Awaited<ReturnType<typeof store.updateItem>>) => {
      if (result.ok) {
        setConflict(null)
        return true
      }
      setConflict(result.conflict)
      return false
    },
    [store],
  )

  const patchShort = useCallback(
    async (patch: { kind?: PlanItemKind; startAt?: string | null; endAt?: string | null; costCents?: number | null; mediaIds?: number[] }, key: string) => {
      if (!item) return
      setBusy(key)
      setError('')
      try {
        const result = await store.updateItem(item.id, patch)
        await handleWriteResult(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : '保存失败')
      } finally {
        setBusy(null)
      }
    },
    [item, store, handleWriteResult],
  )

  const scheduleCostSave = useCallback(
    (text: string) => {
      setCostText(text)
      const cents = yuanTextToCents(text)
      pendingCost.current = cents
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        pendingCost.current = undefined
        void patchShort({ costCents: cents }, 'cost')
      }, 600)
    },
    [patchShort],
  )

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const move = async (dayId: number) => {
    if (!item || dayId === item.dayId) return
    setBusy('move')
    try {
      await store.moveItem(item.id, dayId)
      toast.success('已移到那一天')
      onMoved(dayId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '移动失败')
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!item) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setBusy('delete')
    try {
      await store.deleteItem(item.id)
      toast.success('已删除这一块')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setBusy(null)
    }
  }

  const loadCandidates = useCallback(async () => {
    setCandidatesLoading(true)
    try {
      const res = await fetch(apiUrl('/api/memories/media-candidates?limit=40'), { credentials: 'include' })
      const json = (await res.json().catch(() => ({}))) as { media?: PhotoCandidate[] }
      setCandidates(Array.isArray(json.media) ? json.media : [])
    } catch {
      setCandidates([])
    } finally {
      setCandidatesLoading(false)
    }
  }, [])

  const togglePhoto = async (mediaId: number) => {
    if (!item) return
    const current = item.mediaIds ?? []
    const next = current.includes(mediaId) ? current.filter((id) => id !== mediaId) : [...current, mediaId].slice(0, 9)
    setBusy('photo')
    try {
      const result = await store.updateItem(item.id, { mediaIds: next })
      await handleWriteResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '照片保存失败')
    } finally {
      setBusy(null)
    }
  }

  const conflictText = conflict ? describeServerChange(conflict.current, conflict.patch as Partial<PlanItemRow>) : ''
  // 块属于某一天，日期以天为准：时间输入只要 HH:mm，避免 390 宽下 datetime-local 被裁
  const dayDate =
    days.find((day) => day.id === item?.dayId)?.date ?? (item?.startAt ? item.startAt.slice(0, 10) : null)

  const title = useMemo(() => (item ? (isItemFilled(item) ? '编辑这一项' : '填这一项') : '填这一项'), [item])

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {!item ? (
        <p className="py-8 text-center text-[13px] text-[var(--ui-social-muted)]">这一块已经不在行程里了。</p>
      ) : (
        <div className="plan-editor">
          <p className="plan-editor-coedit">
            标题、地点、备注可以多人同时改 —— 对方的光标会出现在同一段文字里。
          </p>

          {/* 谁正在编辑这一块 */}
          {editors.length > 0 && (
            <p className="plan-editor-peers" aria-live="polite">
              {editors.slice(0, 3).map((peer) => (
                <span key={peer.clientId} className="plan-field-peers-dot" data-slot={peer.user?.slot ?? 0} aria-hidden="true" />
              ))}
              有人也在改这一块，改动会实时合并
            </p>
          )}

          {/* 409 冲突条 */}
          {conflict && (
            <div className="plan-editor-conflict" role="status">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex-none text-[var(--m-warning)]">
                  <Icon icon={AlertCircle} size="sm" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-[var(--ui-social-text)]">刚被别人改过</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-[var(--ui-social-muted)]">
                    {conflictText || '对方先保存了这一块'}。你可以用对方的版本，或保留自己的再存一次。
                  </p>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    store.acceptServerRow(conflict)
                    setCostText(centsToYuanText(conflict.current.costCents))
                    setConflict(null)
                    toast.success('已采用对方的版本')
                  }}
                >
                  用对方的
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    const result = await store.retryWithPatch(conflict)
                    const ok = await handleWriteResult(result)
                    if (ok) toast.success('已按你的改动保存')
                  }}
                >
                  保留我的
                </Button>
              </div>
            </div>
          )}

          {/* 类型 */}
          <div className="plan-editor-section">
            <p className="plan-editor-label">类型</p>
            <div className="plan-editor-kinds" role="radiogroup" aria-label="行程块类型">
              {PLAN_ITEM_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={item.kind === kind}
                  disabled={busy === 'kind'}
                  onClick={() => void patchShort({ kind }, 'kind')}
                  className={cn('plan-editor-kind', item.kind === kind && 'is-active')}
                >
                  <IconBadge icon={PLAN_ITEM_KIND_ICON[kind]} tone={PLAN_ITEM_KIND_TONE[kind]} size="sm" />
                  <span>{PLAN_ITEM_KIND_LABEL[kind]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 标题 / 地点 / 备注：Y.Text（同段文字双光标） */}
          <CollabTextArea
            itemId={item.id}
            field="title"
            label="标题"
            placeholder="例如：上海 → 杭州（高铁 G7301）"
            fallbackValue={item.title}
            maxLength={200}
            multiline={false}
          />

          {/* 时间 */}
          <div className="plan-editor-section">
            <div className="flex items-center justify-between">
              <p className="plan-editor-label">时间</p>
              {item.startAt ? (
                <button
                  type="button"
                  className="plan-editor-inline-action"
                  onClick={() => void patchShort({ startAt: null, endAt: null }, 'time')}
                >
                  清空时间
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="plan-editor-time">
                <span className="plan-editor-time-label">开始</span>
                <input
                  type="time"
                  className="plan-editor-input"
                  aria-label="开始时间"
                  value={wallTimeLabel(item.startAt)}
                  disabled={busy === 'time' || !dayDate}
                  onChange={(event) => {
                    const value = event.target.value
                    if (!value) return
                    void patchShort({ startAt: dayDate ? dayDate + 'T' + value : null }, 'time')
                  }}
                />
              </label>
              <label className="plan-editor-time">
                <span className="plan-editor-time-label">结束</span>
                <input
                  type="time"
                  className="plan-editor-input"
                  aria-label="结束时间"
                  value={wallTimeLabel(item.endAt)}
                  disabled={busy === 'time' || !dayDate}
                  onChange={(event) => {
                    const value = event.target.value
                    void patchShort({ endAt: value && dayDate ? dayDate + 'T' + value : null }, 'time')
                  }}
                />
              </label>
            </div>
            {!dayDate && <p className="plan-collab-field-hint">这一天还没有日期，先在「编辑计划信息」里补上日期再排时间。</p>}
          </div>

          <CollabTextArea
            itemId={item.id}
            field="place"
            label="地点"
            placeholder="填具体地点（店名 / 车站 / 酒店）"
            fallbackValue={item.place ?? ''}
            maxLength={200}
            multiline={false}
          />

          {/* 花销 */}
          <div className="plan-editor-section">
            <p className="plan-editor-label">花销（元）</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="1"
                className="plan-editor-input flex-1"
                aria-label="这一项的花销（元）"
                placeholder="不填也可以"
                value={costText}
                onChange={(event) => scheduleCostSave(event.target.value)}
                onBlur={() => {
                  if (saveTimer.current) clearTimeout(saveTimer.current)
                  const cents = yuanTextToCents(costText)
                  pendingCost.current = undefined
                  void patchShort({ costCents: cents }, 'cost')
                }}
              />
              <span className="text-[11px] text-[var(--ui-social-faint)]">{busy === 'cost' ? '保存中…' : '自动保存'}</span>
            </div>
          </div>

          <CollabTextArea
            itemId={item.id}
            field="note"
            label="备注"
            placeholder="预约方式、注意事项、想吃的菜…"
            fallbackValue={item.note ?? ''}
            maxLength={5000}
            multiline
            rows={3}
          />

          {/* 照片 */}
          <div className="plan-editor-section">
            <div className="flex items-center justify-between">
              <p className="plan-editor-label">
                照片 {item.mediaIds.length > 0 && <span className="plan-editor-count">{item.mediaIds.length}</span>}
              </p>
              <button
                type="button"
                className="plan-editor-inline-action"
                onClick={() => {
                  const next = !photosOpen
                  setPhotosOpen(next)
                  if (next && candidates.length === 0) void loadCandidates()
                }}
                aria-expanded={photosOpen}
              >
                {photosOpen ? '收起' : '从相册选'}
              </button>
            </div>
            {photosOpen && (
              <div className="plan-editor-photos">
                {candidatesLoading ? (
                  <p className="plan-editor-photos-hint">正在读取相册…</p>
                ) : candidates.length === 0 ? (
                  <p className="plan-editor-photos-hint">相册里还没有照片。先去相册上传，再回来挑。</p>
                ) : (
                  <div className="plan-editor-photo-grid">
                    {candidates.map((photo) => {
                      const selected = item.mediaIds.includes(photo.id)
                      return (
                        <button
                          key={photo.id}
                          type="button"
                          className={cn('plan-editor-photo', selected && 'is-selected')}
                          aria-pressed={selected}
                          disabled={busy === 'photo'}
                          onClick={() => void togglePhoto(photo.id)}
                        >
                          <RemoteImage src={photo.url} alt="相册照片" variant="thumbnail" />
                          {selected && (
                            <span className="plan-editor-photo-check" aria-hidden="true">
                              <Icon icon={Check} size="sm" />
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
                <p className="plan-editor-photos-hint">最多 9 张，会随旅行记录一起展示。</p>
              </div>
            )}
          </div>

          {/* 挪到别的一天 */}
          {days.length > 1 && (
            <div className="plan-editor-section">
              <p className="plan-editor-label">挪到</p>
              <div className="plan-editor-days">
                {days.map((day, index) => (
                  <button
                    key={day.id}
                    type="button"
                    className={cn('plan-editor-day', day.id === item.dayId && 'is-current')}
                    disabled={busy === 'move' || day.id === item.dayId}
                    onClick={() => void move(day.id)}
                  >
                    Day {index + 1}
                    {dayDateLabel(day.date) ? ` · ${dayDateLabel(day.date)}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 勾选完成（和卡片上的勾选同一语义） */}
          <div className="plan-editor-section">
            <Checkbox
              checked={item.done}
              onCheckedChange={() => void store.toggleItem(item.id).catch(() => setError('勾选失败'))}
              label="这一项已经完成"
              description={item.doneBy ? `由 ${item.doneBy} 勾选` : undefined}
            />
          </div>

          {error && <p className="plan-editor-error">{error}</p>}

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              className={cn('plan-editor-delete', confirmDelete && 'is-confirm')}
              disabled={busy === 'delete'}
              onClick={() => void remove()}
            >
              <Icon icon={confirmDelete ? AlertCircle : Delete} size="sm" />
              {confirmDelete ? '再点一次确认删除' : '删除这一块'}
            </button>
            <Button variant="secondary" onClick={onClose}>
              完成
            </Button>
          </div>
          {activeDayId != null && item.dayId !== activeDayId && (
            <p className="mt-2 text-[11px] text-[var(--ui-social-faint)]">
              <Icon icon={RefreshCw} size="sm" className="mr-1 inline-block align-[-2px]" />
              这一块已经被挪到别的天了
            </p>
          )}
        </div>
      )}
    </BottomSheet>
  )
}
