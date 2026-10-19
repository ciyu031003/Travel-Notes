'use client'

import { useEffect, useRef } from 'react'

/**
 * 弹层打开期间接管系统/浏览器返回：压入一条同 URL 历史，
 * Android 物理返回键（WebView 中即 history 后退）先关弹层，而不是直接离开页面。
 * 模式来源：app/travel/[slug]/TravelPhotoViewer.tsx 已在真机验证过的
 * pushState + popstate 方案；本 hook 把它抽成可复用形式并补齐嵌套语义。
 *
 * 嵌套规则：模块级栈记录弹层压入顺序，popstate 只让**最顶层**弹层响应，
 * 逐层返回逐层关闭；下层弹层不受影响。
 *
 * 已知取舍：路由跳转导致弹层卸载时，若本层历史条目已非栈顶则不强行回退
 * （避免误关上层弹层），代价是该条目滞留——表现为其后的一次返回"空退"。
 * 该路径（弹层开着时发生路由跳转）极少，可接受。
 */

/** 弹层压入顺序栈（模块级，跨所有弹层实例共享） */
const overlayStack: symbol[] = []

/**
 * 弹层内导航标记（2026-10-19）。
 *
 * 为什么需要：抽屉打开时压入了同 URL 历史；点击抽屉里的入口时，React 会先关闭抽屉
 * （state 更新 → cleanup），而 Next router 的导航是异步的（URL 还没变）。
 * cleanup 此时若 history.back()，会把即将完成的导航顶回旧路由 —— 实测表现为
 * 「点了没反应 / 又回上一页」。导航前显式打标记，cleanup 在标记窗口内不回退。
 */
let overlayNavigationAt = 0
export function markOverlayNavigation(): void {
  overlayNavigationAt = Date.now()
}

export function useCloseOnBack(open: boolean, onClose: () => void, enabled = true): void {
  /** 是否压入过历史（决定卸载清理时是否回退） */
  const pushedRef = useRef(false)
  /** 压入历史时的位置：若关闭时路由已变（弹层内导航），绝不能 history.back 把新路由顶掉 */
  const pushedLocationRef = useRef<string | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useEffect(() => {
    if (!open || !enabledRef.current) return
    const id = Symbol('overlay')
    overlayStack.push(id)
    try {
      window.history.pushState({ ...window.history.state, overlayClose: true }, '')
      pushedRef.current = true
      pushedLocationRef.current = window.location.pathname + window.location.search
    } catch {
      pushedRef.current = false
    }

    const onPop = () => {
      const top = overlayStack[overlayStack.length - 1]
      if (top !== id) return
      overlayStack.pop()
      pushedRef.current = false
      onCloseRef.current()
    }
    const onNativeBack = (event: Event) => {
      if (event.defaultPrevented || overlayStack[overlayStack.length - 1] !== id) return
      event.preventDefault()
      // 保留 pushedRef：关闭后的清理会消耗该弹层专用历史项，不退页面。
      onCloseRef.current()
    }
    window.addEventListener('tiantu:native-back', onNativeBack)
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('tiantu:native-back', onNativeBack)
      window.removeEventListener('popstate', onPop)
      const i = overlayStack.indexOf(id)
      if (i >= 0) {
        overlayStack.splice(i, 1)
        // 仍持有自己压入的那条历史且位于栈顶 → 回退消化掉，保持历史栈干净；
        // 监听器已先移除，随后触发的 popstate 不会再次调用 onClose。
        if (pushedRef.current && i === overlayStack.length) {
          pushedRef.current = false
          /**
           * 2026-10-19 真机 bug（抽屉入口全回首页）的第二层根因：
           * 抽屉打开时压了一条同 URL 历史；若本次关闭是因为**弹层内导航**
           * （router.push/replace 已经改了路由），这里再 history.back 会把刚导航到的页面
           * 顶回旧路由（表现为“点了没反应/又回上一页”）。
           * 路由已变 ⇒ 新历史项已经覆盖该槽位，直接放弃回退。
           */
          const pushedLocation = pushedLocationRef.current
          const currentLocation = window.location.pathname + window.location.search
          const navigating = Date.now() - overlayNavigationAt < 10_000
          if (!navigating && pushedLocation !== null && pushedLocation === currentLocation) {
            window.history.back()
          }
          pushedLocationRef.current = null
        }
      }
    }
  }, [open])
}
