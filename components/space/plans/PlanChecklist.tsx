'use client'

/**
 * 出行清单（沿用 P0/P1 的 tasks 语义：待办 / 打包 / 想去的地方）。
 *
 * 行程块是「什么时候做什么」，清单是「出发前要办的事」——两者不混。
 * 默认折叠，只露出「x/y 已办」，避免抢走时间轴的注意力；展开后行为与旧版一致：
 * 勾选走 PATCH toggleTask（原子、不覆盖别人的改动），新增/删除整表提交。
 */
import { useState } from 'react'
import { motion } from 'motion/react'
import { Icon } from '@/components/mobile/Icon'
import { Checkbox } from '@/components/mobile/Checkbox'
import { Button } from '@/components/mobile/Button'
import { ChevronDown, Plus, ShoppingBag, X } from '@/lib/mobile/icon-system'
import { toast } from '@/lib/mobile/toast-store'
import { cn } from '@/lib/utils'
import {
  PLAN_TASK_KINDS,
  PLAN_TASK_KIND_ICONS,
  PLAN_TASK_KIND_LABELS,
  PLAN_TASK_KIND_SHORT,
  planTaskKindOf,
  type PlanTaskKind,
} from './plan-types'
import { usePlanRecord, usePlanStore } from './plan-collab-context'

export function PlanChecklist({ canEdit }: { canEdit: boolean }) {
  const store = usePlanStore()
  const plan = usePlanRecord()
  const [open, setOpen] = useState(false)
  const [newText, setNewText] = useState('')
  const [newKind, setNewKind] = useState<PlanTaskKind>('TODO')
  const [busy, setBusy] = useState(false)

  const tasks = plan.tasks ?? []
  const grouped = PLAN_TASK_KINDS.map((kind) => ({
    kind,
    items: tasks.filter((task) => planTaskKindOf(task.kind) === kind),
  })).filter((group) => group.items.length > 0)

  const patchTasks = async (payload: Record<string, unknown>) => {
    setBusy(true)
    try {
      await store.patchPlan(payload)
    } finally {
      setBusy(false)
    }
  }

  const toggleTask = async (id: string, done: boolean) => {
    try {
      await patchTasks({ toggleTask: { id, done } })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '勾选失败')
    }
  }

  const addTask = async () => {
    const text = newText.trim()
    if (!text) return
    try {
      await patchTasks({ tasks: [...tasks.map(toPayload), { text, kind: newKind, done: false }] })
      setNewText('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '添加失败')
    }
  }

  const removeTask = async (id: string) => {
    try {
      await patchTasks({ tasks: tasks.filter((task) => task.id !== id).map(toPayload) })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败')
    }
  }

  if (tasks.length === 0 && !canEdit) return null

  return (
    <section className="plan-checklist" aria-label="出行清单">
      <button
        type="button"
        className="plan-checklist-head"
        aria-expanded={open}
        aria-controls="plan-checklist-body"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="plan-checklist-title">
          <Icon icon={ShoppingBag} size="sm" />
          出行清单
        </span>
        <span className="plan-checklist-summary">
          {tasks.length > 0 ? `${plan.taskDoneCount}/${plan.taskCount} 已办` : '还没有事项'}
          <Icon icon={ChevronDown} size="sm" className={cn('plan-checklist-caret', open && 'is-open')} />
        </span>
      </button>

      <div id="plan-checklist-body" className={cn('plan-checklist-body', open && 'is-open')}>
        <div className="plan-checklist-inner">
          {grouped.length === 0 ? (
            <p className="plan-checklist-empty">写下要办的事、要带的东西、想去的地方。</p>
          ) : (
            grouped.map((group) => (
              <div key={group.kind} className="plan-checklist-group">
                <p className="plan-checklist-group-label">
                  <Icon icon={PLAN_TASK_KIND_ICONS[group.kind]} size="sm" />
                  {PLAN_TASK_KIND_LABELS[group.kind]}
                </p>
                <ul>
                  {group.items.map((task) => (
                    <li key={task.id} className="plan-checklist-item">
                      <Checkbox
                        bare
                        checked={task.done}
                        disabled={!canEdit || busy}
                        onCheckedChange={(next) => void toggleTask(task.id, next)}
                        label={task.text}
                      />
                      <span className={cn('plan-checklist-text', task.done && 'is-done')}>{task.text}</span>
                      {task.done && task.doneBy ? <span className="plan-checklist-by">{task.doneBy}</span> : null}
                      {canEdit && (
                        <button
                          type="button"
                          className="plan-checklist-remove"
                          aria-label={`删除清单项：${task.text}`}
                          disabled={busy}
                          onClick={() => void removeTask(task.id)}
                        >
                          <Icon icon={X} size="sm" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}

          {canEdit && (
            <div className="plan-checklist-add">
              <input
                value={newText}
                onChange={(event) => setNewText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void addTask()
                  }
                }}
                maxLength={120}
                placeholder={`添加${PLAN_TASK_KIND_SHORT[newKind]}…`}
                aria-label="新增清单项"
                className="plan-checklist-input"
              />
              <Button size="sm" icon={Plus} disabled={!newText.trim() || busy} onClick={() => void addTask()}>
                加
              </Button>
              <div className="plan-checklist-kinds">
                {PLAN_TASK_KINDS.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={newKind === kind}
                    onClick={() => setNewKind(kind)}
                    className={cn('plan-checklist-kind', newKind === kind && 'is-active')}
                  >
                    {PLAN_TASK_KIND_SHORT[kind]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {open && tasks.length > 0 && (
        <motion.span className="plan-checklist-flare" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      )}
    </section>
  )
}

function toPayload(task: { id: string; text: string; kind: string; done: boolean; doneBy: string | null; doneAt: string | null }) {
  return { id: task.id, text: task.text, kind: task.kind, done: task.done, doneBy: task.doneBy, doneAt: task.doneAt }
}
