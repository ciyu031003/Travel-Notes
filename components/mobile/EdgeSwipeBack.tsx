'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { goBackOrHome } from '@/lib/navigation'
import { canGoBackInApp } from '@/lib/navigation-stack'

/**
 * iOS 边缘右滑返回（v1）：从左缘起手、向右滑动超过阈值即触发——
 * 当前页与底部 Tab 栏整体右滑退场（m-swipeback-commit），随后 router.back()，
 * 上一层以 m-page-pop 左滑入场，构成完整的 push/pop 空间回路。
 *
 * - 仅 <768px 生效；起手点在 [data-no-swipeback] 内（横向轮播/地图）则不启用；
 * - v1 不做全程跟手位移：transform 常驻会成为 fixed 后代（折叠栏等）的包含块，
 *   连锁修复成本高于收益；方向性退场已能传达空间层级，Android 亦有系统返回兜底。
 * - 挂载点：**仅全局壳**（components/layout/LayoutContent.tsx 的各常规页分支）。
 *   此前 6 个页面还各自挂载过一份，同一手势两套监听都 commit → goBackOrHome
 *   调两次 = 一滑退两层（真机 bug，2026-10-24 收敛）。新页面不要再单独挂载。
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
    // commit → back 的延迟窗口：组件卸载 / 二次导航时必须取消，
    // 否则 goBackOrHome 会在新页面上再退一层（多退一层的竞态）
    let commitTimer: ReturnType<typeof setTimeout> | null = null

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
      /**
       * 没有应用内上一页时**不响应**（2026-10-12）。
       *
       * 本组件现在挂在全局壳上（所有页面），因此必须自己判断"这页能不能退"。
       * 若在 Tab 根页（首页/旅行/旅行圈/我的）误触发，goBackOrHome 会退到
       * 浏览器/WebView 的历史之外 —— 真机上就是"左滑直接退出 App 回到桌面"。
       * 用 navigation-stack 的可信判据（而非 window.history.length）兜住。
       */
      if (!canGoBackInApp()) {
        tracking = false
        return
      }
      if (dx > COMMIT_DX && Math.abs(dx) > Math.abs(dy) * 1.4) {
        tracking = false
        committed = true
        document.body.classList.add('m-swipeback-commit')
        // 等滑出动画播完再退栈，上一层以 m-page-pop 入场
        if (commitTimer) clearTimeout(commitTimer)
        commitTimer = setTimeout(() => {
          commitTimer = null
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
      if (commitTimer) clearTimeout(commitTimer)
      reset()
    }
  }, [router])

  return null
}
