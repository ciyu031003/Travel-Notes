'use client'

import { useEffect, type RefObject } from 'react'

/**
 * 浮层「焦点圈定 + 背景 inert」—— 可复用的无障碍行为
 * ============================================================================
 * 抽自 components/web/tickets/WebTicketSpotlight（W3）里先写死的一份 Tab 圈定逻辑。
 * 票据大图浮层与相册 3D 舞台都已经是 role="dialog" + aria-modal="true"，
 * 但只有视觉遮罩：Tab 仍然能跑到背景的画册墙 / 吊绳票据上，键盘与读屏用户会
 * 「焦点不知道跑哪去了」；aria-modal=true 只对读屏宣告，不阻止真实的 Tab 移动。
 * 两处需要完全一致的行为，所以收敛到 hooks/：
 *
 *  · useFocusTrap       —— Tab / Shift+Tab 在容器内循环；焦点意外落在容器外时拉回；
 *  · useInertBackground —— 把容器**往上每一级祖先的兄弟节点**置 inert，
 *                          鼠标、Tab、读屏都无法到达背景。
 *
 * 与 hooks/use-modal-layer 的分工：那个 hook 只服务「portal 到 body 的弹层」
 * （背景 = body 的直接子节点）。相册舞台是 portal（能直接用），票据浮层却挂在
 * 页面树里，所以这里按「容器往上每一级的兄弟」算背景，两种挂载方式都能用。
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** 容器内真正可聚焦的元素：跳过 aria-hidden（牌堆里藏起来的卡）与不可见的节点 */
function focusableInside(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.getAttribute('aria-hidden') === 'true') return false
    if (element.closest('[inert]')) return false
    return element.getClientRects().length > 0
  })
}

/**
 * Tab 焦点圈定。捕获阶段监听：先于页面上的其它 Tab 处理，
 * 避免浏览器先把焦点移出浮层再被拉回来（会有一次可见的跳跃）。
 */
export function useFocusTrap<T extends HTMLElement>(ref: RefObject<T | null>, active = true): void {
  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const root = ref.current
      if (!root) return
      const focusables = focusableInside(root)
      if (focusables.length === 0) {
        // 浮层里没有任何可聚焦元素：把焦点按在容器本身（容器需 tabIndex=-1）
        event.preventDefault()
        root.focus({ preventScroll: true })
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const current = document.activeElement
      const inside = current instanceof HTMLElement && root.contains(current)
      if (event.shiftKey && (!inside || current === first)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (!inside || current === last)) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [active, ref])
}

/**
 * 背景 inert 的引用计数：可能同时有多个浮层（例如浮层里再开编辑面板），
 * 谁置的谁归还 —— 计数归零才真正移除，且不会摘掉元素**原本就有**的 inert。
 * （同 hooks/use-modal-layer 的加固思路：inert 残留会让整站点不动。）
 */
const inertRefCount = new Map<HTMLElement, number>()
const originallyInert = new WeakSet<HTMLElement>()

function retainInert(elements: HTMLElement[]): void {
  for (const element of elements) {
    const count = inertRefCount.get(element) ?? 0
    if (count === 0) {
      if (element.hasAttribute('inert')) originallyInert.add(element)
      else element.setAttribute('inert', '')
    }
    inertRefCount.set(element, count + 1)
  }
}

function releaseInert(elements: HTMLElement[]): void {
  for (const element of elements) {
    const count = (inertRefCount.get(element) ?? 1) - 1
    if (count > 0) {
      inertRefCount.set(element, count)
      continue
    }
    inertRefCount.delete(element)
    if (!originallyInert.has(element)) element.removeAttribute('inert')
  }
}

/** 资源节点没有可交互内容，置 inert 没有意义（也会让 DevTools 看起来很奇怪） */
const NON_INTERACTIVE_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NOSCRIPT'])

/**
 * 把浮层之外的所有兄弟子树置 inert。
 *
 * 覆盖两种挂载方式：
 *  · portal 到 body（相册舞台）→ 第一轮就把应用根节点整体冻结；
 *  · 挂在页面树里（票据浮层）→ 沿祖先链一路往上，每一级的兄弟都冻结。
 */
export function useInertBackground<T extends HTMLElement>(ref: RefObject<T | null>, active = true): void {
  useEffect(() => {
    if (!active) return
    const root = ref.current
    if (!root || typeof document === 'undefined') return

    const marked = new Set<HTMLElement>()
    let node: HTMLElement | null = root
    while (node && node !== document.body) {
      const parent: HTMLElement | null = node.parentElement
      if (!parent) break
      for (const sibling of Array.from(parent.children)) {
        if (!(sibling instanceof HTMLElement) || sibling === node) continue
        if (NON_INTERACTIVE_TAGS.has(sibling.tagName)) continue
        marked.add(sibling)
      }
      node = parent
    }

    const targets = Array.from(marked)
    retainInert(targets)
    return () => releaseInert(targets)
  }, [active, ref])
}
