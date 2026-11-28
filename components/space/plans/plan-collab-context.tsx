'use client'

/**
 * 计划协同 React 接入层。
 *
 * 为什么用 useSyncExternalStore 而不是 Context + useState：
 *   · 计划详情里「天切换 + 每块卡片 + 进度 + 在线态」各自关心不同的切片，
 *     一个 store 通知所有节点会让打字时整页重渲染；
 *   · store 内部按 slice（days / day:<id> / item:<id> / stats / peers …）维护稳定快照，
 *     这里每个 hook 只订阅自己那一片，React 只在对应切片变化时重渲染。
 *
 * 协同连接的生命周期：进入详情页后由 Provider 启动（动态 import Yjs，避免 SSR 执行）；
 * 页面卸载时销毁。StrictMode 下 effect 会执行两遍，store 支持被销毁后重新 start。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { apiUrl } from '@/lib/api-base'
import { PlanCollabStore, type PlanStats } from '@/lib/client/plan-collab-store'
import type {
  CollabStatus,
  CollabUser,
  PlanDayRow,
  PlanDetailPayload,
  PlanItemRow,
  PlanPeer,
  PlanRecord,
} from '@/lib/client/plan-collab-types'
import type { CollabTokenInfo } from '@/lib/client/plan-collab'

const PlanCollabContext = createContext<PlanCollabStore | null>(null)

export function PlanCollabProvider({
  spaceId,
  planId,
  canEdit,
  user,
  detail,
  children,
}: {
  spaceId: number
  planId: number
  canEdit: boolean
  user: CollabUser
  detail: PlanDetailPayload
  children: ReactNode
}) {
  const [store] = useState(
    () =>
      new PlanCollabStore({
        spaceId,
        planId,
        canEdit,
        user,
        detail,
      }),
  )

  useEffect(() => {
    if (!canEdit) return
    const fetchToken = async (): Promise<CollabTokenInfo> => {
      const res = await fetch(apiUrl(`/api/spaces/${spaceId}/plans/${planId}/collab-token`), {
        method: 'POST',
        credentials: 'include',
      })
      const json = (await res.json().catch(() => ({}))) as Partial<CollabTokenInfo> & { error?: string }
      if (!res.ok || !json.token || !json.wsUrl || !json.room) {
        throw new Error(json.error || '获取协同通道失败')
      }
      return { token: json.token, wsUrl: json.wsUrl, room: json.room }
    }
    void store.startCollab(fetchToken).catch(() => {
      // 连不上协同就退回纯 REST：文案在状态条上体现，不打断填写
    })
    return () => {
      // StrictMode 下这里会先执行一次；store 支持销毁后重新 start（见 startCollab）
      store.destroy()
    }
  }, [store, canEdit, spaceId, planId])

  return <PlanCollabContext.Provider value={store}>{children}</PlanCollabContext.Provider>
}

export function usePlanStore(): PlanCollabStore {
  const store = useContext(PlanCollabContext)
  if (!store) throw new Error('usePlanStore 必须在 PlanCollabProvider 内使用')
  return store
}

export function usePlanDays(): ReadonlyArray<PlanDayRow> {
  const store = usePlanStore()
  const subscribe = useCallback((listener: () => void) => store.subscribeDays(listener), [store])
  const getSnapshot = useCallback(() => store.getDays(), [store])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function usePlanDay(dayId: number): PlanDayRow | null {
  const store = usePlanStore()
  const subscribe = useCallback((listener: () => void) => store.subscribeDay(dayId, listener), [store, dayId])
  const getSnapshot = useCallback(() => store.getDay(dayId), [store, dayId])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useDayItems(dayId: number): ReadonlyArray<PlanItemRow> {
  const store = usePlanStore()
  const subscribe = useCallback((listener: () => void) => store.subscribeDay(dayId, listener), [store, dayId])
  const getSnapshot = useCallback(() => store.getDayItems(dayId), [store, dayId])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function usePlanItem(itemId: number): PlanItemRow | null {
  const store = usePlanStore()
  const subscribe = useCallback((listener: () => void) => store.subscribeItem(itemId, listener), [store, itemId])
  const getSnapshot = useCallback(() => store.getItem(itemId), [store, itemId])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function usePlanStats(): PlanStats {
  const store = usePlanStore()
  const subscribe = useCallback((listener: () => void) => store.subscribeStats(listener), [store])
  const getSnapshot = useCallback(() => store.getStats(), [store])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function usePlanRecord(): PlanRecord {
  const store = usePlanStore()
  const subscribe = useCallback((listener: () => void) => store.subscribePlan(listener), [store])
  const getSnapshot = useCallback(() => store.getPlan(), [store])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function usePlanPeers(): ReadonlyArray<PlanPeer> {
  const store = usePlanStore()
  const subscribe = useCallback((listener: () => void) => store.subscribePeers(listener), [store])
  const getSnapshot = useCallback(() => store.getPeers(), [store])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function usePlanCursors(): ReadonlyArray<PlanPeer> {
  const store = usePlanStore()
  const subscribe = useCallback((listener: () => void) => store.subscribeCursors(listener), [store])
  const getSnapshot = useCallback(() => store.getCursors(), [store])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useCollabStatus(): CollabStatus {
  const store = usePlanStore()
  const subscribe = useCallback((listener: () => void) => store.subscribeStatus(listener), [store])
  const getSnapshot = useCallback(() => store.getStatus(), [store])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
