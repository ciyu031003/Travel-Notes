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
    const background = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && (!panel || !element.contains(panel)),
    )
    const previousInert = new Map<HTMLElement, boolean>()

    for (const element of background) {
      previousInert.set(element, element.hasAttribute('inert'))
      element.setAttribute('inert', '')
    }
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
      for (const [element, wasInert] of Array.from(previousInert.entries())) {
        if (!wasInert) element.removeAttribute('inert')
      }
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
