'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface UseFullScreenScrollOptions {
  totalPages: number
  /** 切换锁定期（ms），防止滚动过快 */
  lockDuration?: number
  targetRef?: React.RefObject<HTMLElement | null>
}

export function useFullScreenScroll({
  totalPages,
  lockDuration = 700,
  targetRef,
}: UseFullScreenScrollOptions) {
  const [currentPage, setCurrentPage] = useState(0)
  const lockRef = useRef(false)
  const startYRef = useRef(0)
  const currentPageRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  const goToPage = useCallback(
    (page: number) => {
      if (lockRef.current) return
      const target = Math.max(0, Math.min(totalPages - 1, page))
      if (target === currentPageRef.current) return

      lockRef.current = true
      setCurrentPage(target)

      if (timerRef.current) clearTimeout(timerRef)
      timerRef.current = setTimeout(() => {
        lockRef.current = false
      }, lockDuration)
    },
    [totalPages, lockDuration],
  )

  const next = useCallback(() => goToPage(currentPageRef.current + 1), [goToPage])
  const prev = useCallback(() => goToPage(currentPageRef.current - 1), [goToPage])

  useEffect(() => {
    const target = targetRef?.current
    if (!target) return

    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault()
      if (lockRef.current) return

      const delta = Math.abs(e.deltaY)
      if (delta < 5) return

      if (e.deltaY > 0) {
        next()
      } else {
        prev()
      }
    }

    const touchStartHandler = (e: TouchEvent) => {
      startYRef.current = e.touches[0].clientY
    }

    const touchEndHandler = (e: TouchEvent) => {
      if (lockRef.current) return
      const endY = e.changedTouches[0].clientY
      const diff = startYRef.current - endY
      if (Math.abs(diff) > 30) {
        if (diff > 0) next()
        else prev()
      }
    }

    const keyDownHandler = (e: KeyboardEvent) => {
      if (lockRef.current) return
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault()
        prev()
      } else if (e.key === 'Home') {
        e.preventDefault()
        goToPage(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        goToPage(totalPages - 1)
      }
    }

    target.addEventListener('wheel', wheelHandler, { passive: false })
    target.addEventListener('touchstart', touchStartHandler, { passive: true })
    target.addEventListener('touchend', touchEndHandler, { passive: true })
    window.addEventListener('keydown', keyDownHandler)

    return () => {
      target.removeEventListener('wheel', wheelHandler)
      target.removeEventListener('touchstart', touchStartHandler)
      target.removeEventListener('touchend', touchEndHandler)
      window.removeEventListener('keydown', keyDownHandler)
      if (timerRef.current) clearTimeout(timerRef)
    }
  }, [targetRef?.current, next, prev, goToPage, totalPages])

  // 清理定时器（组件卸载时）
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef)
  }, [])

  return {
    currentPage,
    goToPage,
    next,
    prev,
  }
}
