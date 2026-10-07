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

export function useCloseOnBack(open: boolean, onClose: () => void, enabled = true): void {
  /** 是否压入过历史（决定卸载清理时是否回退） */
  const pushedRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useEffect(() => {
    if (!open || !enabledRef.current) return
    const id = Symbol('overlay')
    overlayStack.push(id)
    try {
      window.history.pushState({ overlayClose: true }, '')
      pushedRef.current = true
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
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      const i = overlayStack.indexOf(id)
      if (i >= 0) {
        overlayStack.splice(i, 1)
        // 仍持有自己压入的那条历史且位于栈顶 → 回退消化掉，保持历史栈干净；
        // 监听器已先移除，随后触发的 popstate 不会再次调用 onClose。
        if (pushedRef.current && i === overlayStack.length) {
          pushedRef.current = false
          window.history.back()
        }
      }
    }
  }, [open])
}
