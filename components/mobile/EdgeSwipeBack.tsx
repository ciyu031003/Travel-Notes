'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { goBackOrHome } from '@/lib/navigation'

/**
 * iOS 边缘右滑返回（v1）：从左缘起手、向右滑动超过阈值即触发——
 * 当前页与底部 Tab 栏整体右滑退场（m-swipeback-commit），随后 router.back()，
 * 上一层以 m-page-pop 左滑入场，构成完整的 push/pop 空间回路。
 *
 * - 仅 <768px 生效；起手点在 [data-no-swipeback] 内（横向轮播/地图）则不启用；
 * - v1 不做全程跟手位移：transform 常驻会成为 fixed 后代（折叠栏等）的包含块，
 *   连锁修复成本高于收益；方向性退场已能传达空间层级，Android 亦有系统返回兜底。
 * - 挂载点：二级/详情页（旅行详情、帖子详情、我的子页）。
 */
export default function EdgeSwipeBack() {
  const router = useRouter()

  useEffect(() => {
    if (!window.matchMedia('(max-width: 767px)').matches) return
    const EDGE = 24
    const COMMIT_DX = 48
    let startX = 0
    let startY = 0
    let tracking = false
    let committed = false

    const reset = () => {
      tracking = false
      document.body.classList.remove('m-swipeback-commit')
    }

    const onTouchStart = (event: TouchEvent) => {
      if (committed || tracking || event.touches.length !== 1) return
      const touch = event.touches[0]
      if (touch.clientX > EDGE || window.scrollX > 0) return
      const target = event.target as Element | null
      if (target?.closest?.('[data-no-swipeback]')) return
      tracking = true
      startX = touch.clientX
      startY = touch.clientY
    }

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking || committed) return
      const touch = event.touches[0]
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      if (dx > COMMIT_DX && Math.abs(dx) > Math.abs(dy) * 1.4) {
        tracking = false
        committed = true
        document.body.classList.add('m-swipeback-commit')
        // 等滑出动画播完再退栈，上一层以 m-page-pop 入场
        window.setTimeout(() => {
          reset()
          committed = false
          goBackOrHome(router)
        }, 230)
      } else if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        // 明确是纵向滚动，退出跟踪
        tracking = false
      }
    }

    const onTouchEnd = () => {
      if (!committed) reset()
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
      reset()
    }
  }, [router])

  return null
}
