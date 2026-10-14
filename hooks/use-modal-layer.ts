'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { useCloseOnBack } from '@/hooks/use-close-on-back'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

let bodyScrollLockCount = 0
let originalBodyOverflow = ''

/**
 * inert 引用计数（2026-10-14 加固）
 * ============================================================================
 * 背景：modal 打开时会给「背景」DOM 加 inert，关闭时移除。此前的实现按
 * 「打开时它是否已 inert」来决定关闭时要不要移除 —— **嵌套/aspect 变化时会漏**，
 * 一旦 inert 残留在应用根节点上，全站会表现为：
 *   · 所有按钮/链接点不动（inert 子树不接收事件）
 *   · 输入框无法聚焦、无法编辑
 * 真机反馈的「我的页面点什么都没反应」「名字改不了」正是这一类的症状。
 *
 * 现在改为**引用计数**：谁把元素置为本组件引入的 inert，就由谁归还；
 * 计数归零时**无条件**移除（除非它在最初本就是 inert）。这样无论开关顺序、
 * 嵌套层数、组件是否被强制卸载，都不会留下残留。
 */
const inertRefCount = new Map<HTMLElement, number>()
/** 记录「最初本来就是 inert」的元素，归还时不能把它连原本的 inert 一起摘掉 */
const originallyInert = new WeakSet<HTMLElement>()

function retainInert(elements: HTMLElement[]) {
  for (const el of elements) {
    const count = inertRefCount.get(el) ?? 0
    if (count === 0) {
      if (el.hasAttribute('inert')) originallyInert.add(el)
      else el.setAttribute('inert', '')
    }
    inertRefCount.set(el, count + 1)
  }
}

/**
 * 兜底自愈：清掉「没有任何弹层在用」时残留的 inert。
 *
 * 为什么需要：inert 一旦意外残留，用户整个应用都点不动、输入框也进不去，
 * 只能杀进程重启 —— 对一个记录类 App 来说这是最难受的故障。
 * 因此在路由切换这类安全时机做一次巡检：若引用计数已空（说明没有弹层在用），
 * 就把 body 各层的 inert 摘掉。**计数非空时绝不动手**，不会误伤正在显示的弹层。
 */
export function clearStrayInert(): void {
  if (typeof document === 'undefined') return
  if (inertRefCount.size > 0) return
  for (const el of Array.from(document.body.children)) {
    if (!(el instanceof HTMLElement)) continue
    if (el.hasAttribute('inert') && !originallyInert.has(el)) el.removeAttribute('inert')
  }
}

function releaseInert(elements: HTMLElement[]) {
  for (const el of elements) {
    const count = (inertRefCount.get(el) ?? 1) - 1
    if (count > 0) {
      inertRefCount.set(el, count)
      continue
    }
    inertRefCount.delete(el)
    if (!originallyInert.has(el)) el.removeAttribute('inert')
  }
}

function lockBodyScroll() {
  if (bodyScrollLockCount === 0) {
    originalBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  bodyScrollLockCount += 1
}

function unlockBodyScroll() {
  bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1)
  if (bodyScrollLockCount === 0) {
    document.body.style.overflow = originalBodyOverflow
  }
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return []
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.getAttribute('aria-hidden') === 'true') return false
    return element.getClientRects().length > 0
  })
}

/**
 * Shared behavior for modal layers rendered in a body portal:
 * focus containment/restore, Escape dismissal, background inert, scroll lock
 * and Android/browser back handling.
 */
export function useModalLayer<T extends HTMLElement>({
  open,
  onClose,
  dismissible = true,
  panelRef,
}: {
  open: boolean
  onClose: () => void
  dismissible?: boolean
  panelRef: RefObject<T | null>
}) {
  useCloseOnBack(open, onClose, dismissible)
  const onCloseRef = useRef(onClose)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const restoreFrameRef = useRef<number | null>(null)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    const panel = panelRef.current
    if (restoreFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreFrameRef.current)
      restoreFrameRef.current = null
    }
    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (activeElement && (!panel || !panel.contains(activeElement))) {
      restoreFocusRef.current = activeElement
    }
    /**
     * 背景 = body 下不包含本面板的其它层。
     *
     * ⚠️ panel 为空时**不做 inert**：那种情况下「不包含面板」恒成立，会把
     * 面板自己的 portal 容器也一起冻结 —— 表现是弹层出现但完全点不动。
     * 宁可暂时不锁背景，也不能把弹层自己锁死。
     */
    const background = panel
      ? Array.from(document.body.children).filter(
          (element): element is HTMLElement =>
            element instanceof HTMLElement && !element.contains(panel),
        )
      : []

    retainInert(background)
    lockBodyScroll()

    const focusFirst = window.requestAnimationFrame(() => {
      const focusable = getFocusableElements(panel)
      ;(focusable[0] ?? panel)?.focus({ preventScroll: true })
    })

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (dismissible) onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel) return

      const focusable = getFocusableElements(panel)
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus({ preventScroll: true })
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey, true)

    return () => {
      window.cancelAnimationFrame(focusFirst)
      window.removeEventListener('keydown', onKey, true)
      unlockBodyScroll()
      // 引用计数归还：计数归零才真正移除（且不会摘掉元素原本就有的 inert）
      releaseInert(background)
      const restoreFocus = restoreFocusRef.current
      if (restoreFocus?.isConnected) {
        restoreFrameRef.current = window.requestAnimationFrame(() => {
          restoreFrameRef.current = null
          if (restoreFocus.isConnected) {
            restoreFocus.focus({ preventScroll: true })
          }
          restoreFocusRef.current = null
        })
      }
    }
  }, [dismissible, open, panelRef])
}
