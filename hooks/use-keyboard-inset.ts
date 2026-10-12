'use client'

import { useEffect, useState } from 'react'

/**
 * 虚拟键盘避让（P1-1）
 * ============================================================================
 * 为什么需要：移动端底部固定输入条（评论框、底部 CTA、聊天输入）在软键盘弹出时
 * 会被遮住。`capacitor.config.ts` 已配 `Keyboard.resize: 'native'`，但那只解决
 * **原生 WebView 改 viewport 高度**这一种情形；移动 Web（Safari/Chrome）与部分
 * Android WebView 下键盘是"浮"在页面之上的，CSS 视口高度不变 —— 此时必须靠
 * `visualViewport` 自己算差值。
 *
 * 此前全项目 **0 处** 使用 visualViewport（grep 确认），《移动端UI精修方案2.0》
 * §H.3 曾明确要求却未落地，是移动端最大的"网页感"来源之一。
 *
 * 用法：
 * ```tsx
 * const keyboardInset = useKeyboardInset()
 * <div style={{ paddingBottom: keyboardInset || undefined }}>...</div>
 * ```
 *
 * 实现要点：
 *  · 只在**键盘遮住视口**时返回非 0 值，键盘收起时归零，不干扰正常布局；
 *  · 用 rAF 合并频繁的 resize（iOS 键盘弹出过程会连续触发数十次）；
 *  · 不做 `window.scrollTo` 之类的滚动干预 —— 交给浏览器自己的
 *    "滚动到聚焦元素"行为，避免与页面滚动位置打架；
 *  · SSR/不支持 visualViewport 的环境返回 0，零副作用。
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return

    let frame = 0
    const measure = () => {
      // 键盘高度 ≈ 布局视口高度 - 可视视口高度 - 可视视口顶部偏移
      // 后者在页面被键盘顶起时不为 0，不减会把键盘高度算多一倍。
      const raw = window.innerHeight - vv.height - vv.offsetTop
      // 容差 24px：地址栏收缩等正常抖动不应被当成键盘
      setInset(raw > 24 ? Math.round(raw) : 0)
    }
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        measure()
      })
    }

    measure()
    vv.addEventListener('resize', schedule)
    vv.addEventListener('scroll', schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
    }
  }, [])

  return inset
}

export default useKeyboardInset
